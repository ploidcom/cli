import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BASE_URL, resolveConfig } from "../src/config.js";

const ENV_KEYS = ["PLOID_API_KEY", "PLOID_API_BASE_URL", "XDG_CONFIG_HOME"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("resolveConfig", () => {
  it("defaults the base URL when nothing is set", () => {
    const config = resolveConfig();
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.apiKey).toBeUndefined();
  });

  it("prefers flags over env over file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ploid-cfg-"));
    mkdirSync(join(dir, "ploid"), { recursive: true });
    writeFileSync(
      join(dir, "ploid", "config.json"),
      JSON.stringify({ api_key: "from_file", base_url: "https://file.example" }),
    );
    process.env.XDG_CONFIG_HOME = dir;
    process.env.PLOID_API_KEY = "from_env";

    try {
      // Flag wins over env and file.
      expect(resolveConfig({ apiKey: "from_flag" }).apiKey).toBe("from_flag");
      // Env wins over file.
      expect(resolveConfig().apiKey).toBe("from_env");
      // File supplies the base URL when no flag/env override.
      expect(resolveConfig().baseUrl).toBe("https://file.example");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("strips trailing slashes from the base URL", () => {
    process.env.PLOID_API_BASE_URL = "https://api.ploid.com/";
    expect(resolveConfig().baseUrl).toBe("https://api.ploid.com");
  });
});
