import { Command } from "commander";
import { buildContext } from "../context.js";
import { splitList } from "../input.js";
import { printResult } from "../output.js";

export function registerWebhooksCommands(program: Command): void {
  const webhooks = program.command("webhooks").description("Webhook registrations");

  webhooks
    .command("list")
    .description("List webhooks (GET /v1/webhooks)")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get("/webhooks");
      printResult(res, ctx.output);
    });

  webhooks
    .command("create")
    .description("Register a webhook (POST /v1/webhooks)")
    .requiredOption("--url <url>", "HTTPS URL to receive events")
    .requiredOption(
      "--events <list>",
      "comma-separated events (batch.completed,people_set.completed,people_set.failed)",
    )
    .option("--secret <secret>", "shared secret for HMAC signatures (min 16 chars)")
    .action(async (opts, command: Command) => {
      const ctx = buildContext(command);
      const body: Record<string, unknown> = {
        url: opts.url,
        events: splitList(opts.events),
      };
      if (opts.secret) body.secret = opts.secret;
      const res = await ctx.client.post("/webhooks", { body });
      printResult(res, ctx.output);
    });

  webhooks
    .command("delete <id>")
    .description("Delete a webhook (DELETE /v1/webhooks/:id)")
    .action(async (id: string, _opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.delete(`/webhooks/${id}`);
      printResult(res, ctx.output);
    });
}
