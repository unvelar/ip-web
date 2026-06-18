import { useEffect, useState } from "react";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getMonitoringSettings,
  updateMonitoringSettings,
  type ApiKey,
  type MonitoringSettings,
  type MonitoringFrequency,
} from "../api";

const DOCS_URL = `${import.meta.env.VITE_API_URL || ""}/api/docs`;

export default function Settings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{ id: string; token: string } | null>(null);
  const [copyHint, setCopyHint] = useState(false);

  async function load() {
    try {
      const { keys } = await listApiKeys();
      setKeys(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const { key, token } = await createApiKey(name);
      setKeys((prev) => [key, ...prev]);
      setRevealedToken({ id: key.id, token });
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this key? Any client using it will stop working immediately.")) return;
    try {
      await revokeApiKey(id);
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(token);
    setCopyHint(true);
    setTimeout(() => setCopyHint(false), 1500);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">
          Tenant-wide settings. Anyone in your workspace can see and change these.
        </p>
      </div>

      <MonitoringSettingsSection />

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight">API keys</h2>
            <p className="mt-1 text-sm text-stone-500">
              Use these to call the public API.{" "}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-red-700 font-semibold hover:underline"
              >
                Read the API docs &rarr;
              </a>
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl border border-stone-200 p-5 flex gap-3 items-center"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Key label (e.g. ‘Acme integration’)"
            maxLength={80}
            className="flex-1 px-4 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-400"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>

        {revealedToken && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-amber-900 text-sm">Copy your key now</p>
                <p className="text-xs text-amber-800 mt-1">
                  This is the only time it will be shown. Store it somewhere safe.
                </p>
              </div>
              <button
                onClick={() => setRevealedToken(null)}
                className="text-amber-900 hover:text-amber-700 text-sm font-semibold"
              >
                Dismiss
              </button>
            </div>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-mono text-stone-800 break-all">
                {revealedToken.token}
              </code>
              <button
                onClick={() => handleCopy(revealedToken.token)}
                className="px-3 py-2 rounded-lg bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800"
              >
                {copyHint ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-stone-500 text-sm">No API keys yet.</p>
            <p className="text-stone-400 text-xs">Create one above to start calling the API.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className="bg-white rounded-2xl border border-stone-200 p-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-stone-900 truncate">{k.name}</p>
                  <p className="text-xs text-stone-500 mt-0.5 font-mono">
                    {k.prefix}… &middot; created {formatRelative(k.created_at)}
                    {k.last_used_at && <> &middot; last used {formatRelative(k.last_used_at)}</>}
                  </p>
                </div>
                {k.revoked_at ? (
                  <span className="text-xs font-semibold text-stone-400 bg-stone-50 px-2.5 py-0.5 rounded-full">
                    Revoked
                  </span>
                ) : (
                  <button
                    onClick={() => handleRevoke(k.id)}
                    className="text-xs font-semibold text-red-700 hover:text-red-900 hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Tenant-global monitoring schedule. Per-IP platforms + findings live on the
// IP detail page (/ips/:id); this just governs whether/when the
// scheduler fans out runs.
function MonitoringSettingsSection() {
  const [settings, setSettings] = useState<MonitoringSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMonitoringSettings()
      .then(({ settings }) => alive && setSettings(settings))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, []);

  async function setEnabled(enabled: boolean) {
    try {
      const r = await updateMonitoringSettings({ enabled });
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function setFrequency(frequency: MonitoringFrequency) {
    try {
      const r = await updateMonitoringSettings({ frequency });
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-black text-stone-900 tracking-tight">Monitoring</h2>
        <p className="mt-1 text-sm text-stone-500">
          When enabled, the scheduler fans out runs for every IP's watched
          platforms on this cadence. Add platforms per-IP from Monitoring.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-stone-900">Scheduled runs</div>
            <div className="text-xs text-stone-500">
              {settings?.monitoring_enabled
                ? "Enabled — runs fire on schedule."
                : "Disabled — runs only fire when triggered manually from an IP."}
            </div>
          </div>
          <button
            disabled={!settings}
            onClick={() => setEnabled(!settings?.monitoring_enabled)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50 ${
              settings?.monitoring_enabled
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {settings?.monitoring_enabled ? "On" : "Off"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-stone-500">Frequency:</span>
          {(["daily", "weekly"] as MonitoringFrequency[]).map((f) => {
            const active = settings?.monitoring_frequency === f;
            return (
              <button
                key={f}
                disabled={!settings}
                onClick={() => setFrequency(f)}
                className={`px-3 py-1 rounded-full font-semibold transition-all disabled:opacity-50 ${
                  active
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
