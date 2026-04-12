import chalk from "chalk";
import { spawn } from "child_process";
import { existsSync } from "fs";
import type { RhinoInstance, CommandResult } from "../types";
import { DEFAULT_TIMEOUT } from "../constants";
import { displayInfo, displayDebug } from "./logger";

async function waitForRhlFile(inputFile: string, timeoutMs = 30000): Promise<boolean> {
	const rhlPath = inputFile + ".rhl";
	const interval = 200;
	const startTime = Date.now();

	while (!existsSync(rhlPath)) {
		if (Date.now() - startTime > timeoutMs) {
			displayDebug("rhinocode", `timeout waiting for RHL file: ${rhlPath}`);
			return false;
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	displayDebug("rhinocode", `RHL file found: ${rhlPath}`);
	return true;
}

async function waitForRhlFileDeleted(inputFile: string, timeoutMs = 30000): Promise<boolean> {
	const rhlPath = inputFile + ".rhl";
	const interval = 200;
	const startTime = Date.now();

	while (existsSync(rhlPath)) {
		if (Date.now() - startTime > timeoutMs) {
			displayDebug("rhinocode", `timeout waiting for RHL file to be deleted: ${rhlPath}`);
			return false;
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	displayDebug("rhinocode", `RHL file deleted: ${rhlPath}`);
	return true;
}

export { waitForRhlFileDeleted };

async function isRhinoResponsive(timeoutMs = 5000): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("rhinocode", ["command", "_NoEcho"], { stdio: "pipe" });
		let stdout = "";

		proc.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		const timeoutId = setTimeout(() => {
			proc.kill();
			resolve(false);
		}, timeoutMs);

		proc.on("close", (code) => {
			clearTimeout(timeoutId);
			displayDebug("rhinocode", `_NoEcho response code: ${code}`);
			resolve(code === 0);
		});
	});
}

async function waitForRhinoReady(timeoutMs = 30000): Promise<boolean> {
	const interval = 500;
	const maxRetries = 10;
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		try {
			const instances = await listRhinoInstances();
			if (instances.length > 0) {
				displayDebug("rhinocode", `Rhino instance found, verifying responsiveness...`);

				for (let retry = 0; retry < maxRetries; retry++) {
					if (await isRhinoResponsive(5000)) {
						displayDebug("rhinocode", `Rhino is responsive after ${retry + 1} attempt(s)`);
						return true;
					}
					displayDebug("rhinocode", `Rhino not responsive, retry ${retry + 1}/${maxRetries}`);
					await new Promise((resolve) => setTimeout(resolve, interval));
				}
			}
		} catch {
			// continue waiting
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	displayDebug("rhinocode", `timeout waiting for Rhino to be ready`);
	return false;
}

export { waitForRhinoReady };

export async function connect(): Promise<RhinoInstance> {
	const proc = spawn("rhinocode", ["list"], {
		stdio: "pipe",
		shell: true,
	});

	const output = await new Promise<string>((resolve) => {
		let data = "";
		proc.stdout?.on("data", (chunk) => {
			data += chunk.toString();
		});
		proc.on("close", () => resolve(data));
	});

	const lines = output.trim().split("\n").filter(Boolean);
	if (lines.length <= 1) {
		throw new Error("No Rhino instance found. Start Rhino first with 'bark run'");
	}

	const lastLine = lines[lines.length - 1] || "";
	const parts = lastLine.trim().split(/\s+/);
	const id = parts[1] || parts[0] || "";

	return { id, connected: true };
}

export async function execute(
	inputFile: string,
	fileName: string,
	command: string,
	projectRoot: string,
): Promise<CommandResult> {
	const startTime = Date.now();

	let replacedCommand = command.replace(/{{fileName}}/g, fileName);
	replacedCommand = replacedCommand.replace(/\.\//g, projectRoot + "/");

	const openCommand = `_-open "${inputFile}"`;
	const openArgs = ["command", openCommand];
	const commandArgs = ["command", replacedCommand];

	displayDebug("rhinocode", `spawn: rhinocode ${openArgs.join(" ")}`);
	spawn("rhinocode", openArgs, {
		stdio: "pipe",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	displayDebug("rhinocode", `spawn: rhinocode ${commandArgs.join(" ")}`);
	spawn("rhinocode", commandArgs, {
		stdio: "pipe",
	});


	return {
		success: true,
		durationMs: Date.now() - startTime,
	};
}

export async function closeFile(
	filePath: string,
): Promise<CommandResult> {
	const timeout = DEFAULT_TIMEOUT * 1000;
	const startTime = Date.now();

	const closeCommand = `_-Close "${filePath}"`;
	displayDebug("rhinocode", `close command: "${closeCommand}"`);

	return new Promise((resolve) => {
		const fullArgs = ["command", closeCommand];
		displayDebug("rhinocode", `spawn: rhinocode ${fullArgs.join(" ")}`);

		const proc = spawn("rhinocode", fullArgs, {
			stdio: "pipe",
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		proc.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		const timeoutId = setTimeout(() => {
			proc.kill();
			displayDebug("rhinocode", `timed out after ${timeout}ms`);
			resolve({
				success: false,
				output: stdout,
				error: "Close command timed out",
				durationMs: Date.now() - startTime,
			});
		}, timeout);

		proc.on("close", (code) => {
			clearTimeout(timeoutId);
			const duration = Date.now() - startTime;

			displayDebug("rhinocode", `close exit code: ${code}, duration: ${duration}ms`);
			if (stdout) displayDebug("rhinocode", `stdout: ${stdout}`);
			if (stderr) displayDebug("rhinocode", `stderr: ${stderr}`);

			resolve({
				success: code === 0,
				output: stdout,
				error: stderr || undefined,
				durationMs: duration,
			});
		});
	});
}

export async function saveUntitledDocument(
	projectRoot: string,
	outputFolder: string,
): Promise<CommandResult> {
	const timeout = DEFAULT_TIMEOUT * 1000;
	const startTime = Date.now();

	const fullPath = projectRoot + "/" + outputFolder + "untitled.3dm";
	const saveCommand = `_-Save "${fullPath}" `;
	displayDebug("rhinocode", `save untitled command: "${saveCommand}"`);

	return new Promise((resolve) => {
		const fullArgs = ["command", saveCommand];
		displayDebug("rhinocode", `spawn: rhinocode ${fullArgs.join(" ")}`);

		const proc = spawn("rhinocode", fullArgs, {
			stdio: "pipe",
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		proc.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		const timeoutId = setTimeout(() => {
			proc.kill();
			displayDebug("rhinocode", `timed out after ${timeout}ms`);
			resolve({
				success: false,
				output: stdout,
				error: "Save untitled command timed out",
				durationMs: Date.now() - startTime,
			});
		}, timeout);

		proc.on("close", (code) => {
			clearTimeout(timeoutId);
			const duration = Date.now() - startTime;

			displayDebug("rhinocode", `save untitled exit code: ${code}, duration: ${duration}ms`);
			if (stdout) displayDebug("rhinocode", `stdout: ${stdout}`);
			if (stderr) displayDebug("rhinocode", `stderr: ${stderr}`);

			resolve({
				success: code === 0,
				output: stdout,
				error: stderr || undefined,
				durationMs: duration,
			});
		});
	});
}


export async function disconnect(instanceId: string): Promise<void> {
	displayInfo(`  Disconnected from Rhino ${instanceId}`);
}

export async function isRhinocodeAvailable(): Promise<boolean> {
	try {
		const proc = spawn("rhinocode", ["--version"], {
			stdio: "pipe",
			shell: true,
		});

		const code = await new Promise<number>((resolve) => {
			proc.on("close", (c) => resolve(c ?? -1));
		});

		return code === 0;
	} catch {
		return false;
	}
}

export async function listRhinoInstances(): Promise<string[]> {
	const proc = spawn("rhinocode", ["list"], {
		stdio: "pipe",
		shell: true,
	});

	const output = await new Promise<string>((resolve) => {
		let data = "";
		proc.stdout?.on("data", (chunk) => {
			data += chunk.toString();
		});
		proc.on("close", () => resolve(data));
	});

	if (!output.trim()) return [];

	const lines = output.trim().split("\n").slice(1);
	return lines
		.map((line) => {
			const parts = line.trim().split(/\s+/);
			return (parts[1] || parts[0]) ?? "";
		})
		.filter((s): s is string => s !== "");
}
