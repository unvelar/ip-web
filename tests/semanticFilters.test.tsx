import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SemanticFilterPanel } from "../src/components/monitoring/board/SemanticFilterPanel";
import { parseFilters, writeFilters } from "../src/lib/monitoringFilters";
import { semanticFingerprint } from "../src/lib/semanticFilters";
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });
const semantic = { colors: ["red"], materials: ["cotton"], identity_facts: [{ kind: "edition", value: "Away 2026" }], variant_attributes: [{ key: "content_volume", unit: "ml", values: [50] }] };

test("semantic URL filters survive refresh and price-only changes; clearing details preserves other filters", () => {
  const params = new URLSearchParams({ semantic: JSON.stringify(semantic), max_price_usd: "40", country: "France" });
  const next = writeFilters(params, { ...parseFilters(params), max_price_usd: 30 });
  expect(JSON.parse(parseFilters(next).semantic!)).toEqual(semantic);
  expect(parseFilters(next).max_price_usd).toBe(30);
  const cleared = writeFilters(next, { ...parseFilters(next), semantic: null });
  expect(cleared.has("semantic")).toBe(false);
  expect(cleared.get("country")).toBe("France");
  expect(cleared.get("max_price_usd")).toBe("30");
  const invalid = new URLSearchParams({ semantic: "{broken" });
  expect(writeFilters(invalid, parseFilters(invalid)).get("semantic")).toBe("{broken");
});

test("editing colors preserves cotton, edition and exact measurement until applied", async () => {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div"); document.body.append(container);
  const applied: Array<string | null> = [];
  root = createRoot(container);
  await act(async () => root!.render(<SemanticFilterPanel value={JSON.stringify(semantic)} ipId={null} onApply={value => applied.push(value)} />));
  expect(document.activeElement).toBe(container.querySelector("input"));
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === text)!;
  await act(async () => { button("Red").click(); button("Blue").click(); });
  expect(applied).toEqual([]);
  await act(async () => button("Apply filters").click());
  expect(JSON.parse(applied[0]!)).toEqual({ ...semantic, colors: ["blue"] });
  expect(semanticFingerprint(JSON.parse(applied[0]!))).toBe(semanticFingerprint({ ...semantic, colors: ["blue"] }));
  await act(async () => button("Clear details").click());
  expect(applied[1]).toBeNull();
});
