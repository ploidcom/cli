import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerAccountCommands } from "./commands/account.js";
import { registerPeopleCommands } from "./commands/people.js";
import { registerBatchCommands } from "./commands/batch.js";
import { registerSearchesCommands } from "./commands/searches.js";
import { registerMonitorsCommands } from "./commands/monitors.js";
import { registerWebhooksCommands } from "./commands/webhooks.js";
import { registerLinkedinCommands } from "./commands/linkedin.js";
import { registerMetaCommands } from "./commands/meta.js";
import { ApiError, CliError, formatApiError } from "./errors.js";
import { VERSION } from "./version.js";

function buildProgram(): Command {
  const program = new Command();
  program
    .name("ploid")
    .description("Command-line client for the Ploid Public API (https://api.ploid.com/v1)")
    .version(VERSION, "-v, --version", "print the CLI version")
    .option("--api-key <key>", "Ploid API key (overrides PLOID_API_KEY and config file)")
    .option("--base-url <url>", "API base URL (default https://api.ploid.com)")
    .option("--json", "emit machine-readable JSON instead of tables")
    .option("--quiet", "suppress progress output")
    .showHelpAfterError();

  registerAuthCommands(program);
  registerAccountCommands(program);
  registerPeopleCommands(program);
  registerBatchCommands(program);
  registerSearchesCommands(program);
  registerMonitorsCommands(program);
  registerWebhooksCommands(program);
  registerLinkedinCommands(program);
  registerMetaCommands(program);

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof ApiError) {
      process.stderr.write(`${formatApiError(err)}\n`);
      process.exit(2);
    }
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(err.exitCode);
    }
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

void main();
