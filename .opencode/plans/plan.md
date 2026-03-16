# Barkcode CLI Tool Plan

## Overview
A CLI tool to automate Rhino 8 workflows via rhinocode. Allows users to define custom commands in a JSON config and run them interactively or in batch mode.

---

## 1. JSON Config Schema (`barkcode.json`)

```typescript
interface BarkcodeConfig {
  version: "1.0";
  commands: BarkCommand[];
}

interface BarkCommand {
  // Required
  name: string;                    // Human-readable name (e.g., "Convert to STEP")
  rhCommand: string;               // Rhino command (e.g., "_SaveAs", "_Export")
  
  // File handling
  inputPattern?: string;           // Glob pattern (e.g., "*.3dm", "*.stl")
  inputFolder?: string;            // Default input folder (optional)
  recursive?: boolean;             // Search subfolders (default: false)
  singleFile?: boolean;            // Requires single file selection (default: false)
  
  // Output options
  outputFolder?: string;           // Default output folder
  outputFormat?: string;           // Output format (e.g., "step", "iges", "stl")
  outputPattern?: string;          // Output filename pattern (e.g., "{filename}_converted")
  
  // Execution options
  runScript?: string;              // Additional Rhino script to run after command
  waitForCompletion?: boolean;     // Wait for command to finish (default: true)
  timeout?: number;                // Timeout in seconds (default: 300)
  
  // Optional
  description?: string;            // Help text shown in menu
  requiredFiles?: string[];        // Files that must exist before running
}
```

### Example `barkcode.json`
```json
{
  "version": "1.0",
  "commands": [
    {
      "name": "Convert 3DM to STEP",
      "rhCommand": "_-Export",
      "inputPattern": "*.3dm",
      "recursive": true,
      "outputFormat": "step",
      "outputFolder": "./converted",
      "description": "Convert all 3DM files to STEP format"
    },
    {
      "name": "Batch STL Export",
      "rhCommand": "_-Export",
      "inputPattern": "*.3dm",
      "outputFormat": "stl",
      "outputFolder": "./stl_exports",
      "description": "Export 3DM files to STL for 3D printing"
    },
    {
      "name": "Run Analysis Script",
      "rhCommand": "_RunPythonScript",
      "runScript": "AnalyzeGeometry.py",
      "singleFile": true,
      "description": "Run custom Python analysis on selected file"
    }
  ]
}
```

---

## 2. `bark init` Command

**Purpose**: Create a new `barkcode.json` with sensible defaults

**Behavior**:
1. Check if `barkcode.json` already exists
   - If exists: prompt to overwrite or cancel
2. Create default config with 2-3 example commands:
   - "Convert to STEP" (batch, recursive)
   - "Convert to STL" (batch, recursive)  
   - "Run Script" (single file)
3. Print success message with path to file

**CLI Options**:
```
bark init                  # Create in current directory
bark init --path ./config # Create in specific directory
bark init --force         # Overwrite existing without prompt
```

---

## 3. `bark start` Command

**Purpose**: Start Rhino and provide interactive command selection

**Behavior**:
1. Parse `barkcode.json` from current directory (or `--config` path)
2. Validate JSON schema; exit with error if invalid
3. Start Rhino instance(s) with script server (`_StartScriptServer`)
4. Display interactive menu using `inquirer` or `prompts`:
   ```
   ┌─────────────────────────────────────────┐
   │  Select a command to run                │
   ├─────────────────────────────────────────┤
   │  1. Convert 3DM to STEP (batch)         │
   │  2. Convert 3DM to STL (batch)          │
   │  3. Run Analysis Script (single)        │
   │  4. Custom rhinocode command            │
   │  5. Exit                                │
   └─────────────────────────────────────────┘
   ```
5. For batch commands: prompt for input folder (with default from config)
6. Execute selected command via rhinocode RPC
7. Display progress/results
8. Return to menu or exit

**CLI Options**:
```
bark start                        # Interactive mode
bark start --config ./my.json     # Use custom config path
bark start --command "Convert 3DM to STEP"  # Non-interactive, run specific command
bark start --input ./files        # Specify input folder for batch
```

---

## 4. `bark run` Command

**Purpose**: Run a command in a new Rhino instance (non-interactive)

**Behavior**:
1. Parse `barkcode.json` (or `--config` path)
2. Validate command name exists in config
3. Spawn new Rhino instance
4. Execute command via rhinocode with provided parameters
5. Handle batch file processing:
   - Scan input folder for matching files
   - If recursive, walk subdirectories
   - Process files sequentially or in parallel (configurable)
6. Report results (success/failure per file)
7. Clean up Rhino instance

**CLI Options**:
```
bark run "Convert 3DM to STEP"           # Run by command name
bark run 1                               # Run by index
bark run "Convert 3DM to STEP" ./files   # With input folder
bark run "Convert 3DM to STEP" --output ./out  # With output folder
bark run "Convert 3DM to STEP" --recursive     # Enable recursive
```

---

## 5. Rhinocode Communication Layer

Create `src/lib/rhinocode.ts`:

```typescript
interface RhinoInstance {
  id: string;
  connected: boolean;
}

// Connect to Rhino via rhinocode CLI
async function connect(): Promise<RhinoInstance>

// Execute command in Rhino
async function execute(
  command: string, 
  options?: ExecuteOptions
): Promise<CommandResult>

// Execute with file input
async function executeOnFile(
  command: string,
  filePath: string,
  outputPath?: string
): Promise<CommandResult>
```

---

## 6. Batch Processing Engine

Create `src/lib/batch.ts`:

```typescript
interface BatchOptions {
  inputFolder: string;
  outputFolder?: string;
  pattern: string;
  recursive: boolean;
  parallel?: number;  // Max concurrent (default: 1)
}

async function processBatch(
  command: BarkCommand,
  options: BatchOptions
): Promise<BatchResult>
```

**Processing Logic**:
1. Resolve input folder (default: current dir)
2. Collect files matching `inputPattern`
3. For each file:
   - Resolve output path (preserve folder structure if recursive)
   - Execute rhinocode command
   - Report success/failure
4. Summary: X succeeded, Y failed

---

## 7. File Structure

```
barkcode/
├── src/
│   ├── commands/
│   │   ├── init.ts      # Create barkcode.json
│   │   ├── start.ts     # Interactive Rhino launcher
│   │   └── run.ts       # Batch command runner
│   ├── lib/
│   │   ├── config.ts    # Load/validate barkcode.json
│   │   ├── rhinocode.ts # Rhino communication
│   │   ├── batch.ts     # Batch processing
│   │   └── menu.ts      # Interactive menu UI
│   ├── types.ts         # TypeScript interfaces
│   └── constants.ts
├── index.ts
├── package.json
└── tsconfig.json
```

---

## 8. Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "chalk": "^5.6.2",
    "commander": "^14.0.3",
    "prompts": "^2.4.2",      // Interactive menus
    "glob": "^10.3.10"        // File pattern matching
  }
}
```

---

## 9. Implementation Order

1. **Phase 1**: Config & Types
   - Define TypeScript interfaces in `src/types.ts`
   - Implement config loader in `src/lib/config.ts`

2. **Phase 2**: `bark init`
   - Create default `barkcode.json` generator
   - Add `--path` and `--force` options

3. **Phase 3**: Rhinocode Layer
   - Implement `src/lib/rhinocode.ts`
   - Test basic command execution

4. **Phase 4**: `bark start` (Interactive)
   - Build interactive menu with `prompts`
   - Integrate with rhinocode layer

5. **Phase 5**: `bark run` & Batch Processing
   - Implement batch file collection with `glob`
   - Implement sequential/parallel processing
   - Add progress reporting

6. **Phase 6**: Polish
   - Error handling & validation
   - Rich terminal output (spinners, progress bars)
   - Help text and examples

---

## 10. Edge Cases & Error Handling

- **No barkcode.json**: Prompt to run `bark init`
- **Invalid JSON**: Show parse error with line number
- **Rhino not installed**: Show install instructions
- **rhinocode not in PATH**: Show setup guide
- **Command fails**: Log error, continue with next file (batch), exit with non-zero code
- **File locked**: Retry once, then skip with warning
- **Output folder doesn't exist**: Create it automatically
- **Timeout**: Kill Rhino process, report timeout error
