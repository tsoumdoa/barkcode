import chalk from "chalk";
import { RHINO_PATH } from "../constants";

export async function start() {
  const file = Bun.file(RHINO_PATH);
  const exists = await file.exists();

  if (!exists) {
    console.log(chalk.red("✗ Rhino not found!"));
    console.log(chalk.gray("  Expected at: ") + chalk.white(RHINO_PATH));
    console.log();
    console.log(chalk.yellow("Please check your Rhino 8 installation."));
    process.exit(1);
  }

  console.log(chalk.green("✓ ") + chalk.white("Launching Rhino 8..."));

  Bun.spawn([RHINO_PATH, "/nosplash", '/runscript="_StartScriptServer"'], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
    windowsVerbatimArguments: true,
  });

  console.log(chalk.green("✓ ") + chalk.white("Rhino started successfully!"));
}
