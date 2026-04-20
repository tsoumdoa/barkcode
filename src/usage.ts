import chalk from "chalk";
import { displayBold } from "./lib/logger";

export function printUsage() {
  console.log(
    chalk.white("Usage:") + chalk.gray(" barkcode ") + chalk.cyan("<command>"),
  );
  console.log();
  displayBold("Commands:");
  console.log(
    chalk.gray("  ") + chalk.cyan("run       ") + chalk.gray("Launch Rhino 8 with interactive menu"),
  );
  console.log(
    chalk.gray("  ") +
      chalk.cyan("init      ") +
      chalk.gray("Initialize a new project"),
  );
  console.log(
    chalk.gray("  ") +
      chalk.cyan("command   ") +
      chalk.gray("Run a Rhino command (manages Rhino lifecycle)"),
  );
  console.log();
}
