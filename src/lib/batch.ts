import { glob } from "glob";
import chalk from "chalk";
import { resolve, join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { BatchSummary, FileMapping, BarkCommand } from "../types";
import { executeOnFile } from "./rhinocode";
import { displayWarning, displayInfo, displayBold, displayTotal, displaySucceeded, displayFailed, displayDebug } from "./logger";

export async function collectFiles(
	inputFolder: string,
	pattern: string,
	recursive: boolean,
	projectRoot: string,
): Promise<string[]> {
	const fullInputPath = resolve(projectRoot, inputFolder);
	const globPattern = recursive
		? join(fullInputPath, "**", pattern)
		: join(fullInputPath, pattern);

	displayDebug("collectFiles", `globbing...`);
	displayDebug("collectFiles", `inputFolder: ${inputFolder}`);
	displayDebug("collectFiles", `fullInputPath: ${fullInputPath}`);
	displayDebug("collectFiles", `globPattern: ${globPattern}`);
	displayDebug("collectFiles", `recursive: ${recursive}`);

	const files = await glob(globPattern, {
		nodir: true,
		dot: false,
	});

	displayDebug("collectFiles", `found ${files.length} file(s)`);
	if (files.length > 0) {
		files.forEach((f) => displayDebug("collectFiles", `  ${f}`));
	}

	return files;
}

export async function processBatch(
	command: BarkCommand,
	inputFiles: string[],
	projectRoot: string,
	instances: string[],
	options: {
		outputFolder?: string;
	} = {},
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	const { rhCommand, timeout, waitForCompletion } = command;

	const mappings: FileMapping[] = [];
	for (const inputPath of inputFiles) {
		let outputPath = inputPath;
		if (options.outputFolder) {
			outputPath = resolve(projectRoot, options.outputFolder, inputPath.split("/").pop()!);
		}
		mappings.push({
			inputPath,
			outputPath,
			status: "pending",
		});
	}

	const finalMappings: FileMapping[] = [];
	let succeeded = 0;
	let failed = 0;

	const outputDir = options.outputFolder ? resolve(projectRoot, options.outputFolder) : null;
	if (outputDir && !existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const instanceBatches = new Map<string, FileMapping[]>();
	const validInstanceIds = instances.filter((id) => id && id.trim() !== "");
	if (validInstanceIds.length === 0) {
		throw new Error("No Rhino instances available");
	}
	displayDebug("processBatch", `valid instances: ${validInstanceIds.join(", ")}`);
	validInstanceIds.forEach((id) => instanceBatches.set(id, []));

	mappings.forEach((mapping, idx) => {
		const instanceId = validInstanceIds[idx % validInstanceIds.length]!;
		instanceBatches.get(instanceId)!.push(mapping);
	});

	for (const [instanceId, batch] of instanceBatches) {
		displayDebug("processBatch", `instance ${instanceId} gets ${batch.length} file(s)`);
	}

	displayDebug("processBatch", `starting parallel execution...`);
	await Promise.all(
		validInstanceIds.map(async (instanceId) => {
			const batch = instanceBatches.get(instanceId) || [];
			for (const mapping of batch) {
				mapping.status = "processing";
				try {
					const result = await executeOnFile(
						instanceId,
						rhCommand,
						mapping.inputPath,
						mapping.outputPath,
						command.outputFormat,
						{ timeout, waitForCompletion },
					);
					if (result.success) {
						mapping.status = "success";
						succeeded++;
					} else {
						mapping.status = "failed";
						mapping.error = result.error;
						failed++;
					}
				} catch (e) {
					mapping.status = "failed";
					mapping.error = (e as Error).message;
					failed++;
				}
				finalMappings.push(mapping);
			}
		}),
	);

	const summary: BatchSummary = {
		total: inputFiles.length,
		succeeded,
		failed,
		skipped: 0,
	};

	return { mappings: finalMappings, summary };
}

async function computeBatchMappings(
	command: BarkCommand,
	inputFiles: string[],
	projectRoot: string,
	options: {
		outputFolder?: string;
		dryRun?: boolean;
	},
): Promise<{
	mappings: FileMapping[];
}> {
	const mappings: FileMapping[] = [];

	for (const inputPath of inputFiles) {
		let outputPath = inputPath;
		if (options.outputFolder) {
			outputPath = resolve(projectRoot, options.outputFolder, inputPath.split("/").pop()!);
		}
		mappings.push({
			inputPath,
			outputPath,
			status: "pending",
		});
	}

	if (options.dryRun) {
		displayInfo(`\nPreview. Would process ${mappings.length} files:\n`);
		for (const mapping of mappings.slice(0, 10)) {
			console.log(`  ${mapping.inputPath}`);
			displayInfo(`    -> ${mapping.outputPath}`);
		}
		if (mappings.length > 10) {
			displayInfo(`  ... and ${mappings.length - 10} more`);
		}
		displayWarning("\nPreview only. No files were processed.\n");
	}

	return { mappings };
}

export function printBatchSummary(summary: BatchSummary): void {
	displayBold("\n=== Batch Summary ===");
	displayTotal(`Total:    ${summary.total}`);
	displaySucceeded(`Succeeded: ${summary.succeeded}`);
	if (summary.failed > 0) {
		displayFailed(`Failed:   ${summary.failed}`);
	}
	if (summary.skipped > 0) {
		displayWarning(`Skipped:  ${summary.skipped}`);
	}
}

export async function previewBatch(
	command: BarkCommand,
	inputFiles: string[],
	projectRoot: string,
	options: {
		outputFolder?: string;
	} = {},
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	const { mappings } = await computeBatchMappings(
		command,
		inputFiles,
		projectRoot,
		{ ...options, dryRun: true },
	);

	return {
		mappings,
		summary: { total: inputFiles.length, succeeded: 0, failed: 0, skipped: 0 },
	};
}
