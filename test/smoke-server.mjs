import { createServer } from "node:http";

// Minimal fake Ploid API for CLI smoke testing. Records requests and returns
// canned envelopes. Used by smoke.sh, not part of the published package.
let pollCount = 0;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    process.stderr.write(`[server] ${req.method} ${url.pathname}${url.search} ua=${req.headers["user-agent"]} auth=${req.headers["authorization"]}\n`);

    const send = (status, payload) => {
      res.statusCode = status;
      res.end(JSON.stringify(payload));
    };

    if (url.pathname === "/v1/account/credits") {
      return send(200, { data: { available_credits: 4200, available_balance_usd: 42 }, meta: {} });
    }
    if (url.pathname === "/v1/people/lookup") {
      return send(200, { data: { name: JSON.parse(body).name, source: "ploid" }, meta: { found: true } });
    }
    if (url.pathname === "/v1/people/batch/enrich") {
      return send(202, { data: { job_id: "batch_test", status: "queued", estimated_cost_usd: 1.5 }, meta: {} });
    }
    if (url.pathname === "/v1/people/batch/batch_test") {
      pollCount += 1;
      const status = pollCount >= 2 ? "completed" : "running";
      return send(200, { data: { job_id: "batch_test", status, total: 2, completed: pollCount >= 2 ? 2 : 1 }, meta: {} });
    }
    if (url.pathname === "/v1/people/batch/batch_test/results") {
      return send(200, { data: [{ index: 0, status: "found" }, { index: 1, status: "found" }], meta: { next_cursor: null } });
    }
    if (url.pathname === "/v1/linkedin") {
      return send(200, { data: [{ slug: "profile", summary: "Get a profile" }], meta: {} });
    }
    if (url.pathname === "/v1/linkedin/profile") {
      return send(200, { data: { url: url.searchParams.get("url"), passthrough: true }, meta: {} });
    }
    if (url.pathname === "/v1/openapi.json") {
      return send(200, { openapi: "3.1.0", info: { title: "Ploid" } });
    }
    return send(404, { error: { code: "not_found", message: `no route ${url.pathname}`, request_id: "req_smoke" } });
  });
});

server.listen(0, () => {
  const { port } = server.address();
  process.stdout.write(`${port}\n`);
});
