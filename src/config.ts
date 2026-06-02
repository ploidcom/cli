import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

/** Absolute path to the CLI config file (`~/.config/ploid/config.json`). */
export function configPath(): string {
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

/**
 * Persists the API key (and optionally a non-default base URL) to the config
 * file, merging with any existing values. Written with `0600` permissions so
 * the secret isn't world-readable.
 */
export function saveCredentials(apiKey: string, baseUrl?: string): string {
  const path = configPath();
  const existing = readFileConfig();
  const next: FileConfig = { ...existing, api_key: apiKey };
  if (baseUrl && baseUrl !== DEFAULT_BASE_URL) {
    next.base_url = baseUrl.replace(/\/+$/, "");
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return path;
}

/**
 * Removes the stored API key from the config file (used by `ploid logout`).
 * Returns true if a key was present and removed.
 */
export function clearCredentials(): boolean {
  const path = configPath();
  const existing = readFileConfig();
  if (existing.api_key === undefined) return false;
  delete existing.api_key;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600 });
  return true;
}
