import { Command } from "commander";
import { buildContext } from "../context.js";
import { readJsonObject, splitList } from "../input.js";
import { printResult } from "../output.js";

export function registerLinkedinCommands(program: Command): void {
  const linkedin = program
    .command("linkedin")
    .description("LinkedIn reads (profile, search, posts) backed by the public API");

  linkedin
    .command("profile")
    .description("Fetch a LinkedIn profile (GET /v1/linkedin/profile)")
    .requiredOption("--url <url>", "LinkedIn profile URL, vanity slug, or @handle")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get("/linkedin/profile", { query: { url: opts.url } });
      printResult(res, ctx.output);
    });

  linkedin
    .command("search")
    .description("Search LinkedIn people (POST /v1/linkedin/search)")
    .option("--keywords <text>", "free-text keywords")
    .option("--location <list>", "comma-separated locations")
    .option("--title <list>", "comma-separated job titles")
    .option("--company <list>", "comma-separated current companies")
    .option("--school <list>", "comma-separated schools")
    .option("--limit <n>", "max results (1-100)", (v) => Number.parseInt(v, 10))
    .option("--cursor <cursor>", "pagination cursor from a previous response")
    .option("--filters <path>", "JSON file (or - for stdin) with the full filters object")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const filters = opts.filters
        ? readJsonObject(opts.filters)
        : buildLinkedinFilters(opts);
      const body: Record<string, unknown> = {};
      if (filters && Object.keys(filters).length > 0) body.filters = filters;
      if (opts.limit !== undefined) body.limit = opts.limit;
      if (opts.cursor) body.cursor = opts.cursor;
      const res = await ctx.client.post("/linkedin/search", { body });
      printResult(res, ctx.output);
    });

  linkedin
    .command("posts")
    .description("List recent LinkedIn posts (GET /v1/linkedin/posts)")
    .requiredOption("--identifier <id>", "LinkedIn profile URL, vanity slug, or @handle")
    .option("--limit <n>", "max posts (1-50)", (v) => Number.parseInt(v, 10))
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get("/linkedin/posts", {
        query: { identifier: opts.identifier, limit: opts.limit },
      });
      printResult(res, ctx.output);
    });
}

/** Builds the `filters` object from individual flags, splitting list flags. */
function buildLinkedinFilters(opts: {
  keywords?: string;
  location?: string;
  title?: string;
  company?: string;
  school?: string;
}): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (opts.keywords) filters.keywords = opts.keywords;
  if (opts.location) filters.location = splitList(opts.location);
  if (opts.title) filters.title = splitList(opts.title);
  if (opts.company) filters.currentCompany = splitList(opts.company);
  if (opts.school) filters.school = splitList(opts.school);
  return filters;
}
