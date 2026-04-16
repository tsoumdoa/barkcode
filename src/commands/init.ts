import { writeFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { confirm } from "@inquirer/prompts";
import { displayMessage, displayWarning, displayInfo } from "../lib/logger";
import { BarkcodeConfig } from "../types";

const DEFAULT_CONFIG: BarkcodeConfig = {
	version: "1.0",
	commands: [
		{
			id: "convert:skp",
			name: "Convert to skp",
			description: "Convert all 3DM files to SketchUp format",
			rhCommand: '_-SaveAs "{{path}}" _Enter _Enter',
			inputPattern: "*.3dm",
			outputSuffix: "skp",
			outputName: "{{fileName}}",
			inputFolder: "./test/5",
			outputFolder: "./test/converted",
		},
		{
			id: "convert:rh6",
			name: "Save as Rhino6",
			description: "Convert all 3DM files to Rhino 6 format",
			rhCommand: '_-SaveAs _Version=6 "{{path}}" _Enter _Enter',
			inputPattern: "*.3dm",
			outputSuffix: "3dm",
			outputName: "{{fileName}}_rh6",
			inputFolder: "./test/5",
			outputFolder: "./test/converted",
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
