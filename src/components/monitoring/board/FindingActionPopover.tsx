import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal, Sparkles } from "lucide-react";

/** A disclosure of ordinary buttons, with keyboard navigation and local Escape. */
export function FindingActionPopover({ label, description, recommended, disabled, children }: {
  label: string;
  description: string;
  recommended?: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function focusOption(last = false) {
    const options = root.current?.querySelectorAll<HTMLButtonElement>('[data-action-options] button:not(:disabled)');
    (last ? options?.[options.length - 1] : options?.[0])?.focus();
  }

  useEffect(() => {
    if (open) focusOption();
  }, [open]);

  return (
    <div ref={root} className="finding-action-popover" data-more-actions={label === "More actions" || undefined} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (!open) return;
      // Panel and board shortcuts must not fire while choosing a menu option.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-action-options] button:not(:disabled)') ?? []);
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    }}>
      <button ref={trigger} type="button" disabled={disabled} aria-expanded={open} aria-controls={id}
        aria-label={recommended ? `Recommended action: ${label}` : label}
        data-recommended-action={recommended ? "true" : undefined}
        className={recommended ? "recommended-action" : "finding-action-disclosure"}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}>
        {recommended && <Sparkles className="recommended-action-icon" aria-hidden="true" />}
        <span>{label}</span>{label === "More actions" ? <MoreHorizontal size={15} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
      </button>
      <div id={id} hidden={!open} data-action-options role="group" aria-label={label === "Dismiss" ? "Dismiss reasons" : label}
        className="finding-action-options" onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button:not(:disabled)")) {
            setOpen(false);
            trigger.current?.focus();
          }
        }}>
        <p>{description}</p>
        {children}
      </div>
    </div>
  );
}
