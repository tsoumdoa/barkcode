import chalk from "chalk";
import { existsSync } from "fs";
import type { RhinoInstanceJson } from "../types";
import { displayDebug } from "./logger";
import {
	assertRhinoInstalled,
	getRhinoPlatformConfig,
	resolveRhinocodeExecutable,
	type RhinoPlatformConfig,
} from "./rhino-platform";
import { RhinocodeClient } from "./rhinocode";
import { type RhinoDiscoveryError } from "./rhinocode-schemas";
import { DEFAULT_SPAWN_DELAY_MS, MAX_WAIT_MS, POLL_INTERVAL_MS } from "./spawn-constants";

export type EnsureRhinoResult = {
	effectiveCount: number;
	pipeIds: string[];
	launchedPipeIds: string[];
	reusedPipeIds: string[];
	spawnElapsedMs: number;
};

export type RhinoSessionState = {
	activePipeIds: Set<string>;
	ownedPipeIds: Set<string>;
	cleanedPipeIds: Set<string>;
};

export class RhinoLaunchError extends Error {
	constructor(message: string, options: { cause?: unknown } = {}) {
		super(message, options);
		this.name = "RhinoLaunchError";
	}
}

export class RhinoReadinessError extends Error {
	constructor(message: string, options: { cause?: unknown } = {}) {
		super(message, options);
		this.name = "RhinoReadinessError";
	}
}

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
	listRhinoProcessIds: (config: RhinoPlatformConfig) => Promise<Set<number>>;
	pollIntervalMs: number;
	maxWaitMs: number;
};

const defaultDependencies: RhinoSessionDependencies = {
	now: Date.now,
	sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
	exists: existsSync,
	launch: async (command, args, config) => {
		try {
			const proc = Bun.spawn([command, ...args], {
				stdout: "ignore",
				stderr: "ignore",
				stdin: "ignore",
				windowsVerbatimArguments: config.platform === "win32",
			});
			return { pid: proc.pid };
		} catch (cause) {
			throw new RhinoLaunchError(`Failed to launch Rhino with ${command}.`, { cause });
		}
	},
	listRhinoProcessIds: async (config) => {
		if (config.platform !== "darwin") return new Set<number>();
		try {
			const proc = Bun.spawn(["/usr/bin/pgrep", "-x", config.processName], {
				stdout: "pipe",
				stderr: "ignore",
			});
			const output = await new Response(proc.stdout).text();
			await proc.exited;
			return new Set(
				output
					.split(/\s+/)
					.filter(Boolean)
					.map(Number)
					.filter(Number.isInteger),
			);
		} catch {
			return new Set<number>();
		}
	},
	pollIntervalMs: POLL_INTERVAL_MS,
	maxWaitMs: MAX_WAIT_MS,
};

export class RhinoSession {
	readonly state: RhinoSessionState = {
		activePipeIds: new Set(),
		ownedPipeIds: new Set(),
		cleanedPipeIds: new Set(),
	};

	private readonly dependencies: RhinoSessionDependencies;
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
		if (initial.kind === "error") throw initial.error;

		let selected = this.selectInstances(initial.instances, effectiveCount);
		if (selected.length === effectiveCount) {
			return this.recordSelection(selected, effectiveCount, 0);
		}

		const missingCount = effectiveCount - selected.length;
		const launchStartedAt = this.dependencies.now();
		const preLaunchRhinoPids = this.config.platform === "darwin"
			? await this.dependencies.listRhinoProcessIds(this.config)
			: new Set<number>();
		const directChildPids = new Set<number>();
		const spawnDelayMs = options.spawnDelayMs ?? DEFAULT_SPAWN_DELAY_MS;

		for (let index = 0; index < missingCount; index++) {
			console.log(chalk.gray(`  Starting Rhino ${index + 1}/${missingCount}...`));
			let launched: { pid?: number };
			try {
				launched = await this.dependencies.launch(
					this.config.launchCommand,
					[...this.config.launchArgs],
					this.config,
				);
			} catch (cause) {
				if (cause instanceof RhinoLaunchError) throw cause;
				throw new RhinoLaunchError(`Failed to launch Rhino with ${this.config.launchCommand}.`, { cause });
			}
			if (this.config.platform === "win32" && launched.pid !== undefined) {
				directChildPids.add(launched.pid);
			}
			if (index < missingCount - 1) await this.dependencies.sleep(spawnDelayMs);
		}

		let lastDiscoveryError: RhinoDiscoveryError | undefined;
		while (this.dependencies.now() - launchStartedAt < this.dependencies.maxWaitMs) {
			await this.dependencies.sleep(this.dependencies.pollIntervalMs);
			const discovery = await this.client.list();
			if (discovery.kind === "error") {
				lastDiscoveryError = discovery.error;
				displayDebug("rhino", `readiness discovery failed: ${discovery.error.message}`);
				continue;
			}

			this.recordProvenOwnership(discovery.instances, directChildPids, preLaunchRhinoPids);
			selected = this.selectInstances(discovery.instances, effectiveCount);
			if (selected.length === effectiveCount) {
				return this.recordSelection(
					selected,
					effectiveCount,
					this.dependencies.now() - launchStartedAt,
				);
			}
		}

		const existingMacHint = this.config.platform === "darwin" && preLaunchRhinoPids.size > 0
			? " Rhino may already be open without its script server. Run _StartScriptServer once or add it to Rhino's startup commands."
			: "";
		throw new RhinoReadinessError(
			`Rhino did not expose ${effectiveCount} ready instance(s) within ${this.dependencies.maxWaitMs}ms.${existingMacHint}`,
			{ cause: lastDiscoveryError },
		);
	}

	async quitInstance(pipeId: string): Promise<void> {
		if (this.state.cleanedPipeIds.has(pipeId)) return;
		this.state.cleanedPipeIds.add(pipeId);
		const exitCode = await this.client.quit(pipeId);
		if (exitCode !== 0) throw new Error(`Failed to quit Rhino ${pipeId}. rhinocode exited with code ${exitCode}.`);
	}

	cleanupOwned(): Promise<void> {
		if (this.cleanupPromise) return this.cleanupPromise;
		this.cleanupPromise = (async () => {
			for (const pipeId of this.state.ownedPipeIds) {
				if (this.state.cleanedPipeIds.has(pipeId)) continue;
				this.state.cleanedPipeIds.add(pipeId);
				try {
					await this.client.quit(pipeId);
				} catch (error) {
					displayDebug("rhino", `cleanup failed for ${pipeId}: ${(error as Error).message}`);
				}
			}
		})();
		return this.cleanupPromise;
	}

	private selectInstances(instances: RhinoInstanceJson[], count: number): RhinoInstanceJson[] {
		const byPipeId = new Map(instances.map((instance) => [instance.pipeId, instance]));
		const selected: RhinoInstanceJson[] = [];

		for (const pipeId of this.state.activePipeIds) {
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

	private recordProvenOwnership(
		instances: RhinoInstanceJson[],
		directChildPids: Set<number>,
		preLaunchRhinoPids: Set<number>,
	): void {
		for (const instance of instances) {
			const owned = this.config.platform === "win32"
				? directChildPids.has(instance.processId)
				: !preLaunchRhinoPids.has(instance.processId);
			if (owned) this.state.ownedPipeIds.add(instance.pipeId);
		}
	}

	private recordSelection(
		selected: RhinoInstanceJson[],
		effectiveCount: number,
		spawnElapsedMs: number,
	): EnsureRhinoResult {
		const pipeIds = selected.map((instance) => instance.pipeId);
		this.state.activePipeIds = new Set(pipeIds);
		return {
			effectiveCount,
			pipeIds,
			launchedPipeIds: pipeIds.filter((pipeId) => this.state.ownedPipeIds.has(pipeId)),
			reusedPipeIds: pipeIds.filter((pipeId) => !this.state.ownedPipeIds.has(pipeId)),
			spawnElapsedMs,
		};
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
	assertRhinoInstalled(config, options.dependencies?.exists ?? existsSync);
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
