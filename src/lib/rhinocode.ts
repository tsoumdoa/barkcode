import { existsSync } from "fs";
import { resolve } from "path";
import type { BarkCommand, CommandResult, RhinoInstanceJson } from "../types";
import { DEFAULT_TIMEOUT } from "../constants";
import { displayDebug } from "./logger";
import {
	discoverRhinoInstances,
	type RhinocodeProcessResult,
	type RhinocodeRun,
} from "./rhinocode-schemas";

export async function runRhinocodeProcess(
	executable: string,
	args: string[],
): Promise<RhinocodeProcessResult> {
	const proc = Bun.spawn([executable, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
	});
	const stdoutPromise = new Response(proc.stdout).text();
	const stderrPromise = new Response(proc.stderr).text();
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		stdoutPromise,
		stderrPromise,
	]);
	return { exitCode, stdout, stderr };
}

export class RhinocodeClient {
	readonly run: RhinocodeRun;

	constructor(
		public readonly executable: string,
		run?: RhinocodeRun,
	) {
		this.run = run ?? ((args) => runRhinocodeProcess(executable, args));
	}

	list(): Promise<RhinoInstanceJson[]> {
		return discoverRhinoInstances(this.run);
	}

	async checkAvailable(): Promise<void> {
		let result: RhinocodeProcessResult;
		try {
			result = await this.run(["--version"]);
		} catch (cause) {
			throw new Error(`Failed to start rhinocode at ${this.executable}.`, { cause });
		}
		if (result.exitCode !== 0) {
			throw new Error(`rhinocode --version exited with code ${result.exitCode}.`);
		}
	}

	async command(pipeId: string, command: string): Promise<number> {
		const result = await this.run(["--rhino", pipeId, "command", command]);
		return result.exitCode;
	}

	async open(pipeId: string, inputFile: string): Promise<number> {
		const result = await this.run(["--rhino", pipeId, "command", "-_open", `"${inputFile}"`]);
		return result.exitCode;
	}

	async quit(pipeId: string): Promise<number> {
		return this.command(pipeId, "_-Quit");
	}
}

export function buildOutputPath(
	outputFolder: string,
	outputName: string,
	outputSuffix: string,
	fileName: string,
	projectRoot: string,
): string {
	const outputNameReplaced = outputName.replace(/{{fileName}}/g, fileName);
	const fullFileName = `${outputNameReplaced}.${outputSuffix}`;
	return resolve(projectRoot, outputFolder, fullFileName);
}

export async function pollForFile(
	filePath: string,
	timeoutMs: number = 30000,
	intervalMs: number = 500,
): Promise<boolean> {
	const startTime = Date.now();
	displayDebug("pollForFile", `starting poll for: ${filePath}`);

	while (Date.now() - startTime < timeoutMs) {
		if (existsSync(filePath)) return true;
		await new Promise((done) => setTimeout(done, intervalMs));
	}

	displayDebug("pollForFile", `timeout after ${timeoutMs}ms: ${filePath} not found`);
	return false;
}

export async function execute(
	client: RhinocodeClient,
	inputFile: string,
	fileName: string,
	command: BarkCommand,
	projectRoot: string,
	instanceId: string,
): Promise<CommandResult> {
	const timeout = DEFAULT_TIMEOUT * 1000;
	const pollInterval = command.pollIntervalMs ?? 500;
	const startTime = Date.now();

	if (!command.rhCommand.includes("{{path}}")) {
		throw new Error("rhCommand must contain {{path}} placeholder");
	}

	const outputPath = buildOutputPath(
		command.outputFolder,
		command.outputName,
		command.outputSuffix,
		fileName,
		projectRoot,
	);
	const replacedCommand = command.rhCommand
		.replace(/{{path}}/g, `"${outputPath}"`)
		.replace(/{{fileName}}/g, `"${fileName}"`);

	displayDebug("rhinocode", `${client.executable} --rhino ${instanceId} command -_open`);
	const openCode = await client.open(instanceId, inputFile);
	if (openCode !== 0) {
		return { success: false, error: `Rhino open command exited with code ${openCode}.`, durationMs: Date.now() - startTime };
	}

	const commandCode = await client.command(instanceId, replacedCommand);
	if (commandCode !== 0) {
		return { success: false, error: `Rhino command exited with code ${commandCode}.`, durationMs: Date.now() - startTime };
	}

	const found = await pollForFile(outputPath, timeout, pollInterval);
	return {
		success: found,
		output: `Export completed: ${found}`,
		error: found ? undefined : `Timed out waiting for ${outputPath}.`,
		durationMs: Date.now() - startTime,
	};
}
