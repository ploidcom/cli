import type { Command } from "commander";
import { ApiClient } from "../client.js";
import { clearCredentials, resolveConfig, saveCredentials } from "../config.js";
import { buildContext, type GlobalOptions } from "../context.js";
import {
  defaultClientName,
  openBrowser,
  pollDeviceToken,
  pollForApproval,
  sleep,
  startDeviceFlow,
} from "../device.js";
import { printResult } from "../output.js";
import { type CreditSummary, formatCredits } from "./account.js";

/** Reads the root program's global options (they merge down to subcommands). */
function globalOptions(command: Command): GlobalOptions {
  let root: Command = command;
  while (root.parent) root = root.parent;
  return root.opts<GlobalOptions>();
}

interface LoginOptions {
  clientName?: string;
  noBrowser?: boolean;
}

async function runLogin(opts: LoginOptions, command: Command): Promise<void> {
  const globals = globalOptions(command);
  const { baseUrl } = resolveConfig({ baseUrl: globals.baseUrl });
  const quiet = Boolean(globals.quiet);
  const json = Boolean(globals.json);

  const log = (message: string) => {
    if (!quiet) process.stderr.write(`${message}\n`);
  };

  const flow = await startDeviceFlow(baseUrl, { clientName: opts.clientName ?? defaultClientName() });

  log("");
  log("To connect this CLI, open the following URL in your browser:");
  log("");
  log(`  ${flow.verification_uri}`);
  log("");
  log("and enter the code:");
  log("");
  log(`      ${flow.user_code}`);
  log("");

  if (!opts.noBrowser) {
    log("Opening your browser…");
    openBrowser(flow.verification_uri_complete);
  }
  log("Waiting for you to approve in the browser… (Ctrl-C to cancel)");

  const result = await pollForApproval(
    flow.device_code,
    { expiresIn: flow.expires_in, interval: flow.interval },
    {
      poll: (deviceCode) => pollDeviceToken(baseUrl, deviceCode),
      sleep,
      now: () => Date.now(),
    },
  );

  const path = saveCredentials(result.api_key, baseUrl);
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "approved",
          key_prefix: result.key_prefix ?? null,
          organization_id: result.organization_id ?? null,
          scopes: result.scopes ?? [],
          config_path: path,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    log("");
    process.stdout.write(`Logged in. API key saved to ${path}\n`);
    if (result.key_prefix) process.stdout.write(`Key: ${result.key_prefix}…\n`);
  }
}

async function runLogout(command: Command): Promise<void> {
  const globals = globalOptions(command);
  const { apiKey, baseUrl } = resolveConfig({ apiKey: globals.apiKey, baseUrl: globals.baseUrl });

  // Best-effort server-side revoke so the key can't be reused after logout.
  // A failure here (already-revoked, offline, etc.) must not block clearing
  // the local copy.
  let revoked = false;
  if (apiKey) {
    try {
      await new ApiClient({ apiKey, baseUrl }).delete("/account/key");
      revoked = true;
    } catch {
      // ignore — fall through to local removal
    }
  }

  const removed = clearCredentials();
  if (!removed && !apiKey) {
    process.stdout.write("No saved API key to remove.\n");
    return;
  }
  process.stdout.write(
    revoked
      ? "Logged out. API key revoked and removed from this machine.\n"
      : "Logged out. Saved API key removed from this machine.\n",
  );
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authentication helpers (login, logout, check)");

  auth
    .command("login")
    .description("Log in via the browser and save an API key (device authorization flow)")
    .option("--client-name <name>", "Label shown on the approval page (defaults to this machine's hostname)")
    .option("--no-browser", "Don't try to open the browser automatically")
    .action(async (opts: { clientName?: string; browser?: boolean }, command: Command) => {
      await runLogin({ clientName: opts.clientName, noBrowser: opts.browser === false }, command);
    });

  auth
    .command("logout")
    .description("Revoke the saved API key and remove it from this machine")
    .action(async (_opts, command: Command) => {
      await runLogout(command);
    });

  auth
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

  // Top-level conveniences so `ploid login` / `ploid logout` work too.
  program
    .command("login")
    .description("Log in via the browser and save an API key (alias for `auth login`)")
    .option("--client-name <name>", "Label shown on the approval page (defaults to this machine's hostname)")
    .option("--no-browser", "Don't try to open the browser automatically")
    .action(async (opts: { clientName?: string; browser?: boolean }, command: Command) => {
      await runLogin({ clientName: opts.clientName, noBrowser: opts.browser === false }, command);
    });

  program
    .command("logout")
    .description("Revoke the saved API key and remove it from this machine (alias for `auth logout`)")
    .action(async (_opts, command: Command) => {
      await runLogout(command);
    });
}
