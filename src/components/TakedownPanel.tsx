import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getTakedownThread,
  getTakedownDraft,
  sendTakedown,
  markTakedownSentWithoutEmail,
  autoSendTakedown,
  replyTakedown,
  type TakedownDraftResponse,
  type TakedownMessage,
  type TakedownRequestStatus,
  type TakedownThread,
} from "../api";
import { useAuth } from "../context/AuthContext";

const STATUS_META: Record<TakedownRequestStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-stone-100 text-stone-600" },
  sent: { label: "Sent", cls: "bg-amber-50 text-amber-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  replied: { label: "Reply received", cls: "bg-blue-50 text-blue-700" },
  closed: { label: "Closed", cls: "bg-emerald-50 text-emerald-700" },
};

/**
 * Case-scoped takedown email flow. Loads its own thread by case id, so it can
 * live on the case page or inline in the monitoring finding collapsible.
 * Before a request exists it offers a compose modal (pre-filled from the
 * platform intake template + signer profile); after, it shows the sent notice,
 * the platform's replies, and a follow-up composer.
 */
export default function TakedownPanel({
  caseId,
  ipId,
  platform,
  onStatusChange,
  compact = false,
}: {
  caseId: string;
  /** IP the case belongs to — links the incomplete-signer notice to /ips/{ipId}. */
  ipId?: string;
  /** Marketplace the listing is on (e.g. "etsy.com") — shown in the confirm step. */
  platform?: string;
  /** Fired after a send/reply so a parent list can refresh the case's status. */
  onStatusChange?: () => void;
  /** Denser heading for embedding inside the monitoring finding collapsible. */
  compact?: boolean;
}) {
  const [thread, setThread] = useState<TakedownThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getTakedownThread(caseId)
      .then((r) => alive && setThread(r.takedown))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [caseId]);

  // Light polling while a request is open, so a platform reply (ingested by
  // the worker's IMAP poller) appears without the user re-expanding the row.
  // Only nudges the parent board when the request's status actually changes.
  useEffect(() => {
    if (!thread || thread.request.status === "closed") return;
    const prevStatus = thread.request.status;
    const iv = setInterval(async () => {
      try {
        const r = await getTakedownThread(caseId);
        setThread(r.takedown);
        if (r.takedown && r.takedown.request.status !== prevStatus) onStatusChange?.();
      } catch {
        /* ignore transient poll errors */
      }
    }, 45000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, thread?.request.status, thread?.messages.length]);

  async function reload() {
    try {
      const r = await getTakedownThread(caseId);
      setThread(r.takedown);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    onStatusChange?.();
  }

  // Quick path from the confirm dialog: send the pre-filled draft for the
  // suggested route without opening the editor. Falls back to the editor if
  // there's no route/draft to auto-send.
  async function sendDirect() {
    setDirectSending(true);
    setError("");
    try {
      const r = await autoSendTakedown(caseId);
      if (r.status === "unconfigured") {
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(caseId);
          setConfirming(false);
          await reload();
          return;
        }
        setError("Email isn't configured yet — contact your administrator.");
        return;
      }
      if (r.status === "needs_compose") {
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(caseId);
          setConfirming(false);
          await reload();
          return;
        }
        setConfirming(false);
        setComposing(true);
        return;
      }
      setConfirming(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDirectSending(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const body = replyDraft.trim();
    if (!body) return;
    setReplying(true);
    setError("");
    try {
      await replyTakedown(caseId, body);
      setReplyDraft("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReplying(false);
    }
  }

  const status = thread ? STATUS_META[thread.request.status] : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {compact ? (
          <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
            Takedown
          </h3>
        ) : (
          <h2 className="text-lg font-black text-stone-900 tracking-tight">Takedown</h2>
        )}
        {thread && !loading && (
          <button
            onClick={() => {
              setError("");
              setConfirming(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700"
          >
            Send another
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-5 py-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 flex justify-center">
          <div className="w-5 h-5 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !thread ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
          <p className="text-sm text-stone-600">
            Email the platform's IP intake to request removal of this listing.
            We'll track the request and any reply right here.
          </p>
          <button
            onClick={() => {
              setError("");
              setConfirming(true);
            }}
            className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-sm font-semibold text-white"
          >
            Send takedown request
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {/* Request header */}
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                Sent to
              </div>
              <div className="text-sm font-semibold text-stone-800 truncate">
                {thread.request.to_email}
              </div>
            </div>
            {status && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${status.cls}`}>
                {status.label}
              </span>
            )}
          </div>

          {thread.request.status === "failed" && thread.request.error && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-xs text-red-700">
              Send failed: {thread.request.error}
            </div>
          )}

          {/* Message thread */}
          <ul className="divide-y divide-stone-100">
            {thread.messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
          </ul>

          {/* Follow-up composer */}
          <form onSubmit={submitReply} className="px-5 py-4 border-t border-stone-100 space-y-2">
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={3}
              placeholder="Write a follow-up to the platform…"
              className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-400">
                Replies from the platform are added to this thread automatically.
              </p>
              <button
                type="submit"
                disabled={replying || !replyDraft.trim()}
                className="px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 disabled:opacity-50 transition-all"
              >
                {replying ? "Sending…" : "Send follow-up"}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirming && (
        <ConfirmSendModal
          platform={platform}
          sending={directSending}
          error={error}
          onSend={sendDirect}
          onEdit={() => {
            setConfirming(false);
            setComposing(true);
          }}
          onCancel={() => {
            if (directSending) return;
            setConfirming(false);
            setError("");
          }}
        />
      )}

      {composing && (
        <ComposeModal
          caseId={caseId}
          ipId={ipId}
          onClose={() => setComposing(false)}
          onSent={async () => {
            setComposing(false);
            await reload();
          }}
        />
      )}
    </section>
  );
}

/** Title-cased platform name from a domain ("etsy.com" → "Etsy"). */
function prettyPlatform(platform?: string): string {
  const p = (platform ?? "").trim().toLowerCase().replace(/^www\./, "");
  const label = p.split(".")[0];
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "the platform";
}

export function ConfirmSendModal({
  platform,
  sending,
  error,
  noEmailMode = false,
  onSend,
  onEdit,
  onCancel,
}: {
  platform?: string;
  sending: boolean;
  error: string;
  noEmailMode?: boolean;
  onSend: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 max-w-md w-full overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-900">
            {noEmailMode ? "Mark takedown as sent" : "Send takedown notice"}
          </h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-stone-600">
            {noEmailMode ? (
              <>
                No email route or sender is available, so this admin action will
                only move the finding to <span className="font-semibold text-stone-900">Sent</span>.
              </>
            ) : (
              <>
                You're about to email{" "}
                <span className="font-semibold text-stone-900">{prettyPlatform(platform)}</span>{" "}
                a takedown notice for this listing. Their reply will be tracked here.
              </>
            )}
          </p>
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={sending}
            className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onEdit}
            disabled={sending || noEmailMode}
            className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 disabled:opacity-50"
          >
            Edit before sending
          </button>
          <button
            onClick={onSend}
            disabled={sending}
            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (noEmailMode ? "Marking…" : "Sending…") : noEmailMode ? "Mark sent" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: TakedownMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <li className="px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            outbound ? "bg-stone-100 text-stone-600" : "bg-blue-50 text-blue-700"
          }`}
        >
          {outbound ? "You → platform" : "Platform → you"}
        </span>
        <span className="text-[11px] text-stone-400">
          {new Date(message.created_at).toLocaleString()}
        </span>
      </div>
      {message.subject && (
        <div className="text-xs font-semibold text-stone-500 mb-1">{message.subject}</div>
      )}
      <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{message.body}</p>
    </li>
  );
}

export function ComposeModal({
  caseId,
  ipId,
  onClose,
  onSent,
}: {
  caseId: string;
  /** IP the case belongs to — links the incomplete-signer notice to /ips/{ipId}. */
  ipId?: string;
  onClose: () => void;
  onSent: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(true);
  const [resp, setResp] = useState<TakedownDraftResponse | null>(null);
  const [targetId, setTargetId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getTakedownDraft(caseId);
        if (!alive) return;
        setResp(r);
        setTargetId(r.suggested_target_id ?? r.routes[0]?.id ?? "");
        if (r.draft) {
          setSubject(r.draft.subject);
          setBody(r.draft.body);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [caseId]);

  const routes = resp?.routes ?? [];
  const missing = resp?.draft?.missing_fields ?? [];
  const canMarkSent = !!resp && canMarkSentWithoutEmail && routes.length === 0 && !sending;
  const canSend =
    !!resp?.configured && !!targetId && !!subject.trim() && !!body.trim() && !sending;

  async function submit() {
    if (canMarkSent) {
      setSending(true);
      setError("");
      try {
        await markTakedownSentWithoutEmail(caseId);
        await onSent();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setSending(false);
      }
      return;
    }
    if (!targetId || !subject.trim() || !body.trim()) return;
    setSending(true);
    setError("");
    try {
      await sendTakedown(caseId, {
        target_id: targetId,
        subject: subject.trim(),
        body: body.trim(),
      });
      await onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
              Review &amp; edit before sending
            </div>
            <h3 className="font-bold text-stone-900">Send takedown request</h3>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 text-lg font-bold leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {resp && !resp.configured && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Email sending isn't configured yet. An administrator needs to set
                  up Postmark (<span className="font-mono">POSTMARK_SERVER_TOKEN</span>)
                  before takedowns can be sent.
                </div>
              )}

              {routes.length === 0 ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
                  No takedown intake route is configured for this platform yet.
                  {canMarkSentWithoutEmail && (
                    <span className="block mt-1 text-stone-500">
                      As an admin, you can still mark this finding as sent without sending email.
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                    Intake route
                  </label>
                  {routes.length === 1 ? (
                    <div className="text-sm text-stone-700">
                      <span className="font-semibold">{routes[0].label}</span>
                      <span className="text-stone-400"> · {routes[0].to_email}</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {routes.map((r) => (
                        <label key={r.id} className="flex items-start gap-2 text-sm">
                          <input
                            type="radio"
                            name="route"
                            checked={targetId === r.id}
                            onChange={() => setTargetId(r.id)}
                            className="mt-1"
                          />
                          <span>
                            <span className="font-semibold text-stone-800">{r.label}</span>
                            <span className="text-stone-400"> · {r.to_email}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {missing.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
                  <p className="font-bold text-amber-900">This IP's signer profile is incomplete</p>
                  <p>
                    This notice still needs: {missing.join(", ")}. Add these on{" "}
                    {ipId ? (
                      <Link to={`/ips/${ipId}`} className="font-semibold underline">
                        this IP's page
                      </Link>
                    ) : (
                      "the IP's page"
                    )}{" "}
                    so the notice is valid — or fill them into the body below.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-sm font-mono whitespace-pre-wrap focus:outline-none focus:border-stone-400 resize-y"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-between gap-2">
          <span className="text-xs text-red-600">{error}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!(canSend || canMarkSent)}
              className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (canMarkSent ? "Marking…" : "Sending…") : canMarkSent ? "Mark sent" : "Send takedown"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
