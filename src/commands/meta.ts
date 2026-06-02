import { Command } from "commander";
import { buildContext } from "../context.js";
import { printJson } from "../output.js";

export function registerMetaCommands(program: Command): void {
  program
    .command("openapi")
    .description("Print the machine-readable OpenAPI spec (GET /v1/openapi.json)")
    .action(async (_opts, command: Command) => {
      const ctx = buildContext(command);
      // openapi.json is a bare document, not wrapped in the {data,meta} envelope.
      const spec = await ctx.client.getRaw("/openapi.json");
      printJson(spec);
    });
}
