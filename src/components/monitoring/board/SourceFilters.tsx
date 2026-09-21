import type { MonitoringSourceFacet } from "../../../api/monitoring";
import { MONITORING_PLATFORM_OPTIONS } from "../../../lib/platforms";
import { FilterPill } from "./StatusTabs";

export interface SourceSelection {
  source: string | null;
  platform: string | null;
}

/** Counts cover the complete filtered corpus, never just the loaded page. */
export function SourceFilters({ sources, selection, onChange }: {
  sources: MonitoringSourceFacet[];
  selection: SourceSelection;
  onChange: (selection: SourceSelection) => void;
}) {
  return (
    <>
      <FilterPill label="All" count={sources.reduce((n, source) => n + source.n, 0)}
        active={!selection.source && !selection.platform}
        onClick={() => onChange({ source: null, platform: null })} />
      {sources.map((source) => {
        const active = selection.source === source.key;
        const label = source.kind === "domain"
          ? MONITORING_PLATFORM_OPTIONS.find((option) => option.value === source.label)?.label ?? source.label
          : source.label;
        const hasWebsites = source.kind !== "domain" || source.websites.some((site) => `domain:${site.domain}` !== source.key);
        if (!hasWebsites) return (
          <FilterPill key={source.key} label={label} count={source.n} active={active}
            onClick={() => onChange({ source: active ? null : source.key, platform: null })} />
        );
        const missingWebsite = active && selection.platform && !source.websites.some((site) => site.domain === selection.platform);
        return (
          <select key={source.key} aria-label={`Websites found via ${label}`}
            value={active ? selection.platform ?? "" : "__inactive__"}
            onChange={(event) => onChange({ source: source.key, platform: event.target.value || null })}
            className={`h-7 field-sizing-content max-w-[18rem] shrink-0 truncate rounded-md py-1 pl-2.5 pr-2 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-stone-400 ${active ? "bg-stone-900 text-white" : "bg-transparent text-stone-500 hover:bg-stone-100"}`}>
            <option value="__inactive__" disabled hidden>{label} ({source.n})</option>
            <option value="">{label} · All websites ({source.n})</option>
            {missingWebsite && <option value={selection.platform!}>{label} · {selection.platform} (0)</option>}
            {source.websites.map((site) => (
              <option key={site.domain} value={site.domain}>{label} · {site.domain} ({site.n})</option>
            ))}
          </select>
        );
      })}
      {selection.source && !sources.some((source) => source.key === selection.source) && (
        <FilterPill label="Clear source filter" count={0} active onClick={() => onChange({ source: null, platform: null })} />
      )}
      {!selection.source && selection.platform && (
        <FilterPill label={selection.platform} active onClick={() => onChange({ source: null, platform: null })} />
      )}
    </>
  );
}
