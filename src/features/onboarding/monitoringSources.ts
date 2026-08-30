export interface MonitoringSourceFailure {
  source: string;
  error: string;
}

export interface StartMonitoringSourcesResult {
  started: string[];
  failures: MonitoringSourceFailure[];
  checksQueued: number;
}

/**
 * Start a bounded batch of monitoring sources while preserving enough detail
 * for the caller to retry only failed sources after a partial success.
 */
export async function startMonitoringSources(
  sources: string[],
  startSource: (source: string) => Promise<unknown>,
  onProgress?: (completed: number, total: number) => void,
): Promise<StartMonitoringSourcesResult> {
  const queue = Array.from(
    new Set(sources.map((source) => source.trim()).filter(Boolean)),
  );
  const started: string[] = [];
  const failures: MonitoringSourceFailure[] = [];
  let checksQueued = 0;
  let nextIndex = 0;
  let completed = 0;

  const workers = Array.from(
    { length: Math.min(4, queue.length) },
    async () => {
      while (nextIndex < queue.length) {
        const source = queue[nextIndex++];
        try {
          const result = await startSource(source);
          if (
            result &&
            typeof result === "object" &&
            "jobs_enqueued" in result
          ) {
            const jobsEnqueued = Number(result.jobs_enqueued);
            if (!Number.isInteger(jobsEnqueued) || jobsEnqueued < 1) {
              throw new Error("No first monitoring check was queued");
            }
            checksQueued += jobsEnqueued;
          }
          started.push(source);
        } catch (error) {
          failures.push({
            source,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          completed += 1;
          onProgress?.(completed, queue.length);
        }
      }
    },
  );

  await Promise.all(workers);
  return { started, failures, checksQueued };
}
