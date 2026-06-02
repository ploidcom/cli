import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { buildContext } from "../context.js";
import { readJsonObject, splitList } from "../input.js";
import { printJson, printResult, progress } from "../output.js";
import { pollUntilDone } from "../poll.js";

export function registerSearchesCommands(program: Command): void {
  const searches = program.command("searches").description("Async People Sets");

  searches
    .command("create")
    .description("Create a People Set search job (POST /v1/searches)")
    .requiredOption("--query <text>", "search query")
    .option("--name <name>", "human-readable name")
    .option("--mode <mode>", "table or natural", "natural")
    .option("--count <n>", "requested results (25-1000)", (v) => Number.parseInt(v, 10))
    .option("--include <list>", "comma-separated enrichment fields")
    .option("--filters <path>", "JSON file (or - for stdin) with structured filters")
    .option("--webhook-url <url>", "completion webhook")
    .option("--wait", "poll until the People Set completes")
    .option("--interval <seconds>", "poll interval when --wait is set", (v) => Number.parseInt(v, 10), 5)
    .option("--timeout <seconds>", "max wait when --wait is set", (v) => Number.parseInt(v, 10), 1800)
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = { query: opts.query, mode: opts.mode };
      if (opts.name) body.name = opts.name;
      if (opts.count !== undefined) body.count = opts.count;
      if (opts.include) body.include = splitList(opts.include);
      if (opts.filters) body.filters = readJsonObject(opts.filters);
      if (opts.webhookUrl) body.webhook_url = opts.webhookUrl;

      const res = await ctx.client.post<{ people_set_id?: string }>("/searches", { body });
      const id = res.data.people_set_id;
      if (!opts.wait || !id) {
        printResult(res, ctx.output);
        return;
      }
      progress(`Created People Set ${id}. Waiting...`, ctx.output);
      const final = await pollUntilDone(
        ctx.client,
        `/searches/${id}`,
        { intervalSeconds: opts.interval, timeoutSeconds: opts.timeout },
        ctx.output,
      );
      printJson(final);
    });

  searches
    .command("list")
    .description("List People Sets (GET /v1/searches)")
    .option("--limit <n>", "max rows", (v) => Number.parseInt(v, 10))
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get("/searches", {
        query: { limit: opts.limit },
      });
      printResult(res, ctx.output);
    });

  searches
    .command("get <id>")
    .description("Get a People Set (GET /v1/searches/:id)")
    .action(async (id: string, _opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get(`/searches/${id}`);
      printResult(res, ctx.output);
    });

  searches
    .command("items <id>")
    .description("Page People Set items (GET /v1/searches/:id/items)")
    .option("--cursor <n>", "start cursor", (v) => Number.parseInt(v, 10), 0)
    .option("--limit <n>", "page size", (v) => Number.parseInt(v, 10), 100)
    .action(async (id: string, opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get(`/searches/${id}/items`, {
        query: { cursor: opts.cursor, limit: opts.limit },
      });
      printResult(res, ctx.output);
    });

  searches
    .command("refine <id>")
    .description("Create a refined People Set (POST /v1/searches/:id/refine)")
    .requiredOption("--query <text>", "refinement query")
    .option("--behavior <behavior>", "append or replace", "replace")
    .option("--count <n>", "requested results", (v) => Number.parseInt(v, 10))
    .option("--webhook-url <url>", "completion webhook")
    .action(async (id: string, opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = { query: opts.query, behavior: opts.behavior };
      if (opts.count !== undefined) body.count = opts.count;
      if (opts.webhookUrl) body.webhook_url = opts.webhookUrl;
      const res = await ctx.client.post(`/searches/${id}/refine`, { body });
      printResult(res, ctx.output);
    });

  searches
    .command("export <id>")
    .description("Export People Set results (POST /v1/searches/:id/exports)")
    .option("--format <format>", "json or csv", "json")
    .option("--out <path>", "write content to a file instead of stdout")
    .action(async (id: string, opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.post<{ content?: string; filename?: string }>(
        `/searches/${id}/exports`,
        { body: { format: opts.format } },
      );
      if (ctx.output.json) {
        printResult(res, ctx.output);
        return;
      }
      const content = res.data.content ?? "";
      if (opts.out) {
        writeFileSync(opts.out, content);
        progress(`Wrote ${res.data.filename ?? opts.out} to ${opts.out}`, ctx.output);
      } else {
        process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
      }
    });

  searches
    .command("wait <id>")
    .description("Poll a People Set until it finishes")
    .option("--interval <seconds>", "poll interval", (v) => Number.parseInt(v, 10), 5)
    .option("--timeout <seconds>", "max time to wait", (v) => Number.parseInt(v, 10), 1800)
    .action(async (id: string, opts, command: Command) => {
      const ctx = buildContext(command);
      const final = await pollUntilDone(
        ctx.client,
        `/searches/${id}`,
        { intervalSeconds: opts.interval, timeoutSeconds: opts.timeout },
        ctx.output,
      );
      printJson(final);
    });
}
