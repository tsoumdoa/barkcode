import chalk from "chalk";
import { platform } from "os";
import { RHINO_PATH } from "../constants";
import { isRhinocodeAvailable } from "./rhinocode";
import { listRhinoInstancesJson } from "./rhinocode-schemas";
import { displayError, displayInfo, displayWarning, displaySuccess } from "./logger";
import { POLL_INTERVAL_MS, MAX_WAIT_MS, MAX_RETRIES, DEFAULT_SPAWN_DELAY_MS } from "./spawn-constants";

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isRhinoRunning(): Promise<{ running: boolean; output: string }> {
	try {
		const instances = await listRhinoInstancesJson();
		return { running: instances.length > 0, output: JSON.stringify(instances) };
	} catch {
		return { running: false, output: "" };
	}
}

export function createRhinoRunner(rhinoPath: string) {
	return {
		async checkRhinoOrExit() {
			displayInfo("Checking for Rhino 8...");
			if (platform() === "darwin") return;
			const file = Bun.file(rhinoPath);
			const exists = await file.exists();
			if (!exists) {
				displayError("Rhino not found!");
				displayInfo("  Expected at: " + rhinoPath);
				console.log();
				displayWarning("Please check your Rhino 8 installation.");
				process.exit(1);
			}
			displaySuccess("Rhino 8 found.\n");
		},
		async spawnRhino(count: number, delayMs?: number): Promise<{ pipeIds: string[]; spawnElapsedMs: number }> {
			const startTime = Date.now();
			const initialInstances = await listRhinoInstancesJson();
			const initialCount = initialInstances.length;

			const spawn = async (needed: number): Promise<void> => {
				for (let i = 0; i < needed; i++) {
					console.log(chalk.gray(`  Spawning ${i + 1}/${needed} instance(s)...`));
					Bun.spawn(
						[RHINO_PATH, "/nosplash", '/runscript="_StartScriptServer"'],
						{
							stdout: "ignore",
							stderr: "ignore",
							stdin: "ignore",
							windowsVerbatimArguments: true,
						},
					);
					if (needed > 1) {
						console.log(chalk.gray(`  Waiting ${delayMs ?? DEFAULT_SPAWN_DELAY_MS}ms before next spawn...`));
						await delay(delayMs ?? DEFAULT_SPAWN_DELAY_MS);
					}
				}
			};

			const getSpawnedCount = async (): Promise<number> => {
				const currentInstances = await listRhinoInstancesJson();
				return currentInstances.length - initialCount;
			};

			await spawn(count);
			const spawnEndTime = Date.now();
			const spawnElapsed = spawnEndTime - startTime;

			for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
				for (let elapsed = POLL_INTERVAL_MS; elapsed <= MAX_WAIT_MS; elapsed += POLL_INTERVAL_MS) {
					await delay(POLL_INTERVAL_MS);
					const spawned = await getSpawnedCount();
					if (spawned >= count) {
						const currentInstances = await listRhinoInstancesJson();
						return { pipeIds: currentInstances.map((i) => i.pipeId), spawnElapsedMs: spawnElapsed };
					}
					console.log(chalk.gray(`  [${elapsed / 1000}s] ${spawned}/${count} instances running...`));
				}

				const spawned = await getSpawnedCount();
				const missing = count - spawned;
				if (missing > 0) {
					console.log(chalk.gray(`  Attempt ${attempt + 1}/${MAX_RETRIES}: ${spawned}/${count} running. Retrying ${missing}...`));
					await spawn(missing);
				}
			}

			const finalCount = await getSpawnedCount();
			throw new Error(`Failed to spawn ${count} Rhino instances after ${MAX_RETRIES + 1} attempts (${finalCount}/${count})`);
		},
		async checkRhinocodeOrExit(): Promise<void> {
			displayInfo("Checking for rhinocode...");
			const hasRhinocode = await isRhinocodeAvailable();
			if (!hasRhinocode) {
				displayError("rhinocode not recognized!");
				displayInfo("  Ensure rhinocode is in your system PATH.");
				process.exit(1);
			}
			displaySuccess("rhinocode found.");
		},
		getRunningProcesses: async () => {
			const instances = await listRhinoInstancesJson();
			if (instances.length === 0) return [];
			return instances.map((i) => i.pipeId);
		},
		waitForRhinoInstances,
	};
}

async function getRunningProcessesReal(): Promise<string[]> {
	const instances = await listRhinoInstancesJson();
	if (instances.length === 0) return [];
	return instances.map((i) => i.pipeId);
}

export async function waitForRhinoInstances(expectedCount: number): Promise<string[]> {
	while (true) {
		const processes = await getRunningProcessesReal();
		const currentCount = processes.length;
		console.log(
			chalk.gray(
				`  Current state: ${currentCount}/${expectedCount} Rhino processes running`,
			),
		);

		if (currentCount >= expectedCount) {
			return processes;
		}

		await delay(1000);
	}
}
