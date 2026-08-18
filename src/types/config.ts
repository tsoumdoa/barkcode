export type BarkcodeConfig = {
	version: "1.0";
	commands: BarkCommand[];
};

export type BarkCommand = {
	id: string;
	name: string;
	description?: string;
	rhCommand: string;
	inputPattern: string;
	inputFolder: string;
	outputFolder: string;
	outputName: string;
	outputSuffix: string;
	pollIntervalMs?: number;
};

export type LoadedConfig = {
	config: BarkcodeConfig;
	configPath: string;
	projectRoot: string;
};

export type ConfigLoadOptions = {
	cwd?: string;
	configPath?: string;
};

export type ConfigValidationResult =
	| { success: true; data: BarkcodeConfig }
	| { success: false; error: string };
