import { Command } from "commander";
import { buildContext } from "../context.js";
import { printResult } from "../output.js";

export interface CreditSummary {
  plan?: string;
  /** Credits available (current API shape). */
  available?: number;
  balance_usd?: { available?: number };
  /** Legacy field names, kept for backward compatibility. */
  available_credits?: number;
  available_balance_usd?: number;
  api_key_budget?: {
    daily_budget_cents?: number | null;
    monthly_budget_cents?: number | null;
    daily_remaining_cents?: number | null;
    monthly_remaining_cents?: number | null;
  } | null;
}

export function formatCredits(data: CreditSummary): string {
  const lines: string[] = [];
  const credits = data.available ?? data.available_credits;
  if (credits !== undefined) {
    const usd = data.balance_usd?.available ?? data.available_balance_usd ?? credits / 100;
    lines.push(`Available: ${credits} credits ($${usd.toFixed(2)})`);
  }
  if (data.plan) lines.push(`Plan: ${data.plan}`);
  const budget = data.api_key_budget;
  if (budget) {
    lines.push(formatBudgetLine("Daily", budget.daily_budget_cents, budget.daily_remaining_cents));
    lines.push(formatBudgetLine("Monthly", budget.monthly_budget_cents, budget.monthly_remaining_cents));
  }
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(data, null, 2);
}

/**
 * Renders one budget line. A `null`/absent cap means the key has no budget
 * limit, so we say so instead of printing a misleading "$0.00 remaining".
 */
function formatBudgetLine(
  label: string,
  capCents: number | null | undefined,
  remainingCents: number | null | undefined,
): string {
  if (capCents === null || capCents === undefined) {
    return `${label} budget: no limit`;
  }
  const remaining = remainingCents ?? capCents;
  return `${label} budget remaining: $${(remaining / 100).toFixed(2)} of $${(capCents / 100).toFixed(2)}`;
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
}
