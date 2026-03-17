import chalk from "chalk";
import { RHINO_PATH, isMac } from "../constants";
import { connect, isRhinocodeAvailable, listRhinoInstances } from "../lib/rhinocode.js";
import { loadConfig } from "../lib/config.js";
import { showCommandMenu } from "../lib/menu.js";
import { collectFiles, processBatch, printBatchSummary } from "../lib/batch.js";
import { existsSync } from "fs";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupExitHandler() {
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\nExiting Barkcode. Rhino will remain open."));
    process.exit(0);
  });
}

async function checkRhinocodeOrExit() {
  const hasRhinocode = await isRhinocodeAvailable();
  if (!hasRhinocode) {
    console.log(chalk.red("✗ rhinocode not recognized!"));
    console.log(chalk.gray("  Ensure rhinocode is in your system PATH."));
    process.exit(1);
  }
}

async function checkRhinoOrExit() {
  if (!existsSync(RHINO_PATH)) {
    console.log(chalk.red("✗ Rhino not found!"));
    console.log(chalk.gray("  Expected at: ") + chalk.white(RHINO_PATH));
    console.log();
    console.log(chalk.yellow("Please check your Rhino 8 installation."));
    process.exit(1);
  }
}

function spawnRhino(count: number) {
  for (let i = 0; i < count; i++) {
    const args = isMac
      ? ["-a", "--args", "_StartScriptServer"]
      : ["/nosplash", '/runscript="_StartScriptServer"'];

    Bun.spawn([RHINO_PATH, ...args], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      windowsVerbatimArguments: true,
    });
  }
}

async function getRunningProcesses(): Promise<string[]> {
  return listRhinoInstances();
}

async function waitForRhinoInstances(expectedCount: number): Promise<string[]> {
  while (true) {
    const processes = await getRunningProcesses();
    const currentCount = processes.length;

    if (currentCount >= expectedCount) {
      return processes;
    }

    await delay(1000);
  }
}

export async function startRun(options: { spawn?: number; config?: string; command?: string; dryRun?: boolean } = {}) {
  const { spawn: spawnCount = 1, config: configPath, command: commandName, dryRun: isDryRun = false } = options;

  setupExitHandler();

  console.log(chalk.gray("Checking for rhinocode..."));
  await checkRhinocodeOrExit();
  console.log(chalk.green("✓ ") + chalk.gray("rhinocode found."));

  await checkRhinoOrExit();

  const instances = await getRunningProcesses();

  if (instances.length === 0) {
    console.log(chalk.gray("\nLaunching Rhino 8..."));
    spawnRhino(spawnCount);

    const processes = await waitForRhinoInstances(spawnCount);
    console.log(chalk.green("✓ ") + chalk.gray(`Rhino started (${processes.length} instance(s))\n`));
  } else {
    console.log(chalk.green("✓ ") + chalk.gray(`Found ${instances.length} running Rhino instance(s)\n`));
  }

  let loadedConfig;
  try {
    loadedConfig = await loadConfig({ configPath });
  } catch (e) {
    const err = e as Error;
    console.log(chalk.red(`✗ ${err.message}`));
    console.log(chalk.gray("\nRun `bark init` to create a barkcode.json file."));
    process.exit(1);
  }

  const { config, projectRoot } = loadedConfig;

  console.log(chalk.green("✓ ") + chalk.gray(`Config loaded from ${loadedConfig.configPath}`));
  console.log(chalk.gray(`  Project root: ${projectRoot}\n`));

  let instance;
  try {
    instance = await connect();
  } catch (e) {
    const err = e as Error;
    console.log(chalk.red(`✗ ${err.message}`));
    console.log(chalk.yellow("\nStart Rhino first if it's not running."));
    process.exit(1);
  }

  console.log(chalk.green("✓ ") + chalk.gray(`Connected to Rhino ${instance.id}`));
  console.log(chalk.gray("\nPress Ctrl+C to exit\n"));

  if (commandName) {
    const { getCommand } = await import("../lib/config.js");
    const command = getCommand(config, commandName);

    const { processBatch, printBatchSummary, collectFiles } = await import("../lib/batch.js");

    console.log(chalk.white.bold(`Running: ${command.name}`));

    const inputPattern = command.inputPattern || "*.3dm";
    const inputFolder = command.inputFolder || ".";
    const isRecursive = command.recursive ?? false;

    const files = await collectFiles(inputFolder, inputPattern, isRecursive, projectRoot);

    if (files.length === 0) {
      console.log(chalk.yellow(`No files found matching ${inputPattern}`));
      process.exit(1);
    }

    console.log(chalk.gray(`Found ${files.length} file(s)\n`));

    if (isDryRun) {
      console.log(chalk.yellow("=== DRY RUN MODE ===\n"));
    }

    const { summary } = await processBatch(command, files, projectRoot, instance, {
      outputFolder: command.outputFolder,
      dryRun: isDryRun,
      onConflict: command.onConflict || "error",
    });

    if (!isDryRun) {
      printBatchSummary(summary);
    }
    process.exit(summary.failed > 0 ? 1 : 0);
  }

  while (true) {
    const shouldContinue = await showCommandMenu(config, instance, projectRoot);
    if (!shouldContinue) {
      break;
    }
    console.log();
  }

  console.log(chalk.gray("\nExiting Barkcode. Rhino will remain open."));
}
