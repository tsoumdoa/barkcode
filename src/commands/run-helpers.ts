import { join, resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { confirm } from "@inquirer/prompts";
import { getCommand } from "../lib/config";
import { collectFiles, printBatchSummary, processBatch } from "../lib/batch";
import {
	displaySuccess,
	displayWarning,
	displayInfo,
	displayBold,
	displayDebug,
} from "../lib/logger";
import type { BarkCommand, BarkcodeConfig, RhinocodeClient, RhinoSession } from "../types";

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
	const files = await collectFiles(command.inputFolder, command.inputPattern, projectRoot);

	if (files.length === 0) {
		throw new Error(`No files found matching ${command.inputPattern}`);
	}

	await executeBatch(client, command, files, instances, projectRoot);
}

export async function executeBatch(
	client: RhinocodeClient,
	command: BarkCommand,
	files: string[],
	instances: string[],
	projectRoot: string,
): Promise<void> {
	displayBold(`Running: ${command.name}`);
	displayInfo(`  Input: ${join(command.inputFolder, command.inputPattern)}`);
	displayInfo(`  Found ${files.length} file(s)`);
	displayDebug("executeBatch", `command id: ${command.id}`);
	displayDebug("executeBatch", `rhCommand: ${command.rhCommand}`);
	await ensureOutputFolder(command.outputFolder, projectRoot);
	const summary = await processBatch(
		client,
		command,
		files,
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
