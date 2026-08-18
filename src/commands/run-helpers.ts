import { basename, resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { confirm } from "@inquirer/prompts";
import { getCommand, loadConfig } from "../lib/config";
import { collectFiles, printBatchSummary, processBatch } from "../lib/batch";
import {
	displaySuccess,
	displayWarning,
	displayInfo,
	displayBold,
	displayDebug,
} from "../lib/logger";
import type { BarkcodeConfig, RhinocodeClient, RhinoSession } from "../types";

export async function loadConfigOrExit(options: { configPath?: string }) {
	try {
		return await loadConfig({ configPath: options.configPath });
	} catch (e) {
		const err = e as Error;
		throw new Error(`${err.message}\nRun \`bark init\` to create a barkcode.json file.`, { cause: err });
	}
}

export async function ensureRhinoInstances(
	session: RhinoSession,
	spawnCount: number,
	spawnDelay?: number,
) {
	if (session.config.platform === "darwin" && spawnCount > 1) {
		displayWarning(
			"On Mac, Rhino only allows one instance. Using --spawn=1.\n",
		);
	}

	const result = await session.ensureInstances({
		requestedCount: spawnCount,
		spawnDelayMs: spawnDelay,
	});
	result.pipeIds.forEach((instance) => {
		displaySuccess(`Connected to Rhino ${instance}`);
	});

	if (result.spawnElapsedMs > 0) {
		displayInfo(`Started and connected to ${result.pipeIds.length} instance(s) in ${(result.spawnElapsedMs / 1000).toFixed(1)}s`);
	}

	return result;
}

export async function executeCommandIfRequested(
	client: RhinocodeClient,
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
		throw new Error(`No files found matching ${inputPattern}`);
	}

	displayInfo(`Found ${files.length} file(s)\n`);

	await ensureOutputFolder(command.outputFolder, projectRoot);

	const { summary } = await processBatch(
		client,
		command,
		files,
		fileNames,
		instances,
		projectRoot,
	);

	printBatchSummary(summary);
}

export async function ensureOutputFolder(
	outputFolder: string,
	projectRoot: string,
): Promise<void> {
	const fullPath = resolve(projectRoot, outputFolder);

	if (existsSync(fullPath)) return;

	displayWarning(`Output folder does not exist: ${fullPath}`);
	const shouldCreate = await confirm({
		message: "Create this folder?",
		default: true,
	});

	if (shouldCreate) {
		mkdirSync(fullPath, { recursive: true });
		displaySuccess(`Created output folder: ${fullPath}`);
	} else {
		throw new Error("Output folder creation was cancelled.");
	}
}
