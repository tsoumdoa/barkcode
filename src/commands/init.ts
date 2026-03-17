import chalk from "chalk";
import { writeFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { confirm } from "@inquirer/prompts";
import { displayMessage, displayWarning, displayInfo } from "../lib/logger.js";

const DEFAULT_CONFIG = {
  version: "1.0",
  commands: [
    {
      name: "Convert 3DM to STEP",
      description: "Convert all 3DM files to STEP format",
      rhCommand: "_-Export",
      inputMode: "batch",
      inputPattern: "*.3dm",
      inputFolder: "./models",
      recursive: true,
      outputFolder: "./converted/step",
      outputFormat: "step",
      preserveStructure: true,
      onConflict: "error",
      timeout: 300,
    },
    {
      name: "Batch STL Export",
      description: "Export 3DM files to STL for 3D printing",
      rhCommand: "_-Export",
      inputMode: "batch",
      inputPattern: "*.3dm",
      outputFolder: "./exports/stl",
      outputFormat: "stl",
      recursive: true,
      preserveStructure: true,
      onConflict: "rename",
    },
    {
      name: "Run Analysis Script",
      description: "Run custom Python analysis on selected file",
      rhCommand: "_RunPythonScript",
      scriptPath: "./scripts/AnalyzeGeometry.py",
      inputMode: "single",
      timeout: 300,
    },
  ],
};

export async function init(options: { path?: string; force?: boolean } = {}) {
  const targetDir = options.path || process.cwd();
  const configPath = resolve(targetDir, "barkcode.json");

  if (existsSync(configPath) && !options.force) {
    const overwrite = await confirm({
      message: "barkcode.json already exists. Overwrite?",
      default: false,
    });

    if (!overwrite) {
      displayWarning("Init cancelled.");
      return;
    }
  }

  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf-8");

  displayMessage(`Created ${configPath}`);
  displayInfo("  Edit barkcode.json to add your commands.");
}
