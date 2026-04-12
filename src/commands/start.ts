import { createRhinoRunner } from "../lib/rhino";
import { RHINO_PATH } from "../constants";
import { showCommandMenu } from "../lib/menu";
import { processBatch, previewBatch, printBatchSummary } from "../lib/batch";
import { displaySuccess, displayWarning, displayInfo, displayBold } from "../lib/logger";
import { loadConfigOrExit, ensureRhinoInstances, executeCommandIfRequested } from "./start-helpers";
import { platform } from "os";

export async function startRun(
	options: {
		spawn?: number;
		config?: string;
		command?: string;
		dryRun?: boolean;
	} = {},
) {
	const {
		spawn: spawnCount = 1,
		config: configPath,
		command: commandName,
		dryRun: isDryRun = false,
	} = options;
	const rhinoRunner = createRhinoRunner(RHINO_PATH, isDryRun, spawnCount);

	if (isDryRun) {
		displayWarning("=== DRY RUN MODE ===\n");
	}

	await rhinoRunner.checkRhinoOrExit();
	const loadedConfig = await loadConfigOrExit({ configPath });
	await rhinoRunner.checkRhinocodeOrExit();

	const { config, projectRoot } = loadedConfig;
	displaySuccess(`Config loaded from ${loadedConfig.configPath}`);
	displayInfo(`  Project root: ${projectRoot}\n`);

	const instances = await ensureRhinoInstances(rhinoRunner, spawnCount, isDryRun);

	if (commandName) {
		await executeCommandIfRequested(/* rhinoRunner, */ commandName, config, projectRoot, instances, isDryRun);
	}

	displayInfo("\nPress Ctrl+C to exit\n");

	while (true) {
		const action = await showCommandMenu(config, projectRoot);

		if (action.type === "exit") break;

		if (action.type === "run") {
			displayBold(`\nRunning: ${action.command.name}`);
			displayInfo(`  Input: ${action.command.inputFolder || "."}/${action.command.inputPattern || "*.3dm"}`);

			if (action.files.length === 0) {
				displayWarning(`  No files found matching ${action.command.inputPattern || "*.3dm"}`);
				continue;
			}

			displayInfo(`  Found ${action.files.length} file(s)`);

			const fileNamesWithoutExt = action.files.map((file) => {
				const fileName = file.split("/").pop() || file;
				return fileName.replace(/\.[^/.]+$/, "");
			});

			const isMac = platform() === "darwin";
			const { summary } = isDryRun
				? await previewBatch(action.command, action.files, fileNamesWithoutExt, projectRoot)
				: await processBatch(action.command, action.files, fileNamesWithoutExt, instances, projectRoot, isMac);

			printBatchSummary(summary);
		}
	}

	displayInfo("\nExiting Barkcode. Rhino will remain open.");
}
