import { Command } from "commander";
import { buildContext } from "../context.js";
import { readJsonObject } from "../input.js";
import { printResult } from "../output.js";

export function registerMonitorsCommands(program: Command): void {
  const monitors = program.command("monitors").description("Recurring People Set monitors");

  monitors
    .command("list")
    .description("List monitors (GET /v1/monitors)")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get("/monitors");
      printResult(res, ctx.output);
    });

  monitors
    .command("create")
    .description("Create a monitor (POST /v1/monitors)")
    .option("--people-set-id <id>", "base People Set to refresh")
    .option("--query <text>", "query (required if no --people-set-id)")
    .option("--name <name>", "monitor name")
    .option("--interval-days <n>", "refresh interval in days (1-90)", (v) => Number.parseInt(v, 10))
    .option("--filters <path>", "JSON file (or - for stdin) with structured filters")
    .option("--webhook-url <url>", "completion webhook")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = {};
      if (opts.peopleSetId) body.people_set_id = opts.peopleSetId;
      if (opts.query) body.query = opts.query;
      if (opts.name) body.name = opts.name;
      if (opts.intervalDays !== undefined) body.interval_days = opts.intervalDays;
      if (opts.filters) body.filters = readJsonObject(opts.filters);
      if (opts.webhookUrl) body.webhook_url = opts.webhookUrl;
      const res = await ctx.client.post("/monitors", { body });
      printResult(res, ctx.output);
    });

  monitors
    .command("delete <id>")
    .description("Disable a monitor (DELETE /v1/monitors/:id)")
    .action(async (id: string, _opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.delete(`/monitors/${id}`);
      printResult(res, ctx.output);
    });
}
