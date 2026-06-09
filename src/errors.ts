/** Shape of the `error` object returned by every /v1 endpoint. */
export interface ApiErrorBody {
  code: string;
  message: string;
  request_id?: string;
  [key: string]: unknown;
}

/** Thrown when the API returns a non-2xx response with the standard envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code || "unknown_error";
    this.requestId = body.request_id;
    this.body = body;
  }
}

/** A local (pre-request) failure such as missing config or bad input. */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

const HINTS: Record<string, string> = {
  missing_api_key: "Set PLOID_API_KEY, pass --api-key, or run with a config file at ~/.config/ploid/config.json.",
  invalid_api_key: "Check your API key in workspace settings at https://app.ploid.com.",
  revoked_api_key: "This key was revoked. Create a new one in workspace settings.",
  expired_api_key: "This key has expired. Create a new one in workspace settings.",
  insufficient_scope: "Your API key is missing the scope required for this command.",
  insufficient_credits: "Out of credits. Top up at https://app.ploid.com.",
  daily_budget_exceeded: "This API key hit its daily budget. Raise it in workspace settings.",
  monthly_budget_exceeded: "This API key hit its monthly budget. Raise it in workspace settings.",
  max_cost_exceeded: "Estimated job cost exceeds --max-cost-usd. Raise the limit or trim the input.",
  rate_limited: "Rate limit reached. Wait a moment and retry.",
  request_timeout: "The request took too long. For natural-language or large searches use the async flow: `ploid searches create --query \"...\" --count 25 --wait`. Raise --timeout for slow one-off calls.",
  gateway_timeout: "The server held the connection too long. For natural-language or large searches use the async flow: `ploid searches create --query \"...\" --count 25 --wait`.",
  bad_gateway: "The API gateway hit an error. Retry shortly; for long searches prefer `ploid searches create --wait`.",
  service_unavailable: "The API is temporarily unavailable. Retry in a moment.",
  network_error: "Could not reach the API. Check your connection and --base-url.",
};

/** Builds a human-readable, multi-line message for an API error. */
export function formatApiError(err: ApiError): string {
  const lines = [`Error (${err.status} ${err.code}): ${err.message}`];
  const hint = HINTS[err.code];
  if (hint) lines.push(`  ${hint}`);
  if (err.requestId) lines.push(`  request_id: ${err.requestId}`);
  return lines.join("\n");
}
