import { useEffect, useState } from "react";
import { getProductSemanticTaxonomy, type ProductSemanticCategory } from "../api/products";

/** Labels are optional presentation data. Keep unknown filter keys intact, but
 * never borrow a previous brand's labels or expose those keys as display text. */
export function useProductSemanticTaxonomy(ipId: string | null, selectedKeys: readonly string[] = [], includeAll = false) {
  const selection = [...new Set(selectedKeys)].sort().join(",");
  const enabled = includeAll || Boolean(selection);
  const [loaded, setLoaded] = useState<{ ipId: string; categories: ProductSemanticCategory[] } | null>(null);
  useEffect(() => {
    if (!ipId || !enabled) return;
    const controller = new AbortController();
    void getProductSemanticTaxonomy(ipId, controller.signal).then(result => {
      if (controller.signal.aborted || !result || !Array.isArray(result.categories)) return;
      const categories = result.categories.filter(category => category
        && typeof category.key === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(category.key)
        && typeof category.label === "string" && category.label.trim().length > 0 && category.label.length <= 120);
      setLoaded({ ipId, categories });
    }).catch(() => { /* Filters remain visible and removable when labels cannot load. */ });
    return () => controller.abort();
  }, [ipId, enabled, selection]);
  const categories = loaded?.ipId === ipId ? loaded.categories : [];
  return { categories, labels: Object.fromEntries(categories.map(category => [category.key, category.label])) };
}
