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
  inputMode?: "single" | "batch";
  inputPattern?: string;
  inputFolder?: string;
  recursive?: boolean;
  requiredFiles?: string[];
  outputFolder?: string;
  outputFormat?: string;
  preserveStructure?: boolean;
  onConflict?: "error" | "skip" | "overwrite" | "rename";
  rename?: RenameOptions;
};

export type RenameOptions = {
  rules?: RenameRule[];
  template?: string;
  targetExtension?: string;
  counterStart?: number;
  counterPad?: number;
};

export type RenameRule =
  | { type: "stripExtension" }
  | { type: "trim" }
  | { type: "lowercase" }
  | { type: "uppercase" }
  | { type: "replace"; find: string; replace: string; all?: boolean }
  | { type: "regex"; find: string; replace: string; flags?: string }
  | { type: "removeDigits"; position?: "start" | "end" | "all" }
  | { type: "padDigits"; position: "start" | "end"; length: number; char?: string }
  | { type: "slice"; start?: number; end?: number };

export type RenameContext = {
  origName: string;
  origExt: string;
  counter?: number;
  now?: Date;
};

export type RenameResult = {
  baseName: string;
  finalName: string;
  finalExt: string;
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
  preserveStructure?: boolean;
  parallel?: number;
  dryRun?: boolean;
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
  status: "pending" | "processing" | "success" | "failed" | "skipped" | "conflict";
  error?: string;
};

export type ConfigLoadOptions = {
  cwd?: string;
  configPath?: string;
};
