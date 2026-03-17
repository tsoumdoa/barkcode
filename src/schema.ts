import { z } from "zod";

const StripExtensionRuleSchema = z.object({
  type: z.literal("stripExtension"),
});

const TrimRuleSchema = z.object({
  type: z.literal("trim"),
});

const LowercaseRuleSchema = z.object({
  type: z.literal("lowercase"),
});

const UppercaseRuleSchema = z.object({
  type: z.literal("uppercase"),
});

const ReplaceRuleSchema = z.object({
  type: z.literal("replace"),
  find: z.string(),
  replace: z.string(),
  all: z.boolean().optional(),
});

const RegexRuleSchema = z.object({
  type: z.literal("regex"),
  find: z.string(),
  replace: z.string(),
  flags: z.string().optional(),
});

const RemoveDigitsRuleSchema = z.object({
  type: z.literal("removeDigits"),
  position: z.enum(["start", "end", "all"]).optional(),
});

const PadDigitsRuleSchema = z.object({
  type: z.literal("padDigits"),
  position: z.enum(["start", "end"]),
  length: z.number().positive(),
  char: z.string().optional(),
});

const SliceRuleSchema = z.object({
  type: z.literal("slice"),
  start: z.number().optional(),
  end: z.number().optional(),
});

const RenameRuleSchema = z.discriminatedUnion("type", [
  StripExtensionRuleSchema,
  TrimRuleSchema,
  LowercaseRuleSchema,
  UppercaseRuleSchema,
  ReplaceRuleSchema,
  RegexRuleSchema,
  RemoveDigitsRuleSchema,
  PadDigitsRuleSchema,
  SliceRuleSchema,
]);

export const RenameOptionsSchema = z.object({
  rules: z.array(RenameRuleSchema).optional(),
  template: z.string().optional(),
  targetExtension: z.string().optional(),
  counterStart: z.number().optional(),
  counterPad: z.number().optional(),
});

export const BarkCommandSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  rhCommand: z.string(),
  scriptPath: z.string().optional(),
  waitForCompletion: z.boolean().optional(),
  timeout: z.number().optional(),
  inputMode: z.enum(["single", "batch"]).optional(),
  inputPattern: z.string().optional(),
  inputFolder: z.string().optional(),
  recursive: z.boolean().optional(),
  requiredFiles: z.array(z.string()).optional(),
  outputFolder: z.string().optional(),
  outputFormat: z.string().optional(),
  preserveStructure: z.boolean().optional(),
  onConflict: z.enum(["error", "skip", "overwrite", "rename"]).optional(),
  rename: RenameOptionsSchema.optional(),
});

export const BarkcodeConfigSchema = z.object({
  version: z.literal("1.0"),
  commands: z.array(BarkCommandSchema).min(1),
});

export function validateConfig(data: unknown): {
  success: boolean;
  data?: z.infer<typeof BarkcodeConfigSchema>;
  error?: string;
} {
  const result = BarkcodeConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((e: z.ZodIssue) => {
    const path = e.path.join(".");
    return `${path ? `${path}: ` : ""}${e.message}`;
  });

  return { success: false, error: errors.join("\n") };
}
