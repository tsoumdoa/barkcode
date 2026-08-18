import { select } from "@inquirer/prompts";
import type { BarkcodeConfig, MenuAction, MenuChoice } from "../types";
import { collectFiles } from "./batch";
import { displayInfo } from "./logger";

export async function showCommandMenu(
  config: BarkcodeConfig,
  projectRoot: string,
): Promise<MenuAction> {
  const choices: MenuChoice[] = [
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
      const files = await collectFiles(command.inputFolder, command.inputPattern, projectRoot);
      return { type: "run", command, files };
    }

    return { type: "exit" };
  } catch (e) {
    if ((e as Error).name === "ExitPromptError") {
      displayInfo("\nExiting Barkcode.");
      return { type: "exit" };
    }
    throw e;
  }
}
