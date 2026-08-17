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
import { RhinocodeClient } from "./rhinocode";
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

export class RhinoSession {
	private readonly dependencies: RhinoSessionDependencies;
	private activePipeIds = new Set<string>();
	private readonly ownedPipes = new Map<string, number>();
	private readonly ownedProcessIds = new Set<number>();
	private cleanupPromise?: Promise<void>;

	constructor(
		public readonly config: RhinoPlatformConfig,
		public readonly client: RhinocodeClient,
		dependencies: Partial<RhinoSessionDependencies> = {},
	) {
		this.dependencies = { ...defaultDependencies, ...dependencies };
	}

	async ensureInstances(options: {
		requestedCount: number;
		spawnDelayMs?: number;
	}): Promise<EnsureRhinoResult> {
		const requestedCount = options.requestedCount;
		if (!Number.isInteger(requestedCount) || requestedCount < 1) {
			throw new RangeError("The Rhino instance count must be a positive integer.");
		}

		assertRhinoInstalled(this.config, this.dependencies.exists);
		const effectiveCount = Math.min(requestedCount, this.config.maxInstances);
		const initial = await this.client.list();

		let selected = this.selectInstances(initial, effectiveCount);
		if (selected.length === effectiveCount) {
			return this.recordSelection(selected, 0);
		}

		const missingCount = effectiveCount - selected.length;
		const launchStartedAt = this.dependencies.now();
		const preLaunchRhinoPids = this.config.platform === "darwin"
			? await this.dependencies.listRhinoProcessIds(this.config)
			: undefined;
		const spawnDelayMs = options.spawnDelayMs ?? DEFAULT_SPAWN_DELAY_MS;

		for (let index = 0; index < missingCount; index++) {
			console.log(chalk.gray(`  Starting Rhino ${index + 1}/${missingCount}...`));
			try {
				const launched = await this.dependencies.launch(
					this.config.launchCommand,
					[...this.config.launchArgs],
					this.config,
				);
				if (this.config.platform === "win32" && launched.pid !== undefined) {
					this.ownedProcessIds.add(launched.pid);
				}
			} catch (cause) {
				throw new Error(`Failed to launch Rhino with ${this.config.launchCommand}.`, { cause });
			}
			if (index < missingCount - 1) await this.dependencies.sleep(spawnDelayMs);
		}

		const readinessStartedAt = this.dependencies.now();
		let lastDiscoveryError: unknown;
		while (this.dependencies.now() - readinessStartedAt < this.dependencies.maxWaitMs) {
			await this.dependencies.sleep(this.dependencies.pollIntervalMs);
			let instances: RhinoInstanceJson[];
			try {
				instances = await this.client.list();
			} catch (error) {
				lastDiscoveryError = error;
				displayDebug("rhino", `readiness discovery failed: ${(error as Error).message}`);
				continue;
			}

			this.recordOwnedInstances(instances, this.ownedProcessIds, preLaunchRhinoPids);
			selected = this.selectInstances(instances, effectiveCount);
			if (selected.length === effectiveCount) {
				return this.recordSelection(selected, this.dependencies.now() - launchStartedAt);
			}
		}

		throw new Error(
			`Rhino did not expose ${effectiveCount} ready instance(s) within ${this.dependencies.maxWaitMs}ms.`,
			{ cause: lastDiscoveryError },
		);
	}

	async quitInstance(pipeId: string): Promise<void> {
		const exitCode = await this.client.quit(pipeId);
		if (exitCode !== 0) throw new Error(`Failed to quit Rhino ${pipeId}. rhinocode exited with code ${exitCode}.`);
		this.forgetOwnedPipe(pipeId);
	}

	cleanupOwned(): Promise<void> {
		if (this.cleanupPromise) return this.cleanupPromise;
		this.cleanupPromise = (async () => {
			await this.refreshOwnedPipes();
			for (const pipeId of this.ownedPipes.keys()) {
				try {
					await this.quitInstance(pipeId);
				} catch (error) {
					displayWarning(`Failed to close Rhino ${pipeId}: ${(error as Error).message}`);
				}
			}
			for (const processId of [...this.ownedProcessIds]) {
				try {
					await this.dependencies.terminateProcess(processId);
					this.forgetOwnedProcess(processId);
				} catch (error) {
					displayWarning(`Failed to stop Rhino process ${processId}: ${(error as Error).message}`);
				}
			}
		})().finally(() => {
			this.cleanupPromise = undefined;
		});
		return this.cleanupPromise;
	}

	private selectInstances(instances: RhinoInstanceJson[], count: number): RhinoInstanceJson[] {
		const byPipeId = new Map(instances.map((instance) => [instance.pipeId, instance]));
		const selected: RhinoInstanceJson[] = [];

		for (const pipeId of this.activePipeIds) {
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

	private recordOwnedInstances(
		instances: RhinoInstanceJson[],
		directChildPids: Set<number>,
		preLaunchRhinoPids: Set<number> | undefined,
	): void {
		for (const instance of instances) {
			const owned = this.config.platform === "win32"
				? directChildPids.has(instance.processId)
				: preLaunchRhinoPids !== undefined && !preLaunchRhinoPids.has(instance.processId);
			if (!owned) continue;
			this.ownedPipes.set(instance.pipeId, instance.processId);
		}
	}

	private recordSelection(
		selected: RhinoInstanceJson[],
		spawnElapsedMs: number,
	): EnsureRhinoResult {
		const pipeIds = selected.map((instance) => instance.pipeId);
		this.activePipeIds = new Set(pipeIds);
		return {
			pipeIds,
			launchedPipeIds: pipeIds.filter((pipeId) => this.ownedPipes.has(pipeId)),
			spawnElapsedMs,
		};
	}

	private async refreshOwnedPipes(): Promise<void> {
		if (this.ownedProcessIds.size === 0) return;
		try {
			const instances = await this.client.list();
			this.recordOwnedInstances(instances, this.ownedProcessIds, undefined);
		} catch (error) {
			displayDebug("rhino", `cleanup discovery failed: ${(error as Error).message}`);
		}
	}

	private forgetOwnedPipe(pipeId: string): void {
		const processId = this.ownedPipes.get(pipeId);
		this.ownedPipes.delete(pipeId);
		if (processId !== undefined) this.ownedProcessIds.delete(processId);
	}

	private forgetOwnedProcess(processId: number): void {
		this.ownedProcessIds.delete(processId);
		for (const [pipeId, mappedProcessId] of this.ownedPipes) {
			if (mappedProcessId !== processId) continue;
			this.ownedPipes.delete(pipeId);
		}
	}
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
	const client = options.client ?? new RhinocodeClient(executable);
	return new RhinoSession(config, client, options.dependencies);
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
