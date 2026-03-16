# Barkcode CLI Tool Plan v2

## Overview

Barkcode is a CLI tool for automating Rhino 8 workflows via rhinocode.

It allows users to define reusable project commands in `barkcode.json`, then run them interactively or non-interactively for single files or batch processing.

Core goals:
- project-local automation
- repeatable Rhino workflows
- flexible batch conversion/export
- predictable file renaming
- simple enough for non-programmers to edit

---

## 1. Config Discovery

### Config file name
```text
barkcode.json
```

### Discovery behavior
When a command needs config, Barkcode should locate `barkcode.json` using this order:

1. If `--config <path>` is provided:
   - use that file directly
   - error if it does not exist

2. Otherwise, start from the current working directory and search upward:
   - check `./barkcode.json`
   - then `../barkcode.json`
   - then `../../barkcode.json`
   - continue until filesystem root

3. If no config is found:
   - show message:
     ```text
     No barkcode.json found in this directory or any parent directory.
     Run `bark init` to create one.
     ```
   - optionally prompt in interactive mode:
     ```text
     No Barkcode project found. Initialize one here? (Y/n)
     ```

### Notes
- This upward search defines the Barkcode project root.
- Relative paths in config should be resolved from the directory containing `barkcode.json`, not necessarily the current shell directory.

Example:
```text
/work/project/barkcode.json
/work/project/models/a/file.3dm
/work/project/sub/folder
```

If user runs `bark start` from `/work/project/sub/folder`, Barkcode should still use:
```text
/work/project/barkcode.json
```

and resolve config-relative paths from:
```text
/work/project
```

---

## 2. Config Schema (`barkcode.json`)

```ts
type BarkcodeConfig = {
  version: "1.0";
  commands: BarkCommand[];
};

type BarkCommand = {
  name: string; // Human-readable command name
  description?: string;

  // Rhino execution
  rhCommand: string; // e.g. "_-Export", "_SaveAs", "_RunPythonScript"
  scriptPath?: string; // Optional Rhino/Python script path
  waitForCompletion?: boolean; // default: true
  timeout?: number; // seconds, default: 300

  // Input
  inputMode?: "single" | "batch"; // default inferred from command usage
  inputPattern?: string; // e.g. "*.3dm"
  inputFolder?: string; // default input folder
  recursive?: boolean; // default: false
  requiredFiles?: string[]; // files that must exist before execution

  // Output
  outputFolder?: string; // default output folder
  outputFormat?: string; // Rhino/export format intent, e.g. "step", "stl", "sketchup"
  preserveStructure?: boolean; // preserve relative folders in recursive mode
  onConflict?: "error" | "skip" | "overwrite" | "rename"; // default: error

  // Naming
  rename?: RenameOptions;
};
```

### Rename schema

```ts
type RenameOptions = {
  rules?: RenameRule[]; // applied in order to base filename only
  template?: string; // final filename template
  targetExtension?: string; // output extension without leading dot preferred
  counterStart?: number; // default: 1
  counterPad?: number; // default: 3
};

type RenameRule =
  | { type: "stripExtension" }
  | { type: "trim" }
  | { type: "lowercase" }
  | { type: "uppercase" }
  | { type: "replace"; find: string; replace: string; all?: boolean }
  | { type: "regex"; find: string; replace: string; flags?: string }
  | { type: "removeDigits"; position?: "start" | "end" | "all" }
  | { type: "padDigits"; position: "start" | "end"; length: number; char?: string }
  | { type: "slice"; start?: number; end?: number };
```

### Rename semantics

Rename operations should be applied as follows:

1. Start with input file path
2. Extract:
   - `origName`: filename without extension
   - `origExt`: extension without dot
3. Initialize working `name = origName`
4. Apply `rename.rules` in order to `name`
5. Determine output extension:
   - use `rename.targetExtension` if present
   - else use extension implied by command/output format if available
   - else fallback to `origExt`
6. Render `rename.template` if present
7. If no template is present, final filename is:
   ```text
   {name}.{ext}
   ```

Important:
- rename rules operate on filename only, not directories
- output folder logic is handled separately
- template should return filename only, not full path

---

## 3. Rename Template Variables

Supported template variables:

- `{name}`: transformed filename base
- `{origName}`: original filename base
- `{ext}`: final extension
- `{origExt}`: original extension
- `{date}`: `YYYY-MM-DD`
- `{time}`: `HH-mm-ss`
- `{datetime}`: `YYYY-MM-DD_HH-mm-ss`
- `{counter}`: running counter with padding

Example:
```text
{name}_{date}.{ext}
```

Example result:
```text
partial_slab_2026-03-16.skp
```

### Future extension
Possible later support:
- `{parent}`
- `{dir}`
- formatted placeholders like `{counter:4}` or `{date:YYYYMMDD}`

Not required for v1.

---

## 4. Example `barkcode.json`

```json
{
  "version": "1.0",
  "commands": [
    {
      "name": "Convert 3DM to STEP",
      "description": "Convert all 3DM files to STEP format",
      "rhCommand": "_-Export",
      "inputMode": "batch",
      "inputPattern": "*.3dm",
      "inputFolder": "./models",
      "recursive": true,
      "outputFolder": "./converted/step",
      "outputFormat": "step",
      "preserveStructure": true,
      "onConflict": "error",
      "timeout": 300
    },
    {
      "name": "Batch STL Export",
      "description": "Export 3DM files to STL for 3D printing",
      "rhCommand": "_-Export",
      "inputMode": "batch",
      "inputPattern": "*.3dm",
      "outputFolder": "./exports/stl",
      "outputFormat": "stl",
      "recursive": true,
      "preserveStructure": true,
      "onConflict": "rename"
    },
    {
      "name": "Run Analysis Script",
      "description": "Run custom Python analysis on selected file",
      "rhCommand": "_RunPythonScript",
      "scriptPath": "./scripts/AnalyzeGeometry.py",
      "inputMode": "single",
      "timeout": 300
    },
    {
      "name": "Convert 3DM to Sketchup",
      "description": "partial slab 001.3dm -> partial_slab.skp",
      "rhCommand": "_-Export",
      "inputMode": "batch",
      "inputPattern": "*.3dm",
      "outputFolder": "./exports/sketchup",
      "outputFormat": "sketchup",
      "rename": {
        "rules": [
          { "type": "regex", "find": "\\s+\\d{3}$", "replace": "" },
          { "type": "trim" },
          { "type": "lowercase" },
          { "type": "regex", "find": "\\s+", "replace": "_" }
        ],
        "template": "{name}.{ext}",
        "targetExtension": "skp"
      }
    },
    {
      "name": "Convert 3DM to Sketchup with Date",
      "description": "partial slab 001.3dm -> partial_slab_2026-03-16.skp",
      "rhCommand": "_-Export",
      "inputMode": "batch",
      "inputPattern": "*.3dm",
      "outputFolder": "./exports/sketchup-dated",
      "outputFormat": "sketchup",
      "rename": {
        "rules": [
          { "type": "regex", "find": "\\s+\\d{3}$", "replace": "" },
          { "type": "trim" },
          { "type": "lowercase" },
          { "type": "regex", "find": "\\s+", "replace": "_" }
        ],
        "template": "{name}_{date}.{ext}",
        "targetExtension": "skp"
      }
    }
  ]
}
```

---

## 5. `bark init`

### Purpose
Create a new `barkcode.json` in a directory.

### Behavior
1. Determine target directory:
   - current directory by default
   - or `--path <dir>`
2. If `barkcode.json` already exists:
   - prompt to overwrite
   - unless `--force` is provided
3. Create a default config with 3 example commands
4. Print success message and path

### CLI
```bash
bark init
bark init --path ./config
bark init --force
```

### Notes
- `bark init` should not search parent directories
- it creates config exactly where requested

---

## 6. `bark start`

### Purpose
Start Rhino and provide an interactive menu for command selection.

### Behavior
1. Locate `barkcode.json`
2. Validate config schema
3. Start or connect to Rhino with script server
4. Show interactive command menu
5. Ask for any missing runtime inputs:
   - input folder
   - file selection
   - output folder override
6. Run selected command
7. Show progress and results
8. Return to menu until user exits

### CLI
```bash
bark start
bark start --config ./barkcode.json
bark start --command "Convert 3DM to STEP"
bark start --input ./files
bark start --dry-run
```

### Interactive menu example
```text
Select a command to run:
1. Convert 3DM to STEP
2. Batch STL Export
3. Run Analysis Script
4. Custom Rhino command
5. Exit
```

### Notes
- `start` should keep Rhino alive between commands when possible
- this is the persistent session mode

---

## 7. `bark run`

### Purpose
Run a configured command non-interactively.

### Behavior
1. Locate `barkcode.json`
2. Validate config schema
3. Resolve command by name or index
4. Start a new Rhino instance
5. Execute command
6. Print summary
7. Exit with code:
   - `0` on success
   - non-zero on failure

### CLI
```bash
bark run "Convert 3DM to STEP"
bark run 1
bark run "Convert 3DM to STEP" ./files
bark run "Convert 3DM to STEP" --output ./out
bark run "Convert 3DM to STEP" --recursive
bark run "Convert 3DM to STEP" --dry-run
```

### Notes
- `run` is ephemeral session mode
- ideal for scripts, shortcuts, and automation

---

## 8. Dry Run / Preview

### Purpose
Allow users to inspect what Barkcode will do before modifying files or launching long jobs.

### Behavior
With `--dry-run`, Barkcode should:
- load config
- resolve files
- compute output paths
- compute renamed output filenames
- show Rhino command that would run
- not execute Rhino commands
- not create output files

### Example output
```text
Command: Convert 3DM to Sketchup
Input files found: 3

1. ./models/partial slab 001.3dm
   -> ./exports/sketchup/partial_slab.skp

2. ./models/partial slab 002.3dm
   -> ./exports/sketchup/partial_slab.skp
   ! conflict: same output filename

Action on conflict: error
Dry run only. No files were processed.
```

---

## 9. Batch Processing

Create `src/lib/batch.ts`.

```ts
type BatchOptions = {
  inputFolder: string;
  outputFolder?: string;
  pattern: string;
  recursive: boolean;
  preserveStructure?: boolean;
  parallel?: number; // default: 1
  dryRun?: boolean;
};
```

### Processing logic
1. Resolve input folder relative to project root
2. Collect files using `glob`
3. For each file:
   - compute relative path from input root
   - compute output filename via rename system
   - if `preserveStructure`, recreate relative folders under output root
   - check conflicts
   - execute Rhino command unless dry run
4. Continue on file-level failure unless fatal
5. Return summary:
   - total
   - succeeded
   - failed
   - skipped

### Conflict handling
Supported modes:
- `error`: stop and report error
- `skip`: skip conflicting file
- `overwrite`: replace existing output
- `rename`: auto-rename, e.g. `file_001.skp`

Recommended default:
```text
error
```

---

## 10. Rhinocode Communication Layer

Create `src/lib/rhinocode.ts`.

```ts
type RhinoInstance = {
  id: string;
  connected: boolean;
};

type ExecuteOptions = {
  timeout?: number;
  waitForCompletion?: boolean;
};

type CommandResult = {
  success: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
};

async function connect(): Promise<RhinoInstance>;

async function execute(
  instance: RhinoInstance,
  command: string,
  options?: ExecuteOptions
): Promise<CommandResult>;

async function executeOnFile(
  instance: RhinoInstance,
  command: string,
  filePath: string,
  outputPath?: string,
  options?: ExecuteOptions
): Promise<CommandResult>;

async function disconnect(instance: RhinoInstance): Promise<void>;
```

### Session modes
- `bark start`: persistent Rhino session
- `bark run`: new Rhino session per command invocation

---

## 11. Config Loader & Validation

Create `src/lib/config.ts`.

### Responsibilities
- locate `barkcode.json`
- read file
- parse JSON
- validate schema
- return:
  - parsed config
  - config path
  - project root

### Suggested API

```ts
type LoadedConfig = {
  config: BarkcodeConfig;
  configPath: string;
  projectRoot: string;
};

async function findConfig(
  startDir?: string,
  explicitPath?: string
): Promise<string | null>;

async function loadConfig(options?: {
  cwd?: string;
  configPath?: string;
}): Promise<LoadedConfig>;
```

### Validation
Use a runtime schema validator such as:
- Zod

This gives:
- safe JSON parsing
- helpful error messages
- normalized defaults

---

## 12. Rename Engine

Create `src/lib/rename.ts`.

### Responsibilities
- apply rename rules to file basename
- render filename template
- resolve final extension
- sanitize output filename if needed for OS compatibility

### Suggested API

```ts
type RenameContext = {
  origName: string;
  origExt: string;
  counter?: number;
  now?: Date;
};

type RenameResult = {
  baseName: string;
  finalName: string;
  finalExt: string;
};

function renameFile(
  inputFilename: string,
  options?: RenameOptions,
  context?: RenameContext
): RenameResult;
```

### Example
Input:
```text
partial slab 001.3dm
```

Output:
```text
{
  "baseName": "partial_slab",
  "finalName": "partial_slab_2026-03-16.skp",
  "finalExt": "skp"
}
```

---

## 13. File Structure

```text
barkcode/
├── src/
│   ├── commands/
│   │   ├── init.ts
│   │   ├── start.ts
│   │   └── run.ts
│   ├── lib/
│   │   ├── config.ts
│   │   ├── rhinocode.ts
│   │   ├── batch.ts
│   │   ├── rename.ts
│   │   └── menu.ts
│   ├── types.ts
│   ├── schema.ts
│   └── constants.ts
├── index.ts
├── package.json
└── tsconfig.json
```

---

## 14. Dependencies
version here is reference only, use the one already in `package.json`
```json
{
  "dependencies": {
    "chalk": "^5.6.2",
    "commander": "^14.0.3",
    "glob": "^10.3.10",
    "@inquirer/prompts": "^8.3.2",
    "zod": "^3.24.1"
  }
}
```

Optional later:
- `ora` for spinner output
- `cli-table3` for richer tables

---

## 15. Implementation Order

### Phase 1: Types, Schema, Config Discovery
- define TypeScript types
- define Zod schema
- implement config discovery
- implement config loading and validation

### Phase 2: Rename Engine
- rule application
- template rendering
- extension resolution
- conflict-safe filename support

### Phase 3: `bark init`
- scaffold `barkcode.json`
- support `--path`
- support `--force`

### Phase 4: Rhinocode Layer
- start/connect to Rhino
- execute basic commands
- test timeout and error handling

### Phase 5: `bark run`
- resolve command
- resolve input/output folders
- batch file scanning
- dry-run preview
- summary reporting

### Phase 6: `bark start`
- persistent Rhino session
- interactive menu
- runtime prompts
- custom command support

### Phase 7: Polish
- logging improvements
- better validation messages
- conflict reporting
- help text and docs

---

## 16. Edge Cases & Error Handling

- no `barkcode.json`
  - prompt to run `bark init`
- invalid JSON
  - show parse error
- schema validation failure
  - show clear field-level error
- Rhino not installed
  - show setup instructions
- rhinocode unavailable
  - show setup instructions
- no input files matched
  - warn and exit gracefully
- output folder missing
  - create automatically
- duplicate output names
  - apply `onConflict` policy
- file locked
  - retry once, then fail
- timeout
  - abort command, report failure
- bad regex in rename rule
  - validate and report before processing

---

## 17. Key Design Decisions

1. Config is project-local and discoverable by walking up parent directories
2. Relative paths are resolved from the config directory
3. Rename rules modify only the basename, not full path
4. Templates compose final output filename
5. Extension handling is controlled by `targetExtension`
6. Batch conflict behavior must be explicit
7. Dry-run is first-class, not an afterthought

---

## 18. MVP Definition

For v1, Barkcode should support:

- `bark init`
- config discovery by walking upward
- config loading + validation
- `bark run`
- batch file collection via glob
- rename rules + template rendering
- conflict handling
- dry-run preview
- basic Rhino command execution

`bark start` can come right after MVP if needed.

If you want, I can also turn this into:
1. a polished `plan.md` exactly ready to paste
2. `src/types.ts`
3. `src/schema.ts` with Zod
4. `src/lib/config.ts` with the upward-search behavior
