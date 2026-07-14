import type {
  ProductClusterEdge,
  ProductClusterProfile,
} from "../../api";

export type RelationshipMode = "same" | "related";

export function scoreFor(edge: ProductClusterEdge, mode: RelationshipMode) {
  return mode === "same" ? edge.same_product_score : edge.related_product_score;
}

export function profileTitle(profile: ProductClusterProfile) {
  if (profile.listing_title?.trim()) return profile.listing_title.trim();
  const titleLine = profile.profile_text.split("\n")[0]?.replace(/^Title:\s*/i, "").trim();
  return titleLine || "Untitled listing";
}
