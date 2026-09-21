import { useState } from "react";
import { Globe2 } from "lucide-react";
import type { PublicBrandSumupCountry } from "../api/intakes";
import worldCountries from "../data/worldCountries.json";
import { COUNTRIES } from "../lib/countries";

const number = new Intl.NumberFormat("en-US");
const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
const palettes = {
  products: ["#dbeafe", "#93c5fd", "#60a5fa", "#2563eb", "#1e40af"],
  infringement: ["#fee2e2", "#fca5a5", "#f87171", "#dc2626", "#991b1b"],
};
type Metric = keyof typeof palettes;
// Canonical country names used by enrichment, plus common ISO/name variants.
const aliases: Record<string, string> = {
  "czech republic": "czechia", "turkey": "türkiye", "united states of america": "united states",
  "people's republic of china": "china",
  "korea, republic of": "south korea",
  "korea, democratic people's republic of": "north korea",
};
function countryKey(country: string) {
  const name = country.trim().toLowerCase();
  return aliases[name] ?? name;
}
function mapCountry(country: string) {
  const key = countryKey(country);
  return worldCountries.find((item) => countryKey(item.name) === key || item.code.toLowerCase() === key);
}

function countryName(country: string) {
  if (countryKey(country) === "unknown") return "Unknown location";
  const shape = mapCountry(country);
  return shape ? COUNTRIES.find((item) => item.code === shape.code)?.name ?? shape.name : country;
}

export default function BrandCountryMap({ countries }: { countries?: PublicBrandSumupCountry[] }) {
  const [metric, setMetric] = useState<Metric>("products");
  const [selection, setSelection] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = [...(countries ?? [])].sort((a, b) =>
    (metric === "products" ? b.analyzed_count - a.analyzed_count : b.infringement_percentage - a.infringement_percentage)
    || a.country.localeCompare(b.country));
  const mapped = new Map(rows.flatMap((row) => {
    const shape = mapCountry(row.country);
    return shape ? [[shape.name, row] as const] : [];
  }));
  const known = rows.filter((row) => countryKey(row.country) !== "unknown");
  const selected = rows.find((row) => row.country === (hovered ?? selection)) ?? known[0] ?? rows[0];
  const max = Math.max(1, ...known.map((row) => row.analyzed_count));
  const palette = palettes[metric];
  const color = (row: PublicBrandSumupCountry) => {
    const ratio = metric === "products" ? row.analyzed_count / max : row.infringement_percentage / 100;
    return palette[Math.min(4, Math.max(0, Math.ceil(ratio * 5) - 1))];
  };
  const unavailable = countries === undefined;
  const empty = !rows.some((row) => row.analyzed_count > 0);

  return (
    <section aria-labelledby="country-map-title" className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 p-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-stone-400" aria-hidden="true" />
            <h2 id="country-map-title" className="text-base font-black text-stone-950">Products by country</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-500">Where analyzed product listings are located and the percentage marked for takedown.</p>
        </div>
        <div role="group" aria-label="Map color metric" className="flex rounded-lg bg-stone-100 p-1 text-xs font-semibold">
          {([['products', 'Products'], ['infringement', 'Infringement %']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)}
              className={`rounded-md px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${metric === value ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-950"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 bg-stone-50/60 p-4 sm:p-6">
          <div className="relative">
            <svg viewBox="0 0 900 365" role="group" aria-label="World map of analyzed product listings by country" className="block w-full" onMouseLeave={() => setHovered(null)}>
              {worldCountries.map((shape) => {
                const row = mapped.get(shape.name);
                const active = row && selected?.country === row.country;
                return <path key={shape.name} d={shape.path} fill={row ? color(row) : "#e7e5e4"}
                  stroke={active ? "#1c1917" : "#fafaf9"} strokeWidth={active ? 1.5 : 0.6} vectorEffect="non-scaling-stroke"
                  role={row ? "button" : undefined} tabIndex={row ? 0 : undefined}
                  aria-label={row ? `${countryName(row.country)}: ${number.format(row.analyzed_count)} products, ${percent(row.infringement_percentage)} infringement` : undefined}
                  aria-pressed={row ? !!active : undefined} aria-hidden={row ? undefined : true}
                  className={row ? "cursor-pointer transition-colors focus:outline-none focus:stroke-stone-950 focus:stroke-2" : undefined}
                  onMouseEnter={() => setHovered(row?.country ?? null)}
                  onFocus={() => row && setSelection(row.country)}
                  onClick={() => row && setSelection(row.country)}
                  onKeyDown={(event) => {
                    if (row && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setSelection(row.country);
                    }
                  }}>
                  <title>{row ? `${countryName(row.country)} · ${number.format(row.analyzed_count)} products · ${percent(row.infringement_percentage)} infringement` : `${shape.name} · No data`}</title>
                </path>;
              })}
            </svg>
            {(unavailable || empty) && <div className="absolute inset-0 flex items-center justify-center p-3">
              <div className="max-w-xs rounded-lg border border-stone-200 bg-white/95 px-5 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-stone-800">{unavailable ? "Country breakdown is not available yet" : "No country data yet"}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{unavailable ? "Product locations will appear here when geographic data is available." : "Analyzed listings will appear here as monitoring results become available."}</p>
              </div>
            </div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-stone-500">
            <div className="flex items-center gap-2" aria-label={metric === "products" ? `Color scale: 1 to ${max} products` : "Color scale: 0 to 100 percent infringement"}>
              <span>{metric === "products" ? "Fewer" : "0%"}</span>
              <span className="flex overflow-hidden rounded-sm" aria-hidden="true">{palette.map((fill) => <span key={fill} className="h-2 w-6" style={{ backgroundColor: fill }} />)}</span>
              <span>{metric === "products" ? "More products" : "100%"}</span>
            </div>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-stone-200" />No data</span>
          </div>
          <div className="mt-5 min-h-24 rounded-lg border border-stone-200 bg-white p-4" aria-live="polite" aria-atomic="true">
            {selected ? <>
              <div className="text-sm font-bold text-stone-950">{countryName(selected.country)}</div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-stone-500">
                <span><strong className="text-base font-black text-stone-950 tabular-nums">{number.format(selected.analyzed_count)}</strong> products</span>
                <span><strong className="text-base font-black text-red-700 tabular-nums">{percent(selected.infringement_percentage)}</strong> infringement</span>
                <span>{number.format(selected.to_takedown_count)} marked for takedown</span>
              </div>
            </> : <p className="text-xs leading-5 text-stone-500">Select a country to explore its product listings and infringement rate.</p>}
          </div>
        </div>
        <div className="min-w-0 border-t border-stone-200 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-xs font-bold text-stone-700">Country breakdown</h3>
            <span className="text-xs text-stone-400">{known.length} countries</span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-stone-400">
                <tr><th scope="col" className="px-5 py-2 text-left">Country</th><th scope="col" className="px-2 py-2 text-right">Products</th><th scope="col" className="pr-5 py-2 text-right">Infringement</th></tr>
              </thead>
              <tbody>{rows.map((row) => <tr key={row.country} className={`border-t border-stone-100 ${selected?.country === row.country ? "bg-blue-50/70" : ""}`}>
                <th scope="row" className="px-5 py-3 text-left font-semibold text-stone-700">
                  <button type="button" className="text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-600" aria-pressed={selected?.country === row.country}
                    onClick={() => { setHovered(null); setSelection(row.country); }}>{countryName(row.country)}</button>
                </th>
                <td className="px-2 py-3 text-right tabular-nums text-stone-600">{number.format(row.analyzed_count)}</td>
                <td className="pr-5 py-3 text-right font-bold tabular-nums text-red-700">{percent(row.infringement_percentage)}</td>
              </tr>)}</tbody>
            </table>
            {empty && <p className="px-5 py-6 text-xs leading-5 text-stone-400">No country counts available.</p>}
          </div>
        </div>
      </div>
      <div className="border-t border-stone-200 px-5 py-3 text-[11px] leading-5 text-stone-500 sm:px-6">
        Products are analyzed marketplace listings, not unique catalog products. Infringement % = listings marked for takedown ÷ analyzed listings in that country.
        Unknown locations remain in the table; small territories may not appear at this map scale.
        <span className="ml-1">Map: <a href="https://www.naturalearthdata.com/" className="underline hover:text-stone-700" target="_blank" rel="noreferrer">Natural Earth</a>.</span>
      </div>
    </section>
  );
}
