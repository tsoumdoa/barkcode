import { spawn } from "child_process";
import type { RhinoInstance, CommandResult, ExecuteOptions } from "../types.js";
import { DEFAULT_TIMEOUT } from "../constants.js";
import { displayInfo } from "./logger.js";

export async function connect(): Promise<RhinoInstance> {
  const proc = spawn("rhinocode", ["list"], {
    stdio: "pipe",
    shell: true,
  });

  const output = await new Promise<string>((resolve) => {
    let data = "";
    proc.stdout?.on("data", (chunk) => {
      data += chunk.toString();
    });
    proc.on("close", () => resolve(data));
  });

  const lines = output.trim().split("\n").filter(Boolean);
  if (lines.length <= 1) {
    throw new Error("No Rhino instance found. Start Rhino first with 'bark run'");
  }

  const lastLine = lines[lines.length - 1] || "";
  const parts = lastLine.trim().split(/\s+/);
  const id = parts[1] || parts[0] || "";

  return { id, connected: true };
}

export async function execute(
  instance: RhinoInstance,
  command: string,
  options: ExecuteOptions = {},
): Promise<CommandResult> {
  const timeout = (options.timeout || DEFAULT_TIMEOUT) * 1000;
  const waitForCompletion = options.waitForCompletion ?? true;

  const startTime = Date.now();

  return new Promise((resolve) => {
    const args = waitForCompletion
      ? ["exec", instance.id, command]
      : ["send", instance.id, command];

    const proc = spawn("rhinocode", args, {
      stdio: "pipe",
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeoutId = setTimeout(() => {
      proc.kill();
      resolve({
        success: false,
        output: stdout,
        error: "Command timed out",
        durationMs: Date.now() - startTime,
      });
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      resolve({
        success: code === 0,
        output: stdout,
        error: stderr || undefined,
        durationMs: duration,
      });
    });
  });
}

export async function executeOnFile(
  instance: RhinoInstance,
  command: string,
  filePath: string,
  outputPath?: string,
  options: ExecuteOptions = {},
): Promise<CommandResult> {
  let fullCommand = command;
  if (outputPath) {
    fullCommand += ` "${outputPath}"`;
  }
  fullCommand += ` "${filePath}"`;

  return execute(instance, fullCommand, options);
}

export async function disconnect(instance: RhinoInstance): Promise<void> {
  displayInfo(`  Disconnected from Rhino ${instance.id}`);
}

export async function isRhinocodeAvailable(): Promise<boolean> {
  try {
    const proc = spawn("rhinocode", ["--version"], {
      stdio: "pipe",
      shell: true,
    });

    const code = await new Promise<number>((resolve) => {
      proc.on("close", (c) => resolve(c ?? -1));
    });

    return code === 0;
  } catch {
    return false;
  }
}

export async function listRhinoInstances(): Promise<string[]> {
  const proc = spawn("rhinocode", ["list"], {
    stdio: "pipe",
    shell: true,
  });

  const output = await new Promise<string>((resolve) => {
    let data = "";
    proc.stdout?.on("data", (chunk) => {
      data += chunk.toString();
    });
    proc.on("close", () => resolve(data));
  });

  if (!output.trim()) return [];

  const lines = output.trim().split("\n").slice(1);
  return lines
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return (parts[1] || parts[0]) ?? "";
    })
    .filter((s): s is string => s !== "");
}
