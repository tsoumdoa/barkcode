import chalk from "chalk";
import { loadConfig, getCommand } from "../lib/config.js";
import { connect, isRhinocodeAvailable } from "../lib/rhinocode.js";
import { collectFiles, processBatch, printBatchSummary } from "../lib/batch.js";
import { RHINO_PATH } from "../constants.js";
import { existsSync } from "fs";

interface RunOptions {
  command?: string;
  input?: string;
  output?: string;
  recursive?: boolean;
  dryRun?: boolean;
  config?: string;
}

export async function run(options: RunOptions = {}) {
  const { command: commandName, input: inputFolder, output: outputFolder, recursive, dryRun, config: configPath } = options;

  console.log(chalk.gray("Loading config..."));

  let loadedConfig;
  try {
    loadedConfig = await loadConfig({ configPath });
  } catch (e) {
    const err = e as Error;
    console.log(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }

  const { config, configPath: cfgPath, projectRoot } = loadedConfig;

  console.log(chalk.green("✓ ") + chalk.gray(`Config loaded from ${cfgPath}`));
  console.log(chalk.gray(`  Project root: ${projectRoot}\n`));

  if (!commandName) {
    console.log(chalk.yellow("No command specified. Available commands:"));
    config.commands.forEach((cmd, i) => {
      console.log(chalk.cyan(`  ${i + 1}. ${cmd.name}`));
      if (cmd.description) {
        console.log(chalk.gray(`     ${cmd.description}`));
      }
    });
    console.log(chalk.gray("\nUsage: bark run <command-name-or-index> [options]"));
    process.exit(1);
  }

  const command = getCommand(config, commandName);

  console.log(chalk.white.bold(`Command: ${command.name}`));
  if (command.description) {
    console.log(chalk.gray(`  ${command.description}`));
  }

  const inputPattern = command.inputPattern || "*.3dm";
  const inputMode = command.inputMode || "batch";
  const inputDir = inputFolder || command.inputFolder || ".";

  console.log(chalk.gray(`\nInput: ${inputDir}/${inputPattern}`));
  console.log(chalk.gray(`Mode: ${inputMode}`));

  const hasRhinocode = await isRhinocodeAvailable();
  if (!hasRhinocode) {
    console.log(chalk.red("✗ rhinocode not found in PATH"));
    console.log(chalk.gray("  Ensure rhinocode is installed and in your system PATH."));
    process.exit(1);
  }

  const rhinoFile = Bun.file(RHINO_PATH);
  if (!existsSync(RHINO_PATH)) {
    console.log(chalk.red("✗ Rhino not found!"));
    console.log(chalk.gray(`  Expected at: ${RHINO_PATH}`));
    console.log(chalk.yellow("\nPlease check your Rhino 8 installation."));
    process.exit(1);
  }

  console.log(chalk.gray("\nConnecting to Rhino..."));

  let instance;
  try {
    instance = await connect();
  } catch (e) {
    const err = e as Error;
    console.log(chalk.red(`✗ ${err.message}`));
    console.log(chalk.yellow("\nStart Rhino first with: bark start"));
    process.exit(1);
  }

  console.log(chalk.green("✓ ") + chalk.gray(`Connected to Rhino ${instance.id}`));

  console.log(chalk.gray("\nCollecting files..."));
  const isRecursive = recursive ?? command.recursive ?? false;
  const files = await collectFiles(inputDir, inputPattern, isRecursive, projectRoot);

  if (files.length === 0) {
    console.log(chalk.yellow(`\nNo files matching ${inputPattern} found in ${inputDir}`));
    await disconnect(instance);
    process.exit(1);
  }

  console.log(chalk.green("✓ ") + chalk.gray(`Found ${files.length} file(s)\n`));

  const effectiveOutputFolder = outputFolder || command.outputFolder;
  const effectiveRecursive = recursive ?? command.recursive ?? false;

  if (dryRun) {
    console.log(chalk.yellow("=== DRY RUN MODE ===\n"));
  }

  const { summary } = await processBatch(
    command,
    files,
    projectRoot,
    instance,
    {
      outputFolder: effectiveOutputFolder,
      dryRun,
      onConflict: command.onConflict || "error",
    },
  );

  if (!dryRun) {
    printBatchSummary(summary);
  }

  const exitCode = summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

async function disconnect(instance: { id: string }) {
  console.log(chalk.gray(`\nDisconnected from Rhino ${instance.id}`));
}
