import { basename, join } from "path";
import { createRhinoRunner } from "../lib/rhino";
import { RHINO_PATH } from "../constants";
import { showCommandMenu } from "../lib/menu";
import { processBatch, printBatchSummary } from "../lib/batch";
import { displaySuccess, displayWarning, displayInfo, displayBold, setDebugMode } from "../lib/logger";
import { loadConfigOrExit, ensureRhinoInstances, executeCommandIfRequested } from "./run-helpers";

export async function run(
	options: {
		spawn?: number;
		config?: string;
		command?: string;
		debug?: boolean;
	} = {},
) {
	const {
		spawn: spawnCount = 1,
		config: configPath,
		command: commandName,
		debug: isDebug = false,
	} = options;

	setDebugMode(isDebug);

	const rhinoRunner = createRhinoRunner(RHINO_PATH, spawnCount);

	await rhinoRunner.checkRhinoOrExit();
	const loadedConfig = await loadConfigOrExit({ configPath });
	await rhinoRunner.checkRhinocodeOrExit();

	const { config, projectRoot } = loadedConfig;
	displaySuccess(`Config loaded from ${loadedConfig.configPath}`);
	displayInfo(`  Project root: ${projectRoot}\n`);

	const instances = await ensureRhinoInstances(rhinoRunner, spawnCount);

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

			displayInfo(`  Found ${action.files.length} file(s)`);

			const fileNamesWithoutExt = action.files.map((file) => {
				const fileName = basename(file);
				return fileName.replace(/\.[^/.]+$/, "");
			});

			const { summary } = await processBatch(
				action.command,
				action.files,
				fileNamesWithoutExt,
				instances,
				projectRoot,
			);

			printBatchSummary(summary);
			displayInfo("\nExiting Barkcode. Please shut Rhino if it is still running.");
			process.exit(0);
		}
	}

}
