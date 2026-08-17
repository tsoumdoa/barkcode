import { describe, expect, it } from "bun:test";
import { discoverRhinoInstances } from "./rhinocode-schemas";

describe("Rhino discovery", () => {
	it("keeps a successful empty list distinct from failures", async () => {
		const result = await discoverRhinoInstances(async () => ({ exitCode: 0, stdout: "[]", stderr: "" }));
		expect(result).toEqual({ kind: "ok", instances: [] });
	});

	it.each([
		["spawn", async () => { throw new Error("ENOENT"); }],
		["exit", async () => ({ exitCode: 2, stdout: "", stderr: "bad flag" })],
		["json", async () => ({ exitCode: 0, stdout: "not json", stderr: "" })],
		["schema", async () => ({ exitCode: 0, stdout: JSON.stringify([{ pipeId: 4 }]), stderr: "" })],
	] as const)("returns a typed %s error", async (kind, run) => {
		const result = await discoverRhinoInstances(run);
		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error.kind).toBe(kind);
	});
});
