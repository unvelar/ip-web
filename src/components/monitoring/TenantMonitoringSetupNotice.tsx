import { CircleAlert, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { IpOnboardingStatus } from "../../api";

export function TenantMonitoringSetupNotice({
  ipId,
  status,
}: {
  ipId: string;
  status: IpOnboardingStatus | null;
}) {
  if (!status?.customer_action_required) return null;

  const missing = status.checks.filter((check) => check.status === "missing");
  const ipHref = `/ips/${encodeURIComponent(ipId)}`;
  const checkHref = {
    reference_images: `${ipHref}#reference-images`,
    keywords: `${ipHref}#keywords`,
    monitoring_sources: "/monitoring/setup",
    first_scan: ipHref,
  };

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
      aria-label="Monitoring setup action required"
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-stone-900">Finish monitoring setup</h2>
          <p className="mt-1 text-sm text-stone-700">Complete the missing items so monitoring can start.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.length ? missing.map((check) => (
              <Link
                key={check.key}
                to={checkHref[check.key]}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:border-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
              >
                {check.detail}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )) : (
              <Link to={ipHref} className="text-xs font-semibold text-stone-800 underline">Review IP setup</Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
