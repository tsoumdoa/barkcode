import { confirm } from "@inquirer/prompts";
import { createRhinoSession, installSessionSignalCleanup } from "../lib/rhino";
import {
	displaySuccess,
	displayInfo,
	displayError,
	displayBold,
	displayDebug,
	setDebugMode,
} from "../lib/logger";

export async function runCommand(options: {
	command: string;
	debug?: boolean;
}) {
	const { command, debug: isDebug = false } = options;
	setDebugMode(isDebug);

	try {
		const session = createRhinoSession();
		const removeSignalHandlers = installSessionSignalCleanup(session);
		try {
			await session.client.checkAvailable();
			const result = await session.ensureInstances({ requestedCount: 1 });
			const pipeId = result.pipeIds[0]!;
			displaySuccess(
				result.launchedPipeIds.includes(pipeId)
					? `Started Rhino and connected to ${pipeId}`
					: `Connected to existing Rhino instance ${pipeId}`,
			);

			displayBold(`Executing: ${command}`);
			displayDebug("command", `pipeId: ${pipeId}`);
			const exitCode = await session.client.command(pipeId, command);
			if (exitCode === 0) {
				displaySuccess("Command completed successfully.");
			} else {
				displayError(`Command exited with code ${exitCode}.`);
				process.exitCode = 1;
			}

			if (result.reusedPipeIds.includes(pipeId)) {
				const shouldQuit = await confirm({ message: "Quit the existing Rhino instance?", default: false });
				if (shouldQuit) {
					displayInfo("Quitting Rhino...");
					await session.quitInstance(pipeId);
				}
			}
		} finally {
			await session.cleanupOwned();
			removeSignalHandlers();
		}
	} catch (error) {
		displayError((error as Error).message);
		process.exitCode = 1;
	}
}
