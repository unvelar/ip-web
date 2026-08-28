import type { CSSProperties } from "react";

export const APP_SHELL_TOPBAR_HEIGHT_VAR = "--app-shell-topbar-height";
export const APP_SHELL_BANNER_HEIGHT_VAR = "--app-shell-banner-height";
export const APP_SHELL_BANNER_STICKY_TOP_VAR = "--app-shell-banner-sticky-top";
export const APP_SHELL_ACTING_BANNER_HEIGHT = "1.75rem";

export const APP_SHELL_OVERLAY_TOP =
  `calc(var(${APP_SHELL_TOPBAR_HEIGHT_VAR}) + var(${APP_SHELL_BANNER_HEIGHT_VAR}))`;

type AppShellLayoutStyle = CSSProperties & {
  [APP_SHELL_BANNER_HEIGHT_VAR]: string;
};

export function appShellLayoutStyle(isActingAsOther: boolean): AppShellLayoutStyle {
  return {
    [APP_SHELL_BANNER_HEIGHT_VAR]: isActingAsOther
      ? APP_SHELL_ACTING_BANNER_HEIGHT
      : "0px",
  };
}
