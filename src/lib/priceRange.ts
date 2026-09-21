export const MAX_PRICE_BOUND = 1e12;

/** Accept the API's decimal grammar, with surrounding input whitespace trimmed. */
export function parsePriceBound(raw: string): number | null {
  const value = raw.trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= MAX_PRICE_BOUND ? price : null;
}

/** Preserve the number's shortest round-trip value without exponent notation. */
export function formatPriceBound(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > MAX_PRICE_BOUND) {
    throw new RangeError("Price must be between 0 and 1,000,000,000,000.");
  }
  const text = String(value);
  if (!text.includes("e")) return text;
  const [coefficient, exponent] = text.split("e");
  const [integer, fraction = ""] = coefficient.split(".");
  const digits = integer + fraction;
  const decimalPosition = integer.length + Number(exponent);
  if (decimalPosition <= 0) return `0.${"0".repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length) return digits + "0".repeat(decimalPosition - digits.length);
  return `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}
