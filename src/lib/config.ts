import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname, sep } from "path";
import type { BarkcodeConfig, LoadedConfig, ConfigLoadOptions } from "../types";
import { validateConfig } from "../schema";

const CONFIG_FILENAME = "barkcode.json";

export async function findConfig(
  startDir?: string,
  explicitPath?: string,
): Promise<string | null> {
  if (explicitPath) {
    if (existsSync(explicitPath)) {
      return explicitPath;
    }
    return null;
  }

  let currentDir = startDir || process.cwd();
  const root = sep === "/" ? "/" : "C:\\";

  while (true) {
    const configPath = resolve(currentDir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return configPath;
    }

    if (currentDir === root) {
      break;
    }

    const parent = resolve(currentDir, "..");
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  return null;
}

export async function loadConfig(options: ConfigLoadOptions = {}): Promise<LoadedConfig> {
  const { cwd = process.cwd(), configPath } = options;

  const foundPath = await findConfig(cwd, configPath);

  if (!foundPath) {
    throw new Error(
      `No ${CONFIG_FILENAME} found in this directory or any parent directory.\nRun \`bark init\` to create one.`,
    );
  }

  let rawData: unknown;
  try {
    const content = await readFile(foundPath, "utf-8");
    rawData = JSON.parse(content);
  } catch (e) {
    const err = e as Error;
    if (err.message.includes("JSON")) {
      throw new Error(`Invalid JSON in ${foundPath}: ${err.message}`);
    }
    throw new Error(`Failed to read ${foundPath}: ${err.message}`);
  }

  const validation = validateConfig(rawData);
  if (!validation.success || !validation.data) {
    throw new Error(`Config validation failed:\n${validation.error}`);
  }

  const projectRoot = dirname(foundPath);

  return {
    config: validation.data,
    configPath: foundPath,
    projectRoot,
  };
}

export function resolvePath(relativePath: string, projectRoot: string): string {
  return resolve(projectRoot, relativePath);
}

export function getCommand(config: BarkcodeConfig, commandNameOrIndex: string | number) {
  if (typeof commandNameOrIndex === "number") {
    const cmd = config.commands[commandNameOrIndex - 1];
    if (!cmd) {
      throw new Error(`Command index ${commandNameOrIndex} not found. Valid range: 1-${config.commands.length}`);
    }
    return cmd;
  }

  const cmd = config.commands.find((c) => c.id === commandNameOrIndex || c.name === commandNameOrIndex);
  if (!cmd) {
    const available = config.commands.map((c) => c.id ? `${c.name} (${c.id})` : c.name).join(", ");
    throw new Error(`Command "${commandNameOrIndex}" not found. Available: ${available}`);
  }
  return cmd;
}
