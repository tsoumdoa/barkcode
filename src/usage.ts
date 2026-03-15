import chalk from "chalk";

export function printUsage() {
  console.log(
    chalk.white("Usage:") + chalk.gray(" barkcode ") + chalk.cyan("<command>"),
  );
  console.log();
  console.log(chalk.white("Commands:"));
  console.log(
    chalk.gray("  ") + chalk.cyan("start     ") + chalk.gray("Launch Rhino 8"),
  );
  console.log(
    chalk.gray("  ") +
      chalk.cyan("init      ") +
      chalk.gray("Initialize a new project"),
  );
  console.log(
    chalk.gray("  ") + chalk.cyan("run       ") + chalk.gray("Run a script"),
  );
  console.log();
}
