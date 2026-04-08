import { z } from "zod";

export const BarkCommandSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  rhCommand: z.string(),
  scriptPath: z.string().optional(),
  waitForCompletion: z.boolean().optional(),
  timeout: z.number().optional(),
  inputPattern: z.string().optional(),
  inputFolder: z.string().optional(),
  recursive: z.boolean().optional(),
  requiredFiles: z.array(z.string()).optional(),
  outputFolder: z.string().optional(),
  outputFormat: z.string().optional(),
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
