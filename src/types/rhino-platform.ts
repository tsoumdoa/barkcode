export type RhinoPlatform = "darwin" | "win32";

export type RhinoPlatformConfig = {
	platform: RhinoPlatform;
	installationPath: string;
	processName: string;
	launchCommand: string;
	launchArgs: string[];
	rhinocodeFallbacks: string[];
	maxInstances: number;
};

export type RhinocodeExecutableOptions = {
	which?: (command: string) => string | null;
	exists?: (path: string) => boolean;
};
