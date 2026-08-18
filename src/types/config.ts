import type * as v from "valibot";
import type { BarkCommandSchema, BarkcodeConfigSchema } from "../schema";

export type BarkCommand = v.InferOutput<typeof BarkCommandSchema>;
export type BarkcodeConfig = v.InferOutput<typeof BarkcodeConfigSchema>;

export type LoadedConfig = {
	config: BarkcodeConfig;
	configPath: string;
	projectRoot: string;
};

export type ConfigLoadOptions = {
	cwd?: string;
	configPath?: string;
};
