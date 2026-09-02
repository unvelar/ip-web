import { describe, expect, test } from "bun:test";
import {
  RequestTimeoutError,
  withRequestTimeout,
} from "../src/lib/requestTimeout";

describe("withRequestTimeout", () => {
  test("returns a request that finishes before its deadline", async () => {
    await expect(withRequestTimeout(
      async () => "done",
      { timeoutMs: 50 },
    )).resolves.toBe("done");
  });

  test("aborts and reports a request that exceeds its deadline", async () => {
    const request = withRequestTimeout(
      (signal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
      { timeoutMs: 5, timeoutMessage: "Slow request" },
    );

    await expect(request).rejects.toEqual(new RequestTimeoutError("Slow request"));
  });

  test("preserves cancellation from the parent signal", async () => {
    const controller = new AbortController();
    const request = withRequestTimeout(
      (signal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
      { signal: controller.signal, timeoutMs: 50 },
    );

    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
