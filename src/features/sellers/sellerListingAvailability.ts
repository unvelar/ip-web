export function sellerListingAvailability(value: string | null) {
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
      label: "Couldn't verify",
      cls: "bg-amber-50 text-amber-700",
      title: "The website blocked our latest automated check. This finding remains open and will be checked again.",
    };
  }
  if (!normalized || normalized === "unknown" || normalized === "unchecked" || normalized === "error") {
    return {
      label: "Not yet verified",
      cls: "bg-amber-50 text-amber-700",
      title: "We do not have a reliable availability result yet. This finding remains open.",
    };
  }
  return {
    label: "Unavailable",
    cls: "bg-stone-100 text-stone-500",
    title: "The latest check found that this listing is no longer available.",
  };
}
