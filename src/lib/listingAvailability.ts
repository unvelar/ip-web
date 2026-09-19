export function listingAvailabilityMeta(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "live") {
    return {
      label: "Available",
      cls: "bg-emerald-50 text-emerald-700",
      title: "The latest check confirmed that this listing is available.",
    };
  }
  if (normalized === "blocked") {
    return {
      label: "Check blocked",
      cls: "bg-amber-50 text-amber-700",
      title: "The website blocked our latest check of whether this listing is still available. Its availability is unknown. This is not an assessment of product authenticity.",
    };
  }
  if (normalized === "error") {
    return {
      label: "Check failed",
      cls: "bg-amber-50 text-amber-700",
      title: "Our latest check failed, so we could not confirm whether this listing is still available. This is not an assessment of product authenticity.",
    };
  }
  if (!normalized || normalized === "unknown" || normalized === "unchecked") {
    return {
      label: "Unknown",
      cls: "bg-amber-50 text-amber-700",
      title: "We have not yet confirmed whether this listing is still available.",
    };
  }
  return {
    label: "Unavailable",
    cls: "bg-stone-100 text-stone-500",
    title: "The latest check found that this listing is no longer available.",
  };
}
