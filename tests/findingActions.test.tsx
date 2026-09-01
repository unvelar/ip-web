import { afterEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { IpReviewFinding } from "../src/api";

const allowProductImage = mock(async () => ({
  ok: true,
  queued: true,
  job_id: "job-1",
}));
const dismiss = mock(() => undefined);

mock.module("../src/api", () => ({
  DEFAULT_TAKEDOWN_FEEDBACK_SCOPES: [],
  addIpLicense: mock(async () => ({ dismissed: 1 })),
  allowIpFindingProductImage: allowProductImage,
  approveTakedown: mock(async () => ({ status: "automatic" })),
  autoSendTakedown: mock(async () => ({ status: "sent" })),
  getTakedownDraft: mock(async () => ({})),
  getTakedownThread: mock(async () => ({ takedown: null })),
  markIpFindingEnforced: mock(async () => ({ ok: true })),
  markIpFindingNeedsReview: mock(async () => ({ ok: true })),
  markTakedownsSubmitted: mock(async () => ({ submitted_case_ids: [], skipped: [] })),
  openIpFindingTakedownPacket: mock(async () => undefined),
  reenrichIpFinding: mock(async () => ({ ok: true })),
  reopenIpFinding: mock(async () => ({ ok: true })),
  replyTakedown: mock(async () => ({})),
  sendTakedown: mock(async () => ({})),
}));

const { FindingActions } = await import(
  "../src/components/monitoring/board/FindingActions"
);

const happyWindow = new Window({ url: "http://localhost:5173" });
Object.assign(globalThis, {
  window: happyWindow,
  document: happyWindow.document,
  navigator: happyWindow.navigator,
  HTMLElement: happyWindow.HTMLElement,
  Event: happyWindow.Event,
  MouseEvent: happyWindow.MouseEvent,
  Node: happyWindow.Node,
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function finding(overrides: Partial<IpReviewFinding> = {}): IpReviewFinding {
  return {
    result_id: "result-1",
    case_id: "case-1",
    ip_id: "ip-1",
    domain: "ebay.com",
    seller_name: "Example seller",
    review_status: "pending",
    dismissed_at: null,
    dismissal_reason: null,
    licensed_seller: false,
    offer_subject: null,
    actionability: { key: "needs_review", reason: "Needs review" },
    screenshot_url: "screenshot.jpg",
    archived_image_urls: ["archived.jpg"],
    gallery_scores: [
      { url: "weaker.jpg", similarity: 0.72 },
      { url: "strongest.jpg", similarity: 0.94 },
    ],
    image_urls: ["fallback.jpg"],
    image_url: "legacy.jpg",
    ...overrides,
  } as IpReviewFinding;
}

function renderActions({
  item = finding(),
  ipId = "ip-1",
  isDismissed = false,
  isDismissing = false,
}: {
  item?: IpReviewFinding;
  ipId?: string | null;
  isDismissed?: boolean;
  isDismissing?: boolean;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onActionComplete = mock(() => undefined);
  const onUpdated = mock(() => undefined);
  act(() => {
    root.render(createElement(FindingActions, {
      f: item,
      ipId: ipId ?? undefined,
      canLicense: true,
      isDismissed,
      isDismissing,
      onDismiss: dismiss,
      onActionComplete,
      onNeedsReview: mock(() => undefined),
      onTakedownSent: mock(() => undefined),
      onEnforced: mock(() => undefined),
      onLicensed: mock(() => undefined),
      onUpdated,
    }));
  });
  return { container, onActionComplete, onUpdated, root };
}

function button(container: HTMLElement, label: string) {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(match instanceof happyWindow.HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return match;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  allowProductImage.mockReset();
  allowProductImage.mockImplementation(async () => ({
    ok: true,
    queued: true,
    job_id: "job-1",
  }));
  dismiss.mockClear();
  mock.restore();
});

describe("FindingActions allow product", () => {
  test("requires a reviewer reason even when takedown matches the recommendation", () => {
    const { container } = renderActions({
      item: finding({ actionability: { key: "send_takedown", reason: "Recommended" } }),
    });

    act(() => button(container, "TTakedown").click());

    expect(container.querySelector("#takedown-decision-reason")).not.toBeNull();
    expect(button(container, "Takedown").disabled).toBe(true);
  });

  test("submits the strongest eligible image and locks competing decisions", async () => {
    let resolveRequest!: (value: { ok: boolean; queued: boolean; job_id: string }) => void;
    allowProductImage.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const { container, onActionComplete, onUpdated } = renderActions();
    const allow = button(container, "Allow product");

    act(() => allow.click());

    expect(allowProductImage).toHaveBeenCalledTimes(1);
    expect(allowProductImage).toHaveBeenCalledWith("ip-1", "result-1", {
      image_url: "strongest.jpg",
    });
    expect(button(container, "Allowing…").disabled).toBe(true);
    for (const label of [
      "1Different product",
      "2Second hand",
      "3Mark as OK",
      "RReview",
      "TTakedown",
      "License seller",
    ]) {
      expect(button(container, label).disabled).toBe(true);
    }

    act(() => button(container, "Allowing…").click());
    expect(allowProductImage).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();

    await act(async () => {
      resolveRequest({ ok: true, queued: true, job_id: "job-1" });
      await Promise.resolve();
    });

    expect(onActionComplete).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith({ completed: true });
  });

  test("disables every durable action while an external dismissal is pending", () => {
    const { container } = renderActions({ isDismissing: true });

    for (const action of container.querySelectorAll<HTMLButtonElement>(
      ".finding-action-buttons button",
    )) {
      expect(action.disabled).toBe(true);
    }
  });

  test("explains missing prerequisites", () => {
    const withoutIp = renderActions({ ipId: null });
    expect(button(withoutIp.container, "Allow product").disabled).toBe(true);
    expect(button(withoutIp.container, "Allow product").title).toBe(
      "Cannot allow product: finding has no associated IP",
    );

    const withoutImage = renderActions({
      item: finding({
        screenshot_url: "screenshot.jpg",
        archived_image_urls: ["archived.jpg"],
        gallery_scores: [],
        image_urls: ["screenshot.jpg", "archived.jpg"],
        image_url: null,
      }),
    });
    expect(button(withoutImage.container, "Allow product").disabled).toBe(true);
    expect(button(withoutImage.container, "Allow product").title).toBe(
      "No eligible product image is available",
    );
  });

  test("is available for triage, review, and legal-pending findings", () => {
    for (const reviewStatus of ["pending", "review", "takedown_pending"] as const) {
      const { container } = renderActions({ item: finding({ review_status: reviewStatus }) });
      expect(button(container, "Allow product").disabled).toBe(false);
    }
  });

  test("reports a failure, keeps the finding open, and allows retry", async () => {
    const requestError = new Error("Unable to save visual exception");
    allowProductImage.mockRejectedValueOnce(requestError);
    const alertUser = mock(() => undefined);
    Object.assign(globalThis, { alert: alertUser });
    const { container, onActionComplete } = renderActions();

    await act(async () => {
      button(container, "Allow product").click();
      await Promise.resolve();
    });

    expect(alertUser).toHaveBeenCalledWith(requestError.message);
    expect(onActionComplete).not.toHaveBeenCalled();
    expect(button(container, "Allow product").disabled).toBe(false);

    await act(async () => {
      button(container, "Allow product").click();
      await Promise.resolve();
    });
    expect(allowProductImage).toHaveBeenCalledTimes(2);
    expect(onActionComplete).toHaveBeenCalledTimes(1);
  });

  test("does not offer the action after the finding is completed", () => {
    const dismissed = renderActions({ isDismissed: true });
    expect(dismissed.container.textContent).not.toContain("Allow product");

    const licensed = renderActions({ item: finding({ licensed_seller: true }) });
    expect(licensed.container.textContent).not.toContain("Allow product");
  });
});
