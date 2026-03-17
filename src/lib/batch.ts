import { glob } from "glob";
import { resolve, relative, dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";
import chalk from "chalk";
import type { BatchOptions, BatchSummary, FileMapping, BarkCommand } from "../types.js";
import { renameFile, sanitizeFilename } from "./rename.js";
import { executeOnFile } from "./rhinocode.js";
import type { RhinoInstance } from "../types.js";

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

  const files = await glob(globPattern, {
    nodir: true,
    dot: false,
  });

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
  instance: RhinoInstance,
  options: {
    outputFolder?: string;
    dryRun?: boolean;
    onConflict?: "error" | "skip" | "overwrite" | "rename";
  } = {},
): Promise<{ mappings: FileMapping[]; summary: BatchSummary }> {
  const {
    inputFolder = ".",
    outputFolder,
    recursive = false,
    preserveStructure = false,
    onConflict = "error",
    rhCommand,
    rename: renameOptions,
    timeout,
    waitForCompletion,
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

  if (hasConflicts && onConflict === "error") {
    const conflicts = resolved.filter((m) => m.status === "conflict");
    for (const conflict of conflicts) {
      console.log(chalk.red(`! conflict: ${conflict.inputPath} -> ${conflict.outputPath}`));
    }
    console.log(chalk.yellow(`\nAction on conflict: ${onConflict}`));
    console.log(chalk.yellow("Dry run only. No files were processed.\n"));

    return {
      mappings: resolved,
      summary: { total: inputFiles.length, succeeded: 0, failed: 0, skipped: 0 },
    };
  }

  if (options.dryRun) {
    console.log(chalk.gray(`\nDry run. Would process ${resolved.length} files:\n`));
    for (const mapping of resolved.slice(0, 10)) {
      console.log(`  ${mapping.inputPath}`);
      console.log(chalk.gray(`    -> ${mapping.outputPath}`));
    }
    if (resolved.length > 10) {
      console.log(chalk.gray(`  ... and ${resolved.length - 10} more`));
    }
    console.log(chalk.yellow("\nDry run only. No files were processed.\n"));

    return {
      mappings: resolved,
      summary: { total: inputFiles.length, succeeded: 0, failed: 0, skipped: 0 },
    };
  }

  const finalMappings: FileMapping[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const outputDir = outputFolder ? resolve(projectRoot, outputFolder) : null;
  if (outputDir && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const mapping of resolved) {
    if (mapping.status === "skipped") {
      skipped++;
      finalMappings.push(mapping);
      continue;
    }

    mapping.status = "processing";

    try {
      const result = await executeOnFile(
        instance,
        rhCommand,
        mapping.inputPath,
        mapping.outputPath,
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

  const summary: BatchSummary = {
    total: inputFiles.length,
    succeeded,
    failed,
    skipped,
  };

  return { mappings: finalMappings, summary };
}

export function printBatchSummary(summary: BatchSummary): void {
  console.log(chalk.white.bold("\n=== Batch Summary ==="));
  console.log(chalk.white(`Total:    ${summary.total}`));
  console.log(chalk.green(`Succeeded: ${summary.succeeded}`));
  if (summary.failed > 0) {
    console.log(chalk.red(`Failed:   ${summary.failed}`));
  }
  if (summary.skipped > 0) {
    console.log(chalk.yellow(`Skipped:  ${summary.skipped}`));
  }
}
