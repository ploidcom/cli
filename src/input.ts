import { readFileSync } from "node:fs";
import { CliError } from "./errors.js";

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Reads raw text from a file path, or stdin when path is "-" or omitted. */
function readSource(path: string | undefined): string {
  if (!path || path === "-") {
    const text = readStdin();
    if (!text.trim()) {
      throw new CliError("No input provided. Pass --file <path> or pipe JSON/JSONL via stdin.");
    }
    return text;
  }
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new CliError(`Could not read file '${path}': ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Parses a list of people from a file or stdin. Accepts either a JSON array
 * (`[ {...}, {...} ]`) or JSONL (one JSON object per line).
 */
export function readPeople(path: string | undefined): Array<Record<string, unknown>> {
  const text = readSource(path).trim();

  if (text.startsWith("[")) {
    const parsed = parseJson(text, path);
    if (!Array.isArray(parsed)) {
      throw new CliError("Expected a JSON array of people.");
    }
    return parsed as Array<Record<string, unknown>>;
  }

  // JSONL: one person object per non-empty line.
  const people: Array<Record<string, unknown>> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parsed = parseJson(line, path, i + 1);
    people.push(parsed as Record<string, unknown>);
  }
  if (people.length === 0) {
    throw new CliError("No people found in input.");
  }
  return people;
}

/** Parses a JSON object from a file or stdin (used for `--filters`, request bodies). */
export function readJsonObject(path: string | undefined): Record<string, unknown> {
  const parsed = parseJson(readSource(path), path);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("Expected a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function parseJson(text: string, path: string | undefined, line?: number): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    const where = line ? ` (line ${line})` : "";
    const source = path && path !== "-" ? ` in '${path}'` : "";
    throw new CliError(`Invalid JSON${source}${where}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Splits a comma-separated flag value into a trimmed list. */
export function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}
