import { createContext, type ReactNode } from "react";

// The shell owns status polling, scope selection, and notification counts.
export const MonitoringToolbarContext = createContext<{
  status: ReactNode;
  scope: ReactNode;
  notifications: ReactNode;
} | null>(null);
