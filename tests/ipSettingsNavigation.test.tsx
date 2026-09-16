import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import IpSettingsNav from "../src/components/IpSettingsNav";
import { ipSettingsSection } from "../src/lib/ipSettingsNavigation";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

test("existing deep links keep the matching settings section selected", () => {
  for (const hash of ["#keywords", "#monitoring", "#monitoring-source-source-1", "#matching-names"]) expect(ipSettingsSection(hash)).toBe("monitoring");
  for (const hash of ["#takedown-signer", "#allowed-product-images"]) expect(ipSettingsSection(hash)).toBe("protection");
  expect(ipSettingsSection("#reference-images")).toBe("overview");
});

test("page navigation follows the viewed IP, including legacy anchors", async () => {
  const window = new Window({ url: "http://localhost:5173/ips/viewed-ip" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<MemoryRouter initialEntries={["/ips/viewed-ip#takedown-signer"]}><IpSettingsNav /></MemoryRouter>));
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Protection");
  const monitoring = container.querySelector<HTMLAnchorElement>('a[href="/ips/viewed-ip#search"]')!;
  expect(monitoring.getAttribute("href")).toBe("/ips/viewed-ip#search");
  await act(async () => monitoring.click());
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Monitoring");
});
