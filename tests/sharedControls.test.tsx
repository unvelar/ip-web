import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ImageUploader from "../src/components/ImageUploader";
import Lightbox from "../src/components/Lightbox";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });
function setup() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  return { window, container, root };
}

test("upload picker responds to Enter and Space and stays disabled during upload", async () => {
  const { window, container, root } = setup();
  await act(async () => root.render(createElement(ImageUploader, { onUpload: () => undefined })));
  const surface = container.querySelector('[role="button"]') as HTMLElement;
  const input = container.querySelector("input")!;
  let opens = 0;
  input.addEventListener("click", (event) => { event.preventDefault(); opens += 1; });
  expect(surface.tabIndex).toBe(0);
  for (const key of ["Enter", " "]) {
    await act(async () => { surface.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true })); });
  }
  expect(opens).toBe(2);
  await act(async () => root.render(createElement(ImageUploader, { onUpload: () => undefined, uploading: true })));
  await act(async () => { surface.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(surface.getAttribute("aria-disabled")).toBe("true");
  expect(input.disabled).toBe(true);
  expect(opens).toBe(2);
});

test("lightbox exposes a modal dialog, handles cancellation, and restores focus", async () => {
  const { window, container, root } = setup();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  let closes = 0;
  await act(async () => root.render(createElement(Lightbox, { src: "reference.png", alt: "Product reference", onClose: () => { closes += 1; } })));
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.getAttribute("aria-label")).toBe("Product reference");
  await act(async () => { dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })); });
  expect(closes).toBe(1);
  await act(async () => root.unmount());
  expect(document.activeElement === trigger).toBe(true);
  expect(document.body.style.overflow).toBe("");
});
