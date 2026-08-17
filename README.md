# BarkCode - Rhino CLI Batch Processor

BarkCode is an open-source CLI tool for batch-processing Rhino 3DM files. It spawns multiple Rhino instances and uses the `rhinocode` CLI to execute Rhino commands (like `_SaveAs`) across a collection of files in parallel.

## Installation

### Requirements

- [bun](https://bun.sh) runtime
- [npm](https://www.npmjs.com/) CLI
- Rhino 8. BarkCode uses `rhinocode` from PATH when available. On macOS it also checks Rhino 8's bundled binary.
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

## Quick Usage

```bash
# Run an interactive menu to select a batch command
barkcode run

# Spawn 12 instances on Windows. The Windows default is 8.
barkcode run --spawn=12

# macOS starts one Rhino instance automatically. Larger values are clamped to 1.
barkcode run --spawn=1

# Run a specific command by ID (from barkcode.json)
barkcode run convert:skp

# Execute a Rhino macro directly. Rhino starts automatically when needed.
barkcode command "_Circle 0 5"
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

### Rhino instance management

Rhino instances are discovered with `rhinocode list --json`. Each instance has a `pipeId` used to target commands. BarkCode reuses healthy instances before starting more. It returns exactly the requested worker count after applying the platform limit, so extra sessions never receive batch work.

On macOS, BarkCode starts Rhino with:

```text
/usr/bin/open /Applications/Rhino 8.app --args -nosplash -runscript _StartScriptServer
```

macOS allows one worker. If Rhino is already open without its script server, BarkCode stops after a bounded wait and explains how to run `_StartScriptServer`. It does not keep waiting forever.

On Windows, BarkCode starts each worker with:

```text
C:\Program Files\Rhino 8\System\Rhino.exe /nosplash /runscript="_StartScriptServer"
```

One session tracks the active workers and the instances BarkCode can prove it started. Recovery replaces dead worker IDs through that same session. Automatic cleanup only quits proven BarkCode-owned instances. Reused and ambiguous Rhino sessions remain open.

### rhinocode CLI

The `rhinocode` command-line tool (part of Rhino) provides:

- `rhinocode list --json` - List running Rhino instances
- `rhinocode command <cmd>` - Execute a Rhino command in all instances
- `rhinocode --rhino <pipeId> command <cmd>` - Target a specific instance

BarkCode resolves `rhinocode` once for each session. It checks PATH first, then `/Applications/Rhino 8.app/Contents/Resources/bin/rhinocode` on macOS. Listing, direct commands, batch execution, and cleanup all use that resolved executable.

### File Processing Pipeline

1. **Collect**: Files matching `inputPattern` in `inputFolder` are collected, sorted largest-first
2. **Queue**: Each Rhino instance pulls files from a shared work queue
3. **Execute**: For each file:
   - `rhinocode --rhino <id> -_open <file>` - Open the file
   - `rhinocode --rhino <id> command <rhCommand>` - Execute the command (e.g., `_SaveAs`)
   - `pollForFile()` - Wait for the output file to appear
4. **Close**: After the command or menu exits, `_-Quit` is sent only to instances BarkCode proved it started

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
    ├── rhino.ts               # Stateful Rhino session, recovery, and owned cleanup
    ├── rhino-platform.ts      # Platform launch commands and rhinocode resolution
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
2. Resolves `rhinocode` from PATH or Rhino's bundled macOS binary
3. Reuses healthy workers and starts missing Rhino instances on macOS or Windows
4. Shows a numbered menu of configured commands
5. User selects a command → files are collected → batch processes
6. Summary printed, then BarkCode closes only the Rhino instances it started

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

`RhinoSession` manages startup, worker recovery, and cleanup.

```typescript
session.ensureInstances({ requestedCount, spawnDelayMs })
// Returns exactly effectiveCount pipe IDs.

session.cleanupOwned()
// Idempotent. Quits proven owned pipe IDs at most once.
```

The session prefers active worker IDs, then selects other healthy instances in stable process ID order. A successful empty discovery starts missing capacity. Process, exit, JSON, and schema failures remain distinct errors.

Windows ownership uses direct child process IDs. macOS compares Rhino process IDs with a snapshot taken before launch. Pipes without enough ownership evidence are treated as reused and are never closed automatically.

### src/lib/rhinocode.ts

Core execution via `rhinocode` CLI.

```typescript
execute(client, inputFile, fileName, command, projectRoot, instanceId) → Promise<CommandResult>
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
processBatch(client, command, inputFiles, fileNames, instanceIds, projectRoot) → { mappings, summary }
```

1. Maps files to track status (pending/processing/success/failed)
2. `Promise.all()` across instanceIds - each instance runs a while-loop pulling files from `nextIndex++`
3. Each file: execute() → update status → displayProgress()
4. Returns `BatchSummary` with counts and duration. The owning `RhinoSession` handles cleanup.

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
2. Create one `RhinoSession`, then verify Rhino and rhinocode
3. Load config
4. Ask the session for the requested worker capacity
5. If `--command` flag: run it directly, exit
6. Else: enter `showCommandMenu()` loop until exit

### src/commands/run-helpers.ts

```typescript
loadConfigOrExit(options?) → LoadedConfig
// Wraps loadConfig() with a direct CLI error

ensureRhinoInstances(session, spawnCount, delay?) → EnsureRhinoResult
// Delegates startup and selection to the command's RhinoSession
// Shows connected instance IDs

executeCommandIfRequested(client, commandName, config, projectRoot, instances)
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

- Rhino is launched on demand with `/usr/bin/open`
- Worker requests above one are clamped to one with a warning
- BarkCode checks Rhino's bundled `rhinocode` when PATH lookup fails
- Startup polling has a fixed deadline. An already-open Rhino without a script server gets a specific diagnostic

### Windows

- Multiple Rhino instances are started as direct child processes
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
