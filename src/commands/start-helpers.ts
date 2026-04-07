import { getCommand, loadConfig } from "../lib/config";
import { collectFiles, printBatchSummary, processBatch } from "../lib/batch";
import { displaySuccess, displayError, displayWarning, displayInfo, displayBold } from "../lib/logger";
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
	isDryRun: boolean,
) {
	if (platform() === "darwin" && spawnCount > 1) {
		displayWarning("On Mac, Rhino only allows one instance. Using --spawn=1.\n");
		spawnCount = 1;
	}

	let instances = await rhinoRunner.getRunningProcesses();

	if (!isDryRun && instances.length < spawnCount) {
		if (platform() === "darwin") {
			displayWarning(`On Mac, please manually open ${spawnCount} Rhino instance(s) and run the _StartScriptServer command in each.\n`);
			displayInfo("Waiting for user to start Rhino instances...\n");
		} else {
			displayInfo("Launching Rhino 8...");
			rhinoRunner.spawnRhino(spawnCount - instances.length);
		}
		instances = await rhinoRunner.waitForRhinoInstances(spawnCount);
		instances.forEach((instance) => {
			displaySuccess(`Connected to Rhino ${instance}\n`);
		});
	}

	return instances;
}

export async function executeCommandIfRequested(
	rhinoRunner: ReturnType<typeof createRhinoRunner>,
	commandName: string,
	config: BarkcodeConfig,
	projectRoot: string,
	instances: string[],
	isDryRun: boolean,
) {
	const command = getCommand(config, commandName);

	displayBold(`Running: ${command.name}`);

	const inputPattern = command.inputPattern || "*.3dm";
	const inputFolder = command.inputFolder || ".";
	const isRecursive = command.recursive ?? false;

	const files = await collectFiles(inputFolder, inputPattern, isRecursive, projectRoot);

	if (files.length === 0 && !isDryRun) {
		displayWarning(`No files found matching ${inputPattern}`);
		process.exit(1);
	}

	displayInfo(`Found ${files.length} file(s)\n`);

	await rhinoRunner.runCommand({
		command,
		files,
		inputFolder,
		inputPattern,
		isRecursive,
		isDryRun,
	});

	const { summary } = await processBatch(command, files, projectRoot, instances, {
		outputFolder: command.outputFolder,
		dryRun: false,
		onConflict: command.onConflict || "error",
	});

	printBatchSummary(summary);
}
