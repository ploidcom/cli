import type { ApiResponse } from "./client.js";

export interface OutputOptions {
  /** Emit raw JSON instead of a human-readable rendering. */
  json: boolean;
  /** Suppress non-error chatter (progress lines, hints). */
  quiet: boolean;
}

/** Prints the `data` portion of an envelope as pretty JSON to stdout. */
export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Default printer for command results. With `--json`, prints `data` as JSON
 * (scripting-friendly). Otherwise it renders via the supplied formatter, or
 * falls back to pretty JSON when no formatter is given.
 */
export function printResult<T>(
  response: ApiResponse<T>,
  opts: OutputOptions,
  formatter?: (data: T, meta: Record<string, unknown>) => string,
): void {
  if (opts.json || !formatter) {
    printJson(response.data);
    return;
  }
  const rendered = formatter(response.data, response.meta ?? {});
  if (rendered.length > 0) process.stdout.write(`${rendered}\n`);
}

/** Writes a progress/status line to stderr unless `--quiet` is set. */
export function progress(message: string, opts: OutputOptions): void {
  if (opts.quiet) return;
  process.stderr.write(`${message}\n`);
}

/** Renders an array of flat objects as a simple aligned text table. */
export function renderTable(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ key: string; label: string }>,
): string {
  if (rows.length === 0) return "(no results)";
  const widths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((row) => cell(row[col.key]).length)),
  );
  const header = columns.map((col, i) => col.label.padEnd(widths[i]!)).join("  ");
  const divider = widths.map((w) => "-".repeat(w)).join("  ");
  const body = rows.map((row) =>
    columns.map((col, i) => cell(row[col.key]).padEnd(widths[i]!)).join("  "),
  );
  return [header, divider, ...body].join("\n");
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
