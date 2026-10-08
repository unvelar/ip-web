import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

const happyWindow = new Window({ url: "http://localhost:5173" });
Object.assign(globalThis, { window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
  localStorage: happyWindow.localStorage, sessionStorage: happyWindow.sessionStorage,
  HTMLElement: happyWindow.HTMLElement, Event: happyWindow.Event, MouseEvent: happyWindow.MouseEvent, Node: happyWindow.Node,
  IS_REACT_ACT_ENVIRONMENT: true });
const { AuthProvider } = await import("../src/context/AuthContext");
const { ActiveIpProvider, useActiveIp } = await import("../src/context/ActiveIpContext");
const { setActingTenant, getActingTenant } = await import("../src/api/transport");
const { default: TenantMenu } = await import("../src/components/TenantMenu");
const originalFetch = globalThis.fetch;
const originalTenant = getActingTenant();
let root: Root | undefined;
const records = [
  { id: "unused", name: "Empty record", scope_kind: null, brand_name: null, monitoring_enabled: false, historical_ips: [] },
  { id: "brand", name: "Current brand", scope_kind: "brand", brand_name: "Current brand", monitoring_enabled: true,
    historical_ips: [{ id: "earlier", name: "Earlier brand" }] },
  { id: "product", name: "Space soldier", scope_kind: "product", brand_name: "Current brand", monitoring_enabled: true, historical_ips: [] },
];
function Probe() {
  const scope = useActiveIp(), location = useLocation(), navigate = useNavigate();
  return <><output>{JSON.stringify({id:scope.activeIpId,name:scope.activeIp?.name,error:scope.error,loading:scope.loading,url:location.pathname+location.search})}</output>
    <button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button>
    <TenantMenu tenants={[]} /></>;
}
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  if (!predicate()) throw new Error(document.body.textContent ?? "Expected selector state was not reached");
  expect(predicate()).toBe(true);
}
async function mount(route: string, stored = "brand") {
  Object.assign(globalThis, { window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
    localStorage: happyWindow.localStorage, sessionStorage: happyWindow.sessionStorage,
    HTMLElement: happyWindow.HTMLElement, Event: happyWindow.Event, MouseEvent: happyWindow.MouseEvent, Node: happyWindow.Node,
    IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem("unvelar.active-ip.tenant", stored);
  setActingTenant("tenant");
  globalThis.fetch = (async input => {
    const url = new URL(String(input), happyWindow.location.origin);
    if (url.pathname === "/api/ip/selector") return Response.json({ips:records});
    if (url.pathname === "/api/auth/me") return Response.json({user:null});
    throw new Error(`Unexpected request ${url.pathname}`);
  }) as typeof fetch;
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<MemoryRouter initialEntries={[route]}><AuthProvider><ActiveIpProvider><Probe /></ActiveIpProvider></AuthProvider></MemoryRouter>); });
  await waitFor(() => Boolean(container.querySelector("output")?.textContent?.includes('"name"')));
  const state = () => JSON.parse(container.querySelector("output")!.textContent!);
  const click = async (label: string) => {
    await act(async () => { [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click(); });
  };
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Tenant menu: Your tenant"]')!.click(); });
  const select = async (value: string) => {
    await act(async () => { const element=container.querySelector("select")!; element.value=value;
      element.dispatchEvent(new happyWindow.Event("change", {bubbles:true})); });
  };
  return {container,state,select,click};
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); }); root=undefined;
  globalThis.fetch=originalFetch; document.body.replaceChildren(); localStorage.clear(); sessionStorage.clear();
  setActingTenant(originalTenant);
});

test("selection updates a scoped URL and back/forward keeps the selected product in sync", async () => {
  const {state,select,click} = await mount("/monitoring/first-scan?ip_id=brand&q=robot&protected_term_id=old-term&source_id=old-source&product_group_id=old-group");
  await select("product");
  expect(state()).toMatchObject({id:"product",name:"Space soldier",url:"/monitoring/first-scan?ip_id=product&q=robot"});
  await click("Back"); expect(state().id).toBe("brand");
  await click("Forward"); expect(state().id).toBe("product");
});

test("linked-history URLs and remembered records resolve to the canonical brand", async () => {
  const {state,container} = await mount("/monitoring/first-scan?ip_id=earlier", "earlier");
  await waitFor(() => state().url === "/monitoring/first-scan?ip_id=brand");
  expect(state().id).toBe("brand");
  expect([...container.querySelectorAll("option")].some(option => option.value === "earlier")).toBe(false);
  expect(container.querySelector('[aria-label="Linked history"]')?.textContent).toContain("Earlier brand");
});

test("the selector labels brands, products and unconfigured records separately", async () => {
  const {container,state} = await mount("/monitoring/first-scan", "missing-record");
  expect(state().id).toBe("brand");
  expect(container.querySelector("label")?.textContent).toBe("Brand or product");
  expect([...container.querySelectorAll("optgroup")].map(group => group.label)).toEqual(["Brands", "Products", "Unconfigured records"]);
});
