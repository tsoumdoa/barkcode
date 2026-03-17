#!/usr/bin/env bun

import { Command } from "commander";
import { logo } from "./src/logo";
import { start } from "./src/commands/start";
import { init } from "./src/commands/init";
import { run } from "./src/commands/run";

async function main() {
  logo();

  const program = new Command();

  program
    .name("barkcode")
    .description("CLI for Barkcode")
    .version("1.0.0");

  program
    .command("start")
    .description("Launch Rhino 8 with interactive menu")
    .option("-s, --spawn <count>", "Number of Rhino instances to start", "1")
    .option("-c, --config <path>", "Config file path")
    .option("--command <name>", "Run a specific command non-interactively")
    .action((options) => start({
      spawn: parseInt(options.spawn),
      config: options.config,
      command: options.command,
    }));

  program
    .command("init")
    .description("Initialize a new project")
    .option("-p, --path <path>", "Target directory")
    .option("-f, --force", "Overwrite existing config")
    .action((options) => init({ path: options.path, force: options.force }));

  program
    .command("run [command]")
    .description("Run a configured command")
    .option("-c, --config <path>", "Config file path")
    .option("-i, --input <path>", "Input folder")
    .option("-o, --output <path>", "Output folder")
    .option("-r, --recursive", "Process recursively")
    .option("-d, --dry-run", "Preview without executing")
    .action((cmd, options) => run({
      command: cmd,
      config: options.config,
      input: options.input,
      output: options.output,
      recursive: options.recursive,
      dryRun: options.dryRun,
    }));

  program.parse(process.argv);
}

main();
