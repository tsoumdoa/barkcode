import { glob } from "glob";
import chalk from "chalk";
import { resolve, join, dirname } from "path";
import { spawn } from "child_process";
import { existsSync } from "fs";
import type { BatchSummary, FileMapping, BarkCommand } from "../types";
import { execute } from "./rhinocode";
import { displayWarning, displayInfo, displayBold, displayTotal, displaySucceeded, displayFailed, displayDebug } from "./logger";
import { DEFAULT_TIMEOUT } from "../constants";

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

function extractOutputPath(rhCommand: string, fileName: string, projectRoot: string): string {
	const escaped = rhCommand.replace(/[{}]/g, "\\$&");
	const match = escaped.match(/^_-(?:SaveAs|ExportAll)\s+"([^"]+)"/);
	if (!match) return "";
	let outputPath = match[1] || "";
	outputPath = outputPath.replace(/\\{/g, "{").replace(/\\}/g, "}");
	outputPath = outputPath.replace(/{{fileName}}/g, fileName);
	outputPath = outputPath.replace(/\.\//g, projectRoot + "/");
	return outputPath;
}

function extractOutputFolder(rhCommand: string): string {
	const escaped = rhCommand.replace(/[{}]/g, "\\$&");
	const match = escaped.match(/^_-(?:SaveAs|ExportAll)\s+"([^"]+)"/);
	if (!match) return "";
	let folderPath = match[1] || "";
	folderPath = folderPath.replace(/\\{/g, "{").replace(/\\}/g, "}");
	folderPath = folderPath.replace(/\.\//g, "");
	const lastSlash = folderPath.lastIndexOf("/");
	if (lastSlash === -1) return "./";
	return folderPath.substring(0, lastSlash + 1);
}

async function processOneFile(
	mapping: FileMapping,
	rhCommand: string,
	projectRoot: string,
	isMac: boolean,
	skipWait: boolean = false,
): Promise<{ success: boolean; error?: string }> {
	const result = await execute(
		mapping.inputPath,
		mapping.fileName,
		rhCommand,
		projectRoot,
	);

		if (result.success) {
			if (skipWait) {
				return { success: true };
			}

			const outputPath = extractOutputPath(rhCommand, mapping.fileName, projectRoot);
			displayDebug("processBatch", `waiting for output: ${outputPath}`);

			const outputExists = await waitForOutputFile(outputPath, DEFAULT_TIMEOUT * 1000);
			if (outputExists) {
				displayDebug("processBatch", `output file created: ${outputPath}`);
				return { success: true };
			} else {
				return { success: false, error: "Output file not created within timeout" };
			}
		} else {
			return { success: false, error: result.error };
		}
}

async function waitForOutputFile(
	outputPath: string,
	timeoutMs: number = 30000,
): Promise<boolean> {
	const startTime = Date.now();
	while (Date.now() - startTime < timeoutMs) {
		console.log("checking output file", outputPath);
		if (existsSync(outputPath)) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return false;
}

export async function processBatch(
	command: BarkCommand,
	inputFiles: string[],
	fileNames: string[],
	instances: string[],
	projectRoot: string,
	isMac: boolean,
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

	const validInstanceIds = validateInstances(instances);
	if (validInstanceIds.length === 0) {
		throw new Error("No Rhino instances available");
	}
	displayDebug("processBatch", `valid instances: ${validInstanceIds.join(", ")}`);

	displayDebug("processBatch", `starting sequential execution...`);

	for (let i = 0; i < mappings.length; i++) {
		const mapping = mappings[i]!;
		mapping.status = "processing";
		displayInfo(`Processing ${i + 1}/${mappings.length}: ${mapping.fileName}`);

		try {
			const result = await processOneFile(mapping, rhCommand, projectRoot, isMac);
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

		if (i < mappings.length - 1) {
			displayDebug("processBatch", `waiting 2000ms before next file`);
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		finalMappings.push(mapping);
	}

	if (succeeded > 0) {
		displayDebug("processBatch", `quitting Rhino`);
		const quitCommand = `_-quit`;
		const proc = spawn("rhinocode", ["command", quitCommand], { stdio: "pipe" });
		await new Promise<void>((resolve) => {
			proc.on("close", () => resolve());
		});
	}

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
