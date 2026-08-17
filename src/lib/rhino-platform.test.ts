import { describe, expect, it } from "bun:test";
import {
	getRhinoPlatformConfig,
	resolveRhinocodeExecutable,
	RhinocodeExecutableError,
	UnsupportedPlatformError,
} from "./rhino-platform";

describe("Rhino platform configuration", () => {
	it("builds the exact Windows launch command", () => {
		const config = getRhinoPlatformConfig("win32");
		expect(config.launchCommand).toBe("C:\\Program Files\\Rhino 8\\System\\Rhino.exe");
		expect(config.launchArgs).toEqual(["/nosplash", '/runscript="_StartScriptServer"']);
		expect(config.processName).toBe("Rhino.exe");
		expect(config.maxInstances).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("builds the exact macOS launch command and one-instance cap", () => {
		const config = getRhinoPlatformConfig("darwin");
		expect([config.launchCommand, ...config.launchArgs]).toEqual([
			"/usr/bin/open",
			"/Applications/Rhino 8.app",
			"--args",
			"-nosplash",
			"-runscript",
			"_StartScriptServer",
		]);
		expect(config.maxInstances).toBe(1);
		expect(config.processName).toBe("Rhinoceros");
	});

	it("prefers PATH and falls back to Rhino's bundled rhinocode", () => {
		const config = getRhinoPlatformConfig("darwin");
		expect(resolveRhinocodeExecutable(config, {
			which: () => "/opt/homebrew/bin/rhinocode",
			exists: () => true,
		})).toBe("/opt/homebrew/bin/rhinocode");

		expect(resolveRhinocodeExecutable(config, {
			which: () => null,
			exists: (path) => path.endsWith("/Contents/Resources/bin/rhinocode"),
		})).toBe("/Applications/Rhino 8.app/Contents/Resources/bin/rhinocode");
	});

	it("reports unsupported platforms and missing rhinocode directly", () => {
		expect(() => getRhinoPlatformConfig("linux")).toThrow(UnsupportedPlatformError);
		const config = getRhinoPlatformConfig("darwin");
		expect(() => resolveRhinocodeExecutable(config, {
			which: () => null,
			exists: () => false,
		})).toThrow(RhinocodeExecutableError);
	});
});
