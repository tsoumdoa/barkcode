import type { RhinocodeClient } from "./rhinocode";
import type { RhinoPlatformConfig } from "./rhino-platform";

export type EnsureRhinoResult = {
	pipeIds: string[];
	launchedPipeIds: string[];
	spawnElapsedMs: number;
};

export type EnsureInstancesOptions = {
	requestedCount: number;
	spawnDelayMs?: number;
};

export type LaunchProcess = (
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

export type RhinoSession = {
	readonly config: RhinoPlatformConfig;
	readonly client: RhinocodeClient;
	ensureInstances: (options: EnsureInstancesOptions) => Promise<EnsureRhinoResult>;
	quitInstance: (pipeId: string) => Promise<void>;
	cleanupOwned: () => Promise<void>;
};

export type RhinoSessionState = {
	readonly activePipeIds: ReadonlySet<string>;
	readonly launchedPipeIds: ReadonlySet<string>;
	readonly ownedPipes: ReadonlyMap<string, number>;
	readonly ownedProcessIds: ReadonlySet<number>;
};

export type CreateRhinoSessionOptions = {
	platform?: NodeJS.Platform;
	config?: RhinoPlatformConfig;
	rhinocodeExecutable?: string;
	client?: RhinocodeClient;
	dependencies?: Partial<RhinoSessionDependencies>;
};
