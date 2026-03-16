import chalk from "chalk";
import { RHINO_PATH } from "../constants";

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkRhinocode(): Promise<boolean> {
	const proc = Bun.spawn(["rhinocode", "--version"], {
		stdout: "ignore",
		stderr: "ignore",
	});
	const exitCode = await proc.exited;
	return exitCode === 0;
}

async function isRhinoRunning(): Promise<{ running: boolean; output: string }> {
	const proc = Bun.spawn(["rhinocode", "list"], {
		stdout: "pipe",
		stderr: "ignore",
	});
	const output = await new Response(proc.stdout).text();
	return { running: output.includes("rhinocode_remotepipe"), output };
}

async function checkRhinocodeOrExit() {
	const hasRhinocode = await checkRhinocode();
	if (!hasRhinocode) {
		console.log(chalk.red("✗ rhinocode not recognized!"));
		console.log(chalk.gray("  Ensure rhinocode is in your system PATH."));
		process.exit(1);
	}
}


function displayMessage(message: string) {
	console.log(chalk.green("✓ ") + chalk.white(message));
}


function createRhinoRunner(rhinoPath: string) {
	return {
		async checkRhinoOrExit() {
			const file = Bun.file(rhinoPath);
			const exists = await file.exists();

			if (!exists) {
				console.log(chalk.red("✗ Rhino not found!"));
				console.log(chalk.gray("  Expected at: ") + chalk.white(rhinoPath));
				console.log();
				console.log(chalk.yellow("Please check your Rhino 8 installation."));
				process.exit(1);
			}
		},
		spawnRhino(spawnCount: number) {
			for (let i = 0; i < spawnCount; i++) {
				Bun.spawn([RHINO_PATH, "/nosplash", '/runscript="_StartScriptServer"'], {
					stdout: "ignore",
					stderr: "ignore",
					stdin: "ignore",
					windowsVerbatimArguments: true,
				});
			}
		},
	}
}

export async function start(spawnCount: number = 1) {
	displayMessage("Checking for rhinocode...");
	await checkRhinocodeOrExit();
	displayMessage("rhinocode found.");

	const runner = createRhinoRunner(RHINO_PATH);
	await runner.checkRhinoOrExit();
	displayMessage("Launching Rhino 8...");
	runner.spawnRhino(spawnCount);

	displayMessage("Rhino started. Checking if running...");

	let rhinoRunning = false;
	let processes: { id: string; name: string }[] = [];
	for (let i = 0; i < 5; i++) {
		await delay(3000);
		const { running, output } = await isRhinoRunning();
		processes = [];
		if (output.trim()) {
			const lines = output.trim().split("\n").slice(1);
			processes = lines
				.map((line) => {
					const parts = line.trim().split(/\s+/);
					if (parts.length >= 2) {
						return { id: parts[1], name: parts[0] };
					}
					return null;
				})
				.filter((p): p is { id: string; name: string } => p !== null);

			if (processes.length > 0) {
				console.log(chalk.gray("  Running processes:"));
				processes.forEach((p) => console.log(chalk.gray(`    ${p.id} ${p.name}`)));
			}
		}
		if (running) {
			rhinoRunning = true;
			const ids = processes.map((p) => p.id).join(", ");
			console.log(chalk.green("✓ ") + chalk.white("Rhino started! ") + chalk.cyan(`RhinoId: ${ids}`));
			break;
		}
	}

	if (!rhinoRunning) {
		console.log(chalk.yellow("⚠ ") + chalk.white("Rhino launched but not yet detected via rhinocode."));
	}
}
