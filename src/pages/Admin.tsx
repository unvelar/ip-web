import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Clock3, Cpu, GitBranch, Inbox, Server } from "lucide-react";
import {
  ADMIN_SOURCES,
  getComputeProfiles,
  getComputeRuntimeSettings,
  patchComputeJobRoute,
  patchComputeProfileSettings,
  patchComputeRuntimeSettings,
  searchAdminIps,
  type AdminIpSummary,
  type ComputeJobRoute,
  type ComputeProfileRecord,
  type ComputeRuntimeSettingsRecord,
} from "../api";

const SOURCE_LABELS: Record<string, string> = {
  tenant_trademark: "Tenant",
  euipo_trademark: "EUIPO",
  wipo_design: "WIPO",
  giantbomb: "Giantbomb",
  anilist: "Anilist",
};

const PAGE_SIZE = 50;

export default function Admin() {
  const [ips, setIps] = useState<AdminIpSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compute, setCompute] = useState<ComputeRuntimeSettingsRecord | null>(null);
  const [computeLoading, setComputeLoading] = useState(true);
  const [computeError, setComputeError] = useState("");
  const [computeNotice, setComputeNotice] = useState("");
  const [minimumPods, setMinimumPods] = useState(1);
  const [maxPodsDraft, setMaxPodsDraft] = useState("");
  const [jobsPerPodTargetDraft, setJobsPerPodTargetDraft] = useState("");
  const [savingWindow, setSavingWindow] = useState<number | "cancel" | null>(null);
  const [savingAutoscaling, setSavingAutoscaling] = useState(false);
  const [profiles, setProfiles] = useState<ComputeProfileRecord[]>([]);
  const [routes, setRoutes] = useState<ComputeJobRoute[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileDrafts, setProfileDrafts] = useState<Record<string, {
    gpuTypeIds: string;
    minimumGpuMemoryGb: string;
  }>>({});
  const [routeDrafts, setRouteDrafts] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState<string | null>(null);
  const [savingRoute, setSavingRoute] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getComputeRuntimeSettings()
      .then((record) => {
        if (cancelled) return;
        setCompute(record);
        setMinimumPods(Math.max(1, record.settings.minimumPods ?? 1));
        setMaxPodsDraft(String(record.settings.maxPods));
        setJobsPerPodTargetDraft(String(record.settings.jobsPerPodTarget));
      })
      .catch((e: unknown) => {
        if (!cancelled) setComputeError(e instanceof Error ? e.message : "Could not load RunPod settings");
      })
      .finally(() => {
        if (!cancelled) setComputeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadComputeProfiles() {
    try {
      const response = await getComputeProfiles();
      setProfiles(response.profiles);
      setRoutes(response.routes);
      setProfileDrafts(Object.fromEntries(response.profiles.map((profile) => [
        profile.pool,
        {
          gpuTypeIds: profile.settings.gpuTypeIds.join(", "),
          minimumGpuMemoryGb: String(profile.settings.minimumGpuMemoryGb),
        },
      ])));
      setRouteDrafts(Object.fromEntries(response.routes.map((route) => [
        route.job_type,
        route.execution_class,
      ])));
      setProfilesError("");
    } catch (e: unknown) {
      setProfilesError(e instanceof Error ? e.message : "Could not load compute profiles");
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    void loadComputeProfiles();
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    // Debounce the text query so each keystroke doesn't hit the API.
    const handle = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await searchAdminIps({
          source: source || undefined,
          q: query.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        setIps(res.ips);
        setTotal(res.total);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [source, query, offset]);

  const minimumUntil = compute?.settings.minimumPodsUntil ?? null;
  const configuredMinimum = compute?.settings.minimumPods ?? 0;
  const maximumPods = compute?.settings.maxPods ?? 0;
  const scalingDirty = compute !== null
    && (Number(maxPodsDraft) !== compute.settings.maxPods
      || Number(jobsPerPodTargetDraft) !== compute.settings.jobsPerPodTarget);
  const minimumActive = configuredMinimum > 0
    && minimumUntil !== null
    && Date.parse(minimumUntil) > now;

  async function saveAutoscalingLimits() {
    if (!compute) return;
    const maxPods = Number(maxPodsDraft);
    const jobsPerPodTarget = Number(jobsPerPodTargetDraft);
    if (!Number.isInteger(maxPods) || maxPods < 0 || maxPods > 20) {
      setComputeError("Maximum pods must be a whole number between 0 and 20.");
      return;
    }
    if (!Number.isInteger(jobsPerPodTarget)
      || jobsPerPodTarget < 1
      || jobsPerPodTarget > 1_000_000) {
      setComputeError("Additional pod target must be a whole number between 1 and 1,000,000.");
      return;
    }
    if ((compute.settings.minimumPods ?? 0) > maxPods) {
      setComputeError("Maximum pods cannot be lower than the active minimum-pod setting.");
      return;
    }
    setSavingAutoscaling(true);
    setComputeError("");
    setComputeNotice("");
    try {
      const updated = await patchComputeRuntimeSettings(compute.version, {
        maxPods,
        jobsPerPodTarget,
      });
      setCompute(updated);
      setMaxPodsDraft(String(updated.settings.maxPods));
      setJobsPerPodTargetDraft(String(updated.settings.jobsPerPodTarget));
      setComputeNotice(
        `Autoscaling saved: maximum ${maxPods} pods, one additional pod per ${jobsPerPodTarget} queued capacity units.`,
      );
    } catch (e: unknown) {
      setComputeError(e instanceof Error ? e.message : "Could not update RunPod autoscaling");
    } finally {
      setSavingAutoscaling(false);
    }
  }

  async function saveMinimumWindow(durationHours: 4 | 8 | 24) {
    if (!compute) return;
    setSavingWindow(durationHours);
    setComputeError("");
    setComputeNotice("");
    try {
      const updated = await patchComputeRuntimeSettings(compute.version, {
        minimumPods,
      }, durationHours);
      setCompute(updated);
      setNow(Date.now());
      setComputeNotice(
        `${minimumPods} pod${minimumPods === 1 ? "" : "s"} requested for ${durationHours} hours.`,
      );
    } catch (e: unknown) {
      setComputeError(e instanceof Error ? e.message : "Could not update RunPod capacity");
    } finally {
      setSavingWindow(null);
    }
  }

  async function cancelMinimumWindow() {
    if (!compute) return;
    setSavingWindow("cancel");
    setComputeError("");
    setComputeNotice("");
    try {
      const updated = await patchComputeRuntimeSettings(compute.version, {
        minimumPods: 0,
        minimumPodsUntil: null,
      });
      setCompute(updated);
      setNow(Date.now());
      setComputeNotice("Minimum capacity ended; queue-driven scaling resumed.");
    } catch (e: unknown) {
      setComputeError(e instanceof Error ? e.message : "Could not end RunPod capacity window");
    } finally {
      setSavingWindow(null);
    }
  }

  async function saveProfileHardware(profile: ComputeProfileRecord) {
    const draft = profileDrafts[profile.pool];
    if (!draft) return;
    const gpuTypeIds = Array.from(new Set(
      draft.gpuTypeIds.split(",").map((value) => value.trim()).filter(Boolean),
    ));
    const minimumGpuMemoryGb = Number(draft.minimumGpuMemoryGb);
    if (gpuTypeIds.length === 0) {
      setProfilesError(`${profile.pool} needs at least one RunPod GPU type ID.`);
      return;
    }
    if (!Number.isFinite(minimumGpuMemoryGb)
      || minimumGpuMemoryGb < 1
      || minimumGpuMemoryGb > 200) {
      setProfilesError("Minimum GPU memory must be between 1 and 200 GiB.");
      return;
    }
    setSavingProfile(profile.pool);
    setProfilesError("");
    setProfileNotice("");
    try {
      await patchComputeProfileSettings(profile.pool, profile.version, {
        gpuTypeIds,
        minimumGpuMemoryGb,
      });
      await loadComputeProfiles();
      setProfileNotice(`${profile.pool} hardware profile saved. Existing pods will drain.`);
    } catch (e: unknown) {
      setProfilesError(e instanceof Error ? e.message : "Could not update compute profile");
    } finally {
      setSavingProfile(null);
    }
  }

  async function saveJobRoute(route: ComputeJobRoute) {
    const executionClass = routeDrafts[route.job_type];
    if (!executionClass || executionClass === route.execution_class) return;
    setSavingRoute(route.job_type);
    setProfilesError("");
    setProfileNotice("");
    try {
      await patchComputeJobRoute(route.job_type, executionClass, route.version);
      await loadComputeProfiles();
      setProfileNotice(
        `${formatJobType(route.job_type)} will use ${executionClass} for newly queued jobs.`,
      );
    } catch (e: unknown) {
      setProfilesError(e instanceof Error ? e.message : "Could not update job route");
    } finally {
      setSavingRoute(null);
    }
  }

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setOffset(0);
  }, [source, query]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Admin · IP Catalog</h1>
          <p className="mt-1 text-sm text-stone-500">
            Search every IP across all catalogs. Open one to manage its reference images and caption.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/tenants"
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
          >
            <Building2 size={15} />
            Tenants
          </Link>
          <Link
            to="/admin/intakes"
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-stone-200 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
          >
            <Inbox size={15} />
            Public intakes
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white">
              <Server size={18} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-stone-900">RunPod warm capacity</h2>
                {minimumActive ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    Queue-driven
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-xl text-sm text-stone-500">
                Keep a minimum number of GPU pods online for a fixed window. Autoscaling can still add more when the queue needs them.
              </p>
              {minimumActive && minimumUntil && (
                <p
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
                  role="status"
                  aria-live="polite"
                >
                  <Clock3 size={13} />
                  At least {configuredMinimum} pod{configuredMinimum === 1 ? "" : "s"} until {formatCapacityDeadline(minimumUntil)}
                  {` · ${formatRemaining(Date.parse(minimumUntil) - now)} remaining`}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-xs font-semibold text-stone-600">
              Minimum pods
              <select
                value={minimumPods}
                onChange={(event) => setMinimumPods(Number(event.target.value))}
                disabled={computeLoading || !compute || maximumPods < 1 || savingWindow !== null || savingAutoscaling}
                className="h-11 min-w-28 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 disabled:opacity-50"
              >
                {maximumPods < 1
                  ? <option value={1}>Unavailable</option>
                  : Array.from({ length: maximumPods }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {([4, 8, 24] as const).map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => void saveMinimumWindow(hours)}
                  aria-label={`Keep at least ${minimumPods} pod${minimumPods === 1 ? "" : "s"} warm for ${hours} hours`}
                  disabled={computeLoading || !compute || maximumPods < 1 || savingWindow !== null || savingAutoscaling}
                  className="h-11 rounded-lg bg-stone-900 px-3 text-xs font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingWindow === hours ? "Saving…" : `${hours}h`}
                </button>
              ))}
              {minimumActive && (
                <button
                  type="button"
                  onClick={() => void cancelMinimumWindow()}
                  disabled={savingWindow !== null || savingAutoscaling}
                  className="h-11 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  {savingWindow === "cancel" ? "Ending…" : "End early"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-100 pt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Queue scaling</h3>
              <p className="mt-1 max-w-xl text-xs text-stone-500">
                Cap the fleet, then add one pod for each target-sized band above the first-pod threshold.
              </p>
              {compute && (
                <p className="mt-2 text-xs font-medium text-stone-600">
                  First pod threshold: more than {compute.settings.firstPodQueueThreshold.toLocaleString()} queued capacity units.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="grid gap-1 text-xs font-semibold text-stone-600">
                Maximum pods
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={maxPodsDraft}
                  onChange={(event) => setMaxPodsDraft(event.target.value)}
                  disabled={computeLoading || !compute || savingAutoscaling || savingWindow !== null}
                  className="h-11 w-32 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 disabled:opacity-50"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-stone-600">
                Additional pod target
                <input
                  type="number"
                  min={1}
                  max={1_000_000}
                  step={1}
                  value={jobsPerPodTargetDraft}
                  onChange={(event) => setJobsPerPodTargetDraft(event.target.value)}
                  disabled={computeLoading || !compute || savingAutoscaling || savingWindow !== null}
                  className="h-11 w-44 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                onClick={() => void saveAutoscalingLimits()}
                disabled={computeLoading || !compute || !scalingDirty || savingAutoscaling || savingWindow !== null}
                className="h-11 rounded-lg bg-stone-900 px-4 text-xs font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingAutoscaling ? "Saving…" : "Save scaling"}
              </button>
            </div>
          </div>
        </div>
        {computeError && <p className="mt-3 text-xs font-medium text-red-700" role="alert">{computeError}</p>}
        {computeNotice && (
          <p className="mt-3 text-xs font-medium text-emerald-700" role="status" aria-live="polite">
            {computeNotice}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-100">
        <div className="border-b border-stone-100 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <GitBranch size={18} />
            </div>
            <div>
              <h2 className="font-bold text-stone-900">GPU execution profiles</h2>
              <p className="mt-1 max-w-2xl text-sm text-stone-500">
                Route each managed job to a compatible worker runtime, then choose the RunPod GPU types allowed for that profile.
              </p>
              <p className="mt-2 text-xs font-medium text-amber-700">
                Route edits affect newly queued jobs. Existing queued jobs keep the execution class they received when created.
              </p>
            </div>
          </div>
          {profilesError && <p className="mt-3 text-xs font-medium text-red-700" role="alert">{profilesError}</p>}
          {profileNotice && (
            <p className="mt-3 text-xs font-medium text-emerald-700" role="status" aria-live="polite">
              {profileNotice}
            </p>
          )}
        </div>

        {profilesLoading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-stone-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
            Loading profiles
          </div>
        ) : (
          <>
            <div className="grid gap-4 border-b border-stone-100 p-5 lg:grid-cols-2">
              {profiles.map((profile) => {
                const draft = profileDrafts[profile.pool];
                const status = profile.status;
                const hasHardwareChanges = Boolean(draft) && (
                  draft.gpuTypeIds !== profile.settings.gpuTypeIds.join(", ")
                  || Number(draft.minimumGpuMemoryGb) !== profile.settings.minimumGpuMemoryGb
                );
                return (
                  <article key={profile.pool} className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700">
                          <Cpu size={17} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-stone-900">{profile.pool}</h3>
                          <p className="text-[11px] text-stone-500">
                            {profile.settings.executionClass} · revision {profile.profile_revision}
                          </p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        status?.last_error
                          ? "bg-red-50 text-red-700"
                          : status?.ready_instances
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-stone-100 text-stone-500"
                      }`}>
                        {status?.last_error ? "Error" : status?.ready_instances ? "Ready" : "Idle"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <ProfileMetric label="Runtime" value={profile.settings.runtimeMode === "product_cuda" ? "Product CUDA" : "vLLM"} />
                      <ProfileMetric label="Queue" value={String(status?.pending_jobs ?? 0)} />
                      <ProfileMetric label="Ready pods" value={String(status?.ready_instances ?? 0)} />
                    </div>

                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-1.5 text-xs font-semibold text-stone-600">
                        Allowed RunPod GPU type IDs
                        <textarea
                          rows={2}
                          value={draft?.gpuTypeIds ?? ""}
                          onChange={(event) => setProfileDrafts((current) => ({
                            ...current,
                            [profile.pool]: {
                              gpuTypeIds: event.target.value,
                              minimumGpuMemoryGb: current[profile.pool]?.minimumGpuMemoryGb ?? "",
                            },
                          }))}
                          className="resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-stone-800 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/10"
                        />
                      </label>
                      <div className="flex items-end gap-2">
                        <label className="grid flex-1 gap-1.5 text-xs font-semibold text-stone-600">
                          Minimum observed VRAM
                          <div className="relative">
                            <input
                              type="number"
                              min={1}
                              max={200}
                              step={1}
                              value={draft?.minimumGpuMemoryGb ?? ""}
                              onChange={(event) => setProfileDrafts((current) => ({
                                ...current,
                                [profile.pool]: {
                                  gpuTypeIds: current[profile.pool]?.gpuTypeIds ?? "",
                                  minimumGpuMemoryGb: event.target.value,
                                },
                              }))}
                              className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 pr-12 text-sm font-semibold text-stone-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/10"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-stone-400">GiB</span>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => void saveProfileHardware(profile)}
                          disabled={!hasHardwareChanges || savingProfile !== null}
                          className="h-10 rounded-lg bg-stone-900 px-3 text-xs font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {savingProfile === profile.pool ? "Saving…" : "Save profile"}
                        </button>
                      </div>
                    </div>
                    {status?.last_error && <p className="mt-3 text-xs text-red-700">{status.last_error}</p>}
                  </article>
                );
              })}
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Job routing</h3>
                  <p className="mt-0.5 text-xs text-stone-500">Only profiles whose runtime supports the job are selectable.</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table className="min-w-full divide-y divide-stone-200 text-left">
                  <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-3 py-2.5">Job</th>
                      <th className="px-3 py-2.5">Execution class</th>
                      <th className="px-3 py-2.5 text-right">Apply</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {routes.map((route) => {
                      const compatibleProfiles = profiles.filter((profile) => (
                        profile.settings.runtimeMode === "product_cuda"
                          ? route.job_type === "product_profile"
                          : route.job_type !== "product_profile"
                      ));
                      const selected = routeDrafts[route.job_type] ?? route.execution_class;
                      return (
                        <tr key={route.job_type}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-stone-800">
                            {formatJobType(route.job_type)}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={selected}
                              onChange={(event) => setRouteDrafts((current) => ({
                                ...current,
                                [route.job_type]: event.target.value,
                              }))}
                              className="h-9 min-w-56 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-800 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/10"
                            >
                              {compatibleProfiles.map((profile) => (
                                <option key={profile.settings.executionClass} value={profile.settings.executionClass}>
                                  {profile.pool} · {profile.settings.executionClass}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => void saveJobRoute(route)}
                              disabled={selected === route.execution_class || savingRoute !== null}
                              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {savingRoute === route.job_type ? "Applying…" : "Apply"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or alias…"
          className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-4 py-2.5 border border-stone-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all"
        >
          <option value="">All sources</option>
          {ADMIN_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-stone-500">
        {loading ? "Searching…" : `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
      </p>

      {/* Results */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ips.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-500 text-sm">No IPs match.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {ips.map((ip) => (
            <Link
              key={ip.id}
              to={`/admin/ips/${encodeURIComponent(ip.id)}`}
              className="group bg-white rounded-xl border border-stone-200 px-5 py-4 hover:border-stone-300 hover:shadow-md hover:shadow-stone-100 transition-all flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h3 className="font-bold text-stone-900 group-hover:text-red-700 transition-colors truncate">
                  {ip.name || "(unnamed)"}
                </h3>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                  <span className="inline-block text-[10px] font-semibold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                    {SOURCE_LABELS[ip.source] ?? ip.source}
                  </span>
                  {ip.entity_type && <span className="text-stone-400">{ip.entity_type}</span>}
                  <span className="text-stone-300">·</span>
                  <span>
                    {ip.image_count} image{ip.image_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {ip.has_caption && (
                  <span className="inline-block text-[10px] font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                    caption
                  </span>
                )}
                <StatusBadge ip={ip} />
                <span className="text-stone-300 group-hover:text-stone-500 transition-colors">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-all"
          >
            ← Prev
          </button>
          <span className="text-xs text-stone-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={page >= pages}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function formatCapacityDeadline(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatJobType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-bold text-stone-800" title={value}>{value}</p>
    </div>
  );
}

function StatusBadge({ ip }: { ip: AdminIpSummary }) {
  if (ip.centroid_ready) {
    return (
      <span className="inline-block text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
        Indexed
      </span>
    );
  }
  if (ip.indexed_count > 0) {
    return (
      <span className="inline-block text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">
        Partial
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-semibold text-stone-400 bg-stone-50 px-2.5 py-0.5 rounded-full">
      Pending
    </span>
  );
}
