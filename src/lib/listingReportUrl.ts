export function listingReportUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new Error("Enter a full http:// or https:// listing URL."); }
  if (raw.length > 4096 || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error("Use a public HTTP or HTTPS link without credentials or a custom port.");
  }
  url.hash = "";
  return url.href;
}
