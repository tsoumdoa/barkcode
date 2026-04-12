import chalk from "chalk";

let _debugMode = false;
let _progressActive = false;
let _progressData: { current: number; total: number; fileName: string; elapsedMs: number } | null = null;

export function setDebugMode(enabled: boolean) {
	_debugMode = enabled;
}

function _eraseProgressLine() {
	process.stdout.write("\r" + " ".repeat(120) + "\r");
}

function _redrawProgress() {
	if (_progressData) {
		_eraseProgressLine();
		_displayProgressBar(_progressData.current, _progressData.total, _progressData.fileName, _progressData.elapsedMs);
	}
}

function _displayProgressBar(
	current: number,
	total: number,
	fileName: string,
	elapsedMs: number,
) {
	const elapsedSec = Math.floor(elapsedMs / 1000);
	const elapsedMin = Math.floor(elapsedSec / 60);
	const elapsedStr = elapsedMin > 0
		 ? `${elapsedMin}m ${elapsedSec % 60}s`
		: `${elapsedSec}s`;

	const percent = Math.round((current / total) * 100);
	const barWidth = 20;
	const filled = Math.round((current / total) * barWidth);
	const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

	process.stdout.write(
		`\r${chalk.cyan("[")}${chalk.white(bar)}${chalk.cyan("]")} ` +
		`${chalk.white(`${current}/${total}`)} ` +
		`${chalk.gray(`${percent}%`)} | ` +
		`${chalk.gray("▓")} ${chalk.gray(fileName)} ` +
		`${chalk.gray(`(${elapsedStr})`)}`
	);
}

export function flushProgress() {
	if (_progressActive) {
		_eraseProgressLine();
		_progressActive = false;
		_progressData = null;
	}
}

export function displayProgress(
	current: number,
	total: number,
	fileName: string,
	status: "processing" | "success" | "failed",
	elapsedMs: number,
) {
	if (status === "processing") {
		_progressActive = true;
		_progressData = { current, total, fileName, elapsedMs };
		_displayProgressBar(current, total, fileName, elapsedMs);
	} else {
		_eraseProgressLine();
		console.log(
			`${status === "success" ? chalk.green("✓") : chalk.red("✗")} ` +
			`${fileName} ${chalk.gray(`(${elapsedMs / 1000}s)`)}`
		);
		_progressActive = false;
		_progressData = null;
	}
}

export function displayMessage(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.green("✓ ") + chalk.white(message));
	if (_progressActive) _redrawProgress();
}

export function displaySuccess(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.green("✓ ") + chalk.gray(message));
	if (_progressActive) _redrawProgress();
}

export function displayError(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.red("✗ ") + chalk.white(message));
	if (_progressActive) _redrawProgress();
}

export function displayWarning(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.yellow(message));
	if (_progressActive) _redrawProgress();
}

export function displayInfo(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.gray(message));
	if (_progressActive) _redrawProgress();
}

export function displayBold(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.white.bold(message));
	if (_progressActive) _redrawProgress();
}

export function displayConflict(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.red(`! conflict: ${message}`));
	if (_progressActive) _redrawProgress();
}

export function displayFailed(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.red(message));
	if (_progressActive) _redrawProgress();
}

export function displaySucceeded(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.green(message));
	if (_progressActive) _redrawProgress();
}

export function displayTotal(message: string) {
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.white(message));
	if (_progressActive) _redrawProgress();
}

export function displayDebug(context: string, message: string) {
	if (!_debugMode) return;
	if (_progressActive) _eraseProgressLine();
	console.log(chalk.gray(`[${context}] ${message}`));
	if (_progressActive) _redrawProgress();
}
