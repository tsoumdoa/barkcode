import { connect } from "../lib/rhinocode";
import { loadConfig } from "../lib/config";
import { showCommandMenu } from "../lib/menu";
import { printBatchSummary, processBatch } from "../lib/batch";
import { displaySuccess, displayError, displayWarning, displayInfo, displayBold } from "../lib/logger";
import { createRhinoRunner, getRunningProcesses, waitForRhinoInstances, setupExitHandler, checkRhinocodeOrExit, isRhinoRunning } from "../lib/rhino";

import { RHINO_PATH } from "../constants";

export async function startRun(options: { spawn?: number; config?: string; command?: string; dryRun?: boolean } = {}) {
	const { spawn: spawnCount = 1, config: configPath, command: commandName, dryRun: isDryRun = false } = options;

	const rhinoRunner = createRhinoRunner(RHINO_PATH, isDryRun);

	setupExitHandler();

	if (isDryRun) {
		displayWarning("=== DRY RUN MODE ===\n");
	}

	displayInfo("Checking for Rhino 8...");
	await rhinoRunner.checkRhinoOrExit();
	displaySuccess("Rhino 8 found.\n");

	let loadedConfig;
	try {
		loadedConfig = await loadConfig({ configPath });
	} catch (e) {
		const err = e as Error;
		displayError(err.message);
		displayInfo("\nRun `bark init` to create a barkcode.json file.");
		process.exit(1);
	}

	const { config, projectRoot } = loadedConfig;

	displaySuccess(`Config loaded from ${loadedConfig.configPath}`);
	displayInfo(`  Project root: ${projectRoot}\n`);

	if (commandName) {
		const { getCommand } = await import("../lib/config.js");
		const command = getCommand(config, commandName);

		const { collectFiles } = await import("../lib/batch.js");

		displayBold(`Running: ${command.name}`);

		const inputPattern = command.inputPattern || "*.3dm";
		const inputFolder = command.inputFolder || ".";
		const isRecursive = command.recursive ?? false;

		const files = await collectFiles(inputFolder, inputPattern, isRecursive, projectRoot);

		if (files.length === 0) {
			displayWarning(`No files found matching ${inputPattern}`);
			process.exit(1);
		}

		displayInfo(`Found ${files.length} file(s)\n`);

		if (isDryRun) {
			displayWarning("=== DRY RUN MODE ===\n");
			displayInfo("Command: " + command.rhCommand);
			displayInfo("Input: " + `${inputFolder}/${inputPattern}`);
			displayInfo("Output: " + (command.outputFolder || "(default)"));
			displayInfo("Recursive: " + String(isRecursive));
			displayInfo("Mode: " + (command.inputMode || "batch"));
			console.log();
			displaySuccess("Files that would be processed:");
			files.forEach((file) => {
				displayInfo("  - " + file);
			});
			console.log();
			displayWarning("Dry run complete. No changes made.");
			process.exit(0);
		}

		await checkRhinocodeOrExit();


		const instances = await getRunningProcesses();
		if (!isDryRun) {
			displayInfo("Launching Rhino 8...");
			rhinoRunner.spawnRhino(spawnCount);

			const processes = await waitForRhinoInstances(spawnCount);
			displaySuccess(`Rhino started (${processes.length} instance(s)\n`);
		} else {
			displaySuccess(`Found ${spawnCount} running Rhino instance(s)\n`);
		}


		instances.forEach((instance) => {
			displaySuccess(`Connected to Rhino ${instance}\n`);
		});


		const { summary } = await processBatch(command, files, projectRoot, instances, {
			outputFolder: command.outputFolder,
			dryRun: false,
			onConflict: command.onConflict || "error",
		});

		printBatchSummary(summary);
		process.exit(summary.failed > 0 ? 1 : 0);
	}

	displayInfo("Checking for rhinocode...");
	await checkRhinocodeOrExit();

	displaySuccess("rhinocode found.");

	const rhinoRunningResult = await isRhinoRunning();

	if (!rhinoRunningResult.running) {
		displayInfo("\nLaunching Rhino 8...");
		rhinoRunner.spawnRhino(spawnCount);
		const processes = await waitForRhinoInstances(spawnCount);
		displaySuccess(`Rhino started (${processes.length} instance(s)\n`);
	} else {
		displayInfo("\nRhino is already running.\n");
	}

	let instance;
	try {
		instance = await connect();
	} catch (e) {
		const err = e as Error;
		displayError(err.message);
		displayWarning("\nStart Rhino first if it's not running.");
		process.exit(1);
	}

	displaySuccess(`Connected to Rhino ${instance.id}`);
	displayInfo("\nPress Ctrl+C to exit\n");

	while (true) {
		const shouldContinue = await showCommandMenu(config, instance, projectRoot);
		if (!shouldContinue) {
			break;
		}
		console.log();
	}

	displayInfo("\nExiting Barkcode. Rhino will remain open.");
}
