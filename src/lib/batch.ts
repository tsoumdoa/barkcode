import { glob } from "glob";
import { resolve, join } from "path";
import type { BatchSummary, FileMapping, BarkCommand } from "../types";
import { execute, closeAll } from "./rhinocode";
import { displayBold, displayTotal, displaySucceeded, displayFailed, displayDebug, displayProgress, flushProgress, displayWarning } from "./logger";

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
	const batchStartTime = Date.now();

	const mappings: FileMapping[] = inputFiles.map((inputPath, index) => ({
		inputPath,
		fileName: fileNames[index] || "unknown",
		status: "pending" as const,
	}));

	const finalMappings: FileMapping[] = [];
	let succeeded = 0;
	let failed = 0;
	let completedCount = 0;

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
				const fileStartTime = Date.now();
				displayProgress(
					completedCount + 1,
					inputFiles.length,
					mapping.fileName,
					"processing",
					Date.now() - batchStartTime,
				);
				try {
					const result = await execute(
						mapping.inputPath,
						mapping.fileName,
						command,
						projectRoot,
					);
					const fileElapsed = Date.now() - fileStartTime;
					if (result.success) {
						mapping.status = "success";
						succeeded++;
						displayProgress(
							completedCount + 1,
							inputFiles.length,
							mapping.fileName,
							"success",
							fileElapsed,
						);
					} else {
						mapping.status = "failed";
						mapping.error = result.error;
						failed++;
						displayProgress(
							completedCount + 1,
							inputFiles.length,
							mapping.fileName,
							"failed",
							fileElapsed,
						);
					}
				} catch (e) {
					const fileElapsed = Date.now() - fileStartTime;
					mapping.status = "failed";
					mapping.error = (e as Error).message;
					failed++;
					displayProgress(
						completedCount + 1,
						inputFiles.length,
						mapping.fileName,
						"failed",
						fileElapsed,
					);
				}
				completedCount++;
				finalMappings.push(mapping);
			}
		}),
	);
	flushProgress();
	displayDebug("processBatch", "all instances finished processing");
	await closeAll();

	const totalElapsed = Date.now() - batchStartTime;

	const summary: BatchSummary = {
		total: inputFiles.length,
		succeeded,
		failed,
		skipped: 0,
		durationMs: totalElapsed,
	};

	return { mappings: finalMappings, summary };
}

export function printBatchSummary(summary: BatchSummary): void {
	const elapsedSec = Math.floor(summary.durationMs / 1000);
	const elapsedMin = Math.floor(elapsedSec / 60);
	const elapsedStr = elapsedMin > 0
		 ? `${elapsedMin}m ${elapsedSec % 60}s`
		: `${elapsedSec}s`;

	displayBold("\n=== Batch Summary ===");
	displayTotal(`Total:    ${summary.total}`);
	displaySucceeded(`Succeeded: ${summary.succeeded}`);
	if (summary.failed > 0) {
		displayFailed(`Failed:   ${summary.failed}`);
	}
	if (summary.skipped > 0) {
		displayWarning(`Skipped:  ${summary.skipped}`);
	}
	displayTotal(`Duration: ${elapsedStr}`);
}
