import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { IpOnboardingStatus } from "../src/api";
import type { FirstScanSourceProgress } from "../src/lib/firstScanProgress";
import { FirstScanSetupNotice } from "../src/features/firstScan/FirstScanSetupNotice";

const onboarding = {
  state: "needs_attention",
  customer_action_required: false,
  title: "Setup saved - retry needed",
  message: "The failed step needs a system retry.",
  checks: [
    {
      key: "monitoring_sources",
      label: "Monitoring sources",
      status: "attention",
      detail: "4 of 5 sources ready; vinted.com needs a retry.",
    },
  ],
  progress: {
    monitoring_sources: {
      source_statuses: [
        { source_id: "vinted", status: "retry_needed" },
      ],
    },
  },
} as IpOnboardingStatus;

const sources = [
  {
    source: {
      id: "vinted",
      domain: "vinted.com",
      display_name: "Vinted",
    },
    state: "retry_needed",
  } as FirstScanSourceProgress,
];

describe("FirstScanSetupNotice", () => {
  test("shows scheduled recovery and monitoring-off state without claiming work is running", () => {
    const recovery = {
      enabled: true, scheduled: 1, due: 0, processing: 0, off: 0, blocked: 0, needed: 0,
      next_retry_at: "2026-09-26T12:00:00Z",
      sources: [{ source_id: "vinted", label: "Vinted", state: "scheduled" as const, next_retry_at: "2026-09-26T12:00:00Z", reason: null }],
    };
    const render = (status: IpOnboardingStatus) => renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(FirstScanSetupNotice, { onboarding: status, sources, ipId: "ip-1" })));
    const html = render({ ...onboarding, state: "delayed", title: "Monitoring limited, retry scheduled", recovery });
    expect(html).toContain("Next automatic retry:");
    expect(html).toContain("Website retry details (1)");
    expect(html).not.toContain("needs a system retry");
    const paused = render({ ...onboarding, state: "paused", title: "Monitoring is off", recovery: {
      ...recovery, enabled: false, scheduled: 0, off: 1, next_retry_at: null,
      sources: [{ ...recovery.sources[0], state: "off", next_retry_at: null }],
    } });
    expect(paused).toContain("automatic retries paused");
    expect(paused).not.toContain("Next automatic retry:");
  });

  test("names the failed source and links directly to its monitoring setup", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(FirstScanSetupNotice, {
          onboarding,
          sources,
          ipId: "ip-1",
        }),
      ),
    );

    expect(html).toContain("Vinted needs a system retry");
    expect(html).toContain("4 of 5 sources ready; vinted.com needs a retry.");
    expect(html).toContain('href="/ips/ip-1#monitoring-source-vinted"');
    expect(html).toContain("View Vinted setup");
  });

  test("keeps an in-progress source visible while setup is being prepared", () => {
    const processingOnboarding = {
      ...onboarding,
      state: "delayed",
      title: "Setup complete - processing delayed",
      message: "No action is required; we'll continue automatically.",
      checks: [
        {
          key: "monitoring_sources",
          label: "Monitoring sources",
          status: "processing",
          detail: "4 of 5 sources ready; 1 is being prepared.",
        },
      ],
      progress: {
        monitoring_sources: {
          source_statuses: [
            { source_id: "vinted", status: "processing" },
          ],
        },
      },
    } as IpOnboardingStatus;
    const processingSources = [
      {
        ...sources[0],
        state: "setup_processing",
      } as FirstScanSourceProgress,
    ];

    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(FirstScanSetupNotice, {
          onboarding: processingOnboarding,
          sources: processingSources,
          ipId: "ip-1",
        }),
      ),
    );

    expect(html).toContain("Vinted is still being prepared");
    expect(html).toContain("4 of 5 sources ready; 1 is being prepared.");
    expect(html).toContain('href="/ips/ip-1#monitoring-source-vinted"');
  });
});
