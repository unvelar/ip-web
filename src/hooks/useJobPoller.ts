import { useState, useEffect, useRef } from "react";
import { getJob, type Job } from "../api";

export function useJobPoller(jobId: string | null, interval = 3000) {
  const [job, setJob] = useState<Job | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    let active = true;

    async function poll() {
      try {
        const j = await getJob(jobId!);
        if (!active) return;
        setJob(j);
        if (j.status === "completed" || j.status === "failed") {
          clearInterval(timerRef.current);
        }
      } catch {
        // ignore poll errors
      }
    }

    poll();
    timerRef.current = setInterval(poll, interval);

    return () => {
      active = false;
      clearInterval(timerRef.current);
    };
  }, [jobId, interval]);

  return job;
}
