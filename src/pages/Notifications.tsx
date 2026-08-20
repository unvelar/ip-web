import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Bell, CheckCheck, MessageSquare, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  listAccountNotifications,
  markAllAccountNotificationsRead,
  updateAccountNotificationRead,
  type AccountNotification,
} from "../api";
import Avatar from "../components/Avatar";
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

export default function Notifications() {
  const { actingTenantId } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AccountNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const mutationPendingRef = useRef(false);

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

  function openNotification(notification: AccountNotification) {
    if (!notification.read_at) void setRead(notification, true);
    navigate(notification.task.result_id
      ? `/monitoring/tasks/${encodeURIComponent(notification.task.result_id)}`
      : "/monitoring/tasks");
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-red-700">
            <Bell size={17} aria-hidden />
            <span className="text-xs font-bold uppercase tracking-[0.14em]">Workspace inbox</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">Notifications</h1>
          <p className="mt-1 text-sm text-stone-500">
            Assignments, mentions, and comments on tasks you follow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void readAll()}
          disabled={unreadCount === 0 || mutationPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-600 shadow-sm hover:bg-stone-50 disabled:opacity-40"
        >
          <CheckCheck size={15} aria-hidden /> Mark all read
        </button>
      </header>

      <div className="mb-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
        {([false, true] as const).map((unreadOnly) => (
          <button
            key={String(unreadOnly)}
            type="button"
            onClick={() => setShowUnreadOnly(unreadOnly)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              showUnreadOnly === unreadOnly
                ? "bg-stone-900 text-white"
                : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
            }`}
          >
            {unreadOnly ? `Unread${unreadCount ? ` · ${unreadCount}` : ""}` : "All"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-stone-400">Loading notifications…</div>
        ) : visibleItems.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400">
              <Bell size={19} aria-hidden />
            </span>
            <p className="text-sm font-semibold text-stone-700">
              {showUnreadOnly ? "You’re all caught up" : "No notifications yet"}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-stone-400">
              New task assignments and comment mentions will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {visibleItems.map((notification) => {
              const copy = notificationCopy(notification);
              const Icon = copy.icon;
              const unread = !notification.read_at;
              const preview = typeof notification.payload.comment_preview === "string"
                ? notification.payload.comment_preview
                : null;
              return (
                <li key={notification.id} className={unread ? "bg-red-50/30" : "bg-white"}>
                  <div className="group flex items-start gap-3 px-4 py-4 sm:px-5">
                    <div className="relative shrink-0">
                      <Avatar
                        pictureUrl={notification.actor?.picture_url ?? null}
                        name={actorName(notification)}
                        size={34}
                      />
                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-stone-700 text-white">
                        <Icon size={9} aria-hidden />
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm text-stone-700">
                        <span className="font-bold text-stone-900">{actorName(notification)}</span>{" "}
                        {copy.action}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-stone-600">
                        {notification.task.title || "Monitoring task"}
                      </p>
                      {preview && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-400">{preview}</p>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-stone-400">{relativeTime(notification.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => void setRead(notification, unread)}
                        disabled={mutationPending}
                        className={`h-2.5 w-2.5 rounded-full border ${
                          unread
                            ? "border-red-600 bg-red-600"
                            : "border-stone-300 bg-white opacity-0 group-hover:opacity-100"
                        }`}
                        aria-label={unread ? "Mark as read" : "Mark as unread"}
                        title={unread ? "Mark as read" : "Mark as unread"}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
