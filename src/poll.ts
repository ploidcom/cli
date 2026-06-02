import type { ApiClient } from "./client.js";
import { CliError } from "./errors.js";
import { progress, type OutputOptions } from "./output.js";

const TERMINAL_DONE = new Set(["completed", "failed", "canceled", "cancelled"]);

export interface PollOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
}

interface JobStatus {
  status?: string;
  total?: number;
  completed?: number;
  verified_count?: number;
  requested_count?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls a status endpoint until the job's `status` is terminal
 * (completed/failed/canceled) or the timeout elapses. Progress is reported on
 * stderr so piped JSON stdout stays clean. Returns the final `data` object.
 */
export async function pollUntilDone(
  client: ApiClient,
  path: string,
  opts: PollOptions,
  output: OutputOptions,
): Promise<JobStatus> {
  const deadline = Date.now() + opts.timeoutSeconds * 1000;
  const intervalMs = Math.max(1, opts.intervalSeconds) * 1000;

  for (;;) {
    const { data } = await client.get<JobStatus>(path);
    const status = (data.status ?? "").toLowerCase();
    const done = data.completed ?? data.verified_count;
    const total = data.total ?? data.requested_count;
    const counts = done !== undefined && total !== undefined ? ` (${done}/${total})` : "";
    progress(`status: ${status || "unknown"}${counts}`, output);

    if (TERMINAL_DONE.has(status)) return data;

    if (Date.now() >= deadline) {
      throw new CliError(`Timed out after ${opts.timeoutSeconds}s waiting for job to finish (last status: ${status || "unknown"}).`, 2);
    }
    await sleep(intervalMs);
  }
}
