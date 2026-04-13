import chalk from "chalk";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, sep } from "path";
import type { RhinoInstance, CommandResult, BarkCommand } from "../types";
import { DEFAULT_TIMEOUT } from "../constants";
import { displayInfo, displayDebug } from "./logger";

export async function pollForFile(
  filePath: string,
  timeoutMs: number = 30000,
  intervalMs: number = 500,
): Promise<boolean> {
  const startTime = Date.now();
  displayDebug("pollForFile", `starting poll for: ${filePath}`);
  displayDebug("pollForFile", `timeout: ${timeoutMs}ms, interval: ${intervalMs}ms`);

  while (Date.now() - startTime < timeoutMs) {
    const elapsed = Date.now() - startTime;
    if (existsSync(filePath)) {
      displayDebug("pollForFile", `file found after ${elapsed}ms: ${filePath}`);
      return true;
    }
    if (elapsed % 2000 < intervalMs * 2) {
      displayDebug("pollForFile", `still polling... ${elapsed}ms elapsed`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  displayDebug("pollForFile", `TIMEOUT after ${timeoutMs}ms: ${filePath} not found`);
  return false;
}

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
	inputFile: string,
	fileName: string,
	command: BarkCommand,
	projectRoot: string,
): Promise<CommandResult> {
	const timeout = DEFAULT_TIMEOUT * 1000;
	const pollInterval = command.pollIntervalMs ?? 500;
	const startTime = Date.now();

	let replacedCommand = command.rhCommand.replace(/{{fileName}}/g, fileName);
	replacedCommand = replacedCommand.replace(/\.\//g, projectRoot + sep);

	const openArgs = ["command", '-_open', `"${inputFile}"`];
	displayDebug("rhinocode", `spawn: rhinocode ${openArgs.join(" ")}`);

	return new Promise((resolve) => {
		const openProc = spawn("rhinocode", openArgs, {
			stdio: "pipe",
		});

		openProc.on("close", (openCode) => {
			displayDebug("rhinocode", `file opened with code: ${openCode}`);

			displayDebug("rhinocode", `command string: "${replacedCommand}"`);
			const cmdProc = spawn("rhinocode", ["command", replacedCommand], {
				stdio: "pipe",
			});

			cmdProc.on("close", (cmdCode) => {
				displayDebug("rhinocode", `command executed with code: ${cmdCode}`);

				const outputPath = join(command.outputFolder, fileName + "." + command.outputSuffix);
				displayDebug("rhinocode", `polling for export: ${outputPath}`);

				(async () => {
					const found = await pollForFile(outputPath, timeout, pollInterval);
					displayDebug("rhinocode", `export file found: ${found}`);
					resolve({
						success: found,
						output: `Export completed: ${found}`,
						durationMs: Date.now() - startTime,
					});
				})();
			});
		});

		let stdout = "";
		openProc.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
	});
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

export async function closeAll(): Promise<void> {
	displayDebug("rhinocode", "running _-Quit on all instances");
	const proc = spawn("rhinocode", ["command", "_-Quit"], {
		stdio: "pipe",
	});
	await new Promise<void>((resolve) => {
		proc.on("close", () => resolve());
	});
}
