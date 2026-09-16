import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import PublicSummarySettings from "../src/components/PublicSummarySettings";
import { publicSummaryUrlForIp } from "../src/lib/publicSummary";
import type { Trademark } from "../src/api";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

function SettingsFixture({ enabled }: { enabled: boolean | undefined }) {
  const [ip, setIp] = useState({
    id: "fixture-ip", public_slug: "example-ip", tenant_public_slug: "example-tenant",
    public_summary_enabled: enabled,
  } as Trademark);
  const url = publicSummaryUrlForIp(ip);
  return <>
    <PublicSummarySettings ip={ip} onSaved={(public_summary_enabled) => setIp({ ...ip, public_summary_enabled })} />
    {url && <a href={url}>Open public summary</a>}
  </>;
}

async function renderSettings(enabled: boolean | undefined) {
  const window = new Window({ url: "http://localhost:5173/ips/fixture-ip" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<SettingsFixture enabled={enabled} />));
  return { container, toggle: container.querySelector<HTMLButtonElement>('[role="switch"]')! };
}

test("publication and sharing change only after a confirmed save, and failed unpublishing stays visible", async () => {
  let respond: (response: Response) => void = () => { throw new Error("No pending request"); };
  let sentBody: unknown;
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toEndWith("/api/ip/fixture-ip");
    expect(init?.method).toBe("PATCH");
    sentBody = JSON.parse(init?.body as string);
    return await new Promise<Response>((resolve) => { respond = resolve; });
  }) as typeof fetch;
  const { container, toggle } = await renderSettings(false);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector("a")).toBeNull();
  await act(async () => toggle.click());
  expect(sentBody).toEqual({ public_summary_enabled: true });
  expect(toggle.disabled).toBe(true);
  expect(container.querySelector("a")).toBeNull();
  await act(async () => respond(Response.json({ trademark: { public_summary_enabled: true } })));
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector("a")?.href).toBe("http://localhost:5173/brand-sumups/example-tenant/example-ip");

  await act(async () => toggle.click());
  expect(sentBody).toEqual({ public_summary_enabled: false });
  await act(async () => respond(Response.json({ error: "Unable to save" }, { status: 503 })));
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector("a")).not.toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unable to save");

  // A stale server that ignores the new field must not claim unpublishing succeeded.
  await act(async () => toggle.click());
  await act(async () => respond(Response.json({ trademark: {} })));
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not confirm");

  await act(async () => toggle.click());
  await act(async () => respond(Response.json({ trademark: { public_summary_enabled: false } })));
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("missing publication state hides sharing and disables changes without claiming the IP is private", async () => {
  const { container, toggle } = await renderSettings(undefined);
  expect(toggle.disabled).toBe(true);
  expect(container.querySelector("a")).toBeNull();
  expect(container.textContent).toContain("Publication settings are temporarily unavailable");
  expect(container.textContent).not.toContain("Not published.");
});
