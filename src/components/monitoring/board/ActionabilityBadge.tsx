import { Info } from "lucide-react";

export function ActionabilityBadge({
  label,
  reason,
  className,
  badgeClassName,
  iconClassName,
  iconSize = 13,
}: {
  label: string;
  reason?: string | null;
  className?: string;
  badgeClassName: string;
  iconClassName?: string;
  iconSize?: number;
}) {
  const title = reason ? `Why recommended: ${reason}` : undefined;

  return (
    <span className={["inline-flex items-center", className].filter(Boolean).join(" ")}>
      <span className={badgeClassName}>{label}</span>
      {title && (
        <span
          className={[
            "inline-flex items-center justify-center rounded-full text-stone-400 hover:text-stone-700",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300",
            iconClassName,
          ].filter(Boolean).join(" ")}
          title={title}
          aria-label={title}
          tabIndex={0}
        >
          <Info size={iconSize} strokeWidth={2.25} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
