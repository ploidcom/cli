import { ApiError, type ApiErrorBody } from "./errors.js";
import { USER_AGENT } from "./version.js";

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** Per-request timeout in milliseconds. Overrides the client default. */
  timeoutMs?: number;
}

/** Standard success envelope: `{ data, meta }`. */
export interface ApiResponse<T = unknown> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Default per-request timeout in milliseconds. When a request exceeds this,
   * it is aborted locally with a `request_timeout` {@link ApiError} instead of
   * hanging until an upstream gateway returns an opaque 504/524. Use `0` or a
   * negative value to disable the client-side timeout entirely.
   */
  timeoutMs?: number;
}

/**
 * Thin HTTP wrapper over the Ploid Public API. It only knows how to build
 * requests against `{baseUrl}/v1`, attach auth, and unwrap the standard
 * `{ data, meta }` / `{ error }` envelopes. No business logic lives here.
 */
/** Default client-side timeout: long enough for slow searches, short enough
 * to beat the typical 100s edge gateway 524 and return a useful message. */
export const DEFAULT_TIMEOUT_MS = 90_000;

export class ApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, "")}/v1`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, options);
  }

  /** GET a non-enveloped JSON document (e.g. openapi.json). */
  async getRaw<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const res = await this.request<unknown>("GET", path, options);
    // Endpoints like openapi.json return a bare object; request() wraps a
    // non-enveloped body, so prefer the parsed payload as-is.
    return res as unknown as T;
  }

  post<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, options);
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, options);
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const { signal, cleanup, didTimeout } = combineSignals(options.signal, timeoutMs);
    const init: RequestInit = { method, headers, signal };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(this.buildUrl(path, options.query), init);
    } catch (err) {
      // A locally-triggered timeout surfaces as an AbortError. Turn it into a
      // clear, actionable ApiError instead of an opaque "fetch failed".
      if (didTimeout()) {
        throw new ApiError(504, {
          code: "request_timeout",
          message: `Request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        });
      }
      // The caller aborted via their own signal — re-throw untouched.
      if (isAbortError(err)) throw err;
      throw new ApiError(0, {
        code: "network_error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      cleanup();
    }

    const payload = await parseJson(res);

    if (!res.ok) {
      const error = extractError(payload, res.status);
      throw new ApiError(res.status, error);
    }

    return (payload ?? { data: null }) as ApiResponse<T>;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Combines a caller-supplied {@link AbortSignal} with a timeout. Returns the
 * merged signal plus a `cleanup` to clear the timer and a `didTimeout` probe so
 * callers can distinguish a local timeout from a user-initiated abort.
 */
function combineSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; cleanup: () => void; didTimeout: () => boolean } {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal: external, cleanup: () => {}, didTimeout: () => false };
  }

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // Don't let a pending timer keep the process alive on its own.
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
    didTimeout: () => timedOut,
  };
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: "invalid_response", message: text.slice(0, 500) } };
  }
}

/**
 * Synthetic codes for gateway/proxy failures that arrive without the standard
 * `{ error }` envelope (e.g. a plain Cloudflare 524 or Railway 502 page).
 */
const GATEWAY_ERROR_CODES: Record<number, { code: string; message: string }> = {
  502: { code: "bad_gateway", message: "The API gateway returned a bad gateway error (502)." },
  503: { code: "service_unavailable", message: "The API is temporarily unavailable (503)." },
  504: { code: "gateway_timeout", message: "The API gateway timed out (504)." },
  524: { code: "gateway_timeout", message: "The request ran longer than the gateway allows (524)." },
};

function extractError(payload: unknown, status: number): ApiErrorBody {
  const gateway = GATEWAY_ERROR_CODES[status];
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (error && typeof error === "object") {
      // `invalid_response` is the synthetic code parseJson uses when the body
      // wasn't valid JSON (e.g. a plain HTML 524 page). For gateway statuses
      // prefer the clearer gateway code in that case.
      if (gateway && (error as ApiErrorBody).code === "invalid_response") return { ...gateway };
      return error as ApiErrorBody;
    }
  }
  if (gateway) return { ...gateway };
  return { code: "unknown_error", message: `Request failed with status ${status}` };
}
