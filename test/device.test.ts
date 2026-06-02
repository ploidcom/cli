import { describe, expect, it, vi } from "vitest";
import { pollForApproval, type DeviceTokenResponse, type PollDeps } from "../src/device.js";
import { CliError } from "../src/errors.js";

const APPROVED: DeviceTokenResponse = {
  status: "approved",
  api_key: "ploid_live_abc",
  key_prefix: "ploid_live_abc",
  scopes: ["people:search"],
  organization_id: "org_1",
};

function deps(
  responses: DeviceTokenResponse[],
  overrides: Partial<PollDeps> = {},
): { deps: PollDeps; sleeps: number[] } {
  const sleeps: number[] = [];
  let i = 0;
  return {
    sleeps,
    deps: {
      poll: vi.fn(async () => responses[Math.min(i++, responses.length - 1)]!),
      sleep: vi.fn(async (ms: number) => {
        sleeps.push(ms);
      }),
      now: () => 1_000, // constant: deadline never reached unless expiresIn is 0
      ...overrides,
    },
  };
}

describe("pollForApproval", () => {
  it("resolves with the approved token after pending polls", async () => {
    const { deps: d } = deps([{ status: "pending" }, { status: "pending" }, APPROVED]);
    const result = await pollForApproval("dc", { expiresIn: 900, interval: 5 }, d);
    expect(result.api_key).toBe("ploid_live_abc");
    expect(d.poll).toHaveBeenCalledTimes(3);
  });

  it("backs off the interval on slow_down", async () => {
    const { deps: d, sleeps } = deps([{ status: "slow_down" }, APPROVED]);
    await pollForApproval("dc", { expiresIn: 900, interval: 5 }, d);
    // First sleep at 5s, second sleep increased by 2s.
    expect(sleeps[0]).toBe(5_000);
    expect(sleeps[1]).toBe(7_000);
  });

  it("throws a CliError (exit 1) when denied", async () => {
    const { deps: d } = deps([{ status: "denied" }]);
    const err = await pollForApproval("dc", { expiresIn: 900, interval: 5 }, d).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).exitCode).toBe(1);
  });

  it("throws a CliError (exit 2) when the server reports expired", async () => {
    const { deps: d } = deps([{ status: "expired" }]);
    const err = await pollForApproval("dc", { expiresIn: 900, interval: 5 }, d).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).exitCode).toBe(2);
  });

  it("times out (exit 2) without polling once the deadline has passed", async () => {
    const { deps: d } = deps([APPROVED], { now: () => 1_000 });
    // expiresIn 0 → deadline equals the first now() reading, so it bails immediately.
    const err = await pollForApproval("dc", { expiresIn: 0, interval: 5 }, d).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).exitCode).toBe(2);
    expect(d.poll).not.toHaveBeenCalled();
  });
});
