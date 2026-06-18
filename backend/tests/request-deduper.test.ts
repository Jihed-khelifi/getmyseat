import { describe, expect, it } from "vitest";

import { RequestDeduper } from "../src/services/request-deduper.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("RequestDeduper", () => {
  it("shares a single in-flight call across concurrent callers for the same key", async () => {
    const deduper = new RequestDeduper<number>();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      await sleep(20);
      return 42;
    };

    const [a, b] = await Promise.all([
      deduper.run("k", fn),
      deduper.run("k", fn),
    ]);

    expect(calls).toBe(1);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(deduper.inFlightCount).toBe(0);
  });

  it("cleans up the in-flight entry even when the call rejects", async () => {
    const deduper = new RequestDeduper<number>();
    await expect(
      deduper.run("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(deduper.inFlightCount).toBe(0);
  });

  it("fetches again once the previous call has settled", async () => {
    const deduper = new RequestDeduper<number>();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };

    await deduper.run("k", fn);
    await deduper.run("k", fn);

    expect(calls).toBe(2);
  });
});
