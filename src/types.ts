export type BarkcodeConfig = {
  version: "1.0";
  commands: BarkCommand[];
};

export type BarkCommand = {
  id: string;
  name: string;
  description?: string;
  rhCommand: string;
  scriptPath?: string;
  waitForCompletion?: boolean;
  timeout?: number;
  inputPattern?: string;
  inputFolder?: string;
  recursive?: boolean;
  requiredFiles?: string[];
  outputFolder?: string;
  outputFormat?: string;
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

export type ExecuteOptions = {
  timeout?: number;
  waitForCompletion?: boolean;
};

export type CommandResult = {
  success: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
};

export type BatchOptions = {
  inputFolder: string;
  outputFolder?: string;
  pattern: string;
  recursive: boolean;
  parallel?: number;
};

export type BatchSummary = {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export type FileMapping = {
  inputPath: string;
  outputPath: string;
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
