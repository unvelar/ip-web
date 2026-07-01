import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink } from "lucide-react";
import { listTrademarks, type Trademark } from "../api";
import BulkIngest from "../components/BulkIngest";
import { publicSummaryUrlForIp } from "../lib/publicSummary";

const COPY_FEEDBACK_MS = 1600;

export default function Registry() {
  const [ips, setIps] = useState<Trademark[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedPublicSummaryIp, setCopiedPublicSummaryIp] = useState<string | null>(null);

  async function load() {
    try {
      const { trademarks } = await listTrademarks();
      setIps(trademarks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function copyPublicSummaryLink(ip: Trademark) {
    const url = publicSummaryUrlForIp(ip);
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedPublicSummaryIp(ip.id);
      window.setTimeout(() => {
        setCopiedPublicSummaryIp((current) => (current === ip.id ? null : current));
      }, COPY_FEEDBACK_MS);
    } catch (error) {
      console.error("Unable to copy public summary link", error);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Intellectual Properties</h1>
        <p className="mt-1 text-sm text-stone-500">
          Manage your intellectual property and the sources we monitor for infringements.
        </p>
      </div>

      {/* Section 1 — bulk ingest */}
      <BulkIngest />

      {/* Section 2 — IP list */}
      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight">Your IPs</h2>
            <p className="mt-1 text-sm text-stone-500">
              Reference assets for every IP we protect on your behalf.
            </p>
          </div>
          <Link
            to="/ips/new"
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-stone-900 text-white hover:bg-stone-800"
          >
            New IP
          </Link>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ips.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto">
              <span className="text-2xl">&#x1F50D;</span>
            </div>
            <p className="text-stone-500 text-sm">No IPs registered yet.</p>
            <p className="text-stone-400 text-xs">Add your first IP to start detecting infringement.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {ips.map((ip) => (
              <IpListCard
                key={ip.id}
                ip={ip}
                copied={copiedPublicSummaryIp === ip.id}
                onCopy={() => void copyPublicSummaryLink(ip)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function IpListCard({
  ip,
  copied,
  onCopy,
}: {
  ip: Trademark;
  copied: boolean;
  onCopy: () => void;
}) {
  const publicSummaryUrl = publicSummaryUrlForIp(ip);

  return (
    <article className="group relative bg-white rounded-2xl border border-stone-200 p-5 hover:border-stone-300 hover:shadow-lg hover:shadow-stone-100 transition-all">
      <Link
        to={`/ips/${ip.id}`}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
        aria-label={`Open ${ip.name}`}
      />
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pointer-events-none">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-stone-900 group-hover:text-red-700 transition-colors">{ip.name}</h3>
          {ip.description && <p className="text-sm text-stone-500 mt-1 line-clamp-2">{ip.description}</p>}
          {publicSummaryUrl && (
            <div className="mt-3 pointer-events-auto">
              <PublicSummaryActions url={publicSummaryUrl} copied={copied} onCopy={onCopy} />
            </div>
          )}
        </div>
        <div className="shrink-0 text-sm space-y-1 sm:text-right">
          <p className="text-stone-500">
            {ip.image_count} ref{ip.image_count !== 1 ? "s" : ""}
          </p>
          <StatusBadge ip={ip} />
        </div>
      </div>
    </article>
  );
}

function PublicSummaryActions({
  url,
  copied,
  onCopy,
}: {
  url: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="inline-flex max-w-full items-stretch rounded-xl border border-stone-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex min-w-0 items-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
        title="Copy public summary link"
      >
        {copied ? (
          <Check className="w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{copied ? "Copied" : "Copy public summary"}</span>
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-10 shrink-0 items-center justify-center border-l border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-900 transition-colors"
        title="Open public summary"
        aria-label="Open public summary"
      >
        <ExternalLink className="w-4 h-4" aria-hidden="true" />
      </a>
    </div>
  );
}

function StatusBadge({ ip }: { ip: Trademark }) {
  if (ip.centroid_dino) {
    return <span className="inline-block text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">Indexed</span>;
  }
  if (ip.indexed_count > 0) {
    return <span className="inline-block text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">Partial</span>;
  }
  return <span className="inline-block text-xs font-semibold text-stone-400 bg-stone-50 px-2.5 py-0.5 rounded-full">Pending</span>;
}
