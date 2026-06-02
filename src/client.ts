import { ApiError, type ApiErrorBody } from "./errors.js";
import { USER_AGENT } from "./version.js";

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
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
}

/**
 * Thin HTTP wrapper over the Ploid Public API. It only knows how to build
 * requests against `{baseUrl}/v1`, attach auth, and unwrap the standard
 * `{ data, meta }` / `{ error }` envelopes. No business logic lives here.
 */
export class ApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, "")}/v1`;
    this.fetchImpl = options.fetchImpl ?? fetch;
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
    const init: RequestInit = { method, headers, signal: options.signal };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const res = await this.fetchImpl(this.buildUrl(path, options.query), init);
    const payload = await parseJson(res);

    if (!res.ok) {
      const error = extractError(payload, res.status);
      throw new ApiError(res.status, error);
    }

    return (payload ?? { data: null }) as ApiResponse<T>;
  }
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

function extractError(payload: unknown, status: number): ApiErrorBody {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (error && typeof error === "object") return error as ApiErrorBody;
  }
  return { code: "unknown_error", message: `Request failed with status ${status}` };
}
