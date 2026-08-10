export function sellerProfilePath(sellerKey: string | null | undefined): string | null {
  return sellerKey ? `/monitoring/sellers/${encodeURIComponent(sellerKey)}` : null;
}
