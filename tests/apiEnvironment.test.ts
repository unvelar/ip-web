import { describe, expect, test } from "bun:test";
import { isLocalApiTarget } from "../src/lib/apiEnvironment";

describe("API environment", () => {
  test("allows the dev shortcut for the same-origin local API", () => {
    expect(isLocalApiTarget(undefined, "http://localhost:5173")).toBe(true);
    expect(isLocalApiTarget("http://127.0.0.1:3000", "http://localhost:5173")).toBe(true);
  });

  test("does not expose dev login when localhost points at production", () => {
    expect(isLocalApiTarget("https://api.unvelar.com", "http://localhost:5173")).toBe(false);
  });

  test("fails closed for an invalid configured API target", () => {
    expect(isLocalApiTarget("http://[", "http://localhost:5173")).toBe(false);
  });
});
