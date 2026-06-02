import { Command } from "commander";
import { buildContext } from "../context.js";
import { readJsonObject, splitList } from "../input.js";
import { printResult } from "../output.js";

export function registerPeopleCommands(program: Command): void {
  const people = program.command("people").description("Search, look up, and enrich people");

  people
    .command("search")
    .description("Search people (POST /v1/people/search)")
    .requiredOption("--query <text>", "natural-language or keyword query")
    .option("--mode <mode>", "search mode: table or natural", "table")
    .option("--size <n>", "number of results", (v) => Number.parseInt(v, 10))
    .option("--filters <path>", "JSON file (or - for stdin) with structured filters")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = { query: opts.query, mode: opts.mode };
      if (opts.size !== undefined) body.page = { size: opts.size };
      if (opts.filters) body.filters = readJsonObject(opts.filters);
      const res = await ctx.client.post("/people/search", { body });
      printResult(res, ctx.output);
    });

  people
    .command("lookup")
    .description("Find one specific person (POST /v1/people/lookup)")
    .requiredOption("--name <name>", "person's full name")
    .option("--company <company>", "company name")
    .option("--linkedin-url <url>", "known LinkedIn URL")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = { name: opts.name };
      if (opts.company) body.company = opts.company;
      if (opts.linkedinUrl) body.linkedin_url = opts.linkedinUrl;
      const res = await ctx.client.post("/people/lookup", { body });
      printResult(res, ctx.output);
    });

  people
    .command("enrich")
    .description("Reveal specific profile/contact fields (POST /v1/people/enrich)")
    .option("--name <name>", "person's full name")
    .option("--company <company>", "company name")
    .option("--linkedin-url <url>", "LinkedIn URL")
    .option("--email <email>", "known email")
    .requiredOption(
      "--fields <list>",
      "comma-separated fields (profile,work_email,personal_email,mobile_phone,github,x,instagram,tiktok,reddit)",
    )
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = { fields: splitList(opts.fields) };
      if (opts.name) body.name = opts.name;
      if (opts.company) body.company = opts.company;
      if (opts.linkedinUrl) body.linkedin_url = opts.linkedinUrl;
      if (opts.email) body.email = opts.email;
      const res = await ctx.client.post("/people/enrich", { body });
      printResult(res, ctx.output);
    });

  people
    .command("agent")
    .description("Resolve and enrich one person with the People Agent (POST /v1/people/agent)")
    .option("--query <text>", "natural-language query")
    .option("--name <name>", "person's full name")
    .option("--company <company>", "company name")
    .option("--linkedin-url <url>", "known LinkedIn URL")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = {};
      if (opts.query) body.query = opts.query;
      if (opts.name) body.name = opts.name;
      if (opts.company) body.company = opts.company;
      if (opts.linkedinUrl) body.linkedin_url = opts.linkedinUrl;
      const res = await ctx.client.post("/people/agent", { body });
      printResult(res, ctx.output);
    });
}
