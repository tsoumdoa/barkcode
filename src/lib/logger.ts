import chalk from "chalk";

export function displayMessage(message: string) {
	console.log(chalk.green("✓ ") + chalk.white(message));
}

export function displaySuccess(message: string) {
	console.log(chalk.green("✓ ") + chalk.gray(message));
}

export function displayError(message: string) {
	console.log(chalk.red("✗ ") + chalk.white(message));
}

export function displayWarning(message: string) {
	console.log(chalk.yellow(message));
}

export function displayInfo(message: string) {
	console.log(chalk.gray(message));
}

export function displayBold(message: string) {
	console.log(chalk.white.bold(message));
}

export function displayConflict(message: string) {
	console.log(chalk.red(`! conflict: ${message}`));
}

export function displayFailed(message: string) {
	console.log(chalk.red(message));
}

export function displaySucceeded(message: string) {
	console.log(chalk.green(message));
}

export function displayTotal(message: string) {
	console.log(chalk.white(message));
}

export function displayDebug(context: string, message: string) {
	console.log(chalk.gray(`[${context}] ${message}`));
}
