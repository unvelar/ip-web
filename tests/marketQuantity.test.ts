import {expect, test} from "bun:test";
import type {IpReviewFinding} from "../src/api/reviews";
import {estimatedMarket, marketQuantity} from "../src/components/monitoring/board/utils";

const finding = (values: Partial<IpReviewFinding>) => ({price_value_usd: 25, ...values}) as IpReviewFinding;

test("row estimates use the backend quantity for both resale and shop listings", () => {
  expect(estimatedMarket(finding({market_quantity: 1}))).toEqual({value: 25, currency: "USD"});
  expect(estimatedMarket(finding({market_quantity: 10}))).toEqual({value: 250, currency: "USD"});
  expect(estimatedMarket(finding({market_quantity: 3, quantity_available: 3}))).toEqual({value: 75, currency: "USD"});
});

test("an older API only supports row estimates when it supplies explicit stock", () => {
  expect(marketQuantity(finding({quantity_available: 2}))).toBe(2);
  expect(estimatedMarket(finding({quantity_available: null}))).toBeNull();
  expect(estimatedMarket(finding({market_quantity: -1}))).toBeNull();
  expect(estimatedMarket(finding({market_quantity: 1, price_value_usd: null}))).toBeNull();
});
