import type { RenameOptions, RenameResult, RenameRule, RenameContext } from "../types.js";
import { extname, basename, dirname, join } from "path";

export function getFileParts(filePath: string): { name: string; ext: string } {
  const ext = extname(filePath);
  const name = ext ? basename(filePath, ext) : basename(filePath);
  return { name, ext: ext.replace(/^\./, "") };
}

function applyRule(name: string, rule: RenameRule): string {
  switch (rule.type) {
    case "stripExtension":
      return name;

    case "trim":
      return name.trim();

    case "lowercase":
      return name.toLowerCase();

    case "uppercase":
      return name.toUpperCase();

    case "replace": {
      if (rule.all) {
        return name.split(rule.find).join(rule.replace);
      }
      return name.replace(rule.find, rule.replace);
    }

    case "regex": {
      const flags = rule.flags || "g";
      const regex = new RegExp(rule.find, flags);
      return name.replace(regex, rule.replace);
    }

    case "removeDigits": {
      if (rule.position === "start") {
        return name.replace(/^\d+/, "");
      }
      if (rule.position === "end") {
        return name.replace(/\d+$/, "");
      }
      return name.replace(/\d/g, "");
    }

    case "padDigits": {
      const digits = name.match(/\d+/g);
      if (!digits) return name;

      const char = rule.char || "0";
      const padded = digits[0].padStart(rule.length, char);

      if (rule.position === "start") {
        return name.replace(/^\d+/, padded);
      }
      return name.replace(/\d+$/, padded);
    }

    case "slice": {
      const start = rule.start ?? 0;
      const end = rule.end ?? name.length;
      return name.slice(start, end);
    }

    default:
      return name;
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}-${m}-${s}`;
}

function padCounter(counter: number, pad: number = 3): string {
  return String(counter).padStart(pad, "0");
}

function getExtension(options: RenameOptions | undefined, outputFormat?: string): string | null {
  if (options?.targetExtension) {
    return options.targetExtension;
  }

  const formatMap: Record<string, string> = {
    step: "step",
    stp: "step",
    stl: "stl",
    obj: "obj",
    fbx: "fbx",
    sketchup: "skp",
    skp: "skp",
    dwg: "dwg",
    dxf: "dxf",
    pdf: "pdf",
    "3dm": "3dm",
  };

  if (outputFormat && formatMap[outputFormat.toLowerCase()]) {
    return formatMap[outputFormat.toLowerCase()] || null;
  }

  return null;
}

export function renameFile(
  inputFilename: string,
  options?: RenameOptions,
  context?: Partial<RenameContext>,
): RenameResult {
  const { name: origName, ext: origExt } = getFileParts(inputFilename);
  const now = context?.now || new Date();
  const counter = context?.counter || 1;
  const counterPad = options?.counterPad || 3;

  let workingName = origName;

  if (options?.rules) {
    for (const rule of options.rules) {
      if (rule.type === "stripExtension") {
        continue;
      }
      workingName = applyRule(workingName, rule);
    }
  }

  const finalExt = getExtension(options, context?.origExt as string | undefined) || origExt;

  let finalName: string;

  if (options?.template) {
    finalName = options.template
      .replace(/\{name\}/g, workingName)
      .replace(/\{origName\}/g, origName)
      .replace(/\{ext\}/g, finalExt)
      .replace(/\{origExt\}/g, origExt)
      .replace(/\{date\}/g, formatDate(now))
      .replace(/\{time\}/g, formatTime(now))
      .replace(/\{datetime\}/g, `${formatDate(now)}_${formatTime(now)}`)
      .replace(/\{counter\}/g, padCounter(counter, counterPad));
  } else {
    finalName = `${workingName}.${finalExt}`;
  }

  return {
    baseName: workingName,
    finalName,
    finalExt,
  };
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, "_");
}
