import * as v from "valibot";
import { RhinoInstanceListSchema, type RhinoInstanceJson } from "../types";

export type RhinocodeProcessResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type RhinocodeRun = (args: string[]) => Promise<RhinocodeProcessResult>;

export type RhinoDiscoveryErrorKind = "spawn" | "exit" | "json" | "schema";

export class RhinoDiscoveryError extends Error {
	constructor(
		public readonly kind: RhinoDiscoveryErrorKind,
		message: string,
		options: { cause?: unknown } = {},
	) {
		super(message, options);
		this.name = "RhinoDiscoveryError";
	}
}

export type DiscoveryResult =
	| { kind: "ok"; instances: RhinoInstanceJson[] }
	| { kind: "error"; error: RhinoDiscoveryError };

export async function discoverRhinoInstances(run: RhinocodeRun): Promise<DiscoveryResult> {
	let result: RhinocodeProcessResult;
	try {
		result = await run(["list", "--json"]);
	} catch (cause) {
		return {
			kind: "error",
			error: new RhinoDiscoveryError("spawn", "Failed to start `rhinocode list --json`.", { cause }),
		};
	}

	if (result.exitCode !== 0) {
		const detail = result.stderr.trim();
		return {
			kind: "error",
			error: new RhinoDiscoveryError(
				"exit",
				`rhinocode list exited with code ${result.exitCode}${detail ? `: ${detail}` : "."}`,
			),
		};
	}

	let json: unknown;
	try {
		json = JSON.parse(result.stdout);
	} catch (cause) {
		return {
			kind: "error",
			error: new RhinoDiscoveryError("json", "rhinocode list returned malformed JSON.", { cause }),
		};
	}

	const parsed = v.safeParse(RhinoInstanceListSchema, json);
	if (!parsed.success) {
		return {
			kind: "error",
			error: new RhinoDiscoveryError("schema", "rhinocode list returned an unsupported status shape.", {
				cause: parsed.issues,
			}),
		};
	}

	return { kind: "ok", instances: parsed.output };
}
