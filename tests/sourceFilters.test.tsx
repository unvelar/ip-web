import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SourceFilters, type SourceSelection } from "../src/components/monitoring/board/SourceFilters";
import type { MonitoringSourceFacet } from "../src/api/monitoring";

const sources: MonitoringSourceFacet[] = [
  { key: "domain:ebay.com", label: "ebay.com", kind: "domain", n: 99, websites: [{ domain: "ebay.com", n: 99 }] },
  { key: "search:google", label: "Google", kind: "search", n: 8, websites: [{ domain: "one.shop", n: 5 }, { domain: "shared.store", n: 3 }] },
  { key: "search:bing", label: "Bing", kind: "search", n: 2, websites: [{ domain: "shared.store", n: 2 }] },
];
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

async function setup(initial: SourceSelection = { source: null, platform: null }) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let selection = initial;
  function render() {
    root!.render(<SourceFilters sources={sources} selection={selection} onChange={(next) => { selection = next; render(); }} />);
  }
  await act(async () => render());
  async function choose(engine: string, domain: string) {
    const select = container.querySelector(`[aria-label="Websites found via ${engine}"]`) as HTMLSelectElement;
    await act(async () => { select.value = domain; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  }
  return { container, choose, selection: () => selection };
}

test("source dropdown narrows by website, can return to all websites, and switches engines", async () => {
  const ui = await setup();
  await ui.choose("Google", "one.shop");
  expect(ui.selection()).toEqual({ source: "search:google", platform: "one.shop" });
  await ui.choose("Google", "");
  expect(ui.selection()).toEqual({ source: "search:google", platform: null });
  await ui.choose("Bing", "shared.store");
  expect(ui.selection()).toEqual({ source: "search:bing", platform: "shared.store" });
  const ebay = Array.from(ui.container.querySelectorAll("button")).find((button) => button.textContent?.startsWith("eBay"))!;
  await act(async () => ebay.click());
  expect(ui.selection()).toEqual({ source: "domain:ebay.com", platform: null });
  const all = ui.container.querySelector("button")!;
  expect(all.textContent).toBe("All109");
  await act(async () => all.click());
  expect(ui.selection()).toEqual({ source: null, platform: null });
});

test("deep-linked website stays selected, and another engine never inherits it", async () => {
  const ui = await setup({ source: "search:google", platform: "shared.store" });
  const google = ui.container.querySelector('[aria-label="Websites found via Google"]') as HTMLSelectElement;
  expect(google.value).toBe("shared.store");
  expect(google.selectedOptions[0].textContent).toContain("(3)");
  await ui.choose("Bing", "");
  expect(ui.selection()).toEqual({ source: "search:bing", platform: null });
});

test("zero-result website retains its selected value and is recoverable", async () => {
  const ui = await setup({ source: "search:google", platform: "missing.shop" });
  const google = ui.container.querySelector("select")!;
  expect(google.value).toBe("missing.shop");
  expect(google.selectedOptions[0].textContent).toContain("(0)");
  await ui.choose("Google", "");
  expect(ui.selection().platform).toBeNull();
});
