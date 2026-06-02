import { Command } from "commander";
import { buildContext } from "../context.js";
import { readPeople, splitList } from "../input.js";
import { printJson, printResult, progress } from "../output.js";
import { pollUntilDone } from "../poll.js";

const DEFAULT_FIELDS = ["github", "x", "instagram"];

function buildBatchBody(opts: {
  file?: string;
  fields?: string;
  outputSchema?: string;
  forceRefresh?: boolean;
  maxCostUsd?: number;
  webhookUrl?: string;
  clientReferenceId?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    people: readPeople(opts.file),
    fields: splitList(opts.fields) ?? DEFAULT_FIELDS,
  };
  if (opts.outputSchema) body.output_schema = splitList(opts.outputSchema);
  if (opts.forceRefresh) body.force_refresh = true;
  if (opts.maxCostUsd !== undefined) body.max_cost_usd = opts.maxCostUsd;
  if (opts.webhookUrl) body.webhook_url = opts.webhookUrl;
  if (opts.clientReferenceId) body.client_reference_id = opts.clientReferenceId;
  return body;
}

function fields(cmd: Command): Command {
  return cmd
    .option("--file <path>", "JSON array or JSONL file of people (- for stdin)")
    .option("--fields <list>", "comma-separated enrichment fields")
    .option("--output-schema <list>", "comma-separated output fields to keep");
}

export function registerBatchCommands(program: Command): void {
  const batch = program.command("batch").description("Async bulk social enrichment jobs");

  fields(batch.command("estimate"))
    .description("Estimate a bulk enrichment job (POST /v1/people/estimate)")
    .option("--force-refresh", "bypass cache when estimating")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body = buildBatchBody(opts);
      const res = await ctx.client.post("/people/estimate", { body });
      printResult(res, ctx.output);
    });

  fields(batch.command("create"))
    .description("Queue a bulk enrichment job (POST /v1/people/batch/enrich)")
    .option("--force-refresh", "re-run live enrichment, ignoring cache")
    .option("--max-cost-usd <usd>", "reject the job if the estimate exceeds this", (v) => Number.parseFloat(v))
    .option("--webhook-url <url>", "receive batch.completed when the job finishes")
    .option("--client-reference-id <id>", "your own correlation id")
    .option("--wait", "poll until the job completes, then print results")
    .option("--interval <seconds>", "poll interval when --wait is set", (v) => Number.parseInt(v, 10), 5)
    .option("--timeout <seconds>", "max time to wait when --wait is set", (v) => Number.parseInt(v, 10), 1800)
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body = buildBatchBody(opts);
      const res = await ctx.client.post<{ job_id?: string; estimated_cost_usd?: number }>(
        "/people/batch/enrich",
        { body },
      );

      const jobId = res.data.job_id;
      if (!opts.wait || !jobId) {
        printResult(res, ctx.output);
        return;
      }

      progress(`Queued ${jobId} (est. $${res.data.estimated_cost_usd ?? "?"}). Waiting...`, ctx.output);
      await pollUntilDone(
        ctx.client,
        `/people/batch/${jobId}`,
        { intervalSeconds: opts.interval, timeoutSeconds: opts.timeout },
        ctx.output,
      );
      await dumpResults(ctx.client, jobId, ctx.output.json);
    });

  batch
    .command("status <id>")
    .description("Poll a batch enrichment job (GET /v1/people/batch/:id)")
    .action(async (id: string, _opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get(`/people/batch/${id}`);
      printResult(res, ctx.output);
    });

  batch
    .command("results <id>")
    .description("Page batch results (GET /v1/people/batch/:id/results)")
    .option("--cursor <n>", "start cursor", (v) => Number.parseInt(v, 10), 0)
    .option("--limit <n>", "page size (max 250)", (v) => Number.parseInt(v, 10), 100)
    .option("--all", "fetch every page and print the combined array")
    .action(async (id: string, opts, command: Command) => {
      const ctx = buildContext(command);
      if (opts.all) {
        const rows = await fetchAllResults(ctx.client, id, opts.limit);
        printJson(rows);
        return;
      }
      const res = await ctx.client.get(`/people/batch/${id}/results`, {
        query: { cursor: opts.cursor, limit: opts.limit },
      });
      printResult(res, ctx.output);
    });

  batch
    .command("wait <id>")
    .description("Poll a job until it finishes, then print results")
    .option("--interval <seconds>", "poll interval", (v) => Number.parseInt(v, 10), 5)
    .option("--timeout <seconds>", "max time to wait", (v) => Number.parseInt(v, 10), 1800)
    .option("--no-results", "skip dumping results when done")
    .action(async (id: string, opts, command: Command) => {
      const ctx = buildContext(command);
      const final = await pollUntilDone(
        ctx.client,
        `/people/batch/${id}`,
        { intervalSeconds: opts.interval, timeoutSeconds: opts.timeout },
        ctx.output,
      );
      if (opts.results === false) {
        printJson(final);
        return;
      }
      await dumpResults(ctx.client, id, ctx.output.json);
    });
}

async function fetchAllResults(
  client: ReturnType<typeof buildContext>["client"],
  id: string,
  limit: number,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor = 0;
  for (;;) {
    const res = await client.get<unknown[]>(`/people/batch/${id}/results`, {
      query: { cursor, limit },
    });
    const page = Array.isArray(res.data) ? res.data : [];
    all.push(...page);
    const next = (res.meta?.next_cursor ?? null) as number | null;
    if (next === null || page.length === 0) break;
    cursor = next;
  }
  return all;
}

async function dumpResults(
  client: ReturnType<typeof buildContext>["client"],
  id: string,
  _json: boolean,
): Promise<void> {
  const rows = await fetchAllResults(client, id, 250);
  printJson(rows);
}
