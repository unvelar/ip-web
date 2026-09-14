import { describe, expect, test } from "bun:test";
import { parseAuthResponse } from "../src/api/auth";
import { parseJob } from "../src/api/jobs";
import { parseTrademarkDetail, parseTrademarkList } from "../src/api/registry";
import { InvalidApiResponseError } from "../src/api/validation";

const ip = { id: "ip-1", name: "Example", keywords: [], image_count: 0, indexed_count: 0 };

describe("API identity and envelope validation", () => {
  test("a missing list is a server error rather than an empty registry", () => {
    expect(() => parseTrademarkList({})).toThrow(InvalidApiResponseError);
    expect(parseTrademarkList({ trademarks: [] })).toEqual({ trademarks: [] });
    expect(parseTrademarkList({ trademarks: [ip] }).trademarks).toHaveLength(1);
  });
  test("a detail response cannot identify a different IP or image owner", () => {
    expect(() => parseTrademarkDetail({ trademark: ip, images: [] }, "ip-2")).toThrow(InvalidApiResponseError);
    expect(() => parseTrademarkDetail({ trademark: ip, images: [{ id: "image-1", trademark_id: "ip-2", url: "image.jpg", status: "indexed" }] }, "ip-1")).toThrow(InvalidApiResponseError);
    expect(parseTrademarkDetail({ trademark: ip, images: [] }, "ip-1").trademark.id).toBe("ip-1");
  });
  test("detail responses derive summary counts from their image list", () => {
    const detail = { id: "ip-1", name: "Example", keywords: [] };
    const images = [
      { id: "image-1", trademark_id: "ip-1", url: "one.jpg", status: "indexed" },
      { id: "image-2", trademark_id: "ip-1", url: "two.jpg", status: "pending" },
    ];
    const result = parseTrademarkDetail({ trademark: detail, images }, "ip-1");
    expect(result.trademark.image_count).toBe(2);
    expect(result.trademark.indexed_count).toBe(1);
  });
  test("a job response must identify the requested job", () => {
    const job = { id: "job-1", status: "completed", type: "index", payload: {}, result: null, error: null };
    expect(() => parseJob(job, "job-2")).toThrow(InvalidApiResponseError);
    expect(parseJob(job, "job-1").status).toBe("completed");
  });
  test("session validation fails closed for missing identity and unknown roles", () => {
    expect(parseAuthResponse({ user: null })).toEqual({ user: null });
    const user = { id: "user-1", tenant_id: "tenant-1", role: "admin", email: null, display_name: null, picture_url: null };
    expect(parseAuthResponse({ user }).user?.role).toBe("admin");
    expect(() => parseAuthResponse({ user: { ...user, tenant_id: null } })).toThrow(InvalidApiResponseError);
    expect(() => parseAuthResponse({ user: { ...user, role: "superuser" } })).toThrow(InvalidApiResponseError);
  });
});
