/**
 * WARNING:
 * These helpers only perform basic input validation/sanitization for file names
 * and relative paths. They are intended to reduce accidental misuse and reject
 * obviously unsafe input, but they are NOT a complete security boundary.
 *
 * Treat this module as input hygiene, not as complete security protection.
 */

import * as v from "valibot";
import path from "node:path";


export function validateFileName(
	name: string
): { valid: boolean; error?: string } {
	if (!name || name === "." || name === "..") {
		return { valid: false, error: "Invalid file name" };
	}

	if (name.includes("/") || name.includes("\\")) {
		return { valid: false, error: "File name must not contain path separators" };
	}

	if (/[\0<>:"|?*\n\r\t]/.test(name)) {
		return { valid: false, error: "File name contains illegal characters" };
	}

	return { valid: true };
}


export function validateFolderPath(
	input: string
): { valid: boolean; error?: string } {
	if (!input.trim()) {
		return { valid: false, error: "Path is required" };
	}

	if (/[\0<>:"|?*\n\r\t]/.test(input)) {
		return { valid: false, error: "Path contains illegal characters" };
	}

	if (path.isAbsolute(input)) {
		return { valid: false, error: "Absolute paths are not allowed" };
	}

	const normalized = path.posix.normalize(input.replace(/\\/g, "/"));

	if (
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../") ||
		normalized.includes("/../")
	) {
		return { valid: false, error: "Path traversal is not allowed" };
	}

	return { valid: true };
}

export function assertSafeForRhinoCommand(value: string): string {
	if (/["\n\r\t\0]/.test(value)) {
		throw new Error("Value contains unsafe characters for Rhino command");
	}
	return value;
}


export const FileNameValidator = v.pipe(
	v.string(),
	v.custom(
		(input) => {
			const result = validateFileName(input as string);
			if (!result.valid) {
				throw new Error(result.error);
			}
			return result.valid;
		},
		"outputName contains illegal characters",
	),
);

export const FolderPathValidator = v.pipe(
	v.string(),
	v.custom(
		(input) => {
			const result = validateFolderPath(input as string);
			if (!result.valid) {
				throw new Error(result.error);
			}
			return result.valid;
		},
		"folder path contains illegal characters or traversal sequence",
	),
);

export const RhinoCommandValidator = v.pipe(
	v.string(),
	v.custom(
		(input) => {
			if (/[\0\n\r`'"\\]/.test(input as string)) {
				throw new Error("rhino command contains unsafe characters");
			}
			return true;
		},
		"rhino command contains illegal characters",
	),
);
