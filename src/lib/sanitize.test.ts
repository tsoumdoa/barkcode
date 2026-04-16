import { describe, it, expect } from "vitest";
import { validateFileName, validateFolderPath, RhinoCommandValidator, assertSafeForRhinoCommand } from "./sanitize";
import * as v from "valibot";

describe("validateFileName", () => {
	it("returns valid for simple file names", () => {
		expect(validateFileName("foo.txt")).toEqual({ valid: true });
	});

	it("returns valid for hidden files", () => {
		expect(validateFileName(".gitignore")).toEqual({ valid: true });
	});

	it("returns invalid for empty string", () => {
		expect(validateFileName("")).toEqual({ valid: false, error: "Invalid file name" });
	});

	it("returns invalid for current directory marker", () => {
		expect(validateFileName(".")).toEqual({ valid: false, error: "Invalid file name" });
	});

	it("returns invalid for parent directory marker", () => {
		expect(validateFileName("..")).toEqual({ valid: false, error: "Invalid file name" });
	});

	it("returns invalid for names with path separators", () => {
		expect(validateFileName("foo/bar")).toEqual({ valid: false, error: "File name must not contain path separators" });
		expect(validateFileName("foo\\bar")).toEqual({ valid: false, error: "File name must not contain path separators" });
	});

	it("returns invalid for names with illegal characters", () => {
		expect(validateFileName("foo<bar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo>bar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo:bar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName('foo"bar')).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo|bar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo?bar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo*bar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo\nbar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo\rbar")).toEqual({ valid: false, error: "File name contains illegal characters" });
		expect(validateFileName("foo\tbar")).toEqual({ valid: false, error: "File name contains illegal characters" });
	});

	it("returns valid with {{fileName}} placeholder", () => {
		expect(validateFileName("foo_{{fileName}}bar")).toEqual({ valid: true });
	});

	it("returns valid for {{fileName}} alone (schema template syntax)", () => {
		expect(validateFileName("{{fileName}}")).toEqual({ valid: true });
	});

	it("returns valid for {{fileName}}_rh6 (schema template with suffix)", () => {
		expect(validateFileName("{{fileName}}_rh6")).toEqual({ valid: true });
	});
});

describe("validateFolderPath", () => {
	it("returns valid for simple paths", () => {
		expect(validateFolderPath("src")).toEqual({ valid: true });
	});

	it("returns valid for nested paths", () => {
		expect(validateFolderPath("src/lib")).toEqual({ valid: true });
	});

	it("returns invalid for empty string", () => {
		expect(validateFolderPath("")).toEqual({ valid: false, error: "Path is required" });
	});

	it("returns invalid for whitespace only", () => {
		expect(validateFolderPath("   ")).toEqual({ valid: false, error: "Path is required" });
	});

	it("returns invalid for paths with illegal characters", () => {
		expect(validateFolderPath("foo<bar")).toEqual({ valid: false, error: "Path contains illegal characters" });
		expect(validateFolderPath("foo|bar")).toEqual({ valid: false, error: "Path contains illegal characters" });
	});

	it("returns invalid for path traversal", () => {
		expect(validateFolderPath("..")).toEqual({ valid: false, error: "Path traversal is not allowed" });
		expect(validateFolderPath("../foo")).toEqual({ valid: false, error: "Path traversal is not allowed" });
		expect(validateFolderPath("foo/../bar")).toEqual({ valid: true });
	});

	it("returns valid for paths with backslashes (normalized)", () => {
		expect(validateFolderPath("src\\lib")).toEqual({ valid: true });
	});

	it("returns invalid for absolute paths", () => {
		expect(validateFolderPath("/absolute/path")).toEqual({ valid: false, error: "Absolute paths are not allowed" });
	});
});

describe("assertSafeForRhinoCommand", () => {
	it("returns value when safe", () => {
		expect(assertSafeForRhinoCommand("normalcommand")).toBe("normalcommand");
	});

	it("throws for double quote", () => {
		expect(() => assertSafeForRhinoCommand('foo"bar')).toThrow("Value contains unsafe characters for Rhino command");
	});

	it("throws for newline", () => {
		expect(() => assertSafeForRhinoCommand("foo\nbar")).toThrow("Value contains unsafe characters for Rhino command");
	});

	it("throws for carriage return", () => {
		expect(() => assertSafeForRhinoCommand("foo\rbar")).toThrow("Value contains unsafe characters for Rhino command");
	});

	it("throws for tab", () => {
		expect(() => assertSafeForRhinoCommand("foo\tbar")).toThrow("Value contains unsafe characters for Rhino command");
	});

	it("throws for null character", () => {
		expect(() => assertSafeForRhinoCommand("foo\0bar")).toThrow("Value contains unsafe characters for Rhino command");
	});
});

describe("RhinoCommandValidator", () => {
	it("validates correct command strings", () => {
		expect(() => v.parse(RhinoCommandValidator, "Exit")).not.toThrow();
		expect(() => v.parse(RhinoCommandValidator, "MyCommand123")).not.toThrow();
		expect(() => v.parse(RhinoCommandValidator, "_-SaveAs {{path}} _Enter")).not.toThrow();
		expect(() => v.parse(RhinoCommandValidator, "{{fileName}}")).not.toThrow();
	});

	it("rejects commands with unsafe characters", () => {
		expect(() => v.parse(RhinoCommandValidator, "foo\nbar")).toThrow();
		expect(() => v.parse(RhinoCommandValidator, "foo\rbar")).toThrow();
		expect(() => v.parse(RhinoCommandValidator, "foo\0bar")).toThrow();
		expect(() => v.parse(RhinoCommandValidator, "foo`bar")).toThrow();
		expect(() => v.parse(RhinoCommandValidator, "foo'bar")).toThrow();
		expect(() => v.parse(RhinoCommandValidator, 'foo"bar')).toThrow();
		expect(() => v.parse(RhinoCommandValidator, "foo'bar")).toThrow();
		expect(() => v.parse(RhinoCommandValidator, "foo\"bar")).toThrow();
	});
});
