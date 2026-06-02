import { spawn } from "node:child_process";
import { hostname, platform } from "node:os";
import { CliError } from "./errors.js";
import { USER_AGENT } from "./version.js";

export interface DeviceStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export type DeviceTokenResponse =
  | { status: "pending"; interval?: number }
  | { status: "slow_down"; interval?: number }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; api_key: string; key_prefix?: string; scopes?: string[]; organization_id?: string };

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": USER_AGENT,
};

function deviceUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/auth/device${path}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  } catch (err) {
    throw new CliError(`Could not reach the Ploid API at ${url}: ${err instanceof Error ? err.message : String(err)}`, 2);
  }
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `Request failed with status ${res.status}`;
    throw new CliError(message, 2);
  }
  return (payload ?? {}) as T;
}

/** Best-effort machine label so the browser approval page can show context. */
export function defaultClientName(): string {
  try {
    return hostname();
  } catch {
    return "Unknown device";
  }
}

export function startDeviceFlow(
  baseUrl: string,
  opts: { clientName?: string } = {},
): Promise<DeviceStartResponse> {
  return postJson<DeviceStartResponse>(deviceUrl(baseUrl, "/start"), {
    client_name: opts.clientName ?? defaultClientName(),
  });
}

export function pollDeviceToken(baseUrl: string, deviceCode: string): Promise<DeviceTokenResponse> {
  return postJson<DeviceTokenResponse>(deviceUrl(baseUrl, "/token"), { device_code: deviceCode });
}

/**
 * Opens a URL in the user's default browser. Best-effort: if it fails (e.g. on
 * a headless server) we silently continue — the caller still prints the URL.
 */
export function openBrowser(url: string): void {
  const command =
    platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* no browser available — ignore */
    });
    child.unref();
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export { sleep };

export type ApprovedToken = Extract<DeviceTokenResponse, { status: "approved" }>;

/** Injectable dependencies so the poll loop can be unit-tested without I/O. */
export interface PollDeps {
  poll: (deviceCode: string) => Promise<DeviceTokenResponse>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/**
 * Polls the device-token endpoint until the request is approved, denied, or
 * expires. Honors `slow_down` by backing off the interval. Throws a
 * {@link CliError} on denial (exit 1) or timeout/expiry (exit 2). Returns the
 * approved token (with the minted API key) on success.
 */
export async function pollForApproval(
  deviceCode: string,
  opts: { expiresIn: number; interval: number },
  deps: PollDeps,
): Promise<ApprovedToken> {
  const deadline = deps.now() + opts.expiresIn * 1000;
  let intervalMs = Math.max(1, opts.interval) * 1000;

  for (;;) {
    if (deps.now() >= deadline) {
      throw new CliError("Login request expired before it was approved. Run `ploid login` again.", 2);
    }
    await deps.sleep(intervalMs);

    const result = await deps.poll(deviceCode);
    if (result.status === "pending") continue;
    if (result.status === "slow_down") {
      intervalMs += 2000;
      continue;
    }
    if (result.status === "denied") {
      throw new CliError("Login was cancelled in the browser.", 1);
    }
    if (result.status === "expired") {
      throw new CliError("Login request expired before it was approved. Run `ploid login` again.", 2);
    }
    return result;
  }
}
