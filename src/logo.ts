import chalk from "chalk";

export function logo() {
  console.log(
    chalk.white(`
    ▗▄▄▖  ▗▄▖ ▗▄▄▖ ▗▖ ▗▖ ▗▄▄▖ ▗▄▖ ▗▄▄▄ ▗▄▄▄▖
    ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌▐▌▗▞▘▐▌   ▐▌ ▐▌▐▌  █▐▌
    ▐▛▀▚▖▐▛▀▜▌▐▛▀▚▖▐▛▚▖ ▐▌   ▐▌ ▐▌▐▌  █▐▛▀▀▘
    ▐▙▄▞▘▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌▝▚▄▄▖▝▚▄▞▘▐▙▄▄▀▐▙▄▄▖
  `),
  );
  console.log(chalk.gray("    ════════════════════════════════════════"));
  console.log(chalk.white.bold("      BarkCode - Rhino Code Runner"));
  console.log(chalk.gray("    ════════════════════════════════════════\n"));
}
