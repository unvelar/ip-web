import { useLocation, useSearchParams } from "react-router-dom";

const RETURN_IP = "sellerFindingReturnIp";

/** The URL owns the expanded seller and task; history remembers task-only IP scope. */
export function useSellerNavigation() {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();

  function select(seller: string | null, finding: string | null = null, ipId?: string | null) {
    const next = new URLSearchParams(params);
    const nextState: Record<string, unknown> = state && typeof state === "object" ? { ...state } : {};
    for (const [key, value] of [["seller", seller], ["finding", finding]] as const) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (finding) {
      if (!(RETURN_IP in nextState)) nextState[RETURN_IP] = params.get("ip_id");
      if (ipId) next.set("ip_id", ipId);
    } else if (RETURN_IP in nextState) {
      const previousIp = nextState[RETURN_IP];
      if (typeof previousIp === "string") next.set("ip_id", previousIp);
      else next.delete("ip_id");
      delete nextState[RETURN_IP];
    }
    // Closing replaces the open state; opening preserves Back/Forward navigation.
    setParams(next, { replace: !finding && (!seller || seller === params.get("seller")), state: nextState });
  }

  return [params, select] as const;
}
