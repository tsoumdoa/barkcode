#!/usr/bin/env bun

import { Command } from "commander";
import { logo } from "./src/logo";
import { run } from "./src/commands/run";
import { init } from "./src/commands/init";
import { benchmark } from "./src/commands/benchmark";
import { runCommand } from "./src/commands/command";
import { DEFAULT_SPAWN_DELAY_MS } from "./src/lib/spawn-constants";
import { DEFAULT_SPAWN_COUNT } from "./src/constants";

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
    .option("-s, --spawn <count>", "Number of Rhino instances to start", String(DEFAULT_SPAWN_COUNT))
    .option("-d, --spawn-delay <ms>", "Delay between spawns in ms", String(DEFAULT_SPAWN_DELAY_MS))
    .option("-c, --config <path>", "Config file path")
    .option("--debug", "Enable debug output")
    .action(async (commandId, options) => {
      await run({
        spawn: options.spawn !== undefined ? Number(options.spawn) : undefined,
        spawnDelay: Number(options.spawnDelay) || DEFAULT_SPAWN_DELAY_MS,
        config: options.config,
        command: commandId,
        debug: options.debug,
      });
    });

  program
    .command("init")
    .description("Initialize a new project")
    .option("-p, --path <path>", "Target directory")
    .option("-f, --force", "Overwrite existing config")
    .action((options) => init({ path: options.path, force: options.force }));

  program
    .command("command")
    .description("Run a Rhino command (manages Rhino lifecycle automatically)")
    .argument("<cmd>", "Rhino command string to execute")
    .option("--debug", "Enable debug output")
    .action(async (cmd, options) => {
      await runCommand({ command: cmd, debug: options.debug });
    });

  program
    .command("benchmark")
    .description("Benchmark Rhino spawn performance")
    .option("--instances <list>", "Comma-separated instance counts (e.g. 1,4,8)")
    .option("--delay <list>", "Comma-separated delay values in ms (e.g. 0,300,500)")
    .action(async (options) => {
      await benchmark({
        instances: options.instances,
        delay: options.delay,
      });
    });

  program.parse(process.argv);
}

main();
