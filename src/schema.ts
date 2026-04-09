import { z } from "zod";

export const BarkCommandSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  rhCommand: z.string(),
  inputPattern: z.string(),
  inputFolder: z.string(),
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
