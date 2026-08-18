import { describe, expect, it } from "bun:test";
import { createRhinocodeClient } from "./rhinocode";

describe("createRhinocodeClient", () => {
	it("routes list, open, command, and quit through one configured runner", async () => {
		const calls: string[][] = [];
		const client = createRhinocodeClient("/custom/rhinocode", async (args) => {
			calls.push(args);
			return {
				exitCode: 0,
				stdout: args[0] === "list" ? "[]" : "",
				stderr: "",
			};
		});

		await client.list();
		await client.open("pipe-1", "/tmp/model.3dm");
		await client.command("pipe-1", "_Circle 0 5");
		await client.quit("pipe-1");

		expect(client.executable).toBe("/custom/rhinocode");
		expect(calls).toEqual([
			["list", "--json"],
			["--rhino", "pipe-1", "command", "-_open", '"/tmp/model.3dm"'],
			["--rhino", "pipe-1", "command", "_Circle 0 5"],
			["--rhino", "pipe-1", "command", "_-Quit"],
		]);
	});
});
