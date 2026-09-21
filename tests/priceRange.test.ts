import { expect, test } from "bun:test";
import { formatPriceBound, MAX_PRICE_BOUND, parsePriceBound } from "../src/lib/priceRange";

test("price parsing accepts decimal bounds and rejects non-decimal numeric syntax", () => {
  for (const [raw, value] of [["0", 0], ["0.00", 0], [".25", .25], [" 12.50 ", 12.5], ["0001.50", 1.5], ["0.0000001", 1e-7], ["1000000000000", MAX_PRICE_BOUND]] as const) {
    expect(parsePriceBound(raw)).toBe(value);
  }
  for (const raw of ["", " ", "0x10", "0b10", "1e-7", "1E3", "-0", "+1", "1.", "1,000", "NaN", "Infinity", "-1", "1000000000001", "USD 25"]) {
    expect(parsePriceBound(raw)).toBeNull();
  }
});

test("price formatting expands exponents without rounding away valid small bounds", () => {
  expect(formatPriceBound(1e-7)).toBe("0.0000001");
  expect(formatPriceBound(1.23456789e-8)).toBe("0.0000000123456789");
  expect(formatPriceBound(0)).toBe("0");
  expect(formatPriceBound(-0)).toBe("0");
  expect(formatPriceBound(MAX_PRICE_BOUND)).toBe("1000000000000");
  for (const value of [Number.MIN_VALUE, 1e-100, 1.23456789e-8, 0.1 + 0.2, 123.45, 999999999999.99, MAX_PRICE_BOUND]) {
    const formatted = formatPriceBound(value);
    expect(formatted).toMatch(/^(?:\d+(?:\.\d+)?|\.\d+)$/);
    expect(parsePriceBound(formatted)).toBe(value);
  }
});

test("invalid numeric bounds cannot be serialized as a price filter", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, MAX_PRICE_BOUND + 1]) {
    expect(() => formatPriceBound(value)).toThrow(RangeError);
  }
});
