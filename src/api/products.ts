import type { MonitoringActionability } from "./monitoring";
import { request } from "./transport";

// --- Product clustering lab ---

export interface ProductClusterScope {
  ip_id: string;
  ip_name: string;
  profile_count: number;
  pair_count: number;
  latest_profile_at: string;
}

export interface ProductClusterProfile {
  id: string;
  case_id: string;
  listing_title: string | null;
  platform: string | null;
  source_url: string | null;
  description_summary: string | null;
  profile_text: string;
  price_value: number | null;
  price_currency: string | null;
  price_value_usd: number | null;
  price_signal: ProductGroupPriceSignal | null;
  image_count: number;
  image_url: string | null;
  group_image_id?: string | null;
  group_image_position?: number | null;
  group_image_similarity?: number | null;
  semantic_component_id?: string | null;
  semantic_component_ordinal?: number | null;
  semantic_correction_id?: string | null;
  semantic_source_category_key?: string | null;
  semantic_source_category_label?: string | null;
  semantic_variant_colors?: ProductSemanticVariantColor[];
  variant_attributes?: ProductVariantAttribute[];
  commercial_subgroup_key?: string | null;
  actionability?: MonitoringActionability | null;
  updated_at: string;
}

export interface ProductSemanticVariantColor {
  color: string;
  confidence: number;
  evidence_image_positions: number[];
}

export type ProductVariantAttributeUnit = "ml" | "g" | "mm" | "count" | "text";

export interface ProductVariantAttribute {
  key: string;
  value: string;
  normalized_values: number[];
  normalized_unit: ProductVariantAttributeUnit;
  confidence: number;
  evidence_image_positions: number[];
  text_evidence: string[];
}

export interface ProductSemanticCategory {
  key: string;
  label: string;
  supports_color_variants: boolean;
  is_generic?: boolean;
  source?: "seed" | "classifier" | "reviewer";
}

export interface ProductSemanticColor {
  key: string;
  label: string;
}

// This is a staged-deployment fallback. The matching API endpoint is
// authoritative once the backend release is live.
export const DEFAULT_PRODUCT_SEMANTIC_TAXONOMY: readonly ProductSemanticCategory[] = [
  { key: "plush_toy", label: "Plush toy", supports_color_variants: true },
  { key: "keychain", label: "Keychain", supports_color_variants: true },
  { key: "backpack", label: "Backpack", supports_color_variants: true },
  { key: "bag", label: "Bag", supports_color_variants: true },
  { key: "cushion", label: "Cushion", supports_color_variants: true },
  { key: "doll", label: "Doll", supports_color_variants: true },
  { key: "figurine", label: "Figurine", supports_color_variants: true },
  { key: "toy", label: "Toy", supports_color_variants: true },
  { key: "apparel", label: "Apparel item", supports_color_variants: true },
  { key: "footwear", label: "Footwear item", supports_color_variants: true },
  { key: "jewelry", label: "Jewelry item", supports_color_variants: true },
  { key: "phone_case", label: "Phone case", supports_color_variants: true },
  { key: "perfume", label: "Perfume", supports_color_variants: false },
  { key: "body_care", label: "Body care item", supports_color_variants: false },
  { key: "cosmetics", label: "Cosmetic", supports_color_variants: false },
  { key: "drinkware", label: "Drinkware item", supports_color_variants: true },
  { key: "wall_art", label: "Wall art item", supports_color_variants: true },
  { key: "sticker", label: "Sticker", supports_color_variants: true },
  { key: "pin_badge", label: "Pin or badge", supports_color_variants: true },
  { key: "patch", label: "Patch", supports_color_variants: true },
  { key: "stationery", label: "Stationery item", supports_color_variants: true },
  { key: "home_decor", label: "Home decor item", supports_color_variants: true },
  { key: "accessory", label: "Accessory", supports_color_variants: true },
  { key: "other", label: "Other product", supports_color_variants: false },
];

export const DEFAULT_PRODUCT_SEMANTIC_COLORS: readonly ProductSemanticColor[] = [
  { key: "black", label: "Black" },
  { key: "blue", label: "Blue" },
  { key: "brown", label: "Brown" },
  { key: "clear", label: "Clear" },
  { key: "gold", label: "Gold" },
  { key: "gray", label: "Gray" },
  { key: "green", label: "Green" },
  { key: "multicolor", label: "Multicolor" },
  { key: "orange", label: "Orange" },
  { key: "pink", label: "Pink" },
  { key: "purple", label: "Purple" },
  { key: "red", label: "Red" },
  { key: "silver", label: "Silver" },
  { key: "tan", label: "Tan" },
  { key: "white", label: "White" },
  { key: "yellow", label: "Yellow" },
];

export interface ProductClusterEdge {
  id: string;
  left_profile_id: string;
  right_profile_id: string;
  vector_similarity: number;
  exact_reranker_score: number;
  related_reranker_score: number;
  same_product_score: number;
  related_product_score: number;
  price_ratio: number | null;
  price_similarity: number | null;
  cheaper_profile_id: string | null;
  too_cheap_signal: number | null;
  scored_at: string;
}

export interface ProductClusterGraph {
  scope: ProductClusterScope;
  profiles: ProductClusterProfile[];
  edges: ProductClusterEdge[];
  truncated: boolean;
}

export interface ProductGroupRecommendationCounts {
  takedown: number;
  second_hand: number;
  might_be_ok: number;
  needs_review: number;
  /** @deprecated Backward-compatible aggregate from older API responses. */
  review?: number;
}

export interface ProductGroupPriceSignal {
  unusually_low: boolean;
  percent_below_reference: number;
  reference_median_usd: number;
  comparison_scope?: "group" | "visual_cohort" | "commercial_variant";
  source_group_id?: string | null;
  source_group_name?: string | null;
}

export interface ProductGroupPriceSignalMember {
  profile_id: string;
  case_id: string;
  price_value_usd: number;
  price_signal: ProductGroupPriceSignal;
}

export interface ProductGroupPriceSummary {
  currency: "USD";
  reference_source: "group" | "reviewed";
  reference_count: number;
  comparable_count: number;
  reviewed_clear_count: number;
  reviewed_resale_count: number;
  actioned_count: number;
  median_usd: number;
  typical_low_usd: number;
  typical_high_usd: number;
  unusually_low_threshold_usd: number;
  unusually_low_count: number;
}

export type ProductCommercialPriceBand =
  | "unusually_low"
  | "other_priced"
  | "unpriced";

export interface ProductCommercialPriceRange {
  currency: "USD";
  count: number;
  minimum: number;
  median: number;
  maximum: number;
}

export interface ProductGroupCommercialSubgroup {
  key: string;
  variant_key: string;
  variant_label: string;
  variant_attributes: ProductVariantAttribute[];
  price_band: ProductCommercialPriceBand;
  price_range: ProductCommercialPriceRange | null;
  member_count: number;
  preview_members: ProductClusterProfile[];
  triage_member_count: number;
  triage_recommendation_counts: ProductGroupRecommendationCounts;
  triage_case_ids: string[];
  price_summary: ProductGroupPriceSummary | null;
}

export interface PersistedProductGroup {
  id: string;
  display_name: string | null;
  name_source: "auto" | "manual";
  confirmation_status: "candidate" | "confirmed";
  confirmed_at: string | null;
  canonical_product_id: string | null;
  catalog_display_name: string;
  catalog_name_source: "manual" | "identity_facts" | "generated_traits" | "fallback";
  catalog_name_confidence: number | null;
  catalog_name_support_count: number | null;
  catalog_name_policy_version: string | null;
  catalog_task_count: number;
  catalog_primary_category_id: string | null;
  catalog_primary_category_name: string | null;
  catalog_primary_category_path: string | null;
  catalog_primary_category_version: string | null;
  catalog_primary_category_source:
    | "backfill"
    | "classifier"
    | "semantic_correction"
    | "reviewer"
    | null;
  atomic_cohort_count: number;
  parent_group_id: string | null;
  semantic_kind: "category" | "color" | null;
  semantic_key: string | null;
  semantic_definition: Record<string, string> | null;
  member_count: number;
  triage_member_count: number | null;
  triage_recommendation_counts?: ProductGroupRecommendationCounts | null;
  price_summary: ProductGroupPriceSummary | null;
  price_signal_members: ProductGroupPriceSignalMember[];
  commercial_subgroups: ProductGroupCommercialSubgroup[];
  average_score: number | null;
  minimum_score: number | null;
  threshold: number;
  embedding_match_threshold: number | null;
  algorithm_version: string;
  generated_at: string;
  members: ProductClusterProfile[];
  triage_members: ProductClusterProfile[];
  rules: ProductGroupRule[];
  authenticity_rules: ProductGroupAuthenticityRule[];
  canonical_decisions: ProductCanonicalDecision[];
  reconciliation_suggestions: ProductGroupReconciliationSuggestion[];
}

export interface ProductCatalogCategoryFacet {
  id: string;
  name: string;
  path: string;
  version: string;
  product_count: number;
}

export type ProductCatalogScope = "catalog" | "history";

export interface ProductCanonicalDecision {
  id: string;
  canonical_product_id: string;
  left_group_id: string;
  right_group_id: string;
  decision_source: "reviewer" | "automatic";
  confidence: number;
  created_at: string;
}

export interface ProductGroupMergeCandidate {
  group_id: string;
  canonical_product_id: string | null;
  display_name: string;
  confirmation_status: "candidate" | "confirmed";
  member_count: number;
  category_name: string | null;
  category_path: string | null;
  representative_listing_title: string | null;
}

export interface ProductGroupReconciliationSuggestion {
  target_group_id: string;
  target_display_name: string | null;
  target_member_count: number;
  target_confirmation_status: "candidate" | "confirmed";
  target_preview_members: ProductClusterProfile[];
  left_group_id: string;
  right_group_id: string;
  recommendation: "review" | "automatic";
  confidence: number;
  support_count: number;
  left_member_count: number;
  right_member_count: number;
  left_coverage: number;
  right_coverage: number;
  average_same_product_score: number;
  median_same_product_score: number;
  minimum_same_product_score: number;
  median_exact_reranker_score: number;
  direct_relation_count: number;
  legacy_relation_count: number;
}

export interface ProductGroupRule {
  id: string;
  group_id: string;
  instruction: string;
  status: "active";
  version: number;
  created_at: string;
  updated_at: string;
}

export type ProductAuthenticityModality = "image" | "description" | "both";
export type ProductAuthenticityFailureAction = "review" | "takedown";

export interface ProductGroupAuthenticityRule {
  id: string;
  group_id: string;
  expected_feature: string;
  violation_pattern: string;
  inspection_instruction: string;
  visibility_rule: string;
  applicability: string | null;
  rationale: string | null;
  modality: ProductAuthenticityModality;
  failure_action: ProductAuthenticityFailureAction;
  status: "active";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProductGroupAuthenticityRuleInput {
  expected_feature: string;
  violation_pattern: string;
  inspection_instruction: string;
  visibility_rule: string;
  applicability: string | null;
  rationale: string | null;
  modality: ProductAuthenticityModality;
  failure_action: ProductAuthenticityFailureAction;
}

export interface ProductGroupVisualReference {
  id: string;
  image_id: string;
  source_profile_id: string;
  reference_rank: number;
  selection_source: "auto" | "manual";
  position: number;
  listing_title: string | null;
  image_url: string | null;
}

export interface ProductGroupVisualEvidenceImage {
  image_id: string;
  profile_id: string;
  case_id: string;
  position: number;
  visual_support_score: number | null;
  matched_reference_image_id: string | null;
  is_reference: boolean;
  image_url: string | null;
}

export interface ProductGroupVisualEvidenceMember {
  profile_id: string;
  case_id: string;
  listing_title: string | null;
  platform: string | null;
  member_rank: number;
  images: ProductGroupVisualEvidenceImage[];
}

export interface ProductGroupVisualEvidence {
  group_id: string;
  display_name: string;
  member_count: number;
  references: ProductGroupVisualReference[];
  members: ProductGroupVisualEvidenceMember[];
  truncated: boolean;
}

export interface PersistedProductGroupOverview {
  scope: ProductClusterScope;
  relationship_type:
    | "same_product"
    | "related_product"
    | "visual_similarity"
    | "semantic_category";
  threshold: number;
  algorithm_version: string;
  generated_at: string | null;
  dirty: boolean;
  last_error: string | null;
  groups: PersistedProductGroup[];
  group_count: number;
  triage_group_count: number | null;
  triage_profile_count: number | null;
  snapshot_profile_count: number | null;
  snapshot_membership_count: number | null;
  pending_snapshot_count: number | null;
  ungrouped_count: number;
  triage_ungrouped_count: number | null;
  ungrouped: ProductClusterProfile[];
  triage_ungrouped: ProductClusterProfile[];
  triage_projection_available: boolean;
  pagination_group_count: number;
  next_cursor: string | null;
  truncated: boolean;
  catalog_scope: ProductCatalogScope;
  catalog_product_count: number;
  catalog_history_product_count: number;
  catalog_categories: ProductCatalogCategoryFacet[];
  unclassified_product_count: number;
  /** False only while the frontend is talking to a pre-catalog API release. */
  catalog_supported: boolean;
}

export type ProductGroupCorrectionReason = "wrong_product" | "different_variant";

export interface ProductGroupMemberCorrection {
  id: string;
  source_group_id: string;
  removed_profile_id: string;
  removed_case_id: string;
  reason: ProductGroupCorrectionReason;
  created_at: string;
}

export interface ProductSemanticCorrection {
  id: string;
  source_group_id: string | null;
  profile_id: string;
  case_id: string;
  component_ordinal: number;
  source_category_key: string;
  source_category_label: string;
  corrected_category_key: string;
  corrected_category_label: string;
  corrected_variant_colors: ProductSemanticVariantColor[];
  created_at: string;
}

export function listProductClusterScopes(signal?: AbortSignal) {
  return request<{ scopes: ProductClusterScope[] }>("/api/product-clusters/scopes", { signal });
}

export function getProductSemanticTaxonomy(ipId: string) {
  return request<{
    categories: ProductSemanticCategory[];
    colors?: ProductSemanticColor[];
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/semantic-taxonomy`,
  );
}

export function getProductClusterGraph(
  ipId: string,
  options: { maxNodes?: number; maxEdges?: number } = {},
) {
  const params = new URLSearchParams();
  if (options.maxNodes) params.set("max_nodes", String(options.maxNodes));
  if (options.maxEdges) params.set("max_edges", String(options.maxEdges));
  const qs = params.toString();
  return request<ProductClusterGraph>(
    `/api/product-clusters/${encodeURIComponent(ipId)}${qs ? `?${qs}` : ""}`,
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeProductGroupPriceSignal(
  signal: ProductGroupPriceSignal | null | undefined,
): ProductGroupPriceSignal | null {
  if (
    signal?.unusually_low !== true ||
    !isFiniteNumber(signal.percent_below_reference) ||
    !isFiniteNumber(signal.reference_median_usd)
  ) {
    return null;
  }
  return {
    unusually_low: true,
    percent_below_reference: Math.max(
      1,
      Math.min(99, Math.round(signal.percent_below_reference)),
    ),
    reference_median_usd: Math.max(0, signal.reference_median_usd),
    comparison_scope: signal.comparison_scope === "visual_cohort"
      ? "visual_cohort"
      : signal.comparison_scope === "commercial_variant"
        ? "commercial_variant"
        : "group",
    source_group_id: typeof signal.source_group_id === "string"
      ? signal.source_group_id
      : null,
    source_group_name: typeof signal.source_group_name === "string"
      ? signal.source_group_name
      : null,
  };
}

function normalizeProductVariantAttributes(value: unknown): ProductVariantAttribute[] {
  if (!Array.isArray(value)) return [];
  const allowedUnits = new Set<ProductVariantAttributeUnit>([
    "ml",
    "g",
    "mm",
    "count",
    "text",
  ]);
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const attribute = raw as Partial<ProductVariantAttribute>;
    const normalizedValues = Array.isArray(attribute.normalized_values)
      ? attribute.normalized_values.filter(isFiniteNumber).slice(0, 3)
      : [];
    const evidencePositions = Array.isArray(attribute.evidence_image_positions)
      ? attribute.evidence_image_positions
        .filter(isFiniteNumber)
        .map((position) => Math.max(0, Math.trunc(position)))
        .slice(0, 16)
      : [];
    const textEvidence = Array.isArray(attribute.text_evidence)
      ? attribute.text_evidence
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
        .slice(0, 4)
      : [];
    if (
      typeof attribute.key !== "string" ||
      typeof attribute.value !== "string" ||
      !attribute.normalized_unit || !allowedUnits.has(attribute.normalized_unit) ||
      !isFiniteNumber(attribute.confidence)
    ) return [];
    return [{
      key: attribute.key,
      value: attribute.value,
      normalized_values: normalizedValues,
      normalized_unit: attribute.normalized_unit,
      confidence: Math.max(0, Math.min(1, attribute.confidence)),
      evidence_image_positions: evidencePositions,
      text_evidence: textEvidence,
    }];
  });
}

function normalizeProductGroupPriceSignalMembers(
  members: ProductGroupPriceSignalMember[] | null | undefined,
): ProductGroupPriceSignalMember[] {
  if (!Array.isArray(members)) return [];
  return members.flatMap((member) => {
    const signal = normalizeProductGroupPriceSignal(member?.price_signal);
    if (
      !signal ||
      typeof member?.profile_id !== "string" ||
      typeof member?.case_id !== "string" ||
      !isFiniteNumber(member?.price_value_usd)
    ) {
      return [];
    }
    return [{
      profile_id: member.profile_id,
      case_id: member.case_id,
      price_value_usd: Math.max(0, member.price_value_usd),
      price_signal: signal,
    }];
  });
}

function normalizeProductClusterProfile(
  profile: ProductClusterProfile,
): ProductClusterProfile {
  const nativePrice = isFiniteNumber(profile.price_value)
    ? profile.price_value
    : null;
  // Staged API compatibility: a native value is safe as a fallback only when
  // it is already USD. Never compare or relabel another currency in the UI.
  const priceValueUsd = isFiniteNumber(profile.price_value_usd)
    ? profile.price_value_usd
    : profile.price_currency?.toUpperCase() === "USD" && nativePrice != null
      ? nativePrice
      : null;
  return {
    ...profile,
    price_value_usd: priceValueUsd,
    price_signal: normalizeProductGroupPriceSignal(profile.price_signal),
    variant_attributes: normalizeProductVariantAttributes(profile.variant_attributes),
    commercial_subgroup_key: typeof profile.commercial_subgroup_key === "string"
      ? profile.commercial_subgroup_key
      : null,
  };
}

function normalizeProductGroupPriceSummary(
  summary: ProductGroupPriceSummary | null | undefined,
): ProductGroupPriceSummary | null {
  if (
    summary?.currency !== "USD" ||
    (summary.reference_source !== "group" && summary.reference_source !== "reviewed") ||
    !isFiniteNumber(summary.reference_count) ||
    !isFiniteNumber(summary.comparable_count) ||
    !isFiniteNumber(summary.reviewed_clear_count) ||
    !isFiniteNumber(summary.reviewed_resale_count) ||
    !isFiniteNumber(summary.actioned_count) ||
    !isFiniteNumber(summary.median_usd) ||
    !isFiniteNumber(summary.typical_low_usd) ||
    !isFiniteNumber(summary.typical_high_usd) ||
    !isFiniteNumber(summary.unusually_low_threshold_usd) ||
    !isFiniteNumber(summary.unusually_low_count)
  ) {
    return null;
  }
  return {
    ...summary,
    reference_count: Math.max(0, Math.trunc(summary.reference_count)),
    comparable_count: Math.max(0, Math.trunc(summary.comparable_count)),
    reviewed_clear_count: Math.max(0, Math.trunc(summary.reviewed_clear_count)),
    reviewed_resale_count: Math.max(0, Math.trunc(summary.reviewed_resale_count)),
    actioned_count: Math.max(0, Math.trunc(summary.actioned_count)),
    median_usd: Math.max(0, summary.median_usd),
    typical_low_usd: Math.max(0, summary.typical_low_usd),
    typical_high_usd: Math.max(0, summary.typical_high_usd),
    unusually_low_threshold_usd: Math.max(0, summary.unusually_low_threshold_usd),
    unusually_low_count: Math.max(0, Math.trunc(summary.unusually_low_count)),
  };
}

function normalizeProductGroupRecommendationCounts(
  counts: ProductGroupRecommendationCounts | null | undefined,
): ProductGroupRecommendationCounts | null {
  if (
    !counts ||
    !isFiniteNumber(counts.takedown) ||
    !isFiniteNumber(counts.second_hand) ||
    !isFiniteNumber(counts.might_be_ok) ||
    !isFiniteNumber(counts.needs_review)
  ) {
    // Older APIs expose one combined `review` count, which cannot be divided
    // truthfully between Might be OK and Needs review. Returning null lets the
    // page label those lanes from the visible preview until the new contract is
    // deployed instead of displaying contradictory exact totals.
    return null;
  }
  const mightBeOk = counts.might_be_ok;
  const needsReview = counts.needs_review;
  return {
    takedown: Math.max(0, Math.trunc(counts.takedown)),
    second_hand: Math.max(0, Math.trunc(counts.second_hand)),
    might_be_ok: Math.max(0, Math.trunc(mightBeOk)),
    needs_review: Math.max(0, Math.trunc(needsReview)),
    review: Math.max(0, Math.trunc(mightBeOk + needsReview)),
  };
}

function normalizeProductCommercialSubgroups(
  value: ProductGroupCommercialSubgroup[] | null | undefined,
): ProductGroupCommercialSubgroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((subgroup) => {
    const counts = normalizeProductGroupRecommendationCounts(
      subgroup?.triage_recommendation_counts,
    );
    const priceBand = subgroup?.price_band;
    if (
      typeof subgroup?.key !== "string" ||
      typeof subgroup.variant_key !== "string" ||
      typeof subgroup.variant_label !== "string" ||
      !["unusually_low", "other_priced", "unpriced"].includes(priceBand) ||
      !isFiniteNumber(subgroup.member_count) ||
      !isFiniteNumber(subgroup.triage_member_count) ||
      !counts
    ) return [];
    const rawRange = subgroup.price_range;
    const priceRange = rawRange?.currency === "USD" &&
        isFiniteNumber(rawRange.count) &&
        isFiniteNumber(rawRange.minimum) &&
        isFiniteNumber(rawRange.median) &&
        isFiniteNumber(rawRange.maximum)
      ? {
          currency: "USD" as const,
          count: Math.max(0, Math.trunc(rawRange.count)),
          minimum: Math.max(0, rawRange.minimum),
          median: Math.max(0, rawRange.median),
          maximum: Math.max(0, rawRange.maximum),
        }
      : null;
    return [{
      key: subgroup.key,
      variant_key: subgroup.variant_key,
      variant_label: subgroup.variant_label,
      variant_attributes: normalizeProductVariantAttributes(subgroup.variant_attributes),
      price_band: priceBand,
      price_range: priceRange,
      member_count: Math.max(0, Math.trunc(subgroup.member_count)),
      preview_members: Array.isArray(subgroup.preview_members)
        ? subgroup.preview_members.map(normalizeProductClusterProfile)
        : [],
      triage_member_count: Math.max(0, Math.trunc(subgroup.triage_member_count)),
      triage_recommendation_counts: counts,
      triage_case_ids: Array.isArray(subgroup.triage_case_ids)
        ? [...new Set(subgroup.triage_case_ids.filter((caseId) => typeof caseId === "string"))]
        : [],
      price_summary: normalizeProductGroupPriceSummary(subgroup.price_summary),
    }];
  });
}

function normalizeProductCanonicalDecisions(value: unknown): ProductCanonicalDecision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const decision = raw as Partial<ProductCanonicalDecision>;
    if (
      typeof decision.id !== "string" ||
      typeof decision.canonical_product_id !== "string" ||
      typeof decision.left_group_id !== "string" ||
      typeof decision.right_group_id !== "string" ||
      !["reviewer", "automatic"].includes(decision.decision_source ?? "") ||
      !isFiniteNumber(decision.confidence) ||
      typeof decision.created_at !== "string"
    ) return [];
    return [{
      ...decision,
      decision_source: decision.decision_source as "reviewer" | "automatic",
      confidence: Math.max(0, Math.min(1, decision.confidence)),
    } as ProductCanonicalDecision];
  });
}

function normalizeProductGroupReconciliationSuggestions(
  value: unknown,
): ProductGroupReconciliationSuggestion[] {
  if (!Array.isArray(value)) return [];
  const numericKeys: Array<keyof ProductGroupReconciliationSuggestion> = [
    "target_member_count",
    "confidence",
    "support_count",
    "left_member_count",
    "right_member_count",
    "left_coverage",
    "right_coverage",
    "average_same_product_score",
    "median_same_product_score",
    "minimum_same_product_score",
    "median_exact_reranker_score",
    "direct_relation_count",
    "legacy_relation_count",
  ];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const suggestion = raw as Partial<ProductGroupReconciliationSuggestion>;
    if (
      typeof suggestion.target_group_id !== "string" ||
      typeof suggestion.left_group_id !== "string" ||
      typeof suggestion.right_group_id !== "string" ||
      !["review", "automatic"].includes(suggestion.recommendation ?? "") ||
      numericKeys.some((key) => !isFiniteNumber(suggestion[key]))
    ) return [];
    return [{
      ...suggestion,
      target_display_name: typeof suggestion.target_display_name === "string"
        ? suggestion.target_display_name
        : null,
      target_confirmation_status: suggestion.target_confirmation_status === "confirmed"
        ? "confirmed"
        : "candidate",
      target_preview_members: Array.isArray(suggestion.target_preview_members)
        ? suggestion.target_preview_members.map(normalizeProductClusterProfile)
        : [],
      recommendation: suggestion.recommendation as "review" | "automatic",
    } as ProductGroupReconciliationSuggestion];
  });
}

function normalizePersistedProductGroupOverview(overview: PersistedProductGroupOverview) {
  const catalogSupported = Array.isArray(overview.catalog_categories);
  const groups = overview.groups.map((group) => ({
    ...group,
    catalog_display_name: group.catalog_display_name?.trim() ||
      group.display_name?.trim() || "Product awaiting classification",
    catalog_name_source: group.catalog_name_source ??
      (group.name_source === "manual" ? "manual" : "fallback"),
    catalog_name_confidence: isFiniteNumber(group.catalog_name_confidence)
      ? Number(group.catalog_name_confidence)
      : null,
    catalog_name_support_count: isFiniteNumber(group.catalog_name_support_count)
      ? Number(group.catalog_name_support_count)
      : null,
    catalog_name_policy_version: typeof group.catalog_name_policy_version === "string"
      ? group.catalog_name_policy_version
      : null,
    catalog_task_count: Number.isFinite(group.catalog_task_count)
      ? Number(group.catalog_task_count)
      : Number(group.member_count),
    catalog_primary_category_id: group.catalog_primary_category_id ?? null,
    catalog_primary_category_name: group.catalog_primary_category_name ?? null,
    catalog_primary_category_path: group.catalog_primary_category_path ?? null,
    catalog_primary_category_version: group.catalog_primary_category_version ?? null,
    catalog_primary_category_source: group.catalog_primary_category_source ?? null,
    canonical_product_id: typeof group.canonical_product_id === "string"
      ? group.canonical_product_id
      : null,
    atomic_cohort_count: isFiniteNumber(group.atomic_cohort_count)
      ? Math.max(1, Math.trunc(group.atomic_cohort_count))
      : 1,
    parent_group_id: group.parent_group_id ?? null,
    semantic_kind: group.semantic_kind ?? null,
    semantic_key: group.semantic_key ?? null,
    semantic_definition:
      group.semantic_definition && typeof group.semantic_definition === "object"
        ? group.semantic_definition
        : null,
    rules: Array.isArray(group.rules) ? group.rules : [],
    authenticity_rules: Array.isArray(group.authenticity_rules)
      ? group.authenticity_rules
      : [],
    canonical_decisions: normalizeProductCanonicalDecisions(group.canonical_decisions),
    reconciliation_suggestions: normalizeProductGroupReconciliationSuggestions(
      group.reconciliation_suggestions,
    ),
    triage_member_count: Number.isFinite(group.triage_member_count)
      ? Number(group.triage_member_count)
      : null,
    triage_recommendation_counts: normalizeProductGroupRecommendationCounts(
      group.triage_recommendation_counts,
    ),
    price_summary: normalizeProductGroupPriceSummary(group.price_summary),
    price_signal_members: normalizeProductGroupPriceSignalMembers(
      group.price_signal_members,
    ),
    commercial_subgroups: normalizeProductCommercialSubgroups(
      group.commercial_subgroups,
    ),
    members: Array.isArray(group.members)
      ? group.members.map(normalizeProductClusterProfile)
      : [],
    triage_members: Array.isArray(group.triage_members)
      ? group.triage_members.map(normalizeProductClusterProfile)
      : [],
    embedding_match_threshold:
      typeof group.embedding_match_threshold === "number"
        ? group.embedding_match_threshold
        : null,
  }));
  const triageProjectionAvailable =
    Number.isFinite(overview.triage_group_count) &&
    Number.isFinite(overview.triage_profile_count) &&
    Number.isFinite(overview.triage_ungrouped_count) &&
    groups.every((group) => group.triage_member_count != null);
  // Keep the frontend compatible while the API and GitHub Pages deploys roll
  // out independently. A capped legacy response cannot provide exact coverage.
  const fallbackSnapshotProfileCount = groups.reduce(
    (total, group) => total + group.member_count,
    overview.ungrouped_count,
  );
  const snapshotProfileCount = Number.isFinite(overview.snapshot_profile_count)
    ? overview.snapshot_profile_count
    : overview.truncated ? null : fallbackSnapshotProfileCount;
  const snapshotMembershipCount = Number.isFinite(overview.snapshot_membership_count)
    ? Number(overview.snapshot_membership_count)
    : overview.truncated ? null : fallbackSnapshotProfileCount;
  const pendingSnapshotCount = Number.isFinite(overview.pending_snapshot_count)
    ? overview.pending_snapshot_count
    : snapshotProfileCount == null
      ? null
      : Math.max(0, overview.scope.profile_count - snapshotProfileCount);
  const fallbackPaginationGroupCount = overview.relationship_type === "semantic_category"
    ? groups.filter((group) => group.semantic_kind === "category" && !group.parent_group_id).length
    : triageProjectionAvailable && overview.triage_group_count != null
      ? Number(overview.triage_group_count)
      : overview.group_count;
  return {
    ...overview,
    groups,
    triage_group_count: triageProjectionAvailable
      ? Number(overview.triage_group_count)
      : null,
    triage_profile_count: triageProjectionAvailable
      ? Number(overview.triage_profile_count)
      : null,
    triage_ungrouped_count: triageProjectionAvailable
      ? Number(overview.triage_ungrouped_count)
      : null,
    ungrouped: Array.isArray(overview.ungrouped)
      ? overview.ungrouped.map(normalizeProductClusterProfile)
      : [],
    triage_ungrouped: Array.isArray(overview.triage_ungrouped)
      ? overview.triage_ungrouped.map(normalizeProductClusterProfile)
      : [],
    triage_projection_available: triageProjectionAvailable,
    snapshot_profile_count: snapshotProfileCount,
    snapshot_membership_count: snapshotMembershipCount,
    pending_snapshot_count: pendingSnapshotCount,
    pagination_group_count: Number.isFinite(overview.pagination_group_count)
      ? Number(overview.pagination_group_count)
      : fallbackPaginationGroupCount,
    next_cursor: typeof overview.next_cursor === "string" && overview.next_cursor
      ? overview.next_cursor
      : null,
    catalog_scope: (overview.catalog_scope === "history" ? "history" : "catalog") as ProductCatalogScope,
    catalog_product_count: Number.isFinite(overview.catalog_product_count)
      ? Math.max(0, Math.trunc(overview.catalog_product_count))
      : Number(overview.group_count),
    catalog_history_product_count: Number.isFinite(overview.catalog_history_product_count)
      ? Math.max(0, Math.trunc(overview.catalog_history_product_count))
      : 0,
    catalog_categories: Array.isArray(overview.catalog_categories)
      ? overview.catalog_categories.map((category) => ({
        ...category,
        product_count: Number(category.product_count),
      }))
      : [],
    unclassified_product_count: Number(overview.unclassified_product_count ?? 0),
    catalog_supported: catalogSupported,
  };
}

export async function getPersistedProductGroups(
  ipId: string,
  relationship: "same" | "related" | "visual" | "semantic",
  view: "triage" | "all" = "triage",
  options: {
    limit?: number;
    cursor?: string | null;
    includeUngrouped?: boolean;
    categoryId?: string | null;
    productId?: string | null;
    catalogScope?: ProductCatalogScope;
    query?: string | null;
    signal?: AbortSignal;
  } = {},
) {
  const params = new URLSearchParams({ relationship, view });
  params.set("include_ungrouped", String(options.includeUngrouped ?? false));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.categoryId) params.set("category_id", options.categoryId);
  if (options.productId) params.set("product_id", options.productId);
  if (options.catalogScope) params.set("catalog_scope", options.catalogScope);
  if (options.query) params.set("q", options.query);
  const overview = await request<PersistedProductGroupOverview>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups?${params.toString()}`,
    { signal: options.signal },
  );
  return normalizePersistedProductGroupOverview(overview);
}

export async function refreshPersistedProductGroups(
  ipId: string,
  relationship: "same" | "related" | "visual" | "semantic",
  view: "triage" | "all" = "triage",
  options: {
    limit?: number;
    includeUngrouped?: boolean;
    categoryId?: string | null;
    productId?: string | null;
    catalogScope?: ProductCatalogScope;
    query?: string | null;
  } = {},
) {
  const params = new URLSearchParams({ relationship, view });
  params.set("include_ungrouped", String(options.includeUngrouped ?? false));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.categoryId) params.set("category_id", options.categoryId);
  if (options.productId) params.set("product_id", options.productId);
  if (options.catalogScope) params.set("catalog_scope", options.catalogScope);
  if (options.query) params.set("q", options.query);
  const overview = await request<PersistedProductGroupOverview>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/refresh?${params.toString()}`,
    { method: "POST" },
  );
  return normalizePersistedProductGroupOverview(overview);
}

export function mergePersistedProductGroups(
  ipId: string,
  leftGroupId: string,
  rightGroupId: string,
) {
  return request<{
    decision: ProductCanonicalDecision;
    regrouped: boolean;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/merge`,
    {
      method: "POST",
      body: JSON.stringify({
        left_group_id: leftGroupId,
        right_group_id: rightGroupId,
      }),
    },
  );
}

export function searchPersistedProductGroupMergeCandidates(
  ipId: string,
  sourceGroupId: string,
  query: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ q: query, limit: "20" });
  return request<{ candidates: ProductGroupMergeCandidate[] }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${
      encodeURIComponent(sourceGroupId)
    }/merge-candidates?${params.toString()}`,
    { signal },
  );
}

export function revokePersistedProductGroupMerge(
  ipId: string,
  groupId: string,
  decisionId: string,
) {
  return request<{
    decision: ProductCanonicalDecision;
    regrouped: boolean;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}` +
      `/canonical-decisions/${encodeURIComponent(decisionId)}`,
    { method: "DELETE" },
  );
}

export function confirmPersistedProductGroup(
  ipId: string,
  groupId: string,
  displayName: string,
  shopifyTaxonomyId?: string,
) {
  return request<{
    group: Pick<
      PersistedProductGroup,
      | "id"
      | "display_name"
      | "name_source"
      | "confirmation_status"
      | "confirmed_at"
      | "catalog_primary_category_id"
      | "catalog_primary_category_name"
      | "catalog_primary_category_path"
      | "catalog_primary_category_version"
      | "catalog_primary_category_source"
    >;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        display_name: displayName,
        ...(shopifyTaxonomyId ? { shopify_taxonomy_id: shopifyTaxonomyId } : {}),
      }),
    },
  );
}

export interface ShopifyProductTaxonomyCategory {
  id: string;
  name: string;
  path: string;
  version: string;
}

export function searchShopifyProductTaxonomy(
  ipId: string,
  query: string,
  limit = 20,
) {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
  });
  return request<{ categories: ShopifyProductTaxonomyCategory[] }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/shopify-taxonomy?${params.toString()}`,
  );
}

export function updatePersistedProductGroupEmbeddingSettings(
  ipId: string,
  groupId: string,
  embeddingMatchThreshold: number | null,
) {
  return request<{
    group: Pick<PersistedProductGroup, "id" | "embedding_match_threshold">;
    regrouping_queued: boolean;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/embedding-settings`,
    {
      method: "PATCH",
      body: JSON.stringify({
        embedding_match_threshold: embeddingMatchThreshold,
      }),
    },
  );
}

export function calculatePersistedProductGroupVisualEvidence(
  ipId: string,
  groupId: string,
) {
  return request<ProductGroupVisualEvidence>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/visual-evidence`,
    { method: "POST" },
  );
}

export function pinPersistedProductGroupReferenceImage(
  ipId: string,
  groupId: string,
  imageId: string,
) {
  return request<ProductGroupVisualEvidence>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/visual-references`,
    { method: "POST", body: JSON.stringify({ image_id: imageId }) },
  );
}

export function removePersistedProductGroupReferenceImage(
  ipId: string,
  groupId: string,
  imageId: string,
) {
  return request<ProductGroupVisualEvidence>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/visual-references/${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
}

export function resetPersistedProductGroupReferenceImages(
  ipId: string,
  groupId: string,
) {
  return request<ProductGroupVisualEvidence>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/visual-references`,
    { method: "DELETE" },
  );
}

export function excludePersistedProductGroupMember(
  ipId: string,
  groupId: string,
  input: {
    profile_id?: string;
    case_id?: string;
    reason: ProductGroupCorrectionReason;
    note?: string | null;
  },
) {
  return request<{
    correction: ProductGroupMemberCorrection;
    regrouped: boolean;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/corrections`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function restorePersistedProductGroupMember(
  ipId: string,
  groupId: string,
  correctionId: string,
) {
  return request<{
    correction: ProductGroupMemberCorrection;
    regrouped: boolean;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/corrections/${encodeURIComponent(correctionId)}`,
    { method: "DELETE" },
  );
}

export function correctProductSemanticGroupMember(
  ipId: string,
  groupId: string,
  input: {
    profile_id: string;
    corrected_category_key?: string;
    new_product_type?: {
      label: string;
      supports_color_variants: boolean;
    };
    corrected_variant_colors: string[];
    note?: string | null;
    propagate_to_similar: boolean;
  },
) {
  return request<{
    correction: ProductSemanticCorrection;
    already_applied?: boolean;
    regrouped: boolean;
    similar_profiles_queued: number;
    propagation_failed?: boolean;
    propagation_visual_similarity_threshold: number | null;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/semantic-corrections`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function restoreProductSemanticCorrection(
  ipId: string,
  correctionId: string,
) {
  return request<{
    correction: ProductSemanticCorrection;
    regrouped: boolean;
    similar_profiles_queued: number;
    propagation_failed?: boolean;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/semantic-corrections/${encodeURIComponent(correctionId)}`,
    { method: "DELETE" },
  );
}

export function createPersistedProductGroupRule(
  ipId: string,
  groupId: string,
  instruction: string,
) {
  return request<{ rule: ProductGroupRule; rescore_jobs_enqueued: number }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/rules`,
    { method: "POST", body: JSON.stringify({ instruction }) },
  );
}

export function updatePersistedProductGroupRule(
  ipId: string,
  groupId: string,
  ruleId: string,
  instruction: string,
) {
  return request<{ rule: ProductGroupRule; rescore_jobs_enqueued: number }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body: JSON.stringify({ instruction }) },
  );
}

export function deletePersistedProductGroupRule(
  ipId: string,
  groupId: string,
  ruleId: string,
) {
  return request<{ id: string; rescore_jobs_enqueued: number }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" },
  );
}

export function createPersistedProductGroupAuthenticityRule(
  ipId: string,
  groupId: string,
  input: ProductGroupAuthenticityRuleInput,
) {
  return request<{
    rule: ProductGroupAuthenticityRule;
    assessment_jobs_enqueued: number;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/authenticity-rules`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updatePersistedProductGroupAuthenticityRule(
  ipId: string,
  groupId: string,
  ruleId: string,
  input: ProductGroupAuthenticityRuleInput,
) {
  return request<{
    rule: ProductGroupAuthenticityRule;
    assessment_jobs_enqueued: number;
  }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/authenticity-rules/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deletePersistedProductGroupAuthenticityRule(
  ipId: string,
  groupId: string,
  ruleId: string,
) {
  return request<{ id: string; assessment_jobs_enqueued: number }>(
    `/api/product-clusters/${encodeURIComponent(ipId)}/groups/${encodeURIComponent(groupId)}/authenticity-rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" },
  );
}
