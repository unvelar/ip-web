import { describe, expect, test } from "bun:test";
import { startMonitoringSources } from "../src/lib/startMonitoringSources";

describe("startMonitoringSources", () => {
  test("deduplicates sources and reports bounded progress", async () => {
    const calls: string[] = [];
    const progress: number[] = [];

    const result = await startMonitoringSources(
      ["etsy.com", " ebay.com ", "etsy.com"],
      async (source) => {
        calls.push(source);
        return { jobs_enqueued: 2 };
      },
      (completed) => progress.push(completed),
    );

    expect(calls.sort()).toEqual(["ebay.com", "etsy.com"]);
    expect(result.started.sort()).toEqual(["ebay.com", "etsy.com"]);
    expect(result.failures).toEqual([]);
    expect(result.checksQueued).toBe(4);
    expect(progress.sort()).toEqual([1, 2]);
  });

  test("keeps successful sources separate so callers retry only failures", async () => {
    const result = await startMonitoringSources(
      ["amazon.com", "example.invalid"],
      async (source) => {
        if (source === "example.invalid") throw new Error("unsupported source");
        return { jobs_enqueued: 1 };
      },
    );

    expect(result.started).toEqual(["amazon.com"]);
    expect(result.failures).toEqual([
      { source: "example.invalid", error: "unsupported source" },
    ]);
    expect(result.checksQueued).toBe(1);
  });

  test("does not report monitoring started when the API queued no first check", async () => {
    const result = await startMonitoringSources(
      ["marketplace.example"],
      async () => ({ jobs_enqueued: 0 }),
    );

    expect(result.started).toEqual([]);
    expect(result.failures).toEqual([
      {
        source: "marketplace.example",
        error: "No first monitoring check was queued",
      },
    ]);
    expect(result.checksQueued).toBe(0);
  });
});
