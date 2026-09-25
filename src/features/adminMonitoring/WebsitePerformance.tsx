import { Fragment, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, LoaderCircle, Search } from "lucide-react";
import { getAdminMonitoringRun, type AdminMonitoringRunDetail } from "../../api/admin";
import { getWebsiteDiscovery, getWebsiteDiscoveryRuns, type WebsiteDiscoveryList,
  type WebsiteDiscoveryRun, type WebsiteDiscoveryRuns } from "../../api/websiteDiscovery";
import { AdminMonitoringRunDetailPanel } from "./AdminMonitoringRunDetail";
import { CoverageBadge } from "./DiscoveryRunEvidence";
import "./WebsitePerformance.css";

const number = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const timestamp = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function WebsitePerformance({ windowHours, asOf }: { windowHours: number; asOf: string }) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<WebsiteDiscoveryList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void getWebsiteDiscovery({ windowHours, asOf, query, offset, signal: controller.signal })
        .then(next => {
          if (controller.signal.aborted) return;
          if (offset > 0 && next.websites.length === 0) { setOffset(0); return; }
          setData(next); setError(null);
        })
        .catch(() => { if (!controller.signal.aborted) setError("Website performance could not be loaded. Coverage is unknown until the server supplies this evidence."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [windowHours, asOf, query, offset, retry]);

  return <section className="admin-card website-performance" aria-label="Website performance">
    <div className="discovery-section-heading">
      <div><h2>Website performance</h2><p>Search completeness and filtering across websites. Open a website to inspect its keywords and runs.</p></div>
      {loading && <LoaderCircle className="animate-spin" size={15} aria-label="Updating website performance" />}
    </div>
    <div className="discovery-toolbar">
      <p>{data ? `${number(data.total)} ${data.total === 1 ? "website" : "websites"}` : "Keyword search history"} · Last {windowHours < 24 ? `${windowHours} hours` : `${windowHours / 24} ${windowHours === 24 ? "day" : "days"}`}</p>
      <label className="discovery-search"><Search size={14} aria-hidden="true" /><input value={query} onChange={event => { setQuery(event.target.value); setOffset(0); setSelected(null); setData(null); }} type="search" placeholder="Website, keyword, IP or tenant" aria-label="Find website searches" /></label>
    </div>
    {error && <div role="alert" className="discovery-warning"><AlertCircle size={15} /><span>{error} {data && "The table shows the last loaded data."}</span><button type="button" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    <div className="discovery-table-scroll" aria-busy={loading}>
      <table className="discovery-table discovery-websites">
        <caption className="sr-only">Keyword search coverage by website</caption>
        <thead><tr>{["Website", "Searches", "Complete", "Partial", "In progress", "Unknown", "Unverified", "Failed", "Last search"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data?.websites.map(website => <Fragment key={website.domain}>
          <tr className={selected === website.domain ? "is-selected" : ""}>
            <th scope="row"><button type="button" aria-expanded={selected === website.domain} onClick={() => setSelected(selected === website.domain ? null : website.domain)}>
              {selected === website.domain ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{website.domain}
            </button></th>
            <td>{number(website.searches)}</td><td className={website.complete ? "discovery-positive" : ""}>{number(website.complete)}</td>
            <td className={website.partial ? "discovery-caution" : ""}>{number(website.partial)}</td><td>{number(website.in_progress)}</td><td>{number(website.unknown)}</td>
            <td className={website.unverified ? "discovery-caution" : ""} title="Searches with listings that lacked required description evidence">{number(website.unverified)}</td>
            <td className={website.failed ? "discovery-negative" : ""}>{number(website.failed)}</td>
            <td className="discovery-date">{website.last_search_at ? timestamp(website.last_search_at) : "None in period"}</td>
          </tr>
          {selected === website.domain && <tr><td colSpan={9} className="discovery-expanded"><WebsiteRuns key={website.domain} domain={website.domain} windowHours={windowHours} asOf={data!.as_of} query={query} /></td></tr>}
        </Fragment>)}</tbody>
      </table>
    </div>
    {!data && loading && <p className="discovery-note">Loading website searches...</p>}
    {data?.websites.length === 0 && <p className="discovery-note">{query ? "No website searches match these filters." : "No website keyword searches started in this period."}</p>}
    {data && <Pagination offset={offset} total={data.total} next={data.next_offset} disabled={loading} onChange={value => { setOffset(value); setSelected(null); setData(null); }} />}
    <p className="discovery-note discovery-footnote">Counts are searches started in this period, with retries grouped by job. Coverage is complete, partial, in progress or unknown. Unverified and failed can overlap those counts. Open-web searches and seller expansions are separate workflows.</p>
  </section>;
}

function WebsiteRuns({ domain, windowHours, asOf, query }: { domain: string; windowHours: number; asOf: string; query: string }) {
  const [data, setData] = useState<WebsiteDiscoveryRuns | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getWebsiteDiscoveryRuns(domain, { windowHours, asOf, query, offset, signal: controller.signal })
      .then(next => {
        if (controller.signal.aborted) return;
        if (offset > 0 && next.runs.length === 0) { setOffset(0); return; }
        setData(next); setError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [domain, windowHours, asOf, query, offset, retry]);
  return <div className="discovery-runs">
    <div className="discovery-section-heading"><div><h3>{domain}</h3><p>Latest searches first. Open a run to inspect exclusions, page evidence and matching decisions.</p></div></div>
    {error && <p role="alert" className="discovery-warning">Could not load search history. <button type="button" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>Retry</button></p>}
    {!data && loading && <p className="discovery-note">Loading search history...</p>}
    {data && <><div className="discovery-table-scroll"><table className="discovery-table discovery-run-table">
      <thead><tr>{["Keyword / IP", "Search coverage", "Collected", "Passed", "Saved", "Evaluated", "Findings", "Started"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{data.runs.map((run, index) => <Fragment key={run.run_id}>
        <tr className={selected === run.run_id ? "is-selected" : ""}>
          <th scope="row"><button type="button" aria-expanded={selected === run.run_id} onClick={() => setSelected(selected === run.run_id ? null : run.run_id)}>
            {selected === run.run_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{run.keyword}
          </button><span className="discovery-run-context">{run.ip_name ?? "IP unavailable"} · {run.tenant_name}</span><span className="discovery-run-context">{run.status}{run.country ? ` · Configured country: ${run.country.toUpperCase()}` : ""}</span></th>
          <td><CoverageBadge coverage={run.discovery.coverage} active={["pending", "in_progress"].includes(run.scrape_status ?? "")} /></td>
          <td>{number(run.discovery.listings?.found ?? run.discovery.coverage?.unique_listings)}<YieldComparison run={run} previous={data.runs.slice(index + 1)} /></td>
          <td>{number(run.discovery.listings?.admitted)}</td><td>{number(run.stored)}</td><td>{number(run.evaluated)}</td><td>{number(run.findings)}</td>
          <td className="discovery-date">{timestamp(run.created_at)}</td>
        </tr>
        {selected === run.run_id && <tr><td colSpan={8} className="discovery-expanded"><RunDetails key={run.run_id} id={run.run_id} refreshAt={asOf} /></td></tr>}
      </Fragment>)}</tbody>
    </table></div>
      {data.runs.length === 0 && <p className="discovery-note">No keyword searches started in this period. Try a longer activity window.</p>}
      <Pagination offset={offset} total={data.total} next={data.next_offset} disabled={loading} onChange={value => { setOffset(value); setData(null); setSelected(null); setLoading(true); }} />
      <p className="discovery-note">Collected and passed count distinct listings when recorded. Saved counts persisted listings. Evaluated requires at least one linked matching decision and may still have checks pending. Findings counts listings with a promoted finding. Older unlinked decisions are excluded.</p>
    </>}
  </div>;
}

export function YieldComparison({ run, previous }: { run: WebsiteDiscoveryRun; previous: WebsiteDiscoveryRun[] }) {
  const coverage = run.discovery.coverage;
  if (coverage?.status !== "complete") return null;
  const prior = previous.find(item => item.domain_id === run.domain_id && item.keyword === run.keyword
    && item.discovery.coverage?.status === "complete" && item.discovery.coverage.recipe_digest === coverage.recipe_digest);
  const count = prior?.discovery.coverage?.unique_listings;
  if (count == null || count === coverage.unique_listings) return null;
  const dropped = count >= 10 && coverage.unique_listings <= count / 2;
  return <span className={`discovery-comparison${dropped ? " discovery-caution" : ""}`} title="Compared with the prior complete search on this page using the same keyword, source and extraction recipe. Inventory changes can also change yield.">
    {dropped ? "Yield drop · " : ""}{number(count)} previously
  </span>;
}

function RunDetails({ id, refreshAt }: { id: string; refreshAt: string }) {
  const [detail, setDetail] = useState<AdminMonitoringRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void getAdminMonitoringRun(id, controller.signal)
      .then(next => { if (!controller.signal.aborted) { setDetail(next); setError(null); } })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load run evidence."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, refreshAt]);
  return <AdminMonitoringRunDetailPanel detail={detail} loading={loading} refreshing={false} error={error} />;
}

function Pagination({ offset, total, next, disabled, onChange }: { offset: number; total: number; next: number | null; disabled: boolean; onChange: (offset: number) => void }) {
  if (total <= 20 && offset === 0) return null;
  return <div className="discovery-pagination"><span>{number(offset + 1)} to {number(Math.min(offset + 20, total))} of {number(total)}</span><div>
    <button type="button" disabled={offset === 0 || disabled} onClick={() => onChange(Math.max(0, offset - 20))}>Previous</button>
    <button type="button" disabled={next === null || disabled} onClick={() => next !== null && onChange(next)}>Next</button>
  </div></div>;
}
