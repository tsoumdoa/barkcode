import { platform } from "os";
import { delay } from "./rhino";
import { listRhinoInstancesJson } from "./rhinocode-schemas";
import { RhinoInstanceJson } from "../types";

export async function killRhinoInstances(instances: RhinoInstanceJson[]): Promise<void> {
	const p = platform();
	for (const instance of instances) {
		const pid = String(instance.processId);
		if (p === "win32") {
			await Bun.spawn(["taskkill", "/PID", pid, "/F"], { stdout: "ignore", stderr: "ignore" }).exited;
		} else {
			await Bun.spawn(["kill", pid], { stdout: "inherit", stderr: "inherit" }).exited;
		}
	}

	for (let elapsed = 0; elapsed <= 2000; elapsed += 100) {
		await delay(100);
		const remaining = await listRhinoInstancesJson();
		if (remaining.length === 0) return;
	}
}
