import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { AuthProvider } from "../src/context/AuthContext";
import { ActiveIpProvider, useActiveIp } from "../src/context/ActiveIpContext";
import { setActingTenant, getActingTenant } from "../src/api/transport";
import { SubmitListingLink } from "../src/components/SubmitListingLink";

const w = new Window({ url: "http://localhost:5173" });
const originalFetch = globalThis.fetch, originalTenant = getActingTenant();
let root: Root | undefined;
let refreshed = 0;
function Probe() {
  const { selectIp } = useActiveIp();
  return <><SubmitListingLink onSubmitted={() => refreshed++} /><button onClick={() => selectIp("product")}>Switch scope</button></>;
}
async function mount(submission: (body: unknown) => Promise<Response>) {
  Object.assign(globalThis, { window: w, document: w.document, navigator: w.navigator,
    localStorage: w.localStorage, sessionStorage: w.sessionStorage, HTMLElement: w.HTMLElement,
    Element: w.Element, Node: w.Node, Event: w.Event, MouseEvent: w.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); sessionStorage.clear(); setActingTenant("tenant"); refreshed = 0;
  const requests: { path: string; body: unknown }[] = [];
  globalThis.fetch = (async (input, init) => {
    const path = new URL(String(input), w.location.origin).pathname;
    if (path === "/api/auth/me") return Response.json({ user: null });
    if (path === "/api/ip/selector") return Response.json({ ips: ["brand", "product"].map(id => ({
      id, name: id === "brand" ? "Test brand" : "Test product", scope_kind: id, monitoring_enabled: true, historical_ips: [],
    })) });
    if (path.endsWith("/monitoring/submissions")) {
      const body = JSON.parse(String(init?.body)); requests.push({ path, body }); return submission(body);
    }
    throw new Error(`Unexpected request ${path}`);
  }) as typeof fetch;
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<MemoryRouter initialEntries={["/monitoring/tasks?ip_id=brand"]}><AuthProvider><ActiveIpProvider><Probe /></ActiveIpProvider></AuthProvider></MemoryRouter>));
  await click("Report listing");
  return requests;
}
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(button => button.textContent === label)!;
  expect(button).toBeTruthy(); await act(async () => button.click());
}
async function fill(value: string) {
  const input = document.querySelector("dialog input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { document.querySelector("dialog form")!.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); });
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined;
  globalThis.fetch = originalFetch; document.body.replaceChildren(); setActingTenant(originalTenant);
});

test("invalid links stay local and server failures preserve the entered URL", async () => {
  const requests = await mount(async () => Response.json({ error: "The listing must be public." }, { status: 400 }));
  await fill("javascript:alert(1)"); await submit();
  expect(requests).toHaveLength(0);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("HTTP or HTTPS");
  await fill("https://shop.example/item/42"); await submit();
  expect(requests).toHaveLength(1);
  expect(document.querySelector<HTMLInputElement>("dialog input")!.value).toBe("https://shop.example/item/42");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("The listing must be public.");
  expect(refreshed).toBe(0);
});

test("submissions use the selected scope and distinguish queued from duplicate", async () => {
  let created = true;
  const requests = await mount(async () => Response.json({ result_id: "result-42", created }));
  await fill("https://shop.example/item?id=42#photos"); await submit();
  expect(requests).toEqual([{ path: "/api/ip/brand/monitoring/submissions", body: { url: "https://shop.example/item?id=42" } }]);
  expect(document.querySelector("dialog h2")?.textContent).toBe("Listing added");
  expect(document.querySelector("dialog a")?.getAttribute("href")).toBe("/monitoring/tasks/result-42?ip_id=brand");
  expect(refreshed).toBe(1);
  await click("Report another"); created = false;
  await fill("https://shop.example/item/42"); await submit();
  expect(document.querySelector("dialog h2")?.textContent).toBe("Listing already added");
});

test("pending submissions cannot be repeated and stale responses cannot follow a scope change", async () => {
  let resolve!: (response: Response) => void;
  const requests = await mount(() => new Promise<Response>(done => { resolve = done; }));
  await fill("https://shop.example/item/42"); await submit(); await submit();
  expect(requests).toHaveLength(1);
  expect(document.querySelector<HTMLButtonElement>('dialog button[type="submit"]')?.disabled).toBe(true);
  await click("Switch scope");
  await act(async () => resolve(Response.json({ result_id: "result-42", created: true })));
  expect(document.querySelector("dialog")).toBeNull(); expect(refreshed).toBe(0);
  await click("Report listing");
  expect(document.querySelector("dialog")?.textContent).toContain("Test product");
});
