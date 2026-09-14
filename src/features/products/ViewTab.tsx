

export function ViewTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number | null | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative h-[34px] shrink-0 text-[11px] font-medium transition ${
        active ? "text-stone-950" : "text-stone-500 hover:text-stone-800"
      }`}
    >
      <span>{label}</span>
      {count != null && (
        <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] ${
          active ? "bg-stone-200/70 text-stone-700" : "bg-stone-100 text-stone-400"
        }`}>
          {count}
        </span>
      )}
      {active && <span className="absolute inset-x-0 bottom-0 h-px bg-stone-950" />}
    </button>
  );
}
