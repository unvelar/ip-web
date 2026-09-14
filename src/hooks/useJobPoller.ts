import { useState, useEffect } from "react";
import { getJob, type Job } from "../api/jobs";
import { withRequestTimeout } from "../lib/requestTimeout";

export function useJobPoller(jobId: string | null, interval = 3000) {
  const [state, setState] = useState<{ jobId: string; job: Job | null; error: string } | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ jobId: id, job: null, error: "" });

    async function poll() {
      try {
        const job = await withRequestTimeout((signal) => getJob(id, signal), {
          signal: controller.signal,
          timeoutMs: 8_000,
          timeoutMessage: "Indexing status request timed out",
        });
        if (controller.signal.aborted) return;
        setState({ jobId: id, job, error: "" });
        if (job.status === "completed" || job.status === "failed") return;
      } catch (caught) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          jobId: id,
          job: current?.jobId === id ? current.job : null,
          error: caught instanceof Error ? caught.message : "Unable to load indexing status",
        }));
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), interval);
    }

    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, interval]);

  return {
    job: state?.jobId === jobId ? state?.job ?? null : null,
    error: state?.jobId === jobId ? state?.error ?? "" : "",
  };
}
