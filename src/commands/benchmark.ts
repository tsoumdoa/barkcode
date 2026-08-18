import { platform } from "os";
import chalk from "chalk";
import { Bench, type Task } from "tinybench";
import { createRhinoSession } from "../lib/rhino";
import { getRhinoPlatformConfig, resolveRhinocodeExecutable } from "../lib/rhino-platform";
import { createRhinocodeClient } from "../lib/rhinocode";
import { killRhinoInstances } from "../lib/kill-rhino";

export type BenchmarkResult = {
	instances: number;
	delayMs: number;
	spawnElapsedMs: number;
	timestamp: string;
};

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

	const config = getRhinoPlatformConfig("win32");
	const client = createRhinocodeClient(resolveRhinocodeExecutable(config));
	await client.checkAvailable();

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
				const session = createRhinoSession({ config, client });
				const result = await session.ensureInstances({ requestedCount: count, spawnDelayMs: delayMs });
				return { overriddenDuration: result.spawnElapsedMs };
			}, {
				beforeEach: async function(this: Task) {
					process.stdout.write(`\r\x1b[2K  ${this.name}  ${this.runs + 1}/${ITERATIONS}...`);
					await killRhinoInstances(client, await client.list());
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
