import { glob } from "glob";
import { stat } from "fs/promises";
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

	const fileSizes = await Promise.all(
		files.map(async (f) => ({
			path: f,
			size: (await stat(f)).size,
		})),
	);

	fileSizes.sort((a, b) => b.size - a.size);
	const sortedFiles = fileSizes.map((f) => f.path);

	displayDebug("collectFiles", `sorted ${sortedFiles.length} file(s) by size (largest first)`);

	return sortedFiles;
}

export async function processBatch(
	command: BarkCommand,
	inputFiles: string[],
	fileNames: string[],
	instanceIds: string[],
	projectRoot: string,
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	const batchStartTime = Date.now();

	const mappings: FileMapping[] = inputFiles.map((inputPath, index) => ({
		inputPath,
		fileName: fileNames[index] || "unknown",
		status: "pending" as const,
	}));

	let succeeded = 0;
	let failed = 0;
	let completedCount = 0;


	displayDebug("processBatch", `valid instances: ${instanceIds.join(", ")}`);

	const stats = { succeeded: 0, failed: 0, completedCount: 0 };
	await processBatchWorkQueue(command, mappings, instanceIds, projectRoot, batchStartTime, stats);

	succeeded = stats.succeeded;
	failed = stats.failed;
	completedCount = stats.completedCount;

	flushProgress();
	displayDebug("processBatch", "all instances finished processing");
	closeAll();

	const totalElapsed = Date.now() - batchStartTime;
	const summary: BatchSummary = {
		total: inputFiles.length,
		succeeded,
		failed,
		skipped: 0,
		durationMs: totalElapsed,
	};

	return { mappings, summary };
}

async function processBatchWorkQueue(
	command: BarkCommand,
	mappings: FileMapping[],
	instanceIds: string[],
	projectRoot: string,
	batchStartTime: number,
	stats: { succeeded: number; failed: number; completedCount: number },
): Promise<void> {

	displayDebug("processBatch", `starting work queue with ${instanceIds.length} workers...`);

	const totalFiles = mappings.length;
	let nextIndex = 0;

	await Promise.all(
		instanceIds.map(async (instanceId) => {
			while (true) {
				const idx = nextIndex++;
				if (idx >= totalFiles) break;

				const mapping = mappings[idx]!;
				mapping.status = "processing";
				const fileStartTime = Date.now();

				displayDebug("workQueue", `worker ${instanceId} grabbed file[${idx}]: ${mapping.fileName}`);
				displayProgress(
					stats.completedCount + 1,
					totalFiles,
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
						instanceId,
					);
					const fileElapsed = Date.now() - fileStartTime;

					if (result.success) {
						mapping.status = "success";
						stats.succeeded++;
						displayDebug("workQueue", `worker ${instanceId} completed file[${idx}]: ${mapping.fileName} (${fileElapsed}ms)`);
						displayProgress(
							stats.completedCount + 1,
							totalFiles,
							mapping.fileName,
							"success",
							fileElapsed,
						);
					} else {
						mapping.status = "failed";
						mapping.error = result.error;
						stats.failed++;
						displayDebug("workQueue", `worker ${instanceId} failed file[${idx}]: ${mapping.fileName} (${fileElapsed}ms)`);
						displayProgress(
							stats.completedCount + 1,
							totalFiles,
							mapping.fileName,
							"failed",
							fileElapsed,
						);
					}
				} catch (e) {
					const fileElapsed = Date.now() - fileStartTime;
					mapping.status = "failed";
					mapping.error = (e as Error).message;
					stats.failed++;
					displayDebug("workQueue", `worker ${instanceId} error file[${idx}]: ${mapping.fileName} (${fileElapsed}ms) - ${(e as Error).message}`);
					displayProgress(
						stats.completedCount + 1,
						totalFiles,
						mapping.fileName,
						"failed",
						fileElapsed,
					);
				}
				stats.completedCount++;
			}
		}),
	);
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
