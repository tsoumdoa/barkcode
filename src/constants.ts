import { platform } from "os";
import { existsSync } from "fs";

function getRhinoPath(): string {
	const p = platform();
	if (p === "darwin") {
		return "not-found";
	}
	if (p === "win32") {
		const windowsPath = "C:\\Program Files\\Rhino 8\\System\\Rhino.exe";
		if (existsSync(windowsPath)) {
			return windowsPath;
		}
		return windowsPath;
	}
	return "/Applications/Rhino 8.app/Contents/MacOS/Rhino";
}

export const RHINO_PATH = getRhinoPath();
export const CONFIG_FILENAME = "barkcode.json";
export const DEFAULT_TIMEOUT = 300;
export const DEFAULT_COUNTER_START = 1;
export const DEFAULT_COUNTER_PAD = 3;
export const DEFAULT_SPAWN_COUNT = platform() === "win32" ? 12 : 1;
export const MAX_SPAWN_COUNT_WARNING = 16;
