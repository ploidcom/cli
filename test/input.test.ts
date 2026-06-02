import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPeople, splitList } from "../src/input.js";
import { CliError } from "../src/errors.js";

const dirs: string[] = [];

function tempFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ploid-in-"));
  dirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("readPeople", () => {
  it("parses a JSON array", () => {
    const path = tempFile("people.json", JSON.stringify([{ name: "A" }, { name: "B" }]));
    expect(readPeople(path)).toEqual([{ name: "A" }, { name: "B" }]);
  });

  it("parses JSONL, skipping blank lines", () => {
    const path = tempFile("people.jsonl", '{"name":"A"}\n\n{"name":"B"}\n');
    expect(readPeople(path)).toEqual([{ name: "A" }, { name: "B" }]);
  });

  it("throws a CliError on invalid JSON", () => {
    const path = tempFile("bad.json", "[not json");
    expect(() => readPeople(path)).toThrow(CliError);
  });

  it("throws a CliError when the file does not exist", () => {
    expect(() => readPeople("/no/such/file.json")).toThrow(CliError);
  });
});

describe("splitList", () => {
  it("splits and trims comma-separated values", () => {
    expect(splitList("github, x , instagram")).toEqual(["github", "x", "instagram"]);
  });

  it("returns undefined for empty input", () => {
    expect(splitList(undefined)).toBeUndefined();
    expect(splitList("  ")).toBeUndefined();
  });
});
