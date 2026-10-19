export interface SemanticFilters {
  categories?: string[];
  colors?: string[];
  materials?: string[];
  form_factors?: string[];
  identity_facts?: Array<{ kind: string; value: string; name?: string }>;
  variant_attributes?: Array<{ key: string; unit: string; value?: string; values?: number[] }>;
}

/** Invalid shared links remain in the request so the API rejects them; this
 * reader only provides a safe draft when opening the editor. */
export function readSemanticFilters(raw?: string | null): SemanticFilters | null {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    for (const key of ["categories", "colors", "materials", "form_factors"]) {
      if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some((item: unknown) => typeof item !== "string"))) return null;
    }
    if (value.identity_facts !== undefined && (!Array.isArray(value.identity_facts) || value.identity_facts.some((item: Record<string, unknown>) => !item || typeof item !== "object" || !("kind" in item) || typeof item.kind !== "string" || !("value" in item) || typeof item.value !== "string" || item.name !== undefined && typeof item.name !== "string"))) return null;
    if (value.variant_attributes !== undefined && (!Array.isArray(value.variant_attributes) || value.variant_attributes.some((item: Record<string, unknown>) => !item || typeof item !== "object" || typeof item.key !== "string" || typeof item.unit !== "string" || (item.unit === "text" ? typeof item.value !== "string" : !Array.isArray(item.values) || item.values.some((n: unknown) => typeof n !== "number"))))) return null;
    return value;
  } catch { return null; }
}
export function semanticFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(semanticFingerprint).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${semanticFingerprint(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function semanticFilterLabel(raw: string): string {
  const value = readSemanticFilters(raw);
  if (!value) return "Product details";
  const parts = [...value.colors ?? [], ...value.materials ?? [], ...value.categories ?? [],
    ...value.form_factors ?? [], ...value.identity_facts?.map(fact => fact.value) ?? [],
    ...value.variant_attributes?.map(attribute => attribute.unit === "text" ? attribute.value ?? "" : `${attribute.values?.join(" × ")} ${attribute.unit}`) ?? []];
  return parts.map(part => part.replaceAll("_", " ")).join(" · ") || "Product details";
}
