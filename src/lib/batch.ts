import { glob } from "glob";
import chalk from "chalk";
import { resolve, relative, dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { BatchSummary, FileMapping, BarkCommand } from "../types";
import { renameFile, sanitizeFilename } from "./rename";
import { executeOnFile } from "./rhinocode";
import { displayConflict, displayWarning, displayInfo, displayBold, displayTotal, displaySucceeded, displayFailed, displayDebug } from "./logger";

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

export function computeOutputPath(
	inputPath: string,
	inputFolder: string,
	outputFolder: string | undefined,
	projectRoot: string,
	preserveStructure: boolean,
	renameResult: { finalName: string },
): string {
	const fullInputFolder = resolve(projectRoot, inputFolder);
	const relPath = relative(fullInputFolder, dirname(inputPath));

	const outputBase = outputFolder
		? resolve(projectRoot, outputFolder)
		: fullInputFolder;

	if (preserveStructure && relPath && relPath !== ".") {
		return resolve(outputBase, relPath, renameResult.finalName);
	}

	return resolve(outputBase, renameResult.finalName);
}

export function checkConflicts(
	mappings: FileMapping[],
	onConflict: "error" | "skip" | "overwrite" | "rename" = "error",
): { mappings: FileMapping[]; hasConflicts: boolean } {
	const outputMap = new Map<string, FileMapping[]>();

	for (const mapping of mappings) {
		const existing = outputMap.get(mapping.outputPath) || [];
		existing.push(mapping);
		outputMap.set(mapping.outputPath, existing);
	}

	const resolved: FileMapping[] = [];
	let hasConflicts = false;

	for (const [outputPath, group] of outputMap) {
		if (group.length === 1 && group[0]) {
			resolved.push(group[0]);
		} else {
			hasConflicts = true;

			for (const mapping of group) {
				if (onConflict === "error") {
					resolved.push({
						...mapping,
						status: "conflict",
						error: `Conflict: multiple inputs map to ${outputPath}`,
					});
				} else if (onConflict === "skip") {
					resolved.push({
						...mapping,
						status: "skipped",
					});
				} else if (onConflict === "overwrite") {
					resolved.push({
						...mapping,
						status: "pending",
					});
				} else if (onConflict === "rename") {
					const ext = mapping.outputPath.split(".").pop() || "";
					const base = mapping.outputPath.replace(/\.[^.]+$/, "");
					const counter = group.indexOf(mapping) + 1;
					const newPath = `${base}_${String(counter).padStart(3, "0")}.${ext}`;
					resolved.push({
						...mapping,
						outputPath: newPath,
						status: "pending",
					});
				}
			}
		}
	}

	return { mappings: resolved, hasConflicts };
}

export async function processBatch(
	command: BarkCommand,
	inputFiles: string[],
	projectRoot: string,
	instances: string[],
	options: {
		outputFolder?: string;
		onConflict?: "error" | "skip" | "overwrite" | "rename";
	} = {},
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	const { onConflict = "error", rhCommand, timeout, waitForCompletion } = command;

	const { resolved, hasConflicts, conflicts } = await computeBatchMappings(
		command,
		inputFiles,
		projectRoot,
		options,
	);

	if (hasConflicts && onConflict === "error") {
		console.log(chalk.yellow(`[processBatch] conflicts detected: ${conflicts.length}`));
		for (const conflict of conflicts) {
			displayConflict(`${conflict.inputPath} -> ${conflict.outputPath}`);
		}
		displayWarning(`\nAction on conflict: ${onConflict}`);
		displayWarning("Dry run only. No files were processed.\n");

		return {
			mappings: resolved,
			summary: { total: inputFiles.length, succeeded: 0, failed: 0, skipped: 0 },
		};
	} else if (hasConflicts) {
displayDebug("processBatch", `conflicts detected (onConflict=${onConflict}), continuing...`);
	} else {
		displayDebug("processBatch", `no conflicts detected`);
	}

	const finalMappings: FileMapping[] = [];
	let succeeded = 0;
	let failed = 0;
	let skipped = 0;

	const outputDir = command.outputFolder ? resolve(projectRoot, command.outputFolder) : null;
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

	resolved.forEach((mapping, idx) => {
		if (mapping.status === "skipped") {
			skipped++;
			finalMappings.push(mapping);
		} else {
			const instanceId = validInstanceIds[idx % validInstanceIds.length]!;
			instanceBatches.get(instanceId)!.push(mapping);
		}
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
		skipped,
	};

	return { mappings: finalMappings, summary };
}

async function computeBatchMappings(
	command: BarkCommand,
	inputFiles: string[],
	projectRoot: string,
	options: {
		outputFolder?: string;
		onConflict?: "error" | "skip" | "overwrite" | "rename";
		dryRun?: boolean;
	},
): Promise<{
	mappings: FileMapping[];
	resolved: FileMapping[];
	hasConflicts: boolean;
	conflicts: FileMapping[];
}> {
	const {
		inputFolder = ".",
		outputFolder,
		recursive = false,
		preserveStructure = false,
		onConflict = "error",
		rename: renameOptions,
	} = command;

	const mappings: FileMapping[] = [];
	let counter = 1;

	for (const inputPath of inputFiles) {
		const { name: origName, ext: origExt } = { name: inputPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "", ext: inputPath.split(".").pop() || "" };

		const renameResult = renameFile(inputPath, renameOptions, {
			origName,
			origExt,
			counter,
			now: new Date(),
		});

		const outputPath = computeOutputPath(
			inputPath,
			inputFolder,
			outputFolder,
			projectRoot,
			preserveStructure,
			renameResult,
		);

		mappings.push({
			inputPath,
			outputPath: sanitizeFilename(outputPath),
			status: "pending",
		});

		counter++;
	}

	const resolved = checkConflicts(mappings, onConflict).mappings;
	const hasConflicts = resolved.some(m => m.status === "conflict");
	const conflicts = resolved.filter((m) => m.status === "conflict");

	if (options.dryRun) {
		if (hasConflicts && onConflict === "error") {
			displayDebug("computeBatchMappings", `conflicts detected: ${conflicts.length}`);
			for (const conflict of conflicts) {
				displayConflict(`${conflict.inputPath} -> ${conflict.outputPath}`);
			}
			displayWarning(`\nAction on conflict: ${onConflict}`);
			displayWarning("Preview only. No files were processed.\n");
		} else if (hasConflicts) {
			displayDebug("computeBatchMappings", `conflicts detected (onConflict=${onConflict}), continuing...`);
		} else {
			displayDebug("computeBatchMappings", `no conflicts detected`);
		}

		displayInfo(`\nPreview. Would process ${resolved.length} files:\n`);
		for (const mapping of resolved.slice(0, 10)) {
			console.log(`  ${mapping.inputPath}`);
			displayInfo(`    -> ${mapping.outputPath}`);
		}
		if (resolved.length > 10) {
			displayInfo(`  ... and ${resolved.length - 10} more`);
		}
		displayWarning("\nPreview only. No files were processed.\n");
	}

	return { mappings, resolved, hasConflicts, conflicts };
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
		onConflict?: "error" | "skip" | "overwrite" | "rename";
	} = {},
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
	const { resolved } = await computeBatchMappings(
		command,
		inputFiles,
		projectRoot,
		{ ...options, dryRun: true },
	);

	return {
		mappings: resolved,
		summary: { total: inputFiles.length, succeeded: 0, failed: 0, skipped: 0 },
	};
}
