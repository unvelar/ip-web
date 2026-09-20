import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, Search } from "lucide-react";
import {
  getScrapePipelineDomain, getScrapePipelineDomains,
  type ScrapePipelineStats as PipelineStats, type ScrapePipelineDomains,
  type ScrapePipelineDomainDetail,
} from "../../api";

const METHOD: Record<string, string> = {
  nodriver: "Nodriver", scrapling: "Scrapling stealth", scrapedo: "Scrape.do",
  scrapfly: "Scrapfly", marketplace_specific: "Marketplace API", web_search: "Web search API",
};
const number = (value: number) => value.toLocaleString();
const rate = (value: number | null) => value === null ? "No data" : `${value.toFixed(1)}%`;

export function ScrapePipelineStats({ stats, windowHours }: { stats: PipelineStats; windowHours: number }) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ScrapePipelineDomains | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!stats.first_recorded_at) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void getScrapePipelineDomains({ windowHours, asOf: stats.as_of, query, offset, signal: controller.signal })
        .then(next => {
          if (controller.signal.aborted) return;
          if (offset > 0 && next.domains.length === 0) { setOffset(0); return; }
          setData(next);
          setError(null);
        })
        .catch(() => { if (!controller.signal.aborted) setError("Could not load domain results."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [stats.as_of, stats.first_recorded_at, windowHours, query, offset, retry]);

  return <div className="border-b border-stone-200">
    <div className="px-4 pt-4">
      <h3 className="text-sm font-semibold text-stone-900">End-to-end scraping</h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">Did any method succeed? Each page check includes all its methods and retries.</p>
    </div>
    {!stats.first_recorded_at ? <p className="px-4 py-5 text-sm text-stone-500">Domain-level history is not available yet. New checks will appear here.</p> : <>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className={`rounded-lg border px-4 py-3 ${stats.failed ? "border-red-200 bg-red-50/60" : "border-stone-200 bg-stone-50"}`}>
          <p className="text-xs font-medium text-stone-600">No method succeeded</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${stats.failed ? "text-red-800" : "text-stone-900"}`}>{number(stats.failed)}</p>
          <p className="mt-1 text-xs text-stone-500">{rate(stats.failure_rate)} of {number(stats.completed)} completed checks</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
          <p className="text-xs font-medium text-stone-600">Domains affected</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{number(stats.affected_domains)}</p>
          <p className="mt-1 text-xs text-stone-500">With at least one failed check</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
          <p className="text-xs font-medium text-stone-600">Recovered after a failure</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">{number(stats.recovered)}</p>
          <p className="mt-1 text-xs text-stone-500">A later attempt succeeded</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 bg-stone-50/50 px-4 py-3">
        <div><h4 className="text-xs font-semibold text-stone-800">Results by domain</h4><p className="mt-0.5 text-[11px] text-stone-500">Most failed checks first. Open a domain to see methods and reasons.</p></div>
        <label className="relative w-full sm:w-56">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
          <span className="sr-only">Find a scraping domain</span>
          <input value={query} onChange={event => { setQuery(event.target.value); setOffset(0); setSelected(null); }} type="search" placeholder="Find a domain" className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-stone-400" />
        </label>
      </div>
      {error ? <p role="alert" className="px-4 py-4 text-xs text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry</button></p> : <div className="overflow-x-auto" aria-busy={loading}>
        <table className="w-full min-w-[760px] text-xs tabular-nums">
          <caption className="sr-only">End-to-end scraping outcomes grouped by domain</caption>
          <thead className="border-b border-stone-200 text-stone-500"><tr>
            {["Domain", "Completed", "Failed", "Failure rate", "Recovered", "Pending", "Last failure"].map((label, i) => <th key={label} scope="col" className={`px-4 py-2.5 font-medium ${i === 0 || i === 6 ? "text-left" : "text-right"}`}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-stone-100">
            {data?.domains.map(row => <Fragment key={row.domain}>
              <tr className={selected === row.domain ? "bg-stone-50" : "hover:bg-stone-50/60"}>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-stone-800">
                  <button type="button" aria-expanded={selected === row.domain} onClick={() => setSelected(selected === row.domain ? null : row.domain)} className="inline-flex items-center gap-2 text-left hover:text-stone-950">
                    {selected === row.domain ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}{row.domain}
                  </button>
                  {row.unknown > 0 && <span className="mt-1 block pl-5 text-[10px] font-normal text-stone-500">{number(row.unknown)} with incomplete history</span>}
                </th>
                <td className="px-4 py-3 text-right text-stone-600">{number(row.completed)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${row.failed ? "text-red-700" : "text-stone-400"}`}>{number(row.failed)}</td>
                <td className="px-4 py-3 text-right text-stone-700">{rate(row.failure_rate)}</td>
                <td className="px-4 py-3 text-right text-stone-600">{number(row.recovered)}</td>
                <td className="px-4 py-3 text-right text-stone-600">{number(row.pending)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[11px] text-stone-500">{row.last_failure_at ? new Date(row.last_failure_at).toLocaleString() : "None"}</td>
              </tr>
              {selected === row.domain && <tr><td colSpan={7} className="bg-stone-50/70 px-4 py-4"><DomainDetails domain={row.domain} windowHours={windowHours} asOf={data.as_of} /></td></tr>}
            </Fragment>)}
          </tbody>
        </table>
        {!data && loading && <p role="status" className="flex items-center gap-2 px-4 py-5 text-xs text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading domains...</p>}
        {data?.domains.length === 0 && <p className="px-4 py-5 text-xs text-stone-500">{query ? "No domains match this search." : "No page checks recorded in this period."}</p>}
      </div>}
      {data && data.total > 20 && <div className="flex items-center justify-between border-t border-stone-200 px-4 py-2.5 text-xs text-stone-500">
        <p>{offset + 1}–{offset + data.domains.length} of {number(data.total)} domains</p>
        <div className="flex gap-4"><button type="button" disabled={offset === 0 || loading} onClick={() => { setOffset(Math.max(0, offset - 20)); setSelected(null); }} className="font-medium disabled:opacity-40">Previous</button><button type="button" disabled={data.next_offset === null || loading} onClick={() => { setOffset(data.next_offset!); setSelected(null); }} className="font-medium disabled:opacity-40">Next</button></div>
      </div>}
      <div className="space-y-1 border-t border-stone-200 px-4 py-3 text-[11px] leading-4 text-stone-500">
        <p>Rates use checks whose jobs finished in this period. Confirming a listing is gone counts as success. Pending retries and incomplete history are excluded.</p>
        {(stats.pending > 0 || stats.unknown > 0) && <p>{number(stats.pending)} checks are running or awaiting retry. {number(stats.unknown)} have incomplete history.</p>}
        <p>Domain history since {new Date(stats.first_recorded_at).toLocaleString()}. Earlier requests are only included in the method statistics below.</p>
      </div>
    </>}
  </div>;
}

function DomainDetails({ domain, windowHours, asOf }: { domain: string; windowHours: number; asOf: string }) {
  const [data, setData] = useState<ScrapePipelineDomainDetail | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getScrapePipelineDomain(domain, windowHours, asOf, controller.signal)
      .then(next => { if (!controller.signal.aborted) { setData(next); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [domain, windowHours, asOf, retry]);
  if (error) return <p role="alert" className="text-red-700">Could not load failure details. <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry</button></p>;
  if (!data) return <p role="status" className="flex items-center gap-2 text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading failure details...</p>;
  if (!data.methods.length) return <p className="text-stone-500">No completed checks failed on {domain} in this period.</p>;
  return <div className="grid gap-5 lg:grid-cols-2">
    <div><h5 className="font-semibold text-stone-800">Methods used in failed checks</h5>
      <p className="mt-1 text-[11px] leading-4 text-stone-500">Includes every recorded retry. The methods used can differ between checks.</p>
      <div className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white px-3">
        {data.methods.map(method => <div key={`${method.method}-${method.provider}`} className="flex items-center justify-between gap-4 py-2.5">
          <span className="font-medium text-stone-700">{METHOD[method.method] ?? method.method}{method.provider ? ` · ${method.provider}` : ""}</span>
          <span className="text-right text-[11px] text-stone-500">{number(method.requests)} attempts · {number(method.checks)} checks</span>
        </div>)}
      </div>
    </div>
    <div><h5 className="font-semibold text-stone-800">Most common failure reasons</h5>
      <ul className="mt-3 space-y-2">{data.reasons.map((reason, index) => <li key={index} className="flex items-start justify-between gap-4 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
        <div><p className="leading-5 text-stone-700">{reason.message}</p><p className="mt-0.5 text-[11px] text-stone-500">{METHOD[reason.method] ?? reason.method}{reason.provider_status !== null ? ` · Provider HTTP ${reason.provider_status}` : ""}{reason.http_status !== null ? ` · Website HTTP ${reason.http_status}` : ""}</p></div>
        <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">{number(reason.requests)}</span>
      </li>)}</ul>
    </div>
  </div>;
}
