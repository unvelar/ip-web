import type { AdminMonitoringOverview } from "../../api";

const METHODS = [
  ["nodriver", "Nodriver"], ["scrapling", "Scrapling stealth"],
  ["scrapedo", "Scrape.do"], ["scrapfly", "Scrapfly"],
  ["marketplace_specific", "Marketplace API"], ["web_search", "Web search API"],
] as const;
const percentage = (value: number | null | undefined) => value == null ? "No data" : `${value.toFixed(1)}%`;

export function ScrapeRequestStats({ stats, windowHours, updating }: {
  stats: AdminMonitoringOverview["scrape_requests"]; windowHours: number; updating: boolean;
}) {
  const rows = new Map(stats?.methods.map(row => [row.method, row]));
  const completed = stats?.methods.reduce((sum, row) => sum + row.requests, 0) ?? 0;
  const unfinished = stats?.methods.reduce((sum, row) => sum + row.unfinished, 0) ?? 0;
  const partialHistory = stats?.first_recorded_at && Date.parse(stats.first_recorded_at) > Date.parse(stats.since);
  const period = windowHours === 1 ? "Last hour" : windowHours === 168 ? "Last 7 days" : windowHours === 72 ? "Last 3 days" : `Last ${windowHours} hours`;
  return (
    <section id="monitoring-scraping" className="admin-card overflow-hidden" aria-label="Scraping methods" aria-busy={updating}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-stone-900">Scraping methods</h2>
          <p className="mt-0.5 text-xs text-stone-500">{period}{stats ? ` · ${completed.toLocaleString()} completed requests` : ""}{updating ? " · Updating…" : ""}</p>
        </div>
        {stats?.first_recorded_at && <p className="text-[11px] text-stone-500">
          Tracking since {new Date(stats.first_recorded_at).toLocaleString()}
        </p>}
      </div>
      {!stats ? <p className="px-4 py-6 text-sm text-stone-500">Request statistics are not available from the API yet.</p> : <>
        {partialHistory && <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">Tracking began during this period. Earlier requests are not included.</p>}
        <div className={`overflow-x-auto ${updating ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[660px] text-xs tabular-nums">
            <caption className="sr-only">Completed scraping requests by method for {period.toLowerCase()}</caption>
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-500">
              <tr>{["Method", "Requests", "Succeeded", "Failed", "Success rate", "Failure rate"].map((label, index) =>
                <th key={label} scope="col" className={`px-4 py-2.5 font-medium ${index === 0 ? "text-left" : "text-right"}`}>{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {METHODS.map(([method, label]) => {
                const row = rows.get(method);
                return <tr key={method}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-stone-800">{label}
                    {(row?.unavailable ?? 0) > 0 && <span className="mt-0.5 block text-[10px] font-normal text-stone-500">{row!.unavailable.toLocaleString()} confirmed unavailable</span>}
                  </th>
                  <td className="px-4 py-3 text-right text-stone-700">{(row?.requests ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-stone-700">{(row?.succeeded ?? 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right ${(row?.failed ?? 0) > 0 ? "font-semibold text-red-700" : "text-stone-400"}`}>{(row?.failed ?? 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${row?.success_rate == null ? "text-stone-400" : "text-emerald-700"}`}>{percentage(row?.success_rate)}</td>
                  <td className={`px-4 py-3 text-right ${row?.failure_rate == null ? "text-stone-400" : "text-stone-700"}`}>{percentage(row?.failure_rate)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {completed === 0 && <p className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500">No completed requests recorded in this period.</p>}
        <div className="space-y-1 border-t border-stone-200 bg-stone-50 px-4 py-3 text-[11px] leading-4 text-stone-500">
          <p>Each target page fetch or upstream API request counts once. Retries count separately. Page assets and skipped routes are excluded.</p>
          <p>Success includes a confirmed unavailable listing. Failures include blocks, errors, and pages that fail validation. Rates use completed requests only.{unfinished > 0 ? ` ${unfinished.toLocaleString()} requests started in this period have no recorded outcome.` : ""}</p>
          <p>Recovery methods receive harder requests after another method fails. These rates are not a matched comparison.</p>
        </div>
      </>}
    </section>
  );
}
