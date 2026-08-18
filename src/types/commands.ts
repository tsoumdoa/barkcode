export type RunOptions = {
	spawn?: number;
	spawnDelay?: number;
	config?: string;
	command?: string;
	debug?: boolean;
};

export type RunSessionOptions = {
	spawnCount: number;
	spawnDelay?: number;
	configPath?: string;
	commandName?: string;
};

export type CommandOptions = {
	command: string;
	debug?: boolean;
};

export type InitOptions = {
	path?: string;
	force?: boolean;
};

export type BenchmarkOptions = {
	instances?: string;
	delay?: string;
};
