import * as v from "valibot";
import { FileNameValidator, FolderPathValidator, RhinoCommandValidator } from "./lib/sanitize";
import type { BarkcodeConfig, ConfigValidationResult } from "./types";

export const BarkCommandSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  rhCommand: RhinoCommandValidator,
  inputPattern: v.string(),
  inputFolder: FolderPathValidator,
  outputFolder: FolderPathValidator,
  outputName: FileNameValidator,
  outputSuffix: v.string(),
  pollIntervalMs: v.optional(v.number()),
});

export const BarkcodeConfigSchema = v.object({
  version: v.literal("1.0"),
  commands: v.pipe(v.array(BarkCommandSchema), v.minLength(1)),
});

const ActiveDocSchema = v.object({ title: v.string(), location: v.string() });
const RhinoStatusMetaSchema = v.object({ version: v.string() });
const RhinoStatusSchema = v.object({
	pipeId: v.string(), processId: v.number(), processName: v.string(), processVersion: v.string(),
	processAge: v.number(), activeDoc: v.nullable(ActiveDocSchema), activeViewport: v.nullable(v.string()),
	$meta: RhinoStatusMetaSchema, $type: v.literal("status"),
});

export const RhinoInstanceListSchema = v.array(RhinoStatusSchema);

export function validateConfig(data: unknown): ConfigValidationResult {
  const result = v.safeParse(BarkcodeConfigSchema, data);

  if (result.success) {
    return { success: true, data: result.output as BarkcodeConfig };
  }

  const errors = result.issues.map((issue) => {
    const path = (issue.path ?? [])
      .map((entry) => String(entry.key))
      .join(".");

    return `${path ? `${path}: ` : ""}${issue.message}`;
  });

  return { success: false, error: errors.join("\n") };
}
