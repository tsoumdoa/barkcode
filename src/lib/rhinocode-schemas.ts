import * as v from "valibot";
import { RhinoInstanceJson, RhinoInstanceListSchema } from "../types";

export async function listRhinoInstancesJson(): Promise<RhinoInstanceJson[]> {
	const proc = Bun.spawn(["rhinocode", "list", "--json"], {
		stdout: "pipe",
		stderr: "ignore",
	});

	const output = await new Response(proc.stdout).text();
	try {
		const json = JSON.parse(output);
		return v.parse(RhinoInstanceListSchema, json);
	} catch {
		return [];
	}
}
