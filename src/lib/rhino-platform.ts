import { existsSync } from "fs";

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

export class UnsupportedPlatformError extends Error {
	constructor(platformName: string) {
		super(`Barkcode supports Rhino startup on macOS and Windows, not ${platformName}.`);
		this.name = "UnsupportedPlatformError";
	}
}

export class RhinoInstallationError extends Error {
	constructor(path: string) {
		super(`Rhino 8 was not found at ${path}. Check your Rhino installation.`);
		this.name = "RhinoInstallationError";
	}
}

export class RhinocodeExecutableError extends Error {
	constructor(candidates: string[]) {
		super(`rhinocode was not found. Checked PATH${candidates.length > 0 ? ` and ${candidates.join(", ")}` : ""}.`);
		this.name = "RhinocodeExecutableError";
	}
}

export function getRhinoPlatformConfig(platformName: NodeJS.Platform = process.platform): RhinoPlatformConfig {
	if (platformName === "win32") {
		const installationPath = "C:\\Program Files\\Rhino 8\\System\\Rhino.exe";
		return {
			platform: "win32",
			installationPath,
			processName: "Rhino.exe",
			launchCommand: installationPath,
			launchArgs: ["/nosplash", '/runscript="_StartScriptServer"'],
			rhinocodeFallbacks: [],
			maxInstances: Number.MAX_SAFE_INTEGER,
		};
	}

	if (platformName === "darwin") {
		const installationPath = "/Applications/Rhino 8.app";
		return {
			platform: "darwin",
			installationPath,
			processName: "Rhinoceros",
			launchCommand: "/usr/bin/open",
			launchArgs: [installationPath, "--args", "-nosplash", "-runscript", "_StartScriptServer"],
			rhinocodeFallbacks: [`${installationPath}/Contents/Resources/bin/rhinocode`],
			maxInstances: 1,
		};
	}

	throw new UnsupportedPlatformError(platformName);
}

export function assertRhinoInstalled(
	config: RhinoPlatformConfig,
	exists: (path: string) => boolean = existsSync,
): void {
	if (!exists(config.installationPath)) {
		throw new RhinoInstallationError(config.installationPath);
	}
}

export function resolveRhinocodeExecutable(
	config: RhinoPlatformConfig,
	options: {
		which?: (command: string) => string | null;
		exists?: (path: string) => boolean;
	} = {},
): string {
	const which = options.which ?? ((command: string) => Bun.which(command));
	const exists = options.exists ?? existsSync;
	const fromPath = which("rhinocode");
	if (fromPath) return fromPath;

	const bundled = config.rhinocodeFallbacks.find(exists);
	if (bundled) return bundled;

	throw new RhinocodeExecutableError(config.rhinocodeFallbacks);
}
