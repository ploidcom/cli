import type { Command } from "commander";
import { ApiClient } from "./client.js";
import { resolveConfig } from "./config.js";
import { CliError } from "./errors.js";
import type { OutputOptions } from "./output.js";

export interface GlobalOptions {
  apiKey?: string;
  baseUrl?: string;
  json?: boolean;
  quiet?: boolean;
}

export interface CommandContext {
  client: ApiClient;
  output: OutputOptions;
  baseUrl: string;
}

/** Reads global options from the root command (they merge down to subcommands). */
function globalOptions(command: Command): GlobalOptions {
  // Walk to the root program so `--api-key` etc. work regardless of where
  // they appear on the command line.
  let root: Command = command;
  while (root.parent) root = root.parent;
  return root.opts<GlobalOptions>();
}

/**
 * Builds an authenticated client + output options for a command. Throws a
 * {@link CliError} with exit code 3 when no API key can be resolved.
 */
export function buildContext(command: Command): CommandContext {
  const opts = globalOptions(command);
  const config = resolveConfig({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });
  if (!config.apiKey) {
    throw new CliError(
      "No API key found. Set PLOID_API_KEY, pass --api-key, or add ~/.config/ploid/config.json.",
      3,
    );
  }
  return {
    client: new ApiClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }),
    output: { json: Boolean(opts.json), quiet: Boolean(opts.quiet) },
    baseUrl: config.baseUrl,
  };
}
