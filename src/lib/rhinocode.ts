import chalk from "chalk";
import { spawn } from "child_process";
import type { RhinoInstance, CommandResult, ExecuteOptions } from "../types";
import { DEFAULT_TIMEOUT } from "../constants";
import { displayInfo, displayDebug } from "./logger";

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
  instanceId: string,
  command: string,
  options: ExecuteOptions = {},
): Promise<CommandResult> {
  const timeout = DEFAULT_TIMEOUT * 1000;
  const waitForCompletion = options.waitForCompletion ?? true;

  const startTime = Date.now();

  return new Promise((resolve) => {
    const action = waitForCompletion ? "exec" : "send";
    const fullArgs = [action, instanceId, command];
	displayDebug("rhinocode", `spawn: rhinocode ${fullArgs.join(" ")}`);
	displayDebug("rhinocode", `command string: "${command}"`);

    const proc = spawn("rhinocode", fullArgs, {
      stdio: "pipe",
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
	displayDebug("rhinocode", `timed out after ${timeout}ms`);
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

	displayDebug("rhinocode", `exit code: ${code}, duration: ${duration}ms`);
	if (stdout) displayDebug("rhinocode", `stdout: ${stdout}`);
	if (stderr) displayDebug("rhinocode", `stderr: ${stderr}`);

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
  instanceId: string,
  command: string,
  filePath: string,
): Promise<CommandResult> {
  const fullCommand = `${command} "${filePath}"`;

	displayDebug("executeOnFile", `fullCommand: ${fullCommand}`);

  return execute(instanceId, fullCommand);
}

export async function disconnect(instanceId: string): Promise<void> {
  displayInfo(`  Disconnected from Rhino ${instanceId}`);
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
