import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  convertPublicIpIntake,
  getPublicIpIntake,
  listPublicIpIntakes,
  listTenants,
  rejectPublicIpIntake,
  tenantLabel,
  type PublicIpIntakeAdminSummary,
  type PublicIpIntakeImage,
  type PublicIpIntakeStatus,
  type Tenant,
} from "../api";

const PAGE_SIZE = 40;
const STATUSES: Array<PublicIpIntakeStatus | ""> = ["pending", "converted", "rejected", ""];

export default function AdminIntakes() {
  const [status, setStatus] = useState<PublicIpIntakeStatus | "">("pending");
  const [offset, setOffset] = useState(0);
  const [intakes, setIntakes] = useState<PublicIpIntakeAdminSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [detail, setDetail] = useState<PublicIpIntakeAdminSummary | null>(null);
  const [images, setImages] = useState<PublicIpIntakeImage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [tenantMode, setTenantMode] = useState<"company" | "existing" | "new">("company");
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [ipName, setIpName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [description, setDescription] = useState("");
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, offset]);

  useEffect(() => {
    listTenants()
      .then(({ tenants }) => setTenants(tenants))
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    if (!selectedId && intakes[0]) setSelectedId(intakes[0].id);
  }, [intakes, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setImages([]);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    getPublicIpIntake(selectedId)
      .then(({ intake, images }) => {
        if (!alive) return;
        setDetail(intake);
        setImages(images);
        setTenantMode("company");
        setTenantId("");
        setTenantName("");
        setIpName(intake.product_name);
        setKeywords(intake.product_name);
        setDescription(defaultDescription(intake));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const res = await listPublicIpIntakes({
        status,
        limit: PAGE_SIZE,
        offset,
      });
      setIntakes(res.intakes);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConvert() {
    if (!detail || converting) return;
    setConverting(true);
    setError("");
    try {
      const keywordList = keywords
        .split(/[,\n]+/)
        .map((k) => k.trim())
        .filter(Boolean);
      const tenantPatch =
        tenantMode === "existing"
          ? { tenant_id: tenantId }
          : tenantMode === "new"
            ? { create_tenant_name: tenantName.trim() }
            : {};
      const res = await convertPublicIpIntake(detail.id, {
        ...tenantPatch,
        ip_name: ipName.trim(),
        description: description.trim(),
        keywords: keywordList,
      });
      await loadList();
      setSelectedId(res.intake.id);
      const refreshed = await getPublicIpIntake(res.intake.id);
      setDetail(refreshed.intake);
      setImages(refreshed.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConverting(false);
    }
  }

  async function handleReject() {
    if (!detail) return;
    const reason = window.prompt("Reject reason");
    if (reason === null) return;
    setError("");
    try {
      await rejectPublicIpIntake(detail.id, reason.trim());
      await loadList();
      const refreshed = await getPublicIpIntake(detail.id);
      setDetail(refreshed.intake);
      setImages(refreshed.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const canConvert = detail?.status === "pending" &&
    ipName.trim() &&
    (tenantMode !== "existing" || tenantId) &&
    (tenantMode !== "new" || tenantName.trim());

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/admin" className="text-xs font-semibold text-stone-400 hover:text-stone-700">
            Admin
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">
            Public intakes
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PublicIpIntakeStatus | "");
              setOffset(0);
              setSelectedId("");
            }}
            className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s ? statusLabel(s) : "All"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadList()}
            className="h-9 w-9 rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 inline-flex items-center justify-center"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[0.95fr_1.3fr] gap-5 items-start">
        <section className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          <div className="border-b border-stone-200 px-4 py-3 text-xs font-bold text-stone-500">
            {loading ? "Loading" : `${total.toLocaleString()} intake${total === 1 ? "" : "s"}`}
          </div>
          {loading ? (
            <div className="h-52 flex items-center justify-center text-stone-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : intakes.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-stone-400">
              No intakes
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {intakes.map((intake) => (
                <button
                  key={intake.id}
                  type="button"
                  onClick={() => setSelectedId(intake.id)}
                  className={[
                    "w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors",
                    selectedId === intake.id ? "bg-red-50/60" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-stone-900 truncate">
                        {intake.product_name}
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500 truncate">
                        {intake.email}
                      </div>
                    </div>
                    <StatusBadge status={intake.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-400">
                    <span>{intake.image_count} image{intake.image_count === 1 ? "" : "s"}</span>
                    <span>{formatDate(intake.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {pages > 1 && (
            <div className="border-t border-stone-200 px-4 py-3 flex items-center justify-between">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="text-xs font-semibold text-stone-600 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs text-stone-400">Page {page} of {pages}</span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="text-xs font-semibold text-stone-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white min-h-[520px]">
          {detailLoading ? (
            <div className="h-52 flex items-center justify-center text-stone-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : !detail ? (
            <div className="h-52 flex items-center justify-center text-sm text-stone-400">
              Select an intake
            </div>
          ) : (
            <div className="p-5 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black tracking-tight text-stone-900">
                      {detail.product_name}
                    </h2>
                    <StatusBadge status={detail.status} />
                  </div>
                  <div className="mt-1 text-sm text-stone-500">
                    {detail.email}
                  </div>
                </div>
                {detail.status === "converted" && detail.converted_ip_catalog_id && (
                  <Link
                    to={`/admin/ips/${encodeURIComponent(detail.converted_ip_catalog_id)}`}
                    className="h-9 px-3 rounded-md bg-stone-900 text-white text-xs font-semibold inline-flex items-center"
                  >
                    Open IP
                  </Link>
                )}
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {images.map((image) => (
                    <a
                      key={image.id}
                      href={image.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square rounded-md overflow-hidden border border-stone-200 bg-stone-100"
                    >
                      {image.url ? (
                        <img src={image.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="h-full flex items-center justify-center text-xs text-stone-400">
                          image
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )}

              {detail.status === "pending" ? (
                <div className="space-y-5">
                  <Field label="IP name">
                    <input value={ipName} onChange={(e) => setIpName(e.target.value)} className={inputClass} />
                  </Field>

                  <div className="grid sm:grid-cols-[0.75fr_1.25fr] gap-4">
                    <Field label="Tenant">
                      <select
                        value={tenantMode}
                        onChange={(e) => setTenantMode(e.target.value as "company" | "existing" | "new")}
                        className={inputClass}
                      >
                        <option value="company">Company domain tenant</option>
                        <option value="existing">Existing tenant</option>
                        <option value="new">New tenant</option>
                      </select>
                    </Field>
                    {tenantMode === "existing" && (
                      <Field label="Existing tenant">
                        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputClass}>
                          <option value="">Select tenant</option>
                          {tenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>{tenantLabel(tenant)}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {tenantMode === "new" && (
                      <Field label="Tenant name">
                        <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputClass} />
                      </Field>
                    )}
                    {tenantMode === "company" && (
                      <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 flex items-center">
                        {detail.email_domain}
                      </div>
                    )}
                  </div>

                  <Field label="Keywords">
                    <textarea
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      rows={3}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Description">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className={inputClass}
                    />
                  </Field>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!canConvert || converting}
                      onClick={() => void handleConvert()}
                      className="h-10 px-4 rounded-md bg-stone-900 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-45"
                    >
                      {converting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                      Convert
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject()}
                      className="h-10 px-4 rounded-md border border-stone-200 text-sm font-semibold text-stone-700 inline-flex items-center gap-2 hover:bg-stone-50"
                    >
                      <X size={16} />
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <StatusSummary intake={detail} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-stone-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: PublicIpIntakeStatus }) {
  const cls = {
    pending: "bg-amber-50 text-amber-700",
    converted: "bg-emerald-50 text-emerald-700",
    rejected: "bg-stone-100 text-stone-500",
  }[status];
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-bold ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function StatusSummary({ intake }: { intake: PublicIpIntakeAdminSummary }) {
  if (intake.status === "converted") {
    return (
      <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2">
        <Check size={16} className="mt-0.5" />
        <div>
          Converted {intake.converted_at ? formatDate(intake.converted_at) : ""}
          {intake.converted_tenant_name ? ` into ${intake.converted_tenant_name}` : ""}.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
      Rejected {intake.rejected_at ? formatDate(intake.rejected_at) : ""}
      {intake.rejection_reason ? `: ${intake.rejection_reason}` : "."}
    </div>
  );
}

function statusLabel(status: PublicIpIntakeStatus) {
  return status[0].toUpperCase() + status.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function defaultDescription(intake: PublicIpIntakeAdminSummary) {
  return `Public intake from ${intake.email}.`;
}
