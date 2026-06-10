import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/client.js";
import { ApiError } from "../src/errors.js";
import { USER_AGENT } from "../src/version.js";

function mockFetch(response: {
  status?: number;
  body?: unknown;
}): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? "" : JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("ApiClient", () => {
  it("targets {baseUrl}/v1 and sends auth + user-agent headers", async () => {
    const { fetchImpl, calls } = mockFetch({ body: { data: { ok: true } } });
    const client = new ApiClient({ apiKey: "pk_test", baseUrl: "https://api.ploid.com", fetchImpl });

    await client.get("/account/credits");

    expect(calls[0]!.url).toBe("https://api.ploid.com/v1/account/credits");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer pk_test");
    expect(headers["User-Agent"]).toBe(USER_AGENT);
  });

  it("strips a trailing slash from the base URL", async () => {
    const { fetchImpl, calls } = mockFetch({ body: { data: null } });
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://api.ploid.com/", fetchImpl });
    await client.get("/account/credits");
    expect(calls[0]!.url).toBe("https://api.ploid.com/v1/account/credits");
  });

  it("appends defined query params and drops undefined ones", async () => {
    const { fetchImpl, calls } = mockFetch({ body: { data: [] } });
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://api.ploid.com", fetchImpl });

    await client.get("/people/batch/abc/results", {
      query: { cursor: 0, limit: 100, skip: undefined },
    });

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("cursor")).toBe("0");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("skip")).toBe(false);
  });

  it("serializes a JSON body and sets Content-Type on POST", async () => {
    const { fetchImpl, calls } = mockFetch({ body: { data: { job_id: "x" } } });
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://api.ploid.com", fetchImpl });

    await client.post("/people/lookup", { body: { name: "Jane" } });

    const init = calls[0]!.init;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "Jane" }));
  });

  it("returns the {data, meta} envelope on success", async () => {
    const { fetchImpl } = mockFetch({ body: { data: { x: 1 }, meta: { total: 1 } } });
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://api.ploid.com", fetchImpl });

    const res = await client.get<{ x: number }>("/foo");
    expect(res.data).toEqual({ x: 1 });
    expect(res.meta).toEqual({ total: 1 });
  });

  it("throws ApiError with code, status, and request_id on failure", async () => {
    const { fetchImpl } = mockFetch({
      status: 402,
      body: { error: { code: "insufficient_credits", message: "Out of credits.", request_id: "req_1" } },
    });
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://api.ploid.com", fetchImpl });

    await expect(client.get("/account/credits")).rejects.toMatchObject({
      name: "ApiError",
      status: 402,
      code: "insufficient_credits",
      requestId: "req_1",
    });
  });

  it("falls back to a synthetic error for non-JSON failures", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("upstream exploded", { status: 502 });
    }) as unknown as typeof fetch;
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://api.ploid.com", fetchImpl });

    const err = await client.get("/foo").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).code).toBe("bad_gateway");
  });

  it("maps a bare 524 gateway response to a gateway_timeout code", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("error code: 524", { status: 524 }),
    ) as unknown as typeof fetch;
    const client = new ApiClient({ apiKey: "k", baseUrl: "https://example.test", fetchImpl });

    const err = await client.get("/people/search").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(524);
    expect((err as ApiError).code).toBe("gateway_timeout");
  });

  it("aborts with request_timeout when the client timeout elapses", async () => {
    const client = new ApiClient({
      apiKey: "k",
      baseUrl: "https://example.test",
      fetchImpl: hangingFetch(),
      timeoutMs: 20,
    });

    const err = await client.post("/people/lookup", { body: { name: "Jane" } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(504);
    expect((err as ApiError).code).toBe("request_timeout");
  });

  it("re-throws a user-initiated abort without wrapping it in ApiError", async () => {
    const controller = new AbortController();
    const client = new ApiClient({
      apiKey: "k",
      baseUrl: "https://example.test",
      fetchImpl: hangingFetch(),
      timeoutMs: 0,
    });

    const promise = client.get("/slow", { signal: controller.signal });
    controller.abort();
    const err = await promise.catch((e) => e);
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as Error).name).toBe("AbortError");
  });

  it("does not time out a fast request when a timeout is configured", async () => {
    const { fetchImpl } = mockFetch({ body: { data: { ok: true } } });
    const client = new ApiClient({
      apiKey: "k",
      baseUrl: "https://example.test",
      fetchImpl,
      timeoutMs: 1000,
    });

    const res = await client.get<{ ok: boolean }>("/account/credits");
    expect(res.data).toEqual({ ok: true });
  });
});

function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

/** A fetch that never resolves on its own — it only rejects when aborted. */
function hangingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) return reject(abortError());
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    });
  }) as unknown as typeof fetch;
}
