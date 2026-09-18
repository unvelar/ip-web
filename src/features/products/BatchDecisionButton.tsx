import { Sparkles } from "lucide-react";

export function BatchDecisionButton({
  label,
  primary = false,
  emphasis = false,
  onClick,
  disabled = false,
}: {
  label: string;
  primary?: boolean;
  emphasis?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={primary ? `Recommended action: ${label}` : undefined}
      data-recommended-action={primary ? "Recommended" : undefined}
      className={`inline-flex h-8 items-center whitespace-nowrap rounded-md px-2 text-[10px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
        primary || emphasis
          ? "gap-1.5 bg-stone-950 text-white hover:bg-stone-800"
          : "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
      }`}
    >
      {primary && (
        <Sparkles size={11} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
