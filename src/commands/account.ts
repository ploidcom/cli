import { Command } from "commander";
import { buildContext } from "../context.js";
import { printResult } from "../output.js";

interface CreditSummary {
  available_credits?: number;
  available_balance_usd?: number;
  api_key_budget?: {
    daily_remaining_cents?: number;
    monthly_remaining_cents?: number;
  } | null;
}

function formatCredits(data: CreditSummary): string {
  const lines: string[] = [];
  if (data.available_credits !== undefined) {
    const usd = data.available_balance_usd ?? data.available_credits / 100;
    lines.push(`Available: ${data.available_credits} credits ($${usd.toFixed(2)})`);
  }
  const budget = data.api_key_budget;
  if (budget) {
    if (budget.daily_remaining_cents !== undefined) {
      lines.push(`Daily budget remaining: $${(budget.daily_remaining_cents / 100).toFixed(2)}`);
    }
    if (budget.monthly_remaining_cents !== undefined) {
      lines.push(`Monthly budget remaining: $${(budget.monthly_remaining_cents / 100).toFixed(2)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(data, null, 2);
}

export function registerAccountCommands(program: Command): void {
  const account = program.command("account").description("Account balance and usage");

  account
    .command("credits")
    .description("Show account balance and API key budget (GET /v1/account/credits)")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get<CreditSummary>("/account/credits");
      printResult(res, ctx.output, formatCredits);
    });

  account
    .command("usage")
    .description("Show public API usage context (GET /v1/account/usage)")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get("/account/usage");
      printResult(res, ctx.output);
    });

  // `ploid auth check` is a friendly alias that validates the key by hitting
  // the credits endpoint and printing the balance.
  program
    .command("auth")
    .description("Authentication helpers")
    .command("check")
    .description("Verify the configured API key works")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      const res = await ctx.client.get<CreditSummary>("/account/credits");
      if (ctx.output.json) {
        printResult(res, ctx.output);
        return;
      }
      process.stdout.write(`API key OK.\n${formatCredits(res.data)}\n`);
    });
}
