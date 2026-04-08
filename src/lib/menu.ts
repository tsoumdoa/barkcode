import { select } from "@inquirer/prompts";
import type { BarkcodeConfig, BarkCommand, MenuAction } from "../types";
import { processBatch, printBatchSummary, collectFiles } from "./batch";
import { displayBold, displayInfo, displayWarning } from "./logger";

class ExitPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExitPromptError";
  }
}

export async function showCommandMenu(
  config: BarkcodeConfig,
  projectRoot: string,
): Promise<MenuAction> {
  const choices: Array<{ name: string; value: string; description?: string }> = [
    ...config.commands.map((cmd, i) => ({
      name: cmd.id ? `${i + 1}. ${cmd.name} (${cmd.id})` : `${i + 1}. ${cmd.name}`,
      value: String(i),
      description: cmd.description,
    })),
    { name: "Exit", value: "exit", description: "Return to terminal" },
  ];

  try {
    const selected = await select({
      message: "Select a command to run:",
      choices,
      pageSize: 10,
    });

    if (selected === "exit") {
      return { type: "exit" };
    }

    const index = parseInt(selected, 10);
    const command = config.commands[index];

    if (command) {
      const inputPattern = command.inputPattern || "*.3dm";
      const inputFolder = command.inputFolder || ".";
      const isRecursive = command.recursive ?? false;

      const files = await collectFiles(inputFolder, inputPattern, isRecursive, projectRoot);
      return { type: "run", command, files };
    }

    return { type: "exit" };
  } catch (e) {
    if (e instanceof ExitPromptError || (e as Error).name === "ExitPromptError") {
      displayInfo("\nExiting Barkcode. Rhino will remain open.");
      process.exit(0);
    }
    throw e;
  }
}
