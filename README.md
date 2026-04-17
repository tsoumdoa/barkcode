# BarkCode - Rhino CLI Batch Processor

BarkCode is an open-source CLI tool for batch-processing Rhino 3DM files. It spawns multiple Rhino instances and uses the `rhinocode` CLI to execute Rhino commands (like `_SaveAs`) across a collection of files in parallel.

## Installation

### Requirements

- [bun](https://bun.sh) runtime
- [npm](https://www.npmjs.com/) CLI
- Rhino 8 with `rhinocode` in system PATH
- macOS or Windows

### Setup

**Important:** Use the `0.1.x` branch for the stable release.

```bash
# Clone the repository
git clone <repo-url>
cd barkcode

# Checkout stable release branch
git checkout 0.1.x

# Install dependencies
bun install

# Link globally so `barkcode` command is available
bun link
```

After linking, the `barkcode` CLI will be available system-wide.

To uninstall:
```bash
bun unlink
```

## Overview

BarkCode reads a `barkcode.json` configuration file that defines commands (e.g., convert 3DM to SketchUp format). Each command specifies:

- A Rhino command to execute (with `{{path}}` and `{{fileName}}` placeholders)
- Input/output folders and patterns
- The command is then executed against all matching files using available Rhino instances

**Architecture Flow:**

```
barkcode.json → Config Loaded → Rhino Instances Spawned → Files Collected
                                                              ↓
                              rhino.ts ← rhinocode CLI ← rhCommand executed
                                                              ↓
                              pollForFile() waits for output file creation
```

## Core Concepts

### Rhino Instance Management

Rhino instances are discovered via `rhinocode list --json`. Each instance has a `pipeId` used to target commands. On macOS, only one Rhino instance is allowed; on Windows, multiple instances can be spawned.

### rhinocode CLI

The `rhinocode` command-line tool (part of Rhino) provides:

- `rhinocode list --json` - List running Rhino instances
- `rhinocode command <cmd>` - Execute a Rhino command in all instances
- `rhinocode --rhino <pipeId> command <cmd>` - Target a specific instance

BarkCode assumes `rhinocode` is in the system PATH.

### File Processing Pipeline

1. **Collect**: Files matching `inputPattern` in `inputFolder` are collected, sorted largest-first
2. **Queue**: Each Rhino instance pulls files from a shared work queue
3. **Execute**: For each file:
   - `rhinocode --rhino <id> -_open <file>` - Open the file
   - `rhinocode --rhino <id> command <rhCommand>` - Execute the command (e.g., `_SaveAs`)
   - `pollForFile()` - Wait for the output file to appear
4. **Close**: After batch completes, `_-Quit` is sent to all instances

## Project Structure

```
src/
├── main.ts                    # Entry point (bin: barkcode)
├── types.ts                   # Shared TypeScript types
├── schema.ts                  # barkcode.json validation schema
├── constants.ts              # Rhino path, timeouts, defaults
├── logo.ts                    # ASCII logo display
├── usage.ts                   # CLI usage help
│
├── commands/
│   ├── run.ts                 # Main run loop - interactive command selection
│   ├── run-helpers.ts         # Config loading, instance management
│   ├── init.ts                # `bark init` - scaffold barkcode.json
│   └── benchmark.ts           # `bark benchmark` - spawn performance testing
│
└── lib/
    ├── rhino.ts               # Rhino process spawning and health checks
    ├── rhinocode.ts           # Execute commands, poll for file output
    ├── rhinocode-schemas.ts   # JSON schema for rhinocode list output
    ├── batch.ts               # Work queue, parallel processing, progress
    ├── config.ts              # Config file discovery and loading
    ├── menu.ts                # Interactive CLI menu (inquirer)
    ├── logger.ts              # Colored console output, progress bars
    ├── sanitize.ts            # Input validation for paths/commands
    ├── kill-rhino.ts          # Kill Rhino processes (benchmark cleanup)
    └── spawn-constants.ts     # Polling intervals, timeouts, retry limits
```

## Configuration

### barkcode.json Schema

```json
{
  "version": "1.0",
  "commands": [
    {
      "id": "convert:skp",
      "name": "Convert to skp",
      "description": "Convert all 3DM files to SketchUp format",
      "rhCommand": "_-SaveAs {{path}} _Enter _Enter",
      "inputPattern": "*.3dm",
      "outputSuffix": "skp",
      "outputName": "{{fileName}}",
      "inputFolder": "./test/5",
      "outputFolder": "./test/converted",
      "pollIntervalMs": 500
    }
  ]
}
```

| Field            | Type    | Description                                                                        |
| ---------------- | ------- | ---------------------------------------------------------------------------------- |
| `id`             | string  | Unique command identifier (e.g., `convert:skp`)                                    |
| `name`           | string  | Display name in the interactive menu                                               |
| `description`    | string? | Optional description shown in menu                                                 |
| `rhCommand`      | string  | Rhino command to execute. Must contain `{{path}}` placeholder for output file path |
| `inputPattern`   | string  | Glob pattern for input files (e.g., `*.3dm`)                                       |
| `inputFolder`    | string  | Relative path to input directory (no absolute paths, no `../`)                     |
| `outputFolder`   | string  | Relative path to output directory                                                  |
| `outputName`     | string  | Output filename template. `{{fileName}}` is replaced with the input's base name    |
| `outputSuffix`   | string  | File extension for output (e.g., `skp`, `3dm`)                                     |
| `pollIntervalMs` | number? | Override default polling interval for file existence checks                        |

### Placeholders

In `rhCommand`, `outputName`, and `outputSuffix`:

- `{{path}}` - Full resolved output file path (quoted)
- `{{fileName}}` - Input filename without extension

Example for converting to Rhino 6 format:

```json
{
  "id": "convert:rh6",
  "name": "Save as Rhino6",
  "rhCommand": "_-SaveAs _Version=6 {{path}} _Enter _Enter",
  "outputName": "{{fileName}}_rh6",
  "outputSuffix": "3dm"
}
```

## Usage

### Setup

```bash
git clone <repo-url>
cd barkcode
bun install
npm link
```

### Commands

#### `bark init`

Scaffolds a `barkcode.json` in the current directory with default commands.

#### `bark run`

Launches the interactive menu:

1. Checks Rhino 8 installation
2. Checks `rhinocode` availability in PATH
3. Spawns Rhino instances (Windows) or prompts to open manually (macOS)
4. Shows a numbered menu of configured commands
5. User selects a command → files are collected → batch processes
6. Summary printed → all Rhino instances closed

**Options:**

- `--spawn=<N>` - Number of Rhino instances to spawn/connect (default: 1 on macOS, 8 on Windows)
- `--spawn-delay=<MS>` - Delay between spawning instances (default: 10ms)
- `--config=<path>` - Use a specific config file path
- `--command=<id>` - Run a specific command by ID without interactive menu
- `--debug` - Enable debug logging

#### `bark benchmark`

Windows-only benchmark tool for testing spawn performance with different instance counts and delays.

## Key Files Explained

### src/lib/rhino.ts

Manages the Rhino process lifecycle.

```typescript
createRhinoRunner(rhinoPath) → {
  checkRhinoOrExit()     // Verify Rhino.exe exists (Windows)
  checkRhinocodeOrExit() // Verify rhinocode is in PATH
  spawnRhino(count, delay?) // Launch count instances with _StartScriptServer
  getRunningProcesses()  // Return pipeIds from `rhinocode list --json`
  waitForRhinoInstances() // Poll until expected count reached
}
```

On macOS, Rhino only allows one instance and must be opened manually.

### src/lib/rhinocode.ts

Core execution via `rhinocode` CLI.

```typescript
execute(inputFile, fileName, command, projectRoot, instanceId?) → Promise<CommandResult>
```

1. Builds output path using `{{fileName}}` replacement
2. Replaces `{{path}}` in `rhCommand` with quoted output path
3. Spawns `rhinocode --rhino <id> -_open "<inputFile>"`
4. On that process exit, spawns `rhinocode --rhino <id> command <replacedCommand>`
5. Polls for output file existence (pollForFile)

```typescript
pollForFile(filePath, timeoutMs, intervalMs) → Promise<boolean>
```

Repeatedly checks if file exists until timeout.

```typescript
buildOutputPath(outputFolder, outputName, outputSuffix, fileName, projectRoot) → string
```

### src/lib/batch.ts

Implements the parallel work queue.

```typescript
collectFiles(inputFolder, pattern, projectRoot) → string[]
```

Uses `glob` to find matching files, sorts by size (largest first).

```typescript
processBatch(command, inputFiles, fileNames, instanceIds, projectRoot) → { mappings, summary }
```

1. Maps files to track status (pending/processing/success/failed)
2. `Promise.all()` across instanceIds - each instance runs a while-loop pulling files from `nextIndex++`
3. Each file: execute() → update status → displayProgress()
4. On completion: closeAll() (sends \_-Quit to all instances)
5. Returns BatchSummary with counts and duration

### src/lib/config.ts

```typescript
loadConfig(options?) → Promise<LoadedConfig>
// Searches upward for barkcode.json, validates JSON against schema

findConfig(startDir?, explicitPath?) → string | null
// Walks up directory tree looking for barkcode.json

getCommand(config, commandNameOrIndex) → BarkCommand
// Lookup by id, name, or numeric index (1-based)
```

### src/lib/sanitize.ts

Input validation using valibot custom validators:

- `FileNameValidator` - Rejects paths separators, null bytes, illegal chars
- `FolderPathValidator` - Rejects absolute paths, `..` traversal
- `RhinoCommandValidator` - Rejects null bytes, newlines, quotes, backticks

### src/lib/logger.ts

Unified console output with progress bar support:

```typescript
displayProgress(current, total, fileName, status, elapsedMs);
// Shows: [████████████░░░░] 5/10 50% | ▓ filename (1m 23s)
// Status "processing" updates the bar; "success"/"failed" replaces it with ✓/✗

displayDebug(context, message);
// Only prints if setDebugMode(true) was called

flushProgress();
// Erases the progress bar line from terminal
```

### src/lib/menu.ts

Uses `@inquirer/prompts` select for interactive command choice. On selection, calls `collectFiles()` and returns `MenuAction: { type: "run", command, files }` or `{ type: "exit" }`.

### src/commands/run.ts

Main entry point for `bark run`:

1. Parse CLI options
2. Create RhinoRunner, verify Rhino + rhinocode
3. Load config
4. ensureRhinoInstances (spawn or prompt)
5. If `--command` flag: run it directly, exit
6. Else: enter `showCommandMenu()` loop until exit

### src/commands/run-helpers.ts

```typescript
loadConfigOrExit(options?) → LoadedConfig
// Wraps loadConfig() with error display and exit

ensureRhinoInstances(rhinoRunner, spawnCount, delay?) → { pipeIds, spawnElapsedMs }
// Platform-aware: macOS warns about single instance; Windows spawns
// Shows connected instance IDs

executeCommandIfRequested(commandName, config, projectRoot, instances)
// Used by --command flag to run non-interactively
```

### src/commands/benchmark.ts

Uses `tinybench` to benchmark spawn performance:

- Spawns N instances with M ms delay
- Measures elapsed time
- Results: ops/sec, avg/min/max latency per configuration

### src/commands/init.ts

Scaffolds barkcode.json with two default commands (SKP conversion, Rhino6 format).

## CLI Options Reference

| Option               | Description                        | Default                |
| -------------------- | ---------------------------------- | ---------------------- |
| `--spawn <N>`        | Number of parallel Rhino instances | 1 (macOS), 8 (Windows) |
| `--spawn-delay <MS>` | Delay between spawning instances   | 10ms                   |
| `--config <path>`    | Use specific config file           | searches upward        |
| `--command <id>`     | Run command by ID, no menu         | -                      |
| `--debug`            | Enable debug output                | false                  |

## Platform-Specific Behavior

### macOS

- Rhino only allows **one** instance
- User must manually open Rhino and run `_StartScriptServer`
- `waitForRhinoInstances()` polls until the single instance appears

### Windows

- Multiple Rhino instances can be spawned via `Bun.spawn()`
- `_StartScriptServer` is passed via `/runscript="_StartScriptServer"` flag
- Default spawn count is 8, max recommended is 16

## Security

`src/lib/sanitize.ts` provides input hygiene only:

- File names cannot contain path separators (`/`, `\`) or illegal characters
- Folder paths cannot be absolute or contain `..` traversal
- Rhino commands cannot contain quotes, backticks, or newlines

These are not complete security boundaries - treat as linting to prevent accidental misuse.

## Dependencies

- **bun** - Runtime (required)
- **@inquirer/prompts** - Interactive CLI menus
- **chalk** - Terminal colors
- **commander** - CLI argument parsing
- **glob** - File pattern matching
- **valibot** - JSON schema validation
- **tinybench** - Benchmarking (dev dependency)
