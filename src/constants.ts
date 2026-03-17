import { platform, arch } from "os";

const isWindows = platform() === "win32";
const isMac = platform() === "darwin";

export const RHINO_PATH = isMac
  ? "/Applications/Rhino 8.app/Contents/MacOS/Rhino 8"
  : "C:/Program Files/Rhino 8/System/Rhino.exe";

export const CONFIG_FILENAME = "barkcode.json";

export const DEFAULT_TIMEOUT = 300;
export const DEFAULT_COUNTER_START = 1;
export const DEFAULT_COUNTER_PAD = 3;

export { isWindows, isMac };
