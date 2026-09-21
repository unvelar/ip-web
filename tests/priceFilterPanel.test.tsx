import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PriceFilterPanel, type PriceFilterPanelProps } from "../src/components/monitoring/board/PriceFilterPanel";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function setup(overrides: Partial<PriceFilterPanelProps> = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const applied: [number | null, number | null][] = [];
  root = createRoot(container);
  await act(async () => root!.render(<PriceFilterPanel min={null} max={null} bounds={{ min: 2, max: 90, missing: 3 }}
    onApply={(min, max) => applied.push([min, max])} {...overrides} />));
  const input = (label: string) => {
    const labelElement = Array.from(container.querySelectorAll("label")).find((candidate) => candidate.textContent?.startsWith(label));
    return (labelElement?.querySelector("input") ?? container.querySelector(`[aria-label="${label}"]`)) as HTMLInputElement;
  };
  const setInput = async (label: string, value: string) => {
    const field = input(label);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(field, value);
      field.dispatchEvent(new window.Event("input", { bubbles: true }));
      field.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  const button = (name: string) => Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === name)!;
  const click = async (name: string) => {
    await act(async () => {
      const target = button(name);
      if (target.disabled) return;
      if (target.type === "submit") container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      else target.click();
    });
  };
  return { container, applied, input, setInput, button, click };
}

test("price slider keeps a draft until Apply and never crosses the other thumb", async () => {
  const ui = await setup({ min: 10, max: 60 });
  await ui.setInput("Minimum price slider", "25");
  expect(ui.input("Minimum price").value).toBe("25");
  expect(ui.applied).toEqual([]);
  await ui.setInput("Maximum price slider", "20");
  expect(ui.input("Maximum price").value).toBe("25");
  await ui.click("Apply");
  expect(ui.applied).toEqual([[25, 25]]);
});

test("typed zero is an inclusive minimum, maximum can be open, and scale expands", async () => {
  const ui = await setup();
  await ui.setInput("Minimum price", "0");
  await ui.setInput("Maximum price", "150");
  expect(ui.input("Minimum price slider").min).toBe("0");
  expect(ui.input("Maximum price slider").max).toBe("150");
  await ui.setInput("Maximum price", "");
  await ui.click("Apply");
  expect(ui.applied).toEqual([[0, null]]);
});

test("invalid negative or reversed prices cannot be applied", async () => {
  const ui = await setup({ min: 10, max: 60 });
  await ui.setInput("Minimum price", "70");
  expect(ui.button("Apply").disabled).toBe(true);
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("Minimum price");
  await ui.click("Apply");
  expect(ui.applied).toEqual([]);
  await ui.setInput("Minimum price", "-1");
  expect(ui.button("Apply").disabled).toBe(true);
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("from $0");
  await ui.setInput("Minimum price", "0");
  expect(ui.button("Apply").disabled).toBe(false);
});

test("clear removes both price bounds immediately, including invalid drafts", async () => {
  const ui = await setup({ min: 10, max: 60 });
  await ui.setInput("Minimum price", "70");
  await ui.click("Clear price");
  expect(ui.applied).toEqual([[null, null]]);
});

test("unavailable bounds do not invent a range or permit an unsupported filter", async () => {
  const ui = await setup({ bounds: undefined, min: 0 });
  expect(ui.container.querySelectorAll('[type="range"]')).toHaveLength(0);
  expect(ui.input("Minimum price").disabled).toBe(true);
  expect(ui.button("Apply").disabled).toBe(true);
  expect(ui.container.textContent).toContain("Price filtering is not available yet");
  await ui.click("Clear price");
  expect(ui.applied).toEqual([[null, null]]);
});

test("single-priced and missing-price views explain their range without fabricated limits", async () => {
  const ui = await setup({ bounds: { min: 25, max: 25, missing: 1 } });
  expect(ui.input("Minimum price slider").min).toBe("25");
  expect(ui.input("Maximum price slider").max).toBe("25");
  expect(ui.input("Minimum price slider").disabled).toBe(true);
  expect(ui.container.textContent).toContain("1 listing has no price");
  expect(ui.input("Minimum price slider").getAttribute("aria-valuetext")).toBe("No minimum");
});


test("prices above the supported API limit cannot be applied", async () => {
  const ui = await setup();
  await ui.setInput("Maximum price", "1000000000001");
  expect(ui.button("Apply").disabled).toBe(true);
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("$1 trillion");
  await ui.setInput("Maximum price", "1000000000000");
  await ui.click("Apply");
  expect(ui.applied).toEqual([[null, 1000000000000]]);
});

test("incoming facet updates preserve the draft and the scale while open", async () => {
  const ui = await setup();
  await ui.setInput("Minimum price", "12");
  await act(async () => root!.render(<PriceFilterPanel min={null} max={null} bounds={{ min: 1, max: 1000, missing: 0 }} onApply={() => {}} />));
  expect(ui.input("Minimum price").value).toBe("12");
  expect(ui.input("Maximum price slider").max).toBe("90");
  expect(ui.input("Minimum price slider").getAttribute("aria-valuetext")).toBe("$12.00");
  expect(ui.input("Minimum price slider").tabIndex).toBe(0);
});


test("fractional-cent FX bounds expand outward so native cent steps cover the full range", async () => {
  const ui = await setup({ bounds: { min: 2.005, max: 3.001, missing: 0 } });
  expect(ui.input("Minimum price slider").min).toBe("2");
  expect(ui.input("Maximum price slider").max).toBe("3.01");
  expect(ui.input("Minimum price slider").step).toBe("0.01");
  await ui.setInput("Maximum price slider", "3.01");
  await ui.click("Apply");
  expect(ui.applied).toEqual([[null, 3.01]]);
});

test("exact decimal inputs preserve precision and reject unsupported exponent syntax", async () => {
  const ui = await setup({ min: 0.0000001 });
  expect(ui.input("Minimum price").value).toBe("0.0000001");
  expect(ui.button("Apply").disabled).toBe(false);
  await ui.setInput("Maximum price", "1e3");
  expect(ui.button("Apply").disabled).toBe(true);
  await ui.setInput("Maximum price", ".5");
  await ui.click("Apply");
  expect(ui.applied).toEqual([[0.0000001, 0.5]]);
});

test("a supported view with no known prices offers exact bounds without inventing a slider", async () => {
  const ui = await setup({ bounds: { min: null, max: null, missing: 20 } });
  expect(ui.container.querySelectorAll('[type="range"]')).toHaveLength(0);
  expect(ui.container.textContent).toContain("No listing prices are available");
  await ui.setInput("Maximum price", "0");
  await ui.click("Apply");
  expect(ui.applied).toEqual([[null, 0]]);
});

test("closing discards a draft without applying or clearing the current range", async () => {
  let closed = 0;
  const ui = await setup({ min: 10, max: 60, onClose: () => { closed += 1; } });
  await ui.setInput("Minimum price", "25");
  await act(async () => (ui.container.querySelector('[aria-label="Close filter options"]') as HTMLButtonElement).click());
  expect(closed).toBe(1);
  expect(ui.applied).toEqual([]);
});
