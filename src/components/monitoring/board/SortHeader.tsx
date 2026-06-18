import type { MonitoringSortMode } from "../../../api";

// Sortable table columns → their asc/desc server sort modes. Clicking a header
// applies `desc` first, then toggles. `score_desc` (the default) mirrors the
// backend ORDER BY (priority desc, found_at desc).
type SortCol = "rate" | "seller" | "platform" | "price" | "days";
const SORT_COLS: Record<SortCol, { asc: MonitoringSortMode; desc: MonitoringSortMode }> = {
  rate: { desc: "score_desc", asc: "score_asc" },
  seller: { desc: "seller_desc", asc: "seller_asc" },
  platform: { desc: "platform_desc", asc: "platform_asc" },
  price: { desc: "price_desc", asc: "price_asc" },
  days: { desc: "found_desc", asc: "found_asc" },
};

// Sortable column header. First click sorts desc, subsequent clicks toggle.
// A subtle ↕ marks sortable columns; the active column shows the direction.
export function SortHeader({
  label,
  col,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  col: SortCol;
  sort: MonitoringSortMode;
  onSort: (next: MonitoringSortMode) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const { asc, desc } = SORT_COLS[col];
  const active = sort === asc || sort === desc;
  const isAsc = sort === asc;
  const next = sort === desc ? asc : desc;
  return (
    <th className={`py-1.5 px-2 font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => onSort(next)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-stone-700 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-stone-700" : ""}`}
      >
        <span>{label}</span>
        <span className={`text-[8px] leading-none ${active ? "opacity-100" : "opacity-30"}`} aria-hidden>
          {active ? (isAsc ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
