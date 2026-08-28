import {
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import type {
  IpOnboardingCheckStatus,
  IpOnboardingState,
  IpOnboardingStatus,
} from "../../api";

const stateStyles: Record<IpOnboardingState, {
  container: string;
  icon: string;
  badge: string;
}> = {
  setup_required: {
    container: "border-amber-200 bg-amber-50/70",
    icon: "text-amber-700",
    badge: "border-amber-200 bg-white text-amber-800",
  },
  processing: {
    container: "border-blue-200 bg-blue-50/60",
    icon: "text-blue-700",
    badge: "border-blue-200 bg-white text-blue-800",
  },
  delayed: {
    container: "border-amber-200 bg-amber-50/70",
    icon: "text-amber-700",
    badge: "border-amber-200 bg-white text-amber-800",
  },
  active: {
    container: "border-emerald-200 bg-emerald-50/60",
    icon: "text-emerald-700",
    badge: "border-emerald-200 bg-white text-emerald-800",
  },
  needs_attention: {
    container: "border-rose-200 bg-rose-50/70",
    icon: "text-rose-700",
    badge: "border-rose-200 bg-white text-rose-800",
  },
};

function StateIcon({ state }: { state: IpOnboardingState }) {
  const className = `h-5 w-5 ${stateStyles[state].icon}`;
  if (state === "active") return <CheckCircle2 className={className} aria-hidden="true" />;
  if (state === "processing") {
    return <LoaderCircle className={`${className} animate-spin`} aria-hidden="true" />;
  }
  if (state === "delayed") return <Clock3 className={className} aria-hidden="true" />;
  if (state === "needs_attention") {
    return <TriangleAlert className={className} aria-hidden="true" />;
  }
  return <CircleAlert className={className} aria-hidden="true" />;
}

function CheckIcon({ status }: { status: IpOnboardingCheckStatus }) {
  if (status === "complete") {
    return <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />;
  }
  if (status === "processing") {
    return <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />;
  }
  if (status === "attention") {
    return <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />;
  }
  if (status === "missing") {
    return <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />;
  }
  return <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />;
}

export function IpOnboardingStatusCard({
  status,
  loading = false,
  error = "",
  compact = false,
}: {
  status: IpOnboardingStatus | null;
  loading?: boolean;
  error?: string;
  compact?: boolean;
}) {
  if (!status && loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500 flex items-center gap-2">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking setup status…
      </div>
    );
  }

  if (!status) {
    if (!error) return null;
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Setup status is temporarily unavailable. Refresh the page to try again.
      </div>
    );
  }

  const styles = stateStyles[status.state];
  const badge = status.customer_action_required
    ? "Action required"
    : status.state === "active"
      ? "Ready"
      : "No action needed";

  return (
    <section
      className={`rounded-xl border ${styles.container} ${compact ? "p-4" : "p-5"}`}
      aria-label="IP setup status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StateIcon state={status.state} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-stone-900">{status.title}</h2>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles.badge}`}>
              {badge}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-stone-700">{status.message}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {status.checks.map((check) => (
          <div key={check.key} className="flex items-start gap-2 rounded-lg border border-black/5 bg-white/70 px-3 py-2.5">
            <CheckIcon status={check.status} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-stone-800">{check.label}</p>
              <p className="mt-0.5 text-xs leading-4 text-stone-600">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
