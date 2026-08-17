import { describe, expect, it } from "bun:test";
import type { RhinoInstanceJson } from "../types";
import { RhinoSession } from "./rhino";
import { getRhinoPlatformConfig } from "./rhino-platform";
import { RhinocodeClient } from "./rhinocode";

function status(pipeId: string, processId: number): RhinoInstanceJson {
	return {
		pipeId,
		processId,
		processName: "Rhino",
		processVersion: "8.0",
		processAge: 1,
		activeDoc: null,
		activeViewport: null,
		$meta: { version: "1" },
		$type: "status",
	};
}

function clientWithLists(
	lists: Array<RhinoInstanceJson[] | Error>,
	commands: string[][] = [],
): RhinocodeClient {
	let listIndex = 0;
	return new RhinocodeClient("mock-rhinocode", async (args) => {
		if (args[0] === "list") {
			const item = lists[Math.min(listIndex++, lists.length - 1)]!;
			if (item instanceof Error) throw item;
			return { exitCode: 0, stdout: JSON.stringify(item), stderr: "" };
		}
		commands.push(args);
		return { exitCode: 0, stdout: "", stderr: "" };
	});
}

function dependencies(overrides: Record<string, unknown> = {}) {
	let time = 0;
	return {
		now: () => time,
		sleep: async (ms: number) => { time += ms; },
		exists: () => true,
		launch: async () => ({ pid: 101 }),
		listRhinoProcessIds: async () => new Set<number>(),
		terminateProcess: async () => {},
		pollIntervalMs: 10,
		maxWaitMs: 100,
		...overrides,
	};
}

describe("RhinoSession", () => {
	it("returns exactly the requested workers in stable process order", async () => {
		const client = clientWithLists([[
			status("third", 30),
			status("first", 10),
			status("second", 20),
		]]);
		const session = new RhinoSession(getRhinoPlatformConfig("win32"), client, dependencies());

		const result = await session.ensureInstances({ requestedCount: 2 });

		expect(result.pipeIds).toEqual(["first", "second"]);
	});

	it("clamps macOS to one and uses the macOS launch spec", async () => {
		const launches: Array<[string, string[]]> = [];
		const client = clientWithLists([[], [status("mac", 55)]]);
		const config = getRhinoPlatformConfig("darwin");
		const session = new RhinoSession(config, client, dependencies({
			launch: async (command: string, args: string[]) => {
				launches.push([command, args]);
				return {};
			},
			listRhinoProcessIds: async () => new Set<number>(),
		}));

		const result = await session.ensureInstances({ requestedCount: 4 });

		expect(result.pipeIds).toEqual(["mac"]);
		expect(result.launchedPipeIds).toEqual(["mac"]);
		expect(launches).toEqual([[config.launchCommand, config.launchArgs]]);
	});

	it("launches missing Windows capacity once and never owns an unrelated process", async () => {
		let launchCount = 0;
		const commands: string[][] = [];
		const client = clientWithLists([
			[status("existing", 10)],
			[status("unrelated", 99), status("started", 101), status("existing", 10)],
		], commands);
		const session = new RhinoSession(getRhinoPlatformConfig("win32"), client, dependencies({
			launch: async () => {
				launchCount++;
				return { pid: 101 };
			},
		}));

		const result = await session.ensureInstances({ requestedCount: 2 });

		expect(launchCount).toBe(1);
		expect(result.pipeIds).toEqual(["existing", "unrelated"]);
		expect(result.launchedPipeIds).toEqual([]);
		await session.cleanupOwned();
		expect(commands).toEqual([["--rhino", "started", "command", "_-Quit"]]);
	});

	it("does not claim macOS ownership when the pre-launch PID snapshot fails", async () => {
		const commands: string[][] = [];
		const client = clientWithLists([[], [status("users-rhino", 42)]], commands);
		const session = new RhinoSession(getRhinoPlatformConfig("darwin"), client, dependencies({
			launch: async () => ({}),
			listRhinoProcessIds: async () => undefined,
		}));

		const result = await session.ensureInstances({ requestedCount: 1 });
		await session.cleanupOwned();

		expect(result.launchedPipeIds).toEqual([]);
		expect(commands).toEqual([]);
	});

	it("does not launch when initial discovery fails", async () => {
		let launched = false;
		const client = clientWithLists([new Error("ENOENT")]);
		const session = new RhinoSession(getRhinoPlatformConfig("win32"), client, dependencies({
			launch: async () => {
				launched = true;
				return { pid: 101 };
			},
		}));

		await expect(session.ensureInstances({ requestedCount: 1 })).rejects.toMatchObject({ kind: "spawn" });
		expect(launched).toBe(false);
	});

	it("retries transient discovery errors without launching a second wave", async () => {
		let launchCount = 0;
		const client = clientWithLists([[], new Error("temporary"), [status("ready", 101)]]);
		const session = new RhinoSession(getRhinoPlatformConfig("win32"), client, dependencies({
			launch: async () => {
				launchCount++;
				return { pid: 101 };
			},
		}));

		const result = await session.ensureInstances({ requestedCount: 1 });

		expect(result.pipeIds).toEqual(["ready"]);
		expect(result.spawnElapsedMs).toBe(20);
		expect(launchCount).toBe(1);
	});

	it("bounds the macOS wait and explains the already-open case", async () => {
		const client = clientWithLists([[]]);
		const session = new RhinoSession(getRhinoPlatformConfig("darwin"), client, dependencies({
			listRhinoProcessIds: async () => new Set([42]),
			maxWaitMs: 20,
		}));

		await expect(session.ensureInstances({ requestedCount: 1 })).rejects.toThrow(
			"Rhino may already be open without its script server",
		);
	});

	it("retries a macOS quit after a non-zero exit", async () => {
		let listCount = 0;
		let quitCount = 0;
		const client = new RhinocodeClient("mock-rhinocode", async (args) => {
			if (args[0] === "list") {
				const instances = listCount++ === 0 ? [] : [status("owned", 55)];
				return { exitCode: 0, stdout: JSON.stringify(instances), stderr: "" };
			}
			quitCount++;
			return { exitCode: quitCount === 1 ? 7 : 0, stdout: "", stderr: "" };
		});
		const session = new RhinoSession(getRhinoPlatformConfig("darwin"), client, dependencies({
			launch: async () => ({}),
			listRhinoProcessIds: async () => new Set<number>(),
		}));

		await session.ensureInstances({ requestedCount: 1 });
		await session.cleanupOwned();
		await session.cleanupOwned();

		expect(quitCount).toBe(2);
	});

	it("terminates an earlier Windows child when a later launch fails", async () => {
		let launchCount = 0;
		const terminated: number[] = [];
		const client = clientWithLists([[]]);
		const session = new RhinoSession(getRhinoPlatformConfig("win32"), client, dependencies({
			launch: async () => {
				if (launchCount++ === 0) return { pid: 101 };
				throw new Error("launch failed");
			},
			terminateProcess: async (pid: number) => { terminated.push(pid); },
			maxWaitMs: 20,
		}));

		await expect(session.ensureInstances({ requestedCount: 2 })).rejects.toThrow("Failed to launch Rhino");
		await session.cleanupOwned();

		expect(terminated).toEqual([101]);
	});

	it("retains ownership through repeated recovery and cleans each pipe once", async () => {
		const commands: string[][] = [];
		const client = clientWithLists([
			[], [status("one", 101)],
			[], [status("two", 102)],
			[], [status("three", 103)],
		], commands);
		let nextPid = 101;
		const session = new RhinoSession(getRhinoPlatformConfig("win32"), client, dependencies({
			launch: async () => ({ pid: nextPid++ }),
		}));

		await session.ensureInstances({ requestedCount: 1 });
		await session.ensureInstances({ requestedCount: 1 });
		await session.ensureInstances({ requestedCount: 1 });
		await Promise.all([session.cleanupOwned(), session.cleanupOwned()]);

		expect(commands).toEqual([
			["--rhino", "one", "command", "_-Quit"],
			["--rhino", "two", "command", "_-Quit"],
			["--rhino", "three", "command", "_-Quit"],
		]);
	});
});
