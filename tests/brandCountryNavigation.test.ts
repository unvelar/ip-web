import { afterEach, expect, test } from "bun:test";
import { brandCountryTasksPath } from "../src/lib/brandSummaryNavigation";
import { parseFilters, writeFilters } from "../src/lib/monitoringFilters";
import { listMonitoringFindingsGlobal } from "../src/api/monitoring";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("country deep links preserve the IP, raw country and all-task status through URL and API", async () => {
  for (const country of ["France", "Korea, Republic of", "Unknown"]) {
    const url = new URL(brandCountryTasksPath("test-ip", country), "https://unvelar.com");
    const filters = parseFilters(url.searchParams);
    expect(filters.ip_id).toBe("test-ip");
    expect(filters.country).toBe(country);
    expect(filters.status).toBeNull();
    expect(filters.sort).toBe("found_desc");
    expect(writeFilters(url.searchParams, filters).get("country")).toBe(country);
    globalThis.fetch = (async (value) => {
      const query = new URL(String(value), "https://api.unvelar.com").searchParams;
      expect(query.get("country")).toBe(country);
      expect(query.get("ip_id")).toBe("test-ip");
      return Response.json({ findings: [], facets: { country }, next_cursor: null });
    }) as typeof fetch;
    await listMonitoringFindingsGlobal(filters);
    expect(writeFilters(url.searchParams, { ...filters, country: null }).has("country")).toBe(false);
  }
});
