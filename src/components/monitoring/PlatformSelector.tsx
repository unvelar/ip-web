import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { MONITORING_PLATFORM_OPTIONS } from "../../lib/platforms";

interface PlatformSelectorProps {
  value: string[];
  onChange: (platforms: string[]) => void;
  disabled?: boolean;
}

export function PlatformSelector({ value, onChange, disabled = false }: PlatformSelectorProps) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [customSource, setCustomSource] = useState("");

  const selected = useMemo(() => new Set(value), [value]);
  const popular = useMemo(
    () => MONITORING_PLATFORM_OPTIONS.filter((platform) => platform.popular),
    [],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return MONITORING_PLATFORM_OPTIONS;
    return MONITORING_PLATFORM_OPTIONS.filter((platform) =>
      `${platform.label} ${platform.value}`.toLocaleLowerCase().includes(needle),
    );
  }, [query]);

  const allPopularSelected = popular.every((platform) => selected.has(platform.value));
  const allVisibleSelected = visible.length > 0 && visible.every((platform) => selected.has(platform.value));

  function toggle(source: string) {
    if (disabled) return;
    onChange(selected.has(source) ? value.filter((item) => item !== source) : [...value, source]);
  }

  function setSources(sources: string[], shouldSelect: boolean) {
    const next = new Set(value);
    for (const source of sources) {
      if (shouldSelect) next.add(source);
      else next.delete(source);
    }
    onChange([...next]);
  }

  function addCustomSource() {
    const raw = customSource.trim();
    if (!raw || disabled) return;
    const known = MONITORING_PLATFORM_OPTIONS.find(
      (platform) => platform.value.toLocaleLowerCase() === raw.toLocaleLowerCase(),
    );
    const source = known?.value ?? raw;
    if (!value.some((item) => item.toLocaleLowerCase() === source.toLocaleLowerCase())) {
      onChange([...value, source]);
    }
    setCustomSource("");
  }

  const customSelections = value.filter(
    (source) => !MONITORING_PLATFORM_OPTIONS.some((platform) => platform.value === source),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-5 text-stone-500">
          Choose the sources most likely to matter. Nothing is added until you start monitoring.
        </p>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled}
            className="shrink-0 text-xs font-medium text-stone-500 hover:text-stone-900 disabled:opacity-50"
          >
            Clear {value.length}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-stone-800">Popular sources</div>
            <div className="text-[11px] text-stone-400">A useful starting point — select only what you need.</div>
          </div>
          <button
            type="button"
            onClick={() => setSources(popular.map((platform) => platform.value), !allPopularSelected)}
            disabled={disabled}
            className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
          >
            {allPopularSelected ? "Clear popular" : `Select all ${popular.length}`}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {popular.map((platform) => {
            const isSelected = selected.has(platform.value);
            return (
              <button
                key={platform.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(platform.value)}
                disabled={disabled}
                className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${
                  isSelected
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{platform.label}</span>
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded border ${
                      isSelected ? "border-white/40 bg-white text-stone-900" : "border-stone-300"
                    }`}
                  >
                    {isSelected && <Check className="size-3" aria-hidden="true" />}
                  </span>
                </span>
                <span className={`mt-0.5 block truncate text-[10px] ${isSelected ? "text-stone-300" : "text-stone-400"}`}>
                  {platform.value}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white">
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          disabled={disabled}
          aria-expanded={showAll}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left disabled:opacity-50"
        >
          <span>
            <span className="block text-xs font-semibold text-stone-800">Browse all sources</span>
            <span className="block text-[11px] text-stone-400">
              Search or select the entire catalog of {MONITORING_PLATFORM_OPTIONS.length}.
            </span>
          </span>
          {showAll ? (
            <ChevronUp className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
          )}
        </button>

        {showAll && (
          <div className="border-t border-stone-100 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <span className="sr-only">Search sources</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by source or domain…"
                  disabled={disabled}
                  className="w-full rounded-lg border border-stone-200 py-1.5 pl-8 pr-2.5 text-xs disabled:opacity-50"
                />
              </label>
              {visible.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSources(visible.map((platform) => platform.value), !allVisibleSelected)}
                  disabled={disabled}
                  className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
                >
                  {allVisibleSelected
                    ? `Clear ${query.trim() ? "results" : "all"}`
                    : `Select ${query.trim() ? `${visible.length} results` : `all ${visible.length}`}`}
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-100 divide-y divide-stone-100">
              {visible.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-stone-400">No matching sources.</div>
              ) : (
                visible.map((platform) => {
                  const isSelected = selected.has(platform.value);
                  return (
                    <button
                      key={platform.value}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => toggle(platform.value)}
                      disabled={disabled}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-stone-50 disabled:opacity-50"
                    >
                      <span
                        className={`grid size-4 shrink-0 place-items-center rounded border ${
                          isSelected
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-300 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="size-3" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-stone-700">{platform.label}</span>
                        <span className="block truncate text-[10px] text-stone-400">{platform.value}</span>
                      </span>
                      {platform.popular && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          Popular
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium text-stone-500">Can’t find a source?</div>
        <div className="flex gap-2">
          <input
            value={customSource}
            onChange={(event) => setCustomSource(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomSource();
              }
            }}
            disabled={disabled}
            placeholder="Enter a domain or full search URL"
            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs disabled:opacity-50"
          />
          <button
            type="button"
            onClick={addCustomSource}
            disabled={!customSource.trim() || disabled}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-stone-300 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {customSelections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customSelections.map((source) => (
            <span
              key={source}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-stone-100 py-1 pl-2.5 pr-1.5 text-[11px] text-stone-600"
            >
              <span className="truncate">{source}</span>
              <button
                type="button"
                onClick={() => toggle(source)}
                disabled={disabled}
                className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-stone-200 disabled:opacity-50"
              >
                <X className="size-3" aria-hidden="true" />
                <span className="sr-only">Remove {source}</span>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="text-xs font-medium text-stone-600" aria-live="polite">
        {value.length === 0 ? "No sources selected" : `${value.length} source${value.length === 1 ? "" : "s"} selected`}
      </div>
    </div>
  );
}
