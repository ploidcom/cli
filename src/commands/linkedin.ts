import { Command } from "commander";
import { buildContext } from "../context.js";
import { CliError } from "../errors.js";
import { printResult } from "../output.js";
import type { QueryValue } from "../client.js";

interface CatalogEntry {
  slug?: string;
  summary?: string;
}

/** Parses `key=value` argument pairs into a query object. */
function parseKeyValues(pairs: string[]): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new CliError(`Invalid parameter '${pair}'. Use key=value (e.g. url=https://...).`);
    }
    query[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return query;
}

export function registerLinkedinCommands(program: Command): void {
  const linkedin = program
    .command("linkedin")
    .description("White-label LinkedIn passthrough endpoints");

  linkedin
    .command("catalog")
    .description("List LinkedIn endpoints and per-call credit prices (GET /v1/linkedin)")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get<CatalogEntry[]>("/linkedin");
      printResult(res, ctx.output, (data) =>
        data
          .map((e) => `${(e.slug ?? "").padEnd(20)} ${e.summary ?? ""}`)
          .join("\n"),
      );
    });

  linkedin
    .command("call <slug> [params...]")
    .description("Call a LinkedIn endpoint, e.g. ploid linkedin call profile url=https://...")
    .action(async (slug: string, params: string[], _opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get(`/linkedin/${slug}`, {
        query: parseKeyValues(params ?? []),
      });
      printResult(res, ctx.output);
    });
}
