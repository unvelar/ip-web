import { useEffect, useRef, useState } from "react";
import { createActivityReader, getAttempts, getLiveJob, type Snapshot, type Attempt } from "./api";
import { jobActivity, type Activity } from "./model";

export function useLlmActivity(paused: boolean, bufferChanges = false) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reader = useRef<ReturnType<typeof createActivityReader> | null>(null);
  const visible = useRef<Snapshot | null>(null);
  const pause = useRef(paused);
  const buffer = useRef(bufferChanges);
  useEffect(() => { pause.current = paused; buffer.current = bufferChanges; }, [paused, bufferChanges]);
  useEffect(() => {
    reader.current ??= createActivityReader();
    const controller = new AbortController(); let timer: number | undefined; let historyTimer: number | undefined;
    const history = async () => {
      if (!document.hidden && !pause.current) await reader.current!.loadHistory(controller.signal);
      if (!controller.signal.aborted) historyTimer = window.setTimeout(history, 60000);
    };
    historyTimer = window.setTimeout(history, 15000);
    const poll = async () => {
      if (!document.hidden && !pause.current) {
        try {
          const next = await reader.current!(controller.signal);
          if (controller.signal.aborted) return;
          const previous = visible.current;
          const changed = !previous || next.jobs.length !== previous.jobs.length || next.jobs.some(job => {
            const before = previous.jobs.find(row => row.id === job.id);
            return !before || before.state !== job.state || before.attempt !== job.attempt || before.started !== job.started || JSON.stringify(before.raw) !== JSON.stringify(job.raw);
          });
          if (!previous || !changed || !buffer.current) { visible.current = next; setSnapshot(next); setPending(null); } else setPending(next);
          setError(null); setWarning(next.warning);
        } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Worker activity could not be loaded"); }
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 10000);
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); window.clearTimeout(historyTimer); };
  }, [revision]);
  const changed = pending ? pending.jobs.filter(job => { const previous = snapshot?.jobs.find(row => row.id === job.id); return !previous || previous.state !== job.state || previous.attempt !== job.attempt || previous.started !== job.started || JSON.stringify(previous.raw) !== JSON.stringify(job.raw); }).length : 0;
  return { snapshot, error, warning, loading: !snapshot && !error, pending: changed,
    applyUpdates() { if (pending) { visible.current = pending; setSnapshot(pending); setPending(null); } },
    refresh() { setRevision(value => value + 1); },
  };
}

export function useJobInspector(selected: Activity | null, workers: NonNullable<ReturnType<typeof useLlmActivity>["snapshot"]>["workers"], paused: boolean) {
  const [detail, setDetail] = useState<{ id: string; activity: Activity; attempts: Attempt[]; error: string | null } | null>(null);
  const context = useRef({ selected, workers });
  useEffect(() => { context.current = { selected, workers }; }, [selected, workers]);
  const id = selected?.id;
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(); let timer: number | undefined;
    const poll = async () => {
      if (document.hidden) { if (!paused && !controller.signal.aborted) timer = window.setTimeout(poll, 10000); return; }
      try {
        const results = await Promise.allSettled([getLiveJob(id, controller.signal), getAttempts(id, controller.signal)]);
        if (controller.signal.aborted || context.current.selected?.id !== id) return;
        const [job, history] = results;
        if (job.status === "rejected") throw job.reason;
        const source = context.current.selected!;
        const activity = jobActivity(job.value, context.current.workers, { tenant: source.tenant, context: source.context });
        if (activity.provider === "Unrecorded") activity.provider = source.provider;
        setDetail({ id, activity, attempts: history.status === "fulfilled" ? history.value : [], error: history.status === "rejected" ? "Attempt history could not be loaded." : null });
      } catch (reason) { if (!controller.signal.aborted) setDetail({ id, activity: context.current.selected!, attempts: [], error: reason instanceof Error ? reason.message : "Job output could not be loaded" }); }
      if (!controller.signal.aborted && !paused) timer = window.setTimeout(poll, 10000);
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [id, paused]);
  return detail?.id === id ? detail : null;
}
