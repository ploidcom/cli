import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pollCount = 0;

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.url === "/api/auth/device/start" && req.method === "POST") {
    await readBody(req);
    return send(200, {
      device_code: "dc_smoke_123",
      user_code: "WDJB-MJHT",
      verification_uri: "http://example.test/auth/cli",
      verification_uri_complete: "http://example.test/auth/cli?code=WDJB-MJHT",
      expires_in: 900,
      interval: 1,
    });
  }
  if (req.url === "/api/auth/device/token" && req.method === "POST") {
    await readBody(req);
    pollCount += 1;
    if (pollCount < 2) return send(200, { status: "pending", interval: 1 });
    return send(200, {
      status: "approved",
      api_key: "ploid_live_smoketestkey",
      key_prefix: "ploid_live_smoke",
      organization_id: "org_smoke",
      scopes: ["people:search", "account:read"],
    });
  }
  return send(404, { error: "not_found", message: "no route" });
});

server.listen(0, () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cfgDir = mkdtempSync(join(tmpdir(), "ploid-cli-smoke-"));

  // Async spawn so this process's event loop keeps running and the mock
  // server can answer the CLI's requests (spawnSync would deadlock).
  const child = spawn(
    process.execPath,
    ["dist/cli.js", "login", "--no-browser", "--base-url", baseUrl],
    { env: { ...process.env, XDG_CONFIG_HOME: cfgDir } },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c));
  child.stderr.on("data", (c) => (stderr += c));

  child.on("exit", (code) => {
    console.log("── exit code:", code);
    console.log("── stderr:\n" + stderr);
    console.log("── stdout:\n" + stdout);

    let ok = code === 0;
    try {
      const cfg = JSON.parse(readFileSync(join(cfgDir, "ploid", "config.json"), "utf8"));
      console.log("── saved config:", JSON.stringify(cfg));
      if (cfg.api_key !== "ploid_live_smoketestkey") {
        console.error("FAIL: api_key not saved correctly");
        ok = false;
      }
    } catch (err) {
      console.error("FAIL: could not read saved config:", err.message);
      ok = false;
    }

    rmSync(cfgDir, { recursive: true, force: true });
    server.close();
    console.log(ok ? "\nSMOKE OK" : "\nSMOKE FAILED");
    process.exit(ok ? 0 : 1);
  });
});
