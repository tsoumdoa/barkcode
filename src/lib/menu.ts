import chalk from "chalk";
import { select } from "@inquirer/prompts";
import type { BarkcodeConfig, BarkCommand, RhinoInstance } from "../types.js";
import { processBatch, printBatchSummary, collectFiles } from "./batch.js";

type MenuChoice = { type: "command"; index: number } | { type: "exit" };

export async function showCommandMenu(
  config: BarkcodeConfig,
  instance: RhinoInstance,
  projectRoot: string,
): Promise<boolean> {
  const choices: Array<{ name: string; value: string; description?: string }> = [
    ...config.commands.map((cmd, i) => ({
      name: cmd.id ? `${i + 1}. ${cmd.name} (${cmd.id})` : `${i + 1}. ${cmd.name}`,
      value: String(i),
      description: cmd.description,
    })),
    { name: "Exit", value: "exit", description: "Return to terminal" },
  ];

  const selected = await select({
    message: "Select a command to run:",
    choices,
    pageSize: 10,
  });

  if (selected === "exit") {
    return false;
  }

  const index = parseInt(selected, 10);
  const command = config.commands[index];

  if (command) {
    await runConfiguredCommand(command, instance, projectRoot);
  }

  return true;
}

async function runConfiguredCommand(
  command: BarkCommand,
  instance: RhinoInstance,
  projectRoot: string,
): Promise<void> {
  console.log(chalk.white.bold(`\nRunning: ${command.name}`));

  const inputPattern = command.inputPattern || "*.3dm";
  const inputFolder = command.inputFolder || ".";
  const isRecursive = command.recursive ?? false;

  console.log(chalk.gray(`  Input: ${inputFolder}/${inputPattern}`));

  const files = await collectFiles(inputFolder, inputPattern, isRecursive, projectRoot);

  if (files.length === 0) {
    console.log(chalk.yellow(`  No files found matching ${inputPattern}`));
    return;
  }

  console.log(chalk.gray(`  Found ${files.length} file(s)`));

  const { summary } = await processBatch(command, files, projectRoot, instance, {
    outputFolder: command.outputFolder,
    dryRun: false,
    onConflict: command.onConflict || "error",
  });

  printBatchSummary(summary);
}
