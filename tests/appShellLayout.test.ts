import { describe, expect, test } from "bun:test";
import {
  APP_SHELL_ACTING_BANNER_HEIGHT,
  APP_SHELL_BANNER_HEIGHT_VAR,
  APP_SHELL_OVERLAY_TOP,
  appShellLayoutStyle,
} from "../src/components/appShellLayout";

describe("application shell overlay offsets", () => {
  test("does not reserve banner space in the user's own tenant", () => {
    expect(appShellLayoutStyle(false)).toEqual({
      [APP_SHELL_BANNER_HEIGHT_VAR]: "0px",
    });
  });

  test("reserves the acting-tenant banner height while impersonating", () => {
    expect(appShellLayoutStyle(true)).toEqual({
      [APP_SHELL_BANNER_HEIGHT_VAR]: APP_SHELL_ACTING_BANNER_HEIGHT,
    });
  });

  test("positions overlays below the topbar and any active banner", () => {
    expect(APP_SHELL_OVERLAY_TOP).toBe(
      "calc(var(--app-shell-topbar-height) + var(--app-shell-banner-height))",
    );
  });
});
