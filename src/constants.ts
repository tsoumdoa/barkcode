import { platform } from "os";

export const CONFIG_FILENAME = "barkcode.json";
export const DEFAULT_TIMEOUT = 300;
export const DEFAULT_SPAWN_COUNT = platform() === "win32" ? 8 : 1;
export const MAX_SPAWN_COUNT_WARNING = 16;
