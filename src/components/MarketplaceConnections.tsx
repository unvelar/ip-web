import { useEffect, useState } from "react";
import { request } from "../api/transport";

interface Connection {
  configured: boolean;
  status: "not_configured" | "disconnected" | "connected" | "refreshing" | "reauthorization_required";
  external_user_id?: string | null;
}

const STATUS_LABELS: Record<Connection["status"], string> = {
  not_configured: "Server setup incomplete",
  disconnected: "Not connected",
  connected: "Connected",
  refreshing: "Renewing connection",
  reauthorization_required: "Reconnect to continue",
};

export default function MarketplaceConnections() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request<Connection>("/api/marketplaces/mercadolibre/oauth/status", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setConnection(value); })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load the connection.");
      });
    return () => controller.abort();
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const { start_url } = await request<{ start_url: string }>("/api/marketplaces/mercadolibre/oauth/authorize", { method: "POST" });
      window.location.assign(start_url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start the connection.");
      setConnecting(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="marketplace-connections-title">
      <div>
        <h2 id="marketplace-connections-title" className="text-lg font-black text-stone-900 tracking-tight">Marketplace connections</h2>
        <p className="mt-1 text-sm text-stone-500">Shared across Unvelar. Only administrators can manage these connections.</p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-stone-900">Mercado Libre</h3>
            <p className="mt-1 text-sm text-stone-500" role="status">
              {connection ? STATUS_LABELS[connection.status] : error ? "Connection unavailable" : "Loading connection…"}
              {connection?.external_user_id && ` · Account ${connection.external_user_id}`}
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            disabled={!connection?.configured || connecting || connection.status === "refreshing"}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? "Opening Mercado Libre…" : connection?.status === "connected" || connection?.status === "reauthorization_required" ? "Reconnect" : "Connect Mercado Libre"}
          </button>
        </div>
        <p className="text-sm leading-relaxed text-stone-500">
          Unvelar will use this connection for read-only access checks. Mercado Libre monitoring stays disabled until listing and seller access has been verified.
        </p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </section>
  );
}
