import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://api.ploid.com";

export interface ResolvedConfig {
  apiKey?: string;
  baseUrl: string;
}

interface FileConfig {
  api_key?: string;
  base_url?: string;
}

interface ConfigOverrides {
  apiKey?: string;
  baseUrl?: string;
}

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim().length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "ploid", "config.json");
}

function readFileConfig(): FileConfig {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as FileConfig;
  } catch {
    // Missing or malformed config file is fine; fall back to env/flags.
  }
  return {};
}

/**
 * Resolves the API key and base URL using flag > env > config-file precedence.
 * The API key is intentionally optional here so commands that do not need it
 * (e.g. `--help`) still work; commands that require it should call
 * {@link requireApiKey}.
 */
export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const file = readFileConfig();
  const apiKey =
    overrides.apiKey ??
    process.env.PLOID_API_KEY ??
    file.api_key ??
    undefined;
  const baseUrl = (
    overrides.baseUrl ??
    process.env.PLOID_API_BASE_URL ??
    file.base_url ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}
