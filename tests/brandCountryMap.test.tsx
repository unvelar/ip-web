import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BrandCountryMap from "../src/components/BrandCountryMap";
import type { PublicBrandSumupCountry } from "../src/api/intakes";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });
async function render(countries?: PublicBrandSumupCountry[]) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<BrandCountryMap countries={countries} />));
  return container;
}
const country = (name: string, products: number, infringements: number): PublicBrandSumupCountry => ({
  country: name, analyzed_count: products, to_takedown_count: infringements,
  infringement_percentage: products ? infringements / products * 100 : 0,
});

test("country map distinguishes missing API support, no results, and unknown location", async () => {
  const container = await render();
  expect(container.textContent).toContain("Country breakdown is not available yet");
  await act(async () => root?.render(<BrandCountryMap countries={[]} />));
  expect(container.textContent).toContain("No country data yet");
  await act(async () => root?.render(<BrandCountryMap countries={[country("Unknown", 10, 1)]} />));
  expect(container.querySelectorAll('svg [role="button"]')).toHaveLength(0);
  expect(container.textContent).toContain("Unknown location");
  expect(container.textContent).toContain("10%");
});

test("map selection, country aliases, sorting, and rate color use country-specific counts", async () => {
  const container = await render([country("United States", 100, 1), country("China", 10, 5), country("Czech Republic", 20, 0), country("Turkey", 2, 1), country("Unknown", 7, 0)]);
  const details = container.querySelector('[aria-live="polite"]')!;
  expect(container.querySelectorAll('svg [role="button"]')).toHaveLength(4);
  expect(details.textContent).toContain("United States");
  const china = container.querySelector<SVGElement>('[aria-label="China: 10 products, 50% infringement"]')!;
  await act(async () => china.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(details.textContent).toContain("China");
  expect(details.textContent).toContain("50%");
  expect(details.textContent).toContain("5 marked for takedown");
  const toggle = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Infringement %')!;
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('tbody tr')?.textContent).toContain('China');
  const chinaFill = china.getAttribute('fill');
  const usFill = container.querySelector('[aria-label="United States: 100 products, 1% infringement"]')!.getAttribute('fill');
  expect(chinaFill).not.toBe(usFill);
  const unknown = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Unknown location')!;
  await act(async () => unknown.click());
  expect(details.textContent).toContain('Unknown location');
  expect(details.textContent).toContain('7');
});

test("production country codes and ISO country names map to readable country labels", async () => {
  const container = await render([country("CN", 4, 0), country("Korea, Republic of", 1, 0)]);
  expect(container.querySelectorAll('svg [role="button"]')).toHaveLength(2);
  expect(container.querySelector('[aria-label="China: 4 products, 0% infringement"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="South Korea: 1 products, 0% infringement"]')).not.toBeNull();
  const korea = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'South Korea')!;
  await act(async () => korea.click());
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('South Korea');
});


test("table and keyboard map activation open tasks using the original API country", async () => {
  const opened: string[] = [];
  const countries = [country("Korea, Republic of", 2, 1), country("Unknown", 1, 0)];
  const container = await render(countries);
  await act(async () => root?.render(<BrandCountryMap countries={countries} onOpenCountry={(value) => opened.push(value)} />));
  const korea = Array.from(container.querySelectorAll("tbody button")).find(button => button.textContent === "South Korea")!;
  await act(async () => (korea as HTMLButtonElement).click());
  const shape = container.querySelector<SVGElement>('svg [role="button"]')!;
  await act(async () => shape.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  const unknown = Array.from(container.querySelectorAll("tbody button")).find(button => button.textContent === "Unknown location")!;
  await act(async () => (unknown as HTMLButtonElement).click());
  expect(opened).toEqual(["Korea, Republic of", "Korea, Republic of", "Unknown"]);
});
