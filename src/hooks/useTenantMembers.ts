import { useEffect, useState } from "react";
import { listTenantMembers, type TenantMember } from "../api";
import { useAuth } from "../context/AuthContext";

const memberCache = new Map<string, TenantMember[]>();
const memberRequests = new Map<string, Promise<TenantMember[]>>();

function loadMembers(tenantId: string) {
  const cached = memberCache.get(tenantId);
  if (cached) return Promise.resolve(cached);

  const existing = memberRequests.get(tenantId);
  if (existing) return existing;

  const request = listTenantMembers()
    .then(({ members }) => {
      memberCache.set(tenantId, members);
      return members;
    })
    .finally(() => memberRequests.delete(tenantId));
  memberRequests.set(tenantId, request);
  return request;
}

export function useTenantMembers() {
  const { actingTenantId } = useAuth();
  const [state, setState] = useState<{
    tenantId: string | null;
    members: TenantMember[];
    error: string;
    loaded: boolean;
  }>(() => {
    const cached = actingTenantId ? memberCache.get(actingTenantId) : undefined;
    return {
      tenantId: actingTenantId,
      members: cached ?? [],
      error: "",
      loaded: !actingTenantId || Boolean(cached),
    };
  });

  useEffect(() => {
    if (!actingTenantId) return;

    let active = true;
    void loadMembers(actingTenantId)
      .then((next) => {
        if (active) {
          setState({ tenantId: actingTenantId, members: next, error: "", loaded: true });
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setState({
            tenantId: actingTenantId,
            members: [],
            error: caught instanceof Error ? caught.message : "Unable to load tenant members",
            loaded: true,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [actingTenantId]);

  const current = state.tenantId === actingTenantId;
  const cached = actingTenantId ? memberCache.get(actingTenantId) : undefined;
  return {
    members: current ? state.members : cached ?? [],
    loading: Boolean(actingTenantId && !cached && (!current || !state.loaded)),
    error: current ? state.error : "",
  };
}
