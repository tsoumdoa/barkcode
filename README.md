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

One session tracks active workers and the instances BarkCode started. Recovery replaces dead worker IDs through that same session. Automatic cleanup leaves reused or ambiguous Rhino sessions open. If macOS process discovery fails before launch, BarkCode treats the resulting session as reused.

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
4. **Close**: After the command or menu exits, `_-Quit` is sent only to instances BarkCode identified as started by the current session

## Project Structure

```
src/
├── main.ts                    # Entry point (bin: barkcode)
├── types.ts                   # Shared TypeScript types
├── schema.ts                  # barkcode.json validation schema
├── constants.ts              # Timeouts and defaults
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
