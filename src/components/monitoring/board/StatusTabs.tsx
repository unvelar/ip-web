// Slim status pipeline pills. `null` is rendered as "pending".
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "To triage" },
  { key: "takedown_sent", label: "Takedown sent" },
  { key: "enforced", label: "Enforced" },
  { key: "dismissed", label: "Dismissed" },
];

export function FilterPill({
  label,
  count,
  active,
  onClick,
  title,
  className = "",
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${className} ${
        active
          ? "bg-stone-900 text-white"
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {count != null && (
        <span
          className={`text-[9px] font-bold tabular-nums px-1 rounded-full ${
            active ? "bg-white/20 text-white" : "bg-stone-200 text-stone-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

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
  const total = (counts.pending ?? 0) + (counts.takedown_sent ?? 0) + (counts.enforced ?? 0);
  const tab = (key: string | null, label: string, n: number) => {
    const isActive = active === key;
    return (
      <FilterPill
        key={key ?? "all"}
        label={label}
        count={n}
        active={isActive}
        onClick={() => onSelect(key)}
      />
    );
  };
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {tab(null, "All open", total)}
      {STATUS_FILTERS.map((s) => tab(s.key, s.label, counts[s.key] ?? 0))}
    </div>
  );
}
