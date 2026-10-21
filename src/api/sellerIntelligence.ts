import { request } from "./transport";
import type { SellerContact, SharedListingImage } from "./monitoring";

export interface SellerProfileFact {
  kind: "description" | "policy" | "specialty" | "identity" | "storefront" | "other";
  label: string; value: string; source_url: string; source_quote: string; observed_at: string;
}
interface TextEvidence {
  case_id: string; page_url: string; label: string; text: string; observed_at: string;
}
export type SellerSimilaritySignal = {
  kind: "shared_contact"; label: string; value: string;
  source: SellerContact; target: SellerContact; other_sellers: number;
} | {kind: "linked_storefront"; source: SellerProfileFact; target_url: string}
  | {kind: "shared_text"; source: TextEvidence; target: TextEvidence; other_sellers: number}
  | {kind: "exact_image" | "possible_copy"; source: SharedListingImage; target: SharedListingImage;
    source_listing: TextEvidence; target_listing: TextEvidence; other_sellers: number};
export interface SellerIntelligence {
  policy: string; status: "not_analyzed" | "partial" | "ready"; scope: "collected_sellers";
  coverage: {
    source_listings: number; source_listings_checked: number;
    candidate_listings: number; candidate_listings_checked: number; candidate_sellers: number;
    source_images: number; source_images_checked: number; source_copy_fingerprints: number;
    candidate_images: number; candidate_images_checked: number; candidate_copy_fingerprints: number;
    source_captured_descriptions: number; image_pairs_truncated: boolean; observations_truncated: boolean;
    approximate_image_retrieval: boolean;
  };
  dossier: {
    facts: SellerProfileFact[]; facts_available: number; observed_listings: number;
    oldest_listing_capture_at: string; latest_listing_capture_at: string;
    listings: Array<{case_id: string; result_id: string; page_url: string; title: string | null;
      description: string | null; description_source: "captured" | "extracted"; observed_at: string;
      captured_description?: string | null;
      images: SharedListingImage[]}>;
  };
  similar_sellers: Array<{
    seller: {key: string; name: string; domain: string; profile_url: string | null};
    relationship: "shared_business_details" | "shared_content"; cross_marketplace: boolean;
    matched_source_listings: number; matched_target_listings: number; compared_target_listings: number;
    signals: SellerSimilaritySignal[]; signal_count: number;
  }>;
  has_more: boolean;
}

export function getSellerIntelligence(sellerKey: string, signal?: AbortSignal) {
  return request<{intelligence: SellerIntelligence}>(
    `/api/monitoring/sellers/${encodeURIComponent(sellerKey)}/intelligence`,{signal},{readTimeoutMs:30_000});
}
