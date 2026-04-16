import chalk from "chalk";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import type { RhinoInstance, CommandResult, BarkCommand } from "../types";
import { DEFAULT_TIMEOUT } from "../constants";
import { displayInfo, displayDebug } from "./logger";
import { listRhinoInstancesJson } from "./rhinocode-schemas";

export function buildOutputPath(
	outputFolder: string,
	outputName: string,
	outputSuffix: string,
	fileName: string,
	projectRoot: string,
): string {
	const outputNameReplaced = outputName.replace(/{{fileName}}/g, fileName);
	const fullFileName = `${outputNameReplaced}.${outputSuffix}`;
	return resolve(projectRoot, outputFolder, fullFileName);
}

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
	const instances = await listRhinoInstancesJson();
	if (instances.length === 0) {
		throw new Error("No Rhino instance found. Start Rhino first with 'bark run'");
	}

	const lastInstance = instances[instances.length - 1]!;
	return { id: lastInstance.pipeId, connected: true };
}

export async function execute(
	inputFile: string,
	fileName: string,
	command: BarkCommand,
	projectRoot: string,
	instanceId?: string,
): Promise<CommandResult> {
	const timeout = DEFAULT_TIMEOUT * 1000;
	const pollInterval = command.pollIntervalMs ?? 500;
	const startTime = Date.now();

	if (!command.rhCommand.includes("{{path}}")) {
		throw new Error("rhCommand must contain {{path}} placeholder");
	}

	const outputPath = buildOutputPath(
		command.outputFolder,
		command.outputName,
		command.outputSuffix,
		fileName,
		projectRoot,
	);

	let replacedCommand = command.rhCommand
		.replace(/{{path}}/g, outputPath)
		.replace(/{{fileName}}/g, fileName);

	const rhinoArg = instanceId ? ["--rhino", instanceId] : [];
	const openArgs = [...rhinoArg, "command", '-_open', `"${inputFile}"`];
	displayDebug("rhinocode", `spawn: rhinocode ${openArgs.join(" ")}`);

	return new Promise((resolve) => {
		const openProc = spawn("rhinocode", openArgs, {
			stdio: "pipe",
		});

		openProc.on("close", (openCode) => {
			displayDebug("rhinocode", `file opened with code: ${openCode}`);
			displayDebug("rhinocode", `command string: "${replacedCommand}"`);
			const cmdArgs = [...rhinoArg, "command", replacedCommand];
			const cmdProc = spawn("rhinocode", cmdArgs, {
				stdio: "pipe",
			});

			cmdProc.on("close", (cmdCode) => {
				displayDebug("rhinocode", `command executed with code: ${cmdCode}`);
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
	const instances = await listRhinoInstancesJson();
	return instances.map((i) => i.pipeId);
}

export function closeAll() {
	displayDebug("rhinocode", "running _-Quit on all instances");
	spawn("rhinocode", ["command", "_-Quit"], {
		stdio: "pipe",
	});
}
