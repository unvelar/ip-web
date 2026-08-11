import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  PackageSearch,
  ScanSearch,
  Search,
  X,
} from "lucide-react";
import type {
  MonitoringCandidateOutcome,
  MonitoringDismissalReasonFilter,
  MonitoringFacets,
} from "../../../api";
import type { BoardFilters } from "../MonitoringBoard";
import {
  CANDIDATE_OUTCOME_LABELS,
  CANDIDATE_OUTCOME_ORDER,
  DISMISSAL_REASON_LABELS,
} from "./constants";

type FilterSection =
  | "ip"
  | "product_group"
  | "platform"
  | "candidate_outcome"
  | "dismissal_reason";

type FilterOption = {
  value: string | null;
  label: string;
  count?: number;
  groupKind?: "product" | "visual_cluster";
  groupSection?: "Products" | "Visual clusters";
  detail?: string;
  searchText?: string;
};

type SectionDefinition = {
  key: FilterSection;
  label: string;
  chipLabel?: string;
  emptyLabel: string;
  currentValue: string | null;
  currentLabel: string | null;
  options: FilterOption[];
};

function filterCountLabel(count: number) {
  return count === 1 ? "1 result" : `${count.toLocaleString()} results`;
}

function findingCountLabel(count: number) {
  return `${count.toLocaleString()} finding${count === 1 ? "" : "s"}`;
}

function isGeneratedVisualGroupName(name: string) {
  return /^potential visual group\b/i.test(name.trim());
}

function visualGroupDisplayName(name: string) {
  const identifier = name.trim().replace(/^potential visual group\s*/i, "");
  return identifier ? `Similar listings · ${identifier}` : "Similar listings";
}

function ActiveFilterChip({
  label,
  value,
  onEdit,
  onRemove,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-8 min-w-0 items-center rounded-md border border-stone-200 bg-stone-50 text-[11px] font-semibold text-stone-700">
      <button
        type="button"
        onClick={onEdit}
        className="flex h-full min-w-0 items-center gap-1.5 rounded-l-md px-2.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400"
        title={`Edit ${label.toLowerCase()} filter`}
      >
        <span className="text-stone-400">{label}</span>
        <span className="max-w-40 truncate text-stone-800">{value}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label.toLowerCase()} filter`}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-r-md text-stone-400 hover:bg-stone-200 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

export function TriageFilters({
  facets,
  filters,
  onFiltersChange,
  showIpFilter,
  ipAware,
  showAiRecommendation,
  selectedCount,
}: {
  facets: MonitoringFacets;
  filters: BoardFilters;
  onFiltersChange: (next: Partial<BoardFilters>) => void;
  showIpFilter: boolean;
  ipAware: boolean;
  showAiRecommendation: boolean;
  selectedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<FilterSection | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const sections = useMemo<SectionDefinition[]>(() => {
    const next: SectionDefinition[] = [];

    if (showIpFilter && ipAware && (facets.ips.length > 1 || filters.ip_id)) {
      const selectedIp = facets.ips.find((ip) => ip.ip_id === filters.ip_id);
      next.push({
        key: "ip",
        label: "IP",
        emptyLabel: "All IPs",
        currentValue: filters.ip_id,
        currentLabel: filters.ip_id ? selectedIp?.name ?? "Selected IP" : null,
        options: [
          { value: null, label: "All IPs", count: facets.total },
          ...facets.ips.map((ip) => ({
            value: ip.ip_id,
            label: ip.name ?? "Unnamed IP",
            count: ip.n,
          })),
        ],
      });
    }

    if ((facets.product_groups?.length ?? 0) > 0 || filters.product_group_id) {
      const selectedGroup = facets.product_groups?.find(
        (group) => group.product_group_id === filters.product_group_id,
      );
      const mappedGroups: FilterOption[] = (facets.product_groups ?? []).map((group) => {
        const visualCluster = isGeneratedVisualGroupName(group.name);
        return {
          value: group.product_group_id,
          label: visualCluster ? visualGroupDisplayName(group.name) : group.name,
          count: group.n,
          groupKind: visualCluster ? "visual_cluster" as const : "product" as const,
          groupSection: visualCluster ? "Visual clusters" as const : "Products" as const,
          detail: visualCluster
            ? `Needs confirmation · ${findingCountLabel(group.n)}`
            : `Saved product group · ${findingCountLabel(group.n)}`,
          searchText: group.name,
        };
      });
      const selectedMappedGroup = mappedGroups.find(
        (group) => group.value === filters.product_group_id,
      );
      const groupOptions: FilterOption[] = [
        { value: null, label: "All products and clusters" },
        ...mappedGroups.filter((option) => option.groupKind === "product"),
        ...mappedGroups.filter((option) => option.groupKind === "visual_cluster"),
      ];
      if (filters.product_group_id && !selectedGroup) {
        groupOptions.splice(1, 0, {
          value: filters.product_group_id,
          label: "Selected group",
          count: 0,
          groupKind: "product",
          groupSection: "Products",
          detail: "Saved product group · 0 findings",
        });
      }
      next.push({
        key: "product_group",
        label: "Product or cluster",
        chipLabel: "Group",
        emptyLabel: "All products and clusters",
        currentValue: filters.product_group_id,
        currentLabel: filters.product_group_id
          ? selectedMappedGroup?.label ?? selectedGroup?.name ?? "Selected group"
          : null,
        options: groupOptions,
      });
    }

    if (facets.platforms.length > 1 || filters.platform) {
      next.push({
        key: "platform",
        label: "Website",
        emptyLabel: "All websites",
        currentValue: filters.platform,
        currentLabel: filters.platform,
        options: [
          { value: null, label: "All websites", count: facets.total },
          ...facets.platforms.map((platform) => ({
            value: platform.domain,
            label: platform.domain,
            count: platform.n,
          })),
        ],
      });
    }

    if (showAiRecommendation) {
      next.push({
        key: "candidate_outcome",
        label: "AI recommendation",
        emptyLabel: "Any recommendation",
        currentValue: filters.candidate_outcome,
        currentLabel: filters.candidate_outcome
          ? CANDIDATE_OUTCOME_LABELS[filters.candidate_outcome]
          : null,
        options: [
          {
            value: null,
            label: "Any recommendation",
            count: facets.statuses.pending ?? 0,
          },
          ...CANDIDATE_OUTCOME_ORDER.map((outcome) => ({
            value: outcome,
            label: CANDIDATE_OUTCOME_LABELS[outcome],
            count: facets.candidate_outcomes?.[outcome] ?? 0,
          })),
        ],
      });
    }

    if (filters.status === "dismissed" || filters.dismissal_reason) {
      next.push({
        key: "dismissal_reason",
        label: "Dismissal outcome",
        emptyLabel: "All dismissed",
        currentValue: filters.dismissal_reason,
        currentLabel: filters.dismissal_reason
          ? DISMISSAL_REASON_LABELS[filters.dismissal_reason]
          : null,
        options: [
          {
            value: null,
            label: "All dismissed",
            count: facets.statuses.dismissed ?? 0,
          },
          ...Object.entries(DISMISSAL_REASON_LABELS).map(([value, label]) => ({
            value,
            label,
            count: facets.dismissal_reasons?.[value] ?? 0,
          })),
        ],
      });
    }

    return next;
  }, [facets, filters, ipAware, showAiRecommendation, showIpFilter]);

  const selectedSection = sections.find((section) => section.key === activeSection) ?? null;
  const activeSections = sections.filter((section) => section.currentValue);
  const filteredOptions = selectedSection?.options.filter((option) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return !normalizedQuery || `${option.label} ${option.detail ?? ""} ${option.searchText ?? ""}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  }) ?? [];

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveSection(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (activeSection) {
        setActiveSection(null);
        setQuery("");
      } else {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeSection, open]);

  useEffect(() => {
    if (open && selectedSection && selectedSection.options.length > 7) {
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, selectedSection]);

  function openMenu(section: FilterSection | null = null) {
    setActiveSection(section);
    setQuery("");
    setOpen(true);
  }

  function clearSection(section: FilterSection) {
    switch (section) {
      case "ip":
        onFiltersChange({ ip_id: null, product_group_id: null });
        break;
      case "product_group":
        onFiltersChange({ product_group_id: null });
        break;
      case "platform":
        onFiltersChange({ platform: null });
        break;
      case "candidate_outcome":
        onFiltersChange({ candidate_outcome: null });
        break;
      case "dismissal_reason":
        onFiltersChange({ dismissal_reason: null });
        break;
    }
  }

  function selectOption(section: FilterSection, value: string | null) {
    switch (section) {
      case "ip":
        onFiltersChange({ ip_id: value, product_group_id: null });
        break;
      case "product_group":
        onFiltersChange({ product_group_id: value });
        break;
      case "platform":
        onFiltersChange({ platform: value });
        break;
      case "candidate_outcome":
        onFiltersChange({
          candidate_outcome: value as MonitoringCandidateOutcome | null,
          ...(value ? { status: "pending" as const } : {}),
        });
        break;
      case "dismissal_reason":
        onFiltersChange({
          status: "dismissed",
          dismissal_reason: value as MonitoringDismissalReasonFilter | null,
          show_dismissed: true,
        });
        break;
    }
    setOpen(false);
    setActiveSection(null);
    setQuery("");
  }

  function clearAll() {
    const next: Partial<BoardFilters> = {
      product_group_id: null,
      platform: null,
      candidate_outcome: null,
      dismissal_reason: null,
    };
    if (showIpFilter) next.ip_id = null;
    onFiltersChange(next);
  }

  return (
    <div className="flex min-h-12 items-center gap-2 border-t border-stone-100 px-3 py-2">
      <div ref={rootRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false);
              setActiveSection(null);
            } else {
              openMenu();
            }
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${
            open
              ? "border-stone-300 bg-stone-100 text-stone-900"
              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
          }`}
        >
          <Filter className="size-3.5" aria-hidden />
          Filter
          {activeSections.length > 0 && (
            <span className="rounded-full bg-stone-900 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
              {activeSections.length}
            </span>
          )}
        </button>

        {open && (
          <div
            role="menu"
            aria-label={selectedSection ? `${selectedSection.label} filter` : "Filters"}
            className={`absolute left-0 top-full z-50 mt-1 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl shadow-stone-900/10 ${
              selectedSection?.key === "product_group" ? "w-[400px]" : "w-[320px]"
            }`}
          >
            {selectedSection ? (
              <>
                <div className="flex h-10 items-center gap-2 border-b border-stone-100 px-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection(null);
                      setQuery("");
                    }}
                    aria-label="Back to filters"
                    className="flex size-7 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <span className="flex-1 text-xs font-semibold text-stone-800">
                    {selectedSection.label}
                  </span>
                  {selectedSection.currentValue && (
                    <button
                      type="button"
                      onClick={() => selectOption(selectedSection.key, null)}
                      className="rounded px-1.5 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {selectedSection.options.length > 7 && (
                  <label className="relative block border-b border-stone-100 p-2">
                    <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" aria-hidden />
                    <span className="sr-only">Search {selectedSection.label.toLowerCase()}</span>
                    <input
                      ref={searchRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={selectedSection.key === "product_group"
                        ? "Search products or clusters…"
                        : `Search ${selectedSection.label.toLowerCase()}…`}
                      className="h-8 w-full rounded-md border border-stone-200 bg-stone-50 pl-8 pr-2 text-xs text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                )}
                <div className="max-h-72 overflow-y-auto p-1.5">
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option, index) => {
                      const selected = selectedSection.currentValue === option.value;
                      const richGroupOption =
                        selectedSection.key === "product_group" && option.value && option.groupKind;
                      const previousOption = filteredOptions[index - 1];
                      const showGroupSection =
                        richGroupOption && option.groupSection !== previousOption?.groupSection;
                      return (
                        <div key={option.value ?? "all"}>
                          {showGroupSection && (
                            <p className="px-2.5 pb-1 pt-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400 first:pt-1">
                              {option.groupSection}
                            </p>
                          )}
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            onClick={() => selectOption(selectedSection.key, option.value)}
                            className={`flex w-full items-center rounded-md text-left text-xs text-stone-700 hover:bg-stone-100 focus:outline-none focus-visible:bg-stone-100 ${
                              richGroupOption ? "gap-2.5 px-2 py-2.5" : "gap-2 px-2 py-2"
                            }`}
                          >
                            {richGroupOption ? (
                              <span className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${
                                option.groupKind === "visual_cluster"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-stone-200 bg-stone-50 text-stone-600"
                              }`}>
                                {option.groupKind === "visual_cluster"
                                  ? <ScanSearch className="size-4" aria-hidden />
                                  : <PackageSearch className="size-4" aria-hidden />}
                              </span>
                            ) : (
                              <span className="flex size-4 shrink-0 items-center justify-center">
                                {selected && <Check className="size-3.5 text-stone-900" aria-hidden />}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className={`${richGroupOption ? "line-clamp-2 leading-4" : "block truncate"} font-semibold text-stone-800`}>
                                {option.label}
                              </span>
                              {richGroupOption && option.detail && (
                                <span className="mt-0.5 block text-[10px] leading-4 text-stone-400">
                                  {option.detail}
                                </span>
                              )}
                            </span>
                            {richGroupOption ? (
                              <span className="flex size-5 shrink-0 items-center justify-center">
                                {selected && <Check className="size-4 text-stone-900" aria-hidden />}
                              </span>
                            ) : option.count != null && (
                              <span className="text-[10px] tabular-nums text-stone-400">
                                {option.count.toLocaleString()}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-stone-400">No matches</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 items-center border-b border-stone-100 px-3">
                  <span className="flex-1 text-xs font-semibold text-stone-800">Filter by</span>
                  {activeSections.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="rounded px-1.5 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="p-1.5">
                  {sections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      role="menuitem"
                      onClick={() => openMenu(section.key)}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left hover:bg-stone-100 focus:outline-none focus-visible:bg-stone-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-stone-800">{section.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-stone-400">
                          {section.currentLabel ?? section.emptyLabel}
                        </span>
                      </span>
                      <ChevronRight className="size-3.5 shrink-0 text-stone-400" aria-hidden />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {activeSections.map((section) => (
          <ActiveFilterChip
            key={section.key}
            label={section.chipLabel ?? section.label}
            value={section.currentLabel ?? section.emptyLabel}
            onEdit={() => openMenu(section.key)}
            onRemove={() => clearSection(section.key)}
          />
        ))}
        {activeSections.length > 1 && (
          <button
            type="button"
            onClick={clearAll}
            className="h-8 shrink-0 rounded-md px-2 text-[10px] font-semibold text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            Clear all
          </button>
        )}
      </div>

      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-stone-500">
        {selectedCount > 0
          ? `${selectedCount.toLocaleString()} selected`
          : filterCountLabel(facets.total)}
      </span>
    </div>
  );
}
