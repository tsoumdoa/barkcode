import { glob } from "glob";
import chalk from "chalk";
import { resolve, join } from "path";
import type { BatchSummary, FileMapping, BarkCommand } from "../types";
import { execute, closeAll } from "./rhinocode";
import { displayWarning, displayInfo, displayBold, displayTotal, displaySucceeded, displayFailed, displayDebug } from "./logger";

export async function collectFiles(
	inputFolder: string,
	pattern: string,
	projectRoot: string,
): Promise<string[]> {
	const fullInputPath = resolve(projectRoot, inputFolder);
	const globPattern = join(fullInputPath, "**", pattern).replace(/\\/g, "/");

	displayDebug("collectFiles", `inputFolder: ${inputFolder}`);
	displayDebug("collectFiles", `globPattern: ${globPattern}`);

	const files = await glob(globPattern, {
		nodir: true,
		dot: false,
	});

	displayDebug("collectFiles", `found ${files.length} file(s)`);

	return files;
}
function validateInstances(instances: string[]): string[] {
	return instances.filter((id) => id && id.trim() !== "");
}

export async function processBatch(
	command: BarkCommand,
	inputFiles: string[],
	fileNames: string[],
	instances: string[],
	projectRoot: string,
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	const { rhCommand } = command;

	const mappings: FileMapping[] = inputFiles.map((inputPath, index) => ({
		inputPath,
		fileName: fileNames[index] || "unknown",
		status: "pending" as const,
	}));

	const finalMappings: FileMapping[] = [];
	let succeeded = 0;
	let failed = 0;

	const instanceBatches = new Map<string, FileMapping[]>();

	const validInstanceIds = validateInstances(instances);
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
					const result = await execute(
						mapping.inputPath,
						mapping.fileName,
						command,
						projectRoot,
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
	displayDebug("processBatch", "all instances finished processing");
	await closeAll();

	const summary: BatchSummary = {
		total: inputFiles.length,
		succeeded,
		failed,
		skipped: 0,
	};

	return { mappings: finalMappings, summary };
}

export async function previewBatch(
	command: BarkCommand,
	inputFiles: string[],
	fileNames: string[],
	projectRoot: string,
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	displayInfo(`\nPreview. Would process ${inputFiles.length} files:\n`);
	for (const inputPath of inputFiles) {
		displayInfo(`Running Command: ${command.name}`);
		displayDebug("previewBatch", `> ${command.rhCommand}`);
		console.log(`  ${inputPath}`);
	}
	displayWarning("\nPreview only. No files were processed.\n");

	const mappings = inputFiles.map((inputPath, index) => ({
		inputPath,
		fileName: fileNames[index] || "unknown",
		outputPath: inputPath,
		status: "pending" as const,
	}));

	return {
		mappings,
		summary: { total: inputFiles.length, succeeded: 0, failed: 0, skipped: 0 },
	};
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
