import { Check, CircleAlert, CircleDashed, ImageIcon, LoaderCircle, Radar, Search, ScanLine, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { IpOnboardingStatus } from "../api";

export function IpSettingsHeading({ icon: Icon, title, description, aside }: { icon: LucideIcon; title: string; description?: string; aside?: string }) {
  return <div className="ip-section-heading"><span className="ip-section-icon"><Icon size={17} aria-hidden="true" /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{aside && <span className="ip-section-aside">{aside}</span>}</div>;
}

const checkLinks = {
  reference_images: { icon: ImageIcon, href: "#reference-images", label: "Images" },
  keywords: { icon: Search, href: "#keywords", label: "Keywords" },
  monitoring_sources: { icon: Radar, href: "#monitoring", label: "Sources" },
  first_scan: { icon: ScanLine, href: "", label: "First scan" },
};

export function IpSetupProgress({ status, loading, error, ipId }: { status: IpOnboardingStatus | null; loading: boolean; error: string; ipId: string }) {
  if (!status) return <div className="ip-setup-placeholder" role="status">{loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}{loading ? "Checking setup…" : error ? "Setup status unavailable. Refresh to try again." : "Setup status unavailable."}</div>;
  const complete = status.checks.filter((check) => check.status === "complete").length;
  const title = status.customer_action_required ? "Finish monitoring setup"
    : status.state === "active" ? "Setup complete" : status.state === "paused" ? "Monitoring is off" : "Setup saved";
  const checks = status.checks.map((check) => check.status === "attention"
    ? { ...check, status: "waiting" as const, detail: "Processing has not completed yet." } : check);
  return <section className="ip-setup" aria-label="IP setup status"><div className="ip-setup-title"><span>{title}</span><span>{complete}/{checks.length} complete</span></div><div className="ip-setup-track" aria-hidden="true">{checks.map((check) => <span key={check.key} data-status={check.status} />)}</div><div className="ip-setup-checks">{checks.map((check) => {
    const { icon: Icon, href, label } = checkLinks[check.key];
    const StateIcon = check.status === "complete" ? Check : check.status === "processing" ? LoaderCircle : check.status === "missing" ? CircleAlert : CircleDashed;
    return <Link key={check.key} to={href || `/monitoring/first-scan?ip_id=${ipId}`} className="ip-setup-check" data-status={check.status} title={check.detail} aria-label={`${check.label}: ${check.detail}`}><Icon size={16} aria-hidden="true" /><span>{label}</span><StateIcon size={14} className={check.status === "processing" ? "animate-spin" : ""} aria-hidden="true" /></Link>;
  })}</div></section>;
}
