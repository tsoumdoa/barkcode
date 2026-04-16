import * as v from "valibot";

export const BarkCommandSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  rhCommand: v.string(),
  inputPattern: v.string(),
  inputFolder: v.string(),
  outputFolder: v.string(),
  outputName: v.string(),
  outputSuffix: v.string(),
  pollIntervalMs: v.optional(v.number()),
});

export const BarkcodeConfigSchema = v.object({
  version: v.literal("1.0"),
  commands: v.pipe(v.array(BarkCommandSchema), v.minLength(1)),
});

export type BarkcodeConfig = v.InferOutput<typeof BarkcodeConfigSchema>;

export function validateConfig(data: unknown): {
  success: boolean;
  data?: BarkcodeConfig;
  error?: string;
} {
  const result = v.safeParse(BarkcodeConfigSchema, data);

  if (result.success) {
    return { success: true, data: result.output };
  }

  const errors = result.issues.map((issue) => {
    const path = (issue.path ?? [])
      .map((entry) => String(entry.key))
      .join(".");

    return `${path ? `${path}: ` : ""}${issue.message}`;
  });

  return { success: false, error: errors.join("\n") };
}
