#!/usr/bin/env bun

import chalk from "chalk";
import { logo } from "./src/logo";
import { printUsage } from "./src/usage";
import { start } from "./src/commands/start";
import { init } from "./src/commands/init";
import { run } from "./src/commands/run";

async function main() {
  const command = process.argv[2];

  logo();

  if (!command) {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case "start":
      await start();
      break;
    case "init":
      await init();
      break;
    case "run":
      await run();
      break;
    case "--help":
    case "-h":
      printUsage();
      break;
    default:
      console.log(chalk.red(`✗ Unknown command: ${command}`));
      console.log();
      printUsage();
      process.exit(1);
  }
}

main();
