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
		expect(result.effectiveCount).toBe(2);
		expect(result.reusedPipeIds).toEqual(["first", "second"]);
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

		expect(result.effectiveCount).toBe(1);
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
		expect(session.state.ownedPipeIds.has("unrelated")).toBe(false);
		expect(session.state.ownedPipeIds.has("started")).toBe(true);
		await session.cleanupOwned();
		expect(commands).toEqual([["--rhino", "started", "command", "_-Quit"]]);
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

		expect([...session.state.activePipeIds]).toEqual(["three"]);
		expect([...session.state.ownedPipeIds]).toEqual(["one", "two", "three"]);
		expect(commands).toEqual([
			["--rhino", "one", "command", "_-Quit"],
			["--rhino", "two", "command", "_-Quit"],
			["--rhino", "three", "command", "_-Quit"],
		]);
	});
});
