// Slim status pipeline pills. `null` is rendered as "pending".
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "To triage" },
  { key: "takedown_sent", label: "Sent" },
  { key: "enforced", label: "Enforced" },
  { key: "dismissed", label: "Dismissed" },
];

// Compact status pills for the dense toolbar. `null` is the aggregate "All".
export function StatusTabs({
  counts,
  active,
  onSelect,
}: {
  counts: Record<string, number>;
  active: string | null;
  onSelect: (s: string | null) => void;
}) {
  const total = counts.pending + counts.takedown_sent + counts.enforced;
  const tab = (key: string | null, label: string, n: number) => {
    const isActive = active === key;
    return (
      <button
        key={key ?? "all"}
        type="button"
        onClick={() => onSelect(key)}
        aria-pressed={isActive}
        className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${
          isActive
            ? "bg-stone-900 text-white"
            : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
        }`}
      >
        {label}
        <span
          className={`text-[9px] font-bold tabular-nums px-1 rounded-full ${
            isActive ? "bg-white/20 text-white" : "bg-stone-200 text-stone-600"
          }`}
        >
          {n}
        </span>
      </button>
    );
  };
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {tab(null, "All", total)}
      {STATUS_FILTERS.map((s) => tab(s.key, s.label, counts[s.key] ?? 0))}
    </div>
  );
}
