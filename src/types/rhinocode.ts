export type RhinoInstanceJson = {
	pipeId: string;
	processId: number;
	processName: string;
	processVersion: string;
	processAge: number;
	activeDoc: { title: string; location: string } | null;
	activeViewport: string | null;
	$meta: { version: string };
	$type: "status";
};

export type RhinocodeProcessResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type RhinocodeRun = (args: string[]) => Promise<RhinocodeProcessResult>;

export type RhinocodeClient = {
	readonly executable: string;
	readonly run: RhinocodeRun;
	list: () => Promise<RhinoInstanceJson[]>;
	checkAvailable: () => Promise<void>;
	command: (pipeId: string, command: string) => Promise<number>;
	open: (pipeId: string, inputFile: string) => Promise<number>;
	quit: (pipeId: string) => Promise<number>;
};

export type RhinoDiscoveryErrorKind = "spawn" | "exit" | "json" | "schema";
