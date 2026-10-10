// Common country labels for maps and worker location registration.
// Monitoring target choices come from the API's country capabilities.
export interface Country {
  code: string; // uppercase ISO-2
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CN", name: "China" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Türkiye" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
];

const BY_CODE: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c]),
);
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** Regional-indicator flag emoji for an ISO-2 code (e.g. "DE" → 🇩🇪). */
export function flagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** "🇩🇪 Germany" for an ISO-2 code. */
export function countryLabel(code: string): string {
  const cc = code.trim().toUpperCase();
  const known = BY_CODE[cc];
  const flag = flagEmoji(cc);
  const name = known?.name ?? (/^[A-Z]{2}$/.test(cc) ? REGION_NAMES.of(cc) : undefined) ?? cc;
  return `${flag} ${name}`.trim();
}
