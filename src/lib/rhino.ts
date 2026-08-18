import chalk from "chalk";
import { existsSync } from "fs";
import type { RhinoInstanceJson } from "../types";
import { displayDebug, displayWarning } from "./logger";
import {
	assertRhinoInstalled,
	getRhinoPlatformConfig,
	resolveRhinocodeExecutable,
	type RhinoPlatformConfig,
} from "./rhino-platform";
import { createRhinocodeClient, type RhinocodeClient } from "./rhinocode";
import { DEFAULT_SPAWN_DELAY_MS, MAX_WAIT_MS, POLL_INTERVAL_MS } from "./spawn-constants";

export type EnsureRhinoResult = {
	pipeIds: string[];
	launchedPipeIds: string[];
	spawnElapsedMs: number;
};

type LaunchProcess = (
	command: string,
	args: string[],
	config: RhinoPlatformConfig,
) => Promise<{ pid?: number }>;

export type RhinoSessionDependencies = {
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	exists: (path: string) => boolean;
	launch: LaunchProcess;
	listRhinoProcessIds: (config: RhinoPlatformConfig) => Promise<Set<number> | undefined>;
	terminateProcess: (pid: number) => Promise<void>;
	pollIntervalMs: number;
	maxWaitMs: number;
};

const defaultDependencies: RhinoSessionDependencies = {
	now: Date.now,
	sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
	exists: existsSync,
	launch: async (command, args, config) => {
		const proc = Bun.spawn([command, ...args], {
			stdout: "ignore",
			stderr: "ignore",
			stdin: "ignore",
			windowsVerbatimArguments: config.platform === "win32",
		});
		return { pid: proc.pid };
	},
	listRhinoProcessIds: async (config) => {
		if (config.platform !== "darwin") return undefined;
		try {
			const proc = Bun.spawn(["/usr/bin/pgrep", "-x", config.processName], {
				stdout: "pipe",
				stderr: "ignore",
			});
			const [output, exitCode] = await Promise.all([
				new Response(proc.stdout).text(),
				proc.exited,
			]);
			if (exitCode === 1) return new Set<number>();
			if (exitCode !== 0) return undefined;
			return new Set(
				output
					.split(/\s+/)
					.filter(Boolean)
					.map(Number)
					.filter(Number.isInteger),
			);
		} catch {
			return undefined;
		}
	},
	terminateProcess: async (pid) => {
		const command = ["taskkill", "/PID", String(pid), "/T", "/F"];
		const exitCode = await Bun.spawn(command, {
			stdout: "ignore",
			stderr: "ignore",
		}).exited;
		if (exitCode !== 0) throw new Error(`${command[0]} exited with code ${exitCode}.`);
	},
	pollIntervalMs: POLL_INTERVAL_MS,
	maxWaitMs: MAX_WAIT_MS,
};

export type RhinoSession = {
	readonly config: RhinoPlatformConfig;
	readonly client: RhinocodeClient;
	ensureInstances: (options: {
		requestedCount: number;
		spawnDelayMs?: number;
	}) => Promise<EnsureRhinoResult>;
	quitInstance: (pipeId: string) => Promise<void>;
	cleanupOwned: () => Promise<void>;
};

type RhinoSessionState = {
	readonly activePipeIds: ReadonlySet<string>;
	readonly launchedPipeIds: ReadonlySet<string>;
	readonly ownedPipes: ReadonlyMap<string, number>;
	readonly ownedProcessIds: ReadonlySet<number>;
};

function createRhinoSessionState(): RhinoSessionState {
	return {
		activePipeIds: new Set(),
		launchedPipeIds: new Set(),
		ownedPipes: new Map(),
		ownedProcessIds: new Set(),
	};
}

export function selectRhinoInstances(
	instances: readonly RhinoInstanceJson[],
	count: number,
	activePipeIds: ReadonlySet<string> = new Set(),
): RhinoInstanceJson[] {
	const byPipeId = new Map(instances.map((instance) => [instance.pipeId, instance]));
	const selected: RhinoInstanceJson[] = [];

	for (const pipeId of activePipeIds) {
		const active = byPipeId.get(pipeId);
		if (active) {
			selected.push(active);
			byPipeId.delete(pipeId);
		}
		if (selected.length === count) return selected;
	}

	const reusable = [...byPipeId.values()].sort(
		(a, b) => a.processId - b.processId || a.pipeId.localeCompare(b.pipeId),
	);
	return [...selected, ...reusable].slice(0, count);
}

function recordOwnedProcess(state: RhinoSessionState, processId: number): RhinoSessionState {
	return {
		...state,
		ownedProcessIds: new Set([...state.ownedProcessIds, processId]),
	};
}

function recordLaunchedInstances(
	state: RhinoSessionState,
	instances: readonly RhinoInstanceJson[],
	platform: RhinoPlatformConfig["platform"],
	directChildPids: ReadonlySet<number>,
	preLaunchRhinoPids: ReadonlySet<number> | undefined,
): RhinoSessionState {
	const launchedPipeIds = new Set(state.launchedPipeIds);
	const ownedPipes = new Map(state.ownedPipes);

	for (const instance of instances) {
		const launched = platform === "win32"
			? directChildPids.has(instance.processId)
			: preLaunchRhinoPids !== undefined && !preLaunchRhinoPids.has(instance.processId);
		if (!launched) continue;
		launchedPipeIds.add(instance.pipeId);

		// /usr/bin/open does not expose the Rhino application PID, so a macOS
		// PID snapshot cannot prove ownership. Only direct Windows children are
		// safe to close automatically.
		if (platform === "win32") {
			ownedPipes.set(instance.pipeId, instance.processId);
		}
	}

	return { ...state, launchedPipeIds, ownedPipes };
}

function recordSelection(
	state: RhinoSessionState,
	selected: readonly RhinoInstanceJson[],
	spawnElapsedMs: number,
): { state: RhinoSessionState; result: EnsureRhinoResult } {
	const pipeIds = selected.map((instance) => instance.pipeId);
	return {
		state: { ...state, activePipeIds: new Set(pipeIds) },
		result: {
			pipeIds,
			launchedPipeIds: pipeIds.filter((pipeId) => state.launchedPipeIds.has(pipeId)),
			spawnElapsedMs,
		},
	};
}

function forgetOwnedPipe(state: RhinoSessionState, pipeId: string): RhinoSessionState {
	const processId = state.ownedPipes.get(pipeId);
	const launchedPipeIds = new Set(state.launchedPipeIds);
	const ownedPipes = new Map(state.ownedPipes);
	const ownedProcessIds = new Set(state.ownedProcessIds);

	launchedPipeIds.delete(pipeId);
	ownedPipes.delete(pipeId);
	if (processId !== undefined) ownedProcessIds.delete(processId);

	return { ...state, launchedPipeIds, ownedPipes, ownedProcessIds };
}

function forgetOwnedProcess(state: RhinoSessionState, processId: number): RhinoSessionState {
	const launchedPipeIds = new Set(state.launchedPipeIds);
	const ownedPipes = new Map(state.ownedPipes);
	const ownedProcessIds = new Set(state.ownedProcessIds);

	ownedProcessIds.delete(processId);
	for (const [pipeId, mappedProcessId] of ownedPipes) {
		if (mappedProcessId !== processId) continue;
		launchedPipeIds.delete(pipeId);
		ownedPipes.delete(pipeId);
	}

	return { ...state, launchedPipeIds, ownedPipes, ownedProcessIds };
}

export function createRhinoSession(options: {
	platform?: NodeJS.Platform;
	config?: RhinoPlatformConfig;
	rhinocodeExecutable?: string;
	client?: RhinocodeClient;
	dependencies?: Partial<RhinoSessionDependencies>;
} = {}): RhinoSession {
	const config = options.config ?? getRhinoPlatformConfig(options.platform);
	const executable = options.rhinocodeExecutable ?? options.client?.executable ?? resolveRhinocodeExecutable(config);
	const client = options.client ?? createRhinocodeClient(executable);
	const dependencies = { ...defaultDependencies, ...options.dependencies };
	let state = createRhinoSessionState();
	let cleanupPromise: Promise<void> | undefined;

	const saveSelection = (
		selected: RhinoInstanceJson[],
		spawnElapsedMs: number,
	): EnsureRhinoResult => {
		const selection = recordSelection(state, selected, spawnElapsedMs);
		state = selection.state;
		return selection.result;
	};

	const ensureInstances = async (options: {
		requestedCount: number;
		spawnDelayMs?: number;
	}): Promise<EnsureRhinoResult> => {
		const requestedCount = options.requestedCount;
		if (!Number.isInteger(requestedCount) || requestedCount < 1) {
			throw new RangeError("The Rhino instance count must be a positive integer.");
		}

		assertRhinoInstalled(config, dependencies.exists);
		const effectiveCount = Math.min(requestedCount, config.maxInstances);
		const initial = await client.list();

		let selected = selectRhinoInstances(initial, effectiveCount, state.activePipeIds);
		if (selected.length === effectiveCount) {
			return saveSelection(selected, 0);
		}

		const missingCount = effectiveCount - selected.length;
		const launchStartedAt = dependencies.now();
		const preLaunchRhinoPids = config.platform === "darwin"
			? await dependencies.listRhinoProcessIds(config)
			: undefined;
		const spawnDelayMs = options.spawnDelayMs ?? DEFAULT_SPAWN_DELAY_MS;

		for (let index = 0; index < missingCount; index++) {
			console.log(chalk.gray(`  Starting Rhino ${index + 1}/${missingCount}...`));
			try {
				const launched = await dependencies.launch(
					config.launchCommand,
					[...config.launchArgs],
					config,
				);
				if (config.platform === "win32" && launched.pid !== undefined) {
					state = recordOwnedProcess(state, launched.pid);
				}
			} catch (cause) {
				throw new Error(`Failed to launch Rhino with ${config.launchCommand}.`, { cause });
			}
			if (index < missingCount - 1) await dependencies.sleep(spawnDelayMs);
		}

		const readinessStartedAt = dependencies.now();
		let lastDiscoveryError: unknown;
		while (dependencies.now() - readinessStartedAt < dependencies.maxWaitMs) {
			await dependencies.sleep(dependencies.pollIntervalMs);
			let instances: RhinoInstanceJson[];
			try {
				instances = await client.list();
			} catch (error) {
				lastDiscoveryError = error;
				displayDebug("rhino", `readiness discovery failed: ${(error as Error).message}`);
				continue;
			}

			state = recordLaunchedInstances(
				state,
				instances,
				config.platform,
				state.ownedProcessIds,
				preLaunchRhinoPids,
			);
			selected = selectRhinoInstances(instances, effectiveCount, state.activePipeIds);
			if (selected.length === effectiveCount) {
				return saveSelection(selected, dependencies.now() - launchStartedAt);
			}
		}

		throw new Error(
			`Rhino did not expose ${effectiveCount} ready instance(s) within ${dependencies.maxWaitMs}ms.`,
			{ cause: lastDiscoveryError },
		);
	};

	const quitInstance = async (pipeId: string): Promise<void> => {
		const exitCode = await client.quit(pipeId);
		if (exitCode !== 0) throw new Error(`Failed to quit Rhino ${pipeId}. rhinocode exited with code ${exitCode}.`);
		state = forgetOwnedPipe(state, pipeId);
	};

	const refreshOwnedPipes = async (): Promise<void> => {
		if (state.ownedProcessIds.size === 0) return;
		try {
			const instances = await client.list();
			state = recordLaunchedInstances(
				state,
				instances,
				config.platform,
				state.ownedProcessIds,
				undefined,
			);
		} catch (error) {
			displayDebug("rhino", `cleanup discovery failed: ${(error as Error).message}`);
		}
	};

	const cleanupOwned = (): Promise<void> => {
		if (cleanupPromise) return cleanupPromise;
		cleanupPromise = (async () => {
			await refreshOwnedPipes();
			for (const pipeId of [...state.ownedPipes.keys()]) {
				try {
					await quitInstance(pipeId);
				} catch (error) {
					displayWarning(`Failed to close Rhino ${pipeId}: ${(error as Error).message}`);
				}
			}
			for (const processId of [...state.ownedProcessIds]) {
				try {
					await dependencies.terminateProcess(processId);
					state = forgetOwnedProcess(state, processId);
				} catch (error) {
					displayWarning(`Failed to stop Rhino process ${processId}: ${(error as Error).message}`);
				}
			}
		})().finally(() => {
			cleanupPromise = undefined;
		});
		return cleanupPromise;
	};

	return { config, client, ensureInstances, quitInstance, cleanupOwned };
}

export function delay(ms: number): Promise<void> {
	return defaultDependencies.sleep(ms);
}

export function installSessionSignalCleanup(session: RhinoSession): () => void {
	const onSigint = () => {
		void session.cleanupOwned().finally(() => process.exit(130));
	};
	const onSigterm = () => {
		void session.cleanupOwned().finally(() => process.exit(143));
	};
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);
	return () => {
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	};
}
