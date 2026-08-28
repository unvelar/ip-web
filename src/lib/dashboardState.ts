export type DashboardContentState = "no_ip" | "no_activity" | "activity";

/**
 * Dashboard activity rows are finding-derived. Their absence says nothing
 * about whether monitoring sources are configured for the selected IP.
 */
export function dashboardContentState(input: {
  hasActiveIp: boolean;
  hasActivity: boolean;
}): DashboardContentState {
  if (!input.hasActiveIp) return "no_ip";
  return input.hasActivity ? "activity" : "no_activity";
}
