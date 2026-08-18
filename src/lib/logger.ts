import chalk from "chalk";
import type { MessageFormatter, ProgressData, ProgressStatus } from "../types";

let _debugMode = false;
let _progressActive = false;
let _progressData: ProgressData | null = null;

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
	status: ProgressStatus,
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

function printMessage(message: string, format: MessageFormatter): void {
	if (_progressActive) _eraseProgressLine();
	console.log(format(message));
	if (_progressActive) _redrawProgress();
}

export function displayMessage(message: string) {
	printMessage(message, (text) => chalk.green("✓ ") + chalk.white(text));
}

export function displaySuccess(message: string) {
	printMessage(message, (text) => chalk.green("✓ ") + chalk.gray(text));
}

export function displayError(message: string) {
	printMessage(message, (text) => chalk.red("✗ ") + chalk.white(text));
}

export function displayWarning(message: string) {
	printMessage(message, chalk.yellow);
}

export function displayInfo(message: string) {
	printMessage(message, chalk.gray);
}

export function displayBold(message: string) {
	printMessage(message, chalk.white.bold);
}

export function displayFailed(message: string) {
	printMessage(message, chalk.red);
}

export function displaySucceeded(message: string) {
	printMessage(message, chalk.green);
}

export function displayTotal(message: string) {
	printMessage(message, chalk.white);
}

export function displayDebug(context: string, message: string) {
	if (!_debugMode) return;
	printMessage(`[${context}] ${message}`, chalk.gray);
}
