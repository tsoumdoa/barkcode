#!/usr/bin/env bun

import { Command } from "commander";
import { logo } from "./src/logo";
import { startRun } from "./src/commands/start";
import { init } from "./src/commands/init";

async function main() {
  logo();

  const program = new Command();

  program
    .name("barkcode")
    .description("CLI for Barkcode")
    .version("1.0.0");

  program
    .command("run")
    .description("Launch Rhino 8 with interactive menu (or run a specific command)")
    .argument("[command-id]", "Command ID to run immediately")
    .option("-s, --spawn <count>", "Number of Rhino instances to start", "1")
    .option("-c, --config <path>", "Config file path")
    .option("-d, --dry-run", "Preview without executing")
    .action(async (commandId, options) => {
      await startRun({
        spawn: Number(options.spawn) || 1,
        config: options.config,
        command: commandId,
        dryRun: options.dryRun,
      });
    });

  program
    .command("init")
    .description("Initialize a new project")
    .option("-p, --path <path>", "Target directory")
    .option("-f, --force", "Overwrite existing config")
    .action((options) => init({ path: options.path, force: options.force }));

  program.parse(process.argv);
}

main();
