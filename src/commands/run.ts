import { basename, join } from "path";
import { createRhinoRunner } from "../lib/rhino";
import { RHINO_PATH, DEFAULT_SPAWN_COUNT, MAX_SPAWN_COUNT_WARNING } from "../constants";
import { showCommandMenu } from "../lib/menu";
import { processBatch, printBatchSummary } from "../lib/batch";
import { displaySuccess, displayWarning, displayInfo, displayBold, displayError, setDebugMode } from "../lib/logger";
import { loadConfigOrExit, ensureRhinoInstances, executeCommandIfRequested, ensureOutputFolder } from "./run-helpers";

export async function run(
	options: {
		spawn?: number;
		spawnDelay?: number;
		config?: string;
		command?: string;
		debug?: boolean;
	} = {},
) {
	const {
		spawn: spawnCount = DEFAULT_SPAWN_COUNT,
		spawnDelay,
		config: configPath,
		command: commandName,
		debug: isDebug = false,
	} = options;

	setDebugMode(isDebug);

	if (spawnCount > MAX_SPAWN_COUNT_WARNING) {
		displayWarning(`Spawning ${spawnCount} instances may cause performance issues. Using 16 or fewer is recommended for stable results.`);
	}

	const rhinoRunner = createRhinoRunner(RHINO_PATH);

	await rhinoRunner.checkRhinoOrExit();
	const loadedConfig = await loadConfigOrExit({ configPath });
	await rhinoRunner.checkRhinocodeOrExit();

	const { config, projectRoot } = loadedConfig;
	displaySuccess(`Config loaded from ${loadedConfig.configPath}`);
	displayInfo(`  Project root: ${projectRoot}\n`);

	const { pipeIds: instances } = await ensureRhinoInstances(rhinoRunner, spawnCount, spawnDelay);

	if (commandName) {
		await executeCommandIfRequested(commandName, config, projectRoot, instances);
		process.exit(0);
	}

	displayInfo("\nPress Ctrl+C to exit\n");

	while (true) {
		const action = await showCommandMenu(config, projectRoot);

		if (action.type === "exit") break;

		if (action.type === "run") {
			displayBold(`\nRunning: ${action.command.name}`);
			displayInfo(`  Input: ${join(action.command.inputFolder || ".", action.command.inputPattern || "*.3dm")}`);

			if (action.files.length === 0) {
				displayWarning(`  No files found matching ${action.command.inputPattern || "*.3dm"}`);
				continue;
			}

			const currentInstances = await rhinoRunner.getRunningProcesses();
			if (currentInstances.length === 0) {
				displayError("No Rhino instances running. Please restart Rhino with _StartScriptServer and try again.");
				continue;
			}

			displayInfo(`  Found ${action.files.length} file(s)`);

			await ensureOutputFolder(action.command.outputFolder, projectRoot);

			const fileNamesWithoutExt = action.files.map((file) => {
				const fileName = basename(file);
				return fileName.replace(/\.[^/.]+$/, "");
			});

			const { summary } = await processBatch(
				action.command,
				action.files,
				fileNamesWithoutExt,
				currentInstances,
				projectRoot,
			);

			printBatchSummary(summary);
			displayInfo("\nClosing Barkcode and Rhino. Please wait.");
			process.exit(0);
		}
	}

}
