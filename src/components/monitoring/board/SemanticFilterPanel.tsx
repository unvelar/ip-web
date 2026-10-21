import { useState } from "react";
import { DEFAULT_PRODUCT_SEMANTIC_COLORS } from "../../../api/products";
import { readSemanticFilters, semanticCategoryLabel, type SemanticFilters } from "../../../lib/semanticFilters";
import { useProductSemanticTaxonomy } from "../../../hooks/useProductSemanticTaxonomy";
import "./SemanticFilterPanel.css";

const factKinds = ["brand", "maker", "product_name", "model", "part_number", "function", "compatibility", "formula", "contents", "specification", "edition"];
const attributes: Record<string, string> = { apparel_size: "text", shoe_size: "text", offer_format: "text", content_volume: "ml", net_weight: "g", height: "mm", width: "mm", length: "mm", diameter: "mm", dimensions: "mm", pack_count: "count" };
const label = (key: string) => key.replaceAll("_", " ").replace(/^./, char => char.toUpperCase());
const keys = (text: string) => [...new Set(text.split(",").map(value => value.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean))];

export function SemanticFilterPanel({ value, ipId, available = true, onApply }: {
  value?: string | null; ipId: string | null; available?: boolean; onApply: (value: string | null) => void;
}) {
  const [initial] = useState(() => readSemanticFilters(value) ?? {});
  const [colors, setColors] = useState(initial.colors ?? []);
  const [categories, setCategories] = useState(initial.categories ?? []);
  const { categories: taxonomy, labels: categoryLabels } = useProductSemanticTaxonomy(ipId, categories, true);
  const [material, setMaterial] = useState(initial.materials?.join(", ") ?? "");
  const [form, setForm] = useState(initial.form_factors?.join(", ") ?? "");
  const [facts, setFacts] = useState(initial.identity_facts ?? []);
  const [variants, setVariants] = useState(() => initial.variant_attributes?.map(item => ({ key: item.key, value: item.unit === "text" ? item.value ?? "" : item.values?.join(", ") ?? "" })) ?? []);
  const semantic: SemanticFilters = {};
  if (colors.length) semantic.colors = colors;
  if (categories.length) semantic.categories = categories;
  if (keys(material).length) semantic.materials = keys(material);
  if (keys(form).length) semantic.form_factors = keys(form);
  if (facts.length) semantic.identity_facts = facts.map(fact => ({ ...fact, value: fact.value.trim(), ...(fact.name ? { name: fact.name.trim() } : {}) }));
  if (variants.length) semantic.variant_attributes = variants.map(item => attributes[item.key] === "text"
    ? { key: item.key, unit: "text", value: item.value.trim() }
    : { key: item.key, unit: attributes[item.key], values: item.value.split(",").map(value => value.trim() ? Number(value) : NaN) });
  const invalid = [...keys(material), ...keys(form)].some(key => !/^[a-z][a-z0-9_]{0,79}$/.test(key)) || keys(material).length > 20 || keys(form).length > 20
    || facts.some(fact => !factKinds.includes(fact.kind) || !fact.value.trim() || fact.value.length > 240 || !/[\p{L}\p{N}]/u.test(fact.value) || [...fact.value].some(char => char.charCodeAt(0) < 32))
    || semantic.variant_attributes?.some(item => item.unit === "text" ? !item.value || item.value.length > 240
      : !item.values || item.values.some(value => !Number.isFinite(value) || value <= 0 || value > 1e9 || item.unit === "count" && !Number.isInteger(value))
        || (item.key === "dimensions" ? item.values.length < 2 || item.values.length > 3 : item.values.length !== 1));
  const categoryOptions = [...taxonomy, ...categories.filter(key => !taxonomy.some(item => item.key === key)).map(key => ({ key, label: semanticCategoryLabel(key, categoryLabels), supports_color_variants: true }))];
  return <div className="semantic-filter-panel">
    <p>Match product details recorded in the listing. Combine fields to narrow results; listings without those details are excluded.</p>
    {!available && <p role="status">Product detail filtering is not available yet.</p>}
    <fieldset disabled={!available}><legend>Offered colors</legend><div className="semantic-color-options">{DEFAULT_PRODUCT_SEMANTIC_COLORS.map(color => <button key={color.key} type="button" aria-pressed={colors.includes(color.key)} onClick={() => setColors(current => current.includes(color.key) ? current.filter(key => key !== color.key) : [...current, color.key])}>{color.label}</button>)}</div></fieldset>
    <label>Product type<select value="" disabled={!available || categories.length >= 20} onChange={event => { if (event.target.value && !categories.includes(event.target.value)) setCategories([...categories, event.target.value]); }}><option value="">{categoryOptions.length ? "Choose a type…" : "Select a brand to choose types"}</option>{categoryOptions.filter(item => !categories.includes(item.key)).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    {categories.length > 0 && <div className="semantic-color-options">{categories.map(key => <button key={key} type="button" aria-label={`Remove ${semanticCategoryLabel(key, categoryLabels)} type`} onClick={() => setCategories(categories.filter(item => item !== key))}>{semanticCategoryLabel(key, categoryLabels)} ×</button>)}</div>}
    <label>Material<input autoFocus disabled={!available} value={material} placeholder="Cotton, polyester…" onChange={event => setMaterial(event.target.value)} /><span>Separate alternatives with commas.</span></label>
    <label>Product form<input disabled={!available} value={form} placeholder="Jersey, bottle…" onChange={event => setForm(event.target.value)} /></label>
    {facts.map((fact, index) => <div className="semantic-detail-row" key={index}><label>Identity detail<select value={fact.kind} onChange={event => setFacts(facts.map((item, i) => i === index ? { ...item, kind: event.target.value } : item))}>{factKinds.map(kind => <option key={kind} value={kind}>{label(kind)}</option>)}</select></label><label>Exact value<input value={fact.value} maxLength={240} placeholder={fact.kind === "edition" ? "Away 2026" : "Value…"} onChange={event => setFacts(facts.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /></label><button type="button" aria-label={`Remove identity detail ${index + 1}`} onClick={() => setFacts(facts.filter((_, i) => i !== index))}>Remove</button></div>)}
    <button type="button" className="semantic-add" disabled={!available || facts.length >= 10} onClick={() => setFacts([...facts, { kind: "edition", value: "" }])}>+ Add edition or identity detail</button>
    {variants.map((attribute, index) => <div className="semantic-detail-row" key={index}><label>Variant detail<select value={attribute.key} onChange={event => setVariants(variants.map((item, i) => i === index ? { key: event.target.value, value: "" } : item))}>{Object.entries(attributes).map(([key, unit]) => <option key={key} value={key}>{label(key)}{unit !== "text" ? ` (${unit})` : ""}</option>)}</select></label><label>{attributes[attribute.key] === "text" ? "Exact value" : attribute.key === "dimensions" ? "Dimensions, separated by commas" : `Amount (${attributes[attribute.key]})`}<input value={attribute.value} placeholder={attribute.key === "content_volume" ? "50" : "Value…"} onChange={event => setVariants(variants.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /></label><button type="button" aria-label={`Remove variant detail ${index + 1}`} onClick={() => setVariants(variants.filter((_, i) => i !== index))}>Remove</button></div>)}
    <button type="button" className="semantic-add" disabled={!available || variants.length >= 10} onClick={() => setVariants([...variants, { key: "content_volume", value: "" }])}>+ Add size or measurement</button>
    {invalid && <p role="alert">Complete each detail. Measurements must be positive numbers in the displayed unit.</p>}
    <div className="semantic-filter-actions"><button type="button" onClick={() => onApply(null)}>Clear details</button><button type="button" disabled={!available || Boolean(invalid)} onClick={() => onApply(Object.keys(semantic).length ? JSON.stringify(semantic) : null)}>Apply filters</button></div>
  </div>;
}
