import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Works from both src/ (dev) and dist/ (built): package.json sits one level up.
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readVersion();
export const USER_AGENT = `ploid-cli/${VERSION}`;
