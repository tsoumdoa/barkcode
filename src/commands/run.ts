import { basename, join } from "path";
import { createRhinoSession, installSessionSignalCleanup, type RhinoSession } from "../lib/rhino";
import { DEFAULT_SPAWN_COUNT, MAX_SPAWN_COUNT_WARNING } from "../constants";
import { showCommandMenu } from "../lib/menu";
import { processBatch, printBatchSummary } from "../lib/batch";
import { displaySuccess, displayWarning, displayInfo, displayBold, displayError, setDebugMode } from "../lib/logger";
import { loadConfigOrExit, ensureRhinoInstances, executeCommandIfRequested, ensureOutputFolder } from "./run-helpers";

type RunOptions = {
	spawn?: number;
	spawnDelay?: number;
	config?: string;
	command?: string;
	debug?: boolean;
};

type RunSessionOptions = {
	spawnCount: number;
	spawnDelay?: number;
	configPath?: string;
	commandName?: string;
};

export async function run(options: RunOptions = {}) {
	const {
		spawn: spawnCount = DEFAULT_SPAWN_COUNT,
		spawnDelay,
		config: configPath,
		command: commandName,
		debug: isDebug = false,
	} = options;

	setDebugMode(isDebug);
	if (spawnCount > MAX_SPAWN_COUNT_WARNING) {
		displayWarning(`Spawning ${spawnCount} instances may cause performance issues. Using 16 or fewer is recommended.`);
	}

	try {
		await runSession({ spawnCount, spawnDelay, configPath, commandName });
	} catch (error) {
		displayError((error as Error).message);
		process.exitCode = 1;
	}
}

async function runSession(options: RunSessionOptions): Promise<void> {
	displayInfo("Checking for Rhino 8 and rhinocode...");
	const session = createRhinoSession();
	const removeSignalHandlers = installSessionSignalCleanup(session);

	try {
		await executeSession(session, options);
	} finally {
		await session.cleanupOwned();
		removeSignalHandlers();
	}
}

async function executeSession(
	session: RhinoSession,
	{ spawnCount, spawnDelay, configPath, commandName }: RunSessionOptions,
): Promise<void> {
	await session.client.checkAvailable();
	const loadedConfig = await loadConfigOrExit({ configPath });
	const { config, projectRoot } = loadedConfig;
	displaySuccess(`Config loaded from ${loadedConfig.configPath}`);
	displayInfo(`  Project root: ${projectRoot}\n`);

	let { pipeIds: instances } = await ensureRhinoInstances(session, spawnCount, spawnDelay);

	if (commandName) {
		await executeCommandIfRequested(session.client, commandName, config, projectRoot, instances);
		displayInfo(
			session.config.platform === "darwin"
				? "\nClosing Barkcode. Rhino remains open on macOS."
				: "\nClosing Barkcode and Rhino instances started by Barkcode.",
		);
		return;
	}

	displayInfo("\nPress Ctrl+C to exit\n");
	while (true) {
		const action = await showCommandMenu(config, projectRoot);
		if (action.type === "exit") break;

		displayBold(`\nRunning: ${action.command.name}`);
		displayInfo(`  Input: ${join(action.command.inputFolder || ".", action.command.inputPattern || "*.3dm")}`);
		if (action.files.length === 0) {
			displayWarning(`  No files found matching ${action.command.inputPattern || "*.3dm"}`);
			continue;
		}

		({ pipeIds: instances } = await ensureRhinoInstances(session, spawnCount, spawnDelay));
		displayInfo(`  Found ${action.files.length} file(s)`);
		await ensureOutputFolder(action.command.outputFolder, projectRoot);

		const fileNamesWithoutExt = action.files.map((file) => basename(file).replace(/\.[^/.]+$/, ""));
		const { summary } = await processBatch(
			session.client,
			action.command,
			action.files,
			fileNamesWithoutExt,
			instances,
			projectRoot,
		);
		printBatchSummary(summary);
	}
}
