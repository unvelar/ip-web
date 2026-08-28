import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Bell,
  CheckCheck,
  Inbox,
  LoaderCircle,
  MessageSquare,
  Package,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import {
  getMonitoringFinding,
  getMonitoringFindingForCase,
  listAccountNotifications,
  markAllAccountNotificationsRead,
  updateAccountNotificationRead,
  type AccountNotification,
  type IpReviewFinding,
} from "../api";
import Avatar from "../components/Avatar";
import { ManagedFindingInspector } from "../components/monitoring/board/ManagedFindingInspector";
import {
  actionabilityMeta,
  compactListingTitle,
  findingPlatformLabel,
  formatMoney,
} from "../components/monitoring/board/utils";
import { useAuth } from "../context/AuthContext";

const NOTIFICATIONS_CHANGED_EVENT = "unvelar:notifications-changed";

function notifyUnreadCountChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

function actorName(notification: AccountNotification) {
  return notification.actor?.display_name?.trim()
    || notification.actor?.email?.trim()
    || "A teammate";
}

function notificationCopy(notification: AccountNotification) {
  if (notification.type === "seller_returned") {
    return { icon: ShieldAlert, action: "returned after a previous takedown" };
  }
  if (notification.type === "task_assigned") {
    return { icon: UserPlus, action: "assigned this task to you" };
  }
  if (notification.type === "comment_mention") {
    return { icon: AtSign, action: "mentioned you in a comment" };
  }
  return { icon: MessageSquare, action: "commented on a task you follow" };
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return new Date(value).toLocaleDateString();
}

function notificationResultId(notification: AccountNotification) {
  return notification.payload.current_result_id
    ?? notification.task.result_id
    ?? notification.payload.result_id
    ?? null;
}

function notificationGroup(value: string) {
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDelta = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (dayDelta <= 0) return "Today";
  if (dayDelta === 1) return "Yesterday";
  if (dayDelta < 7) return "This week";
  return "Earlier";
}

function sourceDomain(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function previewPrice(finding: IpReviewFinding) {
  const usd = Number(finding.price_value_usd);
  if (Number.isFinite(usd) && usd > 0) return formatMoney(usd, "USD");
  return finding.price?.trim() || null;
}

export default function Notifications() {
  const { actingTenantId } = useAuth();
  const [items, setItems] = useState<AccountNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [activeFinding, setActiveFinding] = useState<IpReviewFinding | null>(null);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const [, setPreviewVersion] = useState(0);
  const mutationPendingRef = useRef(false);
  const findingRequestRef = useRef(0);
  const findingPreviewsRef = useRef(new Map<string, IpReviewFinding>());
  const previewRequestsRef = useRef(new Set<string>());
  const failedPreviewRequestsRef = useRef(new Set<string>());

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await listAccountNotifications();
      setItems(result.notifications);
      setUnreadCount(result.unread_count);
      setError("");
    } catch (caught: unknown) {
      if (!quiet) setError(caught instanceof Error ? caught.message : "Unable to load notifications");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [actingTenantId, refresh]);

  const visibleItems = useMemo(
    () => showUnreadOnly ? items.filter((item) => !item.read_at) : items,
    [items, showUnreadOnly],
  );
  const groupedItems = useMemo(() => {
    const groups: Array<{ label: string; items: AccountNotification[] }> = [];
    for (const notification of visibleItems) {
      const label = notificationGroup(notification.created_at);
      const group = groups[groups.length - 1];
      if (group?.label === label) group.items.push(notification);
      else groups.push({ label, items: [notification] });
    }
    return groups;
  }, [visibleItems]);

  useEffect(() => {
    const tenantKey = actingTenantId ?? "default";
    const jobs = Array.from(new Set(
      visibleItems.map(notificationResultId).filter((value): value is string => Boolean(value)),
    )).filter((resultId) => {
      const key = `${tenantKey}:${resultId}`;
      return !findingPreviewsRef.current.has(key) &&
        !previewRequestsRef.current.has(key) &&
        !failedPreviewRequestsRef.current.has(key);
    });
    if (jobs.length === 0) return;

    let cursor = 0;
    for (const resultId of jobs) previewRequestsRef.current.add(`${tenantKey}:${resultId}`);

    const worker = async () => {
      while (cursor < jobs.length) {
        const resultId = jobs[cursor++];
        const key = `${tenantKey}:${resultId}`;
        try {
          const result = await getMonitoringFinding(resultId);
          findingPreviewsRef.current.set(key, result.finding);
        } catch {
          failedPreviewRequestsRef.current.add(key);
        } finally {
          previewRequestsRef.current.delete(key);
          setPreviewVersion((version) => version + 1);
        }
      }
    };

    void Promise.all(
      Array.from({ length: Math.min(4, jobs.length) }, () => worker()),
    );
  }, [actingTenantId, visibleItems]);

  async function setRead(notification: AccountNotification, read: boolean) {
    if (mutationPendingRef.current) return;
    mutationPendingRef.current = true;
    setMutationPending(true);
    const previous = items;
    const previousUnreadCount = unreadCount;
    setItems((current) => current.map((item) => item.id === notification.id
      ? { ...item, read_at: read ? item.read_at ?? new Date().toISOString() : null }
      : item));
    setUnreadCount((count) => Math.max(0, count + (read ? -1 : 1)));
    try {
      await updateAccountNotificationRead(notification.id, read);
      notifyUnreadCountChanged();
    } catch (caught: unknown) {
      setItems(previous);
      setUnreadCount(previousUnreadCount);
      setError(caught instanceof Error ? caught.message : "Unable to update notification");
    } finally {
      mutationPendingRef.current = false;
      setMutationPending(false);
    }
  }

  async function readAll() {
    if (mutationPendingRef.current) return;
    mutationPendingRef.current = true;
    setMutationPending(true);
    const previous = items;
    const previousUnreadCount = unreadCount;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnreadCount(0);
    try {
      await markAllAccountNotificationsRead();
      notifyUnreadCountChanged();
    } catch (caught: unknown) {
      setItems(previous);
      setUnreadCount(previousUnreadCount);
      setError(caught instanceof Error ? caught.message : "Unable to mark notifications read");
    } finally {
      mutationPendingRef.current = false;
      setMutationPending(false);
    }
  }

  async function openNotification(notification: AccountNotification) {
    if (!notification.read_at) void setRead(notification, true);
    const requestId = ++findingRequestRef.current;
    setError("");
    const resultId = notificationResultId(notification);
    const cachedFinding = resultId
      ? findingPreviewsRef.current.get(`${actingTenantId ?? "default"}:${resultId}`)
      : null;
    if (cachedFinding) {
      setOpeningNotificationId(null);
      setActiveFinding(cachedFinding);
      return;
    }
    setOpeningNotificationId(notification.id);
    try {
      const result = resultId
        ? await getMonitoringFinding(resultId)
        : await getMonitoringFindingForCase(notification.case_id);
      if (findingRequestRef.current === requestId) {
        if (resultId) {
          findingPreviewsRef.current.set(
            `${actingTenantId ?? "default"}:${resultId}`,
            result.finding,
          );
        }
        setActiveFinding(result.finding);
      }
    } catch (caught: unknown) {
      if (findingRequestRef.current === requestId) {
        setError(caught instanceof Error ? caught.message : "Unable to open this task");
      }
    } finally {
      if (findingRequestRef.current === requestId) setOpeningNotificationId(null);
    }
  }

  function closeFinding() {
    findingRequestRef.current += 1;
    setOpeningNotificationId(null);
    setActiveFinding(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 shadow-sm">
            <Inbox size={17} aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-stone-950">Inbox</h1>
            <p className="mt-0.5 text-xs text-stone-500">
              Product activity, assignments, and conversations that need your attention.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void readAll()}
          disabled={unreadCount === 0 || mutationPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 text-[11px] font-semibold text-stone-600 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCheck size={14} aria-hidden /> Mark all read
        </button>
      </header>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="flex min-h-11 items-center justify-between border-b border-stone-200 px-3">
          <div className="flex h-11 items-center gap-1">
            {([false, true] as const).map((unreadOnly) => (
              <button
                key={String(unreadOnly)}
                type="button"
                onClick={() => setShowUnreadOnly(unreadOnly)}
                className={`relative h-11 px-2.5 text-xs font-medium transition ${
                  showUnreadOnly === unreadOnly
                    ? "text-stone-950 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                }`}
              >
                {unreadOnly ? "Unread" : "All activity"}
                {unreadOnly && unreadCount > 0 && (
                  <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-red-700">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-medium text-stone-400">
            {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-52 items-center justify-center gap-2 text-xs text-stone-400">
            <LoaderCircle size={15} className="animate-spin" /> Loading inbox…
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 grid size-10 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-400">
              <Bell size={18} aria-hidden />
            </span>
            <p className="text-sm font-medium text-stone-700">
              {showUnreadOnly ? "You’re all caught up" : "No activity yet"}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-stone-400">
              Seller returns, assignments, mentions, and comments on monitored products will appear here.
            </p>
          </div>
        ) : (
          <div>
            {groupedItems.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <div className="flex h-8 items-center justify-between border-b border-stone-100 bg-stone-50/80 px-4">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                    {group.label}
                  </h2>
                  <span className="text-[9px] tabular-nums text-stone-400">{group.items.length}</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {group.items.map((notification) => {
                    const copy = notificationCopy(notification);
                    const Icon = copy.icon;
                    const unread = !notification.read_at;
                    const commentPreview = typeof notification.payload.comment_preview === "string"
                      ? notification.payload.comment_preview
                      : null;
                    const resultId = notificationResultId(notification);
                    const previewKey = `${actingTenantId ?? "default"}:${resultId}`;
                    const finding = resultId ? findingPreviewsRef.current.get(previewKey) ?? null : null;
                    const previewFailed = resultId
                      ? failedPreviewRequestsRef.current.has(previewKey)
                      : false;
                    const platform = finding
                      ? findingPlatformLabel(finding)
                      : sourceDomain(notification.task.source_url);
                    const price = finding ? previewPrice(finding) : null;
                    const actionability = finding ? actionabilityMeta(finding.actionability) : null;
                    const title = finding
                      ? compactListingTitle(finding)
                      : notification.task.title || "Monitoring task";
                    const opening = openingNotificationId === notification.id;

                    return (
                      <li
                        key={notification.id}
                        className={`group relative flex min-h-[104px] items-stretch transition ${
                          unread ? "bg-red-50/25" : "bg-white"
                        } hover:bg-stone-50/80`}
                      >
                        {unread && <span className="absolute inset-y-0 left-0 w-0.5 bg-red-600" />}
                        <button
                          type="button"
                          onClick={() => void openNotification(notification)}
                          disabled={opening}
                          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left disabled:cursor-wait"
                          aria-label={`Open ${title}`}
                        >
                          <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
                            {finding?.image_url ? (
                              <img
                                src={finding.image_url}
                                alt=""
                                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                            ) : resultId && !previewFailed ? (
                              <span className="grid h-full place-items-center bg-stone-100 text-stone-300">
                                <LoaderCircle size={17} className="animate-spin" />
                              </span>
                            ) : (
                              <span className="grid h-full place-items-center text-stone-300">
                                <Package size={19} aria-hidden />
                              </span>
                            )}
                            <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded border border-white/80 bg-stone-900 text-white shadow-sm">
                              <Icon size={10} aria-hidden />
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-stone-500">
                              <Avatar
                                pictureUrl={notification.actor?.picture_url ?? null}
                                name={actorName(notification)}
                                size={20}
                              />
                              <span className="truncate">
                                <span className="font-semibold text-stone-800">{actorName(notification)}</span>{" "}
                                {copy.action}
                              </span>
                              <span className="ml-auto shrink-0 text-[10px] text-stone-400">
                                {relativeTime(notification.created_at)}
                              </span>
                            </div>

                            <div className="mt-1 flex min-w-0 items-center gap-2">
                              <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-stone-950">
                                {opening ? "Opening product…" : title}
                              </h3>
                              {opening && <LoaderCircle size={12} className="shrink-0 animate-spin text-stone-400" />}
                            </div>

                            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
                              {actionability && (
                                <span className={`rounded border px-1.5 py-0.5 font-medium ${actionability.subtleCls}`}>
                                  {actionability.label}
                                </span>
                              )}
                              {platform && <span className="truncate">{platform}</span>}
                              {platform && (price || finding?.seller_name) && <span className="text-stone-300">·</span>}
                              {price && <span className="shrink-0 font-medium text-stone-700">{price}</span>}
                              {price && finding?.seller_name && <span className="text-stone-300">·</span>}
                              {finding?.seller_name && (
                                <span className="max-w-40 truncate">{finding.seller_name}</span>
                              )}
                              {finding?.ip_name && (
                                <span className="hidden rounded bg-stone-100 px-1.5 py-0.5 text-stone-500 sm:inline">
                                  {finding.ip_name}
                                </span>
                              )}
                            </div>

                            {commentPreview && (
                              <p className="mt-1.5 line-clamp-1 text-[11px] leading-4 text-stone-400">
                                “{commentPreview}”
                              </p>
                            )}
                          </div>
                        </button>

                        <div className="flex w-9 shrink-0 items-start justify-center pt-4">
                          <button
                            type="button"
                            onClick={() => void setRead(notification, unread)}
                            disabled={mutationPending}
                            className={`size-3 rounded-full border transition ${
                              unread
                                ? "border-red-600 bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.08)]"
                                : "border-stone-300 bg-white opacity-0 group-hover:opacity-100"
                            }`}
                            aria-label={unread ? "Mark as read" : "Mark as unread"}
                            title={unread ? "Mark as read" : "Mark as unread"}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {activeFinding && (
        <ManagedFindingInspector
          key={activeFinding.result_id}
          finding={activeFinding}
          ipId={activeFinding.ip_id}
          showIp
          onClose={closeFinding}
          onResolved={closeFinding}
          taskHref={`/monitoring/tasks/${encodeURIComponent(activeFinding.result_id)}`}
        />
      )}
    </div>
  );
}
