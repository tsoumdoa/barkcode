import chalk from "chalk";
import { basename } from "path";
import { getCommand, loadConfig } from "../lib/config";
import { collectFiles, printBatchSummary, processBatch } from "../lib/batch";
import {
	displaySuccess,
	displayError,
	displayWarning,
	displayInfo,
	displayBold,
	displayDebug,
} from "../lib/logger";
import { createRhinoRunner } from "../lib/rhino";
import { BarkcodeConfig } from "../types";
import { platform } from "os";

export async function loadConfigOrExit(options: { configPath?: string }) {
	let loadedConfig;
	try {
		loadedConfig = await loadConfig({ configPath: options.configPath });
	} catch (e) {
		const err = e as Error;
		displayError(err.message);
		displayInfo("\nRun `bark init` to create a barkcode.json file.");
		process.exit(1);
	}
	return loadedConfig;
}

export async function ensureRhinoInstances(
	rhinoRunner: ReturnType<typeof createRhinoRunner>,
	spawnCount: number,
	spawnDelay?: number,
) {
	const p = platform();
let spawnElapsedMs = 0;
	if (p === "darwin" && spawnCount > 1) {
		displayWarning(
			"On Mac, Rhino only allows one instance. Using --spawn=1.\n",
		);
		spawnCount = 1;
	}

	let instances = await rhinoRunner.getRunningProcesses();

	if (p === "darwin" && instances.length === 0) {
		displayWarning(
			`On Mac, please manually open ${spawnCount} Rhino instance(s) and run the _StartScriptServer command in each.\n`,
		);
		displayInfo("Waiting for Rhino instances to be ready...\n");
		instances = await rhinoRunner.waitForRhinoInstances(spawnCount);
	} else if (p === "win32") {
		displayInfo("Launching Rhino 8...");
		try {
			const result = await rhinoRunner.spawnRhino(spawnCount, spawnDelay);
			instances = result.pipeIds;
			spawnElapsedMs = result.spawnElapsedMs;
		} catch (e) {
			displayError((e as Error).message);
			process.exit(1);
		}
	}
	instances.forEach((instance) => {
		displaySuccess(`Connected to Rhino ${instance}`);
	});

	if (spawnElapsedMs > 0) {
		displayInfo(`Spawned and connected to ${instances.length} instance(s) in ${(spawnElapsedMs / 1000).toFixed(1)}s`);
	}

	return { pipeIds: instances, spawnElapsedMs };
}

export async function executeCommandIfRequested(
	commandName: string,
	config: BarkcodeConfig,
	projectRoot: string,
	instances: string[],
) {
	const command = getCommand(config, commandName);

	displayBold(`Running: ${command.name}`);
	displayDebug("executeCommandIfRequested", `command id: ${command.id}`);
	displayDebug("executeCommandIfRequested", `rhCommand: ${command.rhCommand}`);

	const inputPattern = command.inputPattern;
	const inputFolder = command.inputFolder;

	displayDebug("executeCommandIfRequested", `inputFolder: ${inputFolder}`);
	displayDebug("executeCommandIfRequested", `inputPattern: ${inputPattern}`);

	const files = await collectFiles(inputFolder, inputPattern, projectRoot);
	const fileNames = files.map((file) => {
		const fileName = basename(file);
		return fileName.replace(/\.[^/.]+$/, "");
	});

	if (files.length === 0) {
		displayWarning(`No files found matching ${inputPattern}`);
		process.exit(1);
	}

	displayInfo(`Found ${files.length} file(s)\n`);

	const { summary } = await processBatch(
		command,
		files,
		fileNames,
		instances,
		projectRoot,
	);

	printBatchSummary(summary);
}
