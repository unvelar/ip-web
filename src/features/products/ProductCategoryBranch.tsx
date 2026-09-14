import { CategoryPathToggle } from "./CategoryPathToggle";
import type { ProductCategoryNode } from "./labDomain";
import { ProductRow } from "./ProductRow";

export function ProductCategoryBranch({
  category,
  depth,
  ancestors = [],
  collapsedPaths,
  forceExpanded,
  showAllListings,
  selectedGroupId,
  mergeSourceGroupId,
  mergeTargetGroupIds,
  mergeDisabled,
  onToggle,
  onSelectGroup,
  onToggleMergeGroup,
}: {
  category: ProductCategoryNode;
  depth: number;
  ancestors?: ProductCategoryNode[];
  collapsedPaths: Set<string>;
  forceExpanded: boolean;
  showAllListings: boolean;
  selectedGroupId: string | null;
  mergeSourceGroupId: string | null;
  mergeTargetGroupIds: Set<string>;
  mergeDisabled: boolean;
  onToggle: (path: string) => void;
  onSelectGroup: (groupId: string) => void;
  onToggleMergeGroup: (groupId: string) => void;
}) {
  const categoryChain = [category];
  let terminalCategory = category;
  while (terminalCategory.children.length === 1) {
    terminalCategory = terminalCategory.children[0];
    categoryChain.push(terminalCategory);
  }
  const breadcrumbChain = [...ancestors, ...categoryChain];
  const collapsed = !forceExpanded && breadcrumbChain.some((item) => collapsedPaths.has(item.path));
  const breadcrumb = breadcrumbChain.map((item) => item.label).join(" / ");
  const rootCategory = breadcrumbChain[0];
  const currentCategory = breadcrumbChain[breadcrumbChain.length - 1];
  const hiddenCategories = breadcrumbChain.slice(1, -1);
  const categoryGroups = categoryChain.flatMap((item) => item.groups);
  const headerTone = depth === 0
    ? "sticky top-0 z-10 bg-[#f0eeea]/95 font-semibold text-stone-700 backdrop-blur"
    : "bg-[#faf9f7] font-medium text-stone-600";
  const indent = 16 + Math.min(depth, 5) * 14;

  if (categoryGroups.length === 0 && terminalCategory.children.length > 0) {
    return (
      <>
        {terminalCategory.children.map((child) => (
          <ProductCategoryBranch
            key={child.key}
            category={child}
            depth={depth}
            ancestors={breadcrumbChain}
            collapsedPaths={collapsedPaths}
            forceExpanded={forceExpanded}
            showAllListings={showAllListings}
            selectedGroupId={selectedGroupId}
            mergeSourceGroupId={mergeSourceGroupId}
            mergeTargetGroupIds={mergeTargetGroupIds}
            mergeDisabled={mergeDisabled}
            onToggle={onToggle}
            onSelectGroup={onSelectGroup}
            onToggleMergeGroup={onToggleMergeGroup}
          />
        ))}
      </>
    );
  }

  return (
    <div role="group" aria-label={breadcrumb}>
      <div
        className={`flex w-full items-center gap-2 border-b border-stone-200/80 py-2 pr-4 text-left text-[10px] transition hover:bg-stone-100 ${headerTone}`}
        style={{ paddingLeft: indent }}
        title={breadcrumb}
      >
        <div className={`flex min-w-0 flex-1 items-center ${depth === 0 ? "uppercase tracking-[0.07em]" : ""}`}>
          <CategoryPathToggle
            category={rootCategory}
            collapsed={!forceExpanded && collapsedPaths.has(rootCategory.path)}
            forceExpanded={forceExpanded}
            onToggle={onToggle}
            className="max-w-[115px]"
          />

          {hiddenCategories.length > 0 && (
            <>
              <span className="mx-1 shrink-0 text-stone-300">/</span>
              <details
                data-category-overflow-menu
                className="group/path relative shrink-0 normal-case tracking-normal"
              >
                <summary
                  className="flex cursor-pointer list-none items-center gap-1 rounded-sm px-1 py-0.5 text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 [&::-webkit-details-marker]:hidden"
                  aria-label={`Show ${hiddenCategories.length} hidden category ${hiddenCategories.length === 1 ? "level" : "levels"}`}
                  title={hiddenCategories.map((item) => item.label).join(" / ")}
                >
                  <span className="font-semibold">…</span>
                  <span className="rounded bg-stone-200/80 px-1 text-[8px] tabular-nums text-stone-500">
                    {hiddenCategories.length}
                  </span>
                </summary>
                <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[240px] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
                  {hiddenCategories.map((item) => (
                    <CategoryPathToggle
                      key={item.path}
                      category={item}
                      collapsed={!forceExpanded && collapsedPaths.has(item.path)}
                      forceExpanded={forceExpanded}
                      onToggle={onToggle}
                      closeMenuOnToggle
                      className="w-full max-w-none px-2.5 py-1.5 text-left font-medium normal-case tracking-normal hover:bg-stone-50"
                    />
                  ))}
                </div>
              </details>
            </>
          )}

          {breadcrumbChain.length > 1 && (
            <>
              <span className="mx-1 shrink-0 text-stone-300">/</span>
              <CategoryPathToggle
                category={currentCategory}
                collapsed={!forceExpanded && collapsedPaths.has(currentCategory.path)}
                forceExpanded={forceExpanded}
                onToggle={onToggle}
                className="min-w-0 flex-1 max-w-none font-semibold"
              />
            </>
          )}
        </div>
        <span className="shrink-0 rounded bg-stone-200/70 px-1.5 py-0.5 text-[9px] font-medium text-stone-500">
          {categoryGroups.length}
        </span>
      </div>

      {!collapsed && (
        <>
          {categoryGroups.map(({ group, index }) => (
            <ProductRow
              key={group.id}
              group={group}
              index={index}
              listingCount={showAllListings
                ? group.member_count
                : group.triage_member_count ?? group.member_count}
              depth={depth + 1}
              selected={selectedGroupId === group.id}
              mergeState={mergeSourceGroupId
                ? mergeSourceGroupId === group.id
                  ? "source"
                  : mergeTargetGroupIds.has(group.id)
                    ? "selected"
                    : "available"
                : null}
              mergeDisabled={mergeDisabled}
              onSelect={() => onSelectGroup(group.id)}
              onToggleMerge={() => onToggleMergeGroup(group.id)}
            />
          ))}
          {terminalCategory.children.map((child) => (
            <ProductCategoryBranch
              key={child.key}
              category={child}
              depth={depth + 1}
              ancestors={breadcrumbChain}
              collapsedPaths={collapsedPaths}
              forceExpanded={forceExpanded}
              showAllListings={showAllListings}
              selectedGroupId={selectedGroupId}
              mergeSourceGroupId={mergeSourceGroupId}
              mergeTargetGroupIds={mergeTargetGroupIds}
              mergeDisabled={mergeDisabled}
              onToggle={onToggle}
              onSelectGroup={onSelectGroup}
              onToggleMergeGroup={onToggleMergeGroup}
            />
          ))}
        </>
      )}
    </div>
  );
}
