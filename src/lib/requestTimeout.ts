export class RequestTimeoutError extends Error {
  constructor(message = "The request timed out") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Give a fetch-backed request its own deadline while preserving cancellation
 * from the caller. The child signal keeps one slow endpoint from pinning a
 * whole page-level Promise.all forever.
 */
export async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: {
    signal?: AbortSignal;
    timeoutMs: number;
    timeoutMessage?: string;
  },
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  try {
    return await request(controller.signal);
  } catch (cause) {
    if (timedOut && !options.signal?.aborted) {
      throw new RequestTimeoutError(options.timeoutMessage);
    }
    throw cause;
  } finally {
    globalThis.clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}
