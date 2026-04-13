import { platform } from "os";
import chalk from "chalk";
import { displayWarning } from "../lib/logger";
import { Bench, type Task } from "tinybench";
import { RHINO_PATH } from "../constants";
import { createRhinoRunner } from "../lib/rhino";
import { killRhinoInstances } from "../lib/kill-rhino";
import { listRhinoInstancesJson } from "../lib/rhinocode-schemas";
import { POLL_INTERVAL_MS, MAX_WAIT_MS, MAX_RETRIES } from "../lib/spawn-constants";

export type BenchmarkResult = {
	instances: number;
	delayMs: number;
	spawnElapsedMs: number;
	timestamp: string;
};

async function spawnWithTiming(count: number, delayMs: number): Promise<{ pipeIds: string[]; spawnElapsedMs: number } | null> {
	const startTime = Date.now();
	const initialInstances = await listRhinoInstancesJson();
	const initialCount = initialInstances.length;

	const spawn = async (needed: number): Promise<void> => {
		for (let i = 0; i < needed; i++) {
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
				await new Promise((r) => setTimeout(r, delayMs));
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
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			const spawned = await getSpawnedCount();
			if (spawned >= count) {
				const currentInstances = await listRhinoInstancesJson();
				return { pipeIds: currentInstances.map((i) => i.pipeId), spawnElapsedMs: spawnElapsed };
			}
		}

		const spawned = await getSpawnedCount();
		const missing = count - spawned;
		if (missing > 0) {
			await spawn(missing);
		}
	}

	const finalCount = await getSpawnedCount();
	if (finalCount === 0) return null;

	const currentInstances = await listRhinoInstancesJson();
	return { pipeIds: currentInstances.map((i) => i.pipeId), spawnElapsedMs: spawnElapsed };
}

const COL_WIDTHS = { name: 24, ops: 14, avg: 14, min: 14, max: 14 };

function printHeader(): void {
	const header = [
		"Task".padEnd(COL_WIDTHS.name),
		"Ops/sec".padEnd(COL_WIDTHS.ops),
		"Avg (ms)".padEnd(COL_WIDTHS.avg),
		"Min (ms)".padEnd(COL_WIDTHS.min),
		"Max (ms)".padEnd(COL_WIDTHS.max),
	].join("  ");

	console.log(chalk.bold("\n  " + header));
	console.log("  " + "-".repeat(header.length));
}

function printSeparator(): void {
	console.log(chalk.dim("  " + "─".repeat(90)));
}

function printTaskRow(task: Task): void {
	const r = task.result;
	if (r?.state !== "completed") {
		const line = [
			task.name.padEnd(COL_WIDTHS.name),
			"-".padEnd(COL_WIDTHS.ops),
			"-".padEnd(COL_WIDTHS.avg),
			"-".padEnd(COL_WIDTHS.min),
			"-".padEnd(COL_WIDTHS.max),
		].join("  ");
		console.log("  " + chalk.gray(line) + chalk.red(" x"));
		return;
	}

	if (r.latency.mean === 0) {
		const line = [
			task.name.padEnd(COL_WIDTHS.name),
			"-".padEnd(COL_WIDTHS.ops),
			"-".padEnd(COL_WIDTHS.avg),
			"-".padEnd(COL_WIDTHS.min),
			"-".padEnd(COL_WIDTHS.max),
		].join("  ");
		console.log("  " + chalk.gray(line) + chalk.yellow(" s"));
		return;
	}

	const line = [
		task.name.padEnd(COL_WIDTHS.name),
		r.throughput.mean.toFixed(4).padEnd(COL_WIDTHS.ops),
		r.latency.mean.toFixed(2).padEnd(COL_WIDTHS.avg),
		r.latency.min.toFixed(2).padEnd(COL_WIDTHS.min),
		r.latency.max.toFixed(2).padEnd(COL_WIDTHS.max),
	].join("  ");
	console.log("  " + chalk.gray(line) + chalk.green(" ✓"));
}

export async function benchmark(options: {
	instances?: string;
	delay?: string;
}) {
	const p = platform();
	if (p !== "win32") {
		console.log(chalk.yellow("  Benchmark only supported on Windows (win32). Exiting."));
		process.exit(0);
	}

	const instanceCounts = options.instances
		? options.instances.split(",").map(Number)
		: [8, 12, 16, 24].reverse();
	const delayValues = options.delay
		? options.delay.split(",").map(Number)
		: [10, 30, 50, 150].reverse();

	const rhinoRunner = createRhinoRunner(RHINO_PATH);
	await rhinoRunner.checkRhinoOrExit();
	await rhinoRunner.checkRhinocodeOrExit();

	const ITERATIONS = 1;

	const bench = new Bench({
		iterations: ITERATIONS,
		warmup: false,
		time: 0,
		throws: true,
	});

	for (const count of instanceCounts) {
		for (const delayMs of delayValues) {
			const taskName = `spawn-${count}@${delayMs}ms`;
			bench.add(taskName, async () => {
				const result = await spawnWithTiming(count, delayMs);
				if (!result) return { overriddenDuration: 0 };
				return { overriddenDuration: result.spawnElapsedMs };
			}, {
				beforeEach: async function(this: Task) {
					process.stdout.write(`\r\x1b[2K  ${this.name}  ${this.runs + 1}/${ITERATIONS}...`);
					const instances = await listRhinoInstancesJson();
					await killRhinoInstances(instances);
				},
			});
		}
	}

	printHeader();

	let lastGroup = "";
	bench.addEventListener("cycle", (evt) => {
		const task = evt.task;
		if (!task) return;
		process.stdout.write("\r\x1b[2K");
		const group = (task.name ?? "").split("@")[0] ?? "";
		if (group !== lastGroup) {
			if (lastGroup !== "") printSeparator();
			lastGroup = group;
		}
		printTaskRow(task);
	});

	const benchStart = Date.now();
	await bench.run();
	const benchElapsed = Date.now() - benchStart;

	console.log(chalk.bold(`\n  Total benchmark time: ${(benchElapsed / 1000).toFixed(1)}s`));
}
