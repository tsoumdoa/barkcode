import { spawn } from "child_process";
import { confirm } from "@inquirer/prompts";
import { createRhinoRunner } from "../lib/rhino";
import { RHINO_PATH } from "../constants";
import { listRhinoInstancesJson } from "../lib/rhinocode-schemas";
import { closeAll } from "../lib/rhinocode";
import {
	displaySuccess,
	displayInfo,
	displayError,
	displayBold,
	displayDebug,
	setDebugMode,
} from "../lib/logger";

export async function runCommand(options: {
	command: string;
	debug?: boolean;
}) {
	const { command, debug: isDebug = false } = options;
	setDebugMode(isDebug);

	const rhinoRunner = createRhinoRunner(RHINO_PATH);

	if (process.platform === "win32") {
		await rhinoRunner.checkRhinoOrExit();
	}
	await rhinoRunner.checkRhinocodeOrExit();

	let instances = await listRhinoInstancesJson();

	if (instances.length === 0) {
		if (process.platform === "darwin") {
			displayInfo("No Rhino instance found. Please start Rhino and run _StartScriptServer.");
			while (true) {
				await new Promise((r) => setTimeout(r, 2000));
				instances = await listRhinoInstancesJson();
				if (instances.length > 0) break;
			}
			displaySuccess(`Connected to Rhino instance ${instances[0]!.pipeId}`);
		} else {
			displayInfo("No running Rhino instance found. Starting one...");
			try {
				await rhinoRunner.spawnRhino(1);
				instances = await listRhinoInstancesJson();
				displaySuccess(`Started Rhino and connected to ${instances[0]?.pipeId}`);
			} catch (e) {
				displayError(`Failed to start Rhino: ${(e as Error).message}`);
				process.exit(1);
			}
		}
	} else {
		displaySuccess(`Connected to existing Rhino instance ${instances[0]!.pipeId}`);
	}

	const pipeId = instances[0]!.pipeId;

	displayBold(`Executing: ${command}`);
	displayDebug("command", `pipeId: ${pipeId}`);

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn("rhinocode", ["--rhino", pipeId, "command", command], {
			stdio: "pipe",
		});

		proc.on("close", (code) => {
			resolve(code ?? -1);
		});
	});

	if (exitCode === 0) {
		displaySuccess("Command completed successfully.");
	} else {
		displayError(`Command exited with code ${exitCode}.`);
	}

	const shouldQuit = await confirm({
		message: "Quit Rhino?",
		default: false,
	});

	if (shouldQuit) {
		displayInfo("Quitting Rhino...");
		closeAll();
	}

	process.exit(exitCode === 0 ? 0 : 1);
}
