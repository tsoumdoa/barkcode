import chalk from "chalk";
import { RHINO_PATH } from "../constants";
import { isRhinocodeAvailable } from "./rhinocode";
import { displayError, displayInfo, displayWarning, displaySuccess } from "./logger";

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isRhinoRunning(): Promise<{ running: boolean; output: string }> {
	const proc = Bun.spawn(["rhinocode", "list"], {
		stdout: "pipe",
		stderr: "ignore",
	});
	const output = await new Response(proc.stdout).text();
	return { running: output.includes("rhinocode_remotepipe"), output };
}

export function createRhinoRunner(rhinoPath: string, dryMode: boolean = false) {
	return {
		async checkRhinoOrExit() {
			if (dryMode) return;
			const file = Bun.file(rhinoPath);
			const exists = await file.exists();

			if (!exists) {
				displayError("Rhino not found!");
				displayInfo("  Expected at: " + rhinoPath);
				console.log();
				displayWarning("Please check your Rhino 8 installation.");
				process.exit(1);
			}
		},
		spawnRhino(spawnCount: number) {
			if (dryMode) return;
			for (let i = 0; i < spawnCount; i++) {
				Bun.spawn(
					[RHINO_PATH, "/nosplash", '/runscript="_StartScriptServer"'],
					{
						stdout: "ignore",
						stderr: "ignore",
						stdin: "ignore",
						windowsVerbatimArguments: true,
					},
				);
			}
		},
		async checkRhinocodeOrExit(): Promise<void> {
			if(dryMode) return;
			const hasRhinocode = await isRhinocodeAvailable();
			if (!hasRhinocode) {
				displayError("rhinocode not recognized!");
				displayInfo("  Ensure rhinocode is in your system PATH.");
				process.exit(1);
			}
		}

	};
}

export async function getRunningProcesses(): Promise<string[]> {
	const { output } = await isRhinoRunning();
	if (!output.trim()) return [""];

	const lines = output.trim().split("\n").slice(1);
	return lines
		.map((line) => {
			const parts = line.trim().split(/\s+/);
			if (parts.length >= 2) {
				return parts[1];
			}
			return null;
		})
		.filter((p): p is string => p !== null);
}

export async function waitForRhinoInstances(expectedCount: number): Promise<string[]> {
	while (true) {
		const processes = await getRunningProcesses();
		const currentCount = processes.length;
		console.log(
			chalk.gray(
				`  Current state: ${currentCount}/${expectedCount} Rhino processes running`,
			),
		);

		if (currentCount === expectedCount) {
			return processes;
		}

		await delay(1000);
	}
}


