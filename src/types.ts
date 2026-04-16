import * as v from "valibot";
import { InferOutput } from "valibot";

export type BarkcodeConfig = {
  version: "1.0";
  commands: BarkCommand[];
};

export type BarkCommand = {
  id: string;
  name: string;
  description?: string;
  rhCommand: string;
  inputPattern: string;
  inputFolder: string;
  outputFolder: string;
  outputName: string;
  outputSuffix: string;
  pollIntervalMs?: number;
};

export type LoadedConfig = {
  config: BarkcodeConfig;
  configPath: string;
  projectRoot: string;
};

export type RhinoInstance = {
  id: string;
  connected: boolean;
};


export type CommandResult = {
  success: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
};

export type BatchSummary = {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
};

export type FileMapping = {
  inputPath: string;
	fileName: string;
  status: "pending" | "processing" | "success" | "failed" | "skipped";
  error?: string;
};

export type ConfigLoadOptions = {
  cwd?: string;
  configPath?: string;
};

export type MenuAction =
  | { type: "exit" }
  | { type: "run"; command: BarkCommand; files: string[] };



const ActiveDocSchema = v.object({
	title: v.string(),
	location: v.string(),
});

const RhinoStatusMetaSchema = v.object({
	version: v.string(),
});

const RhinoStatusSchema = v.object({
	pipeId: v.string(),
	processId: v.number(),
	processName: v.string(),
	processVersion: v.string(),
	processAge: v.number(),
	activeDoc: v.nullable(ActiveDocSchema),
	activeViewport: v.nullable(v.string()),
	$meta: RhinoStatusMetaSchema,
	$type: v.literal("status"),
});

export const RhinoInstanceListSchema = v.array(RhinoStatusSchema);
export type RhinoInstanceJson = InferOutput<typeof RhinoStatusSchema>;
