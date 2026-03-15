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
    .description("Launch Rhino 8")
    .action(start);

  program
    .command("init")
    .description("Initialize a new project")
    .action(init);

  program
    .command("run")
    .description("Run a script")
    .action(run);

  program.parse(process.argv);
}

main();
