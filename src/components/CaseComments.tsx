import { useEffect, useRef, useState } from "react";
import { AtSign, MessageSquare } from "lucide-react";
import {
  getCaseSubscription,
  listCaseComments,
  postCaseComment,
  updateCaseSubscription,
  deleteCaseComment as apiDeleteCaseComment,
  type CaseComment,
} from "../api";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import CommentBody from "./CommentBody";
import { MentionTextarea } from "./MentionTextarea";
import { useTenantMembers } from "../hooks/useTenantMembers";

/**
 * Self-contained case discussion thread (loads by case id). Ported out of the
 * old case-detail page so it can live inline in the monitoring finding
 * collapsible. `compact` shrinks the heading for that embedded use.
 */
export default function CaseComments({
  caseId,
  compact = false,
}: {
  caseId: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { members } = useTenantMembers();
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setComments([]);
    setDraft("");
    setMentionIds([]);
    setError("");
    setExpanded(false);
    setSubscribed(false);
    listCaseComments(caseId)
      .then((commentResult) => {
        if (alive) setComments(commentResult.comments);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    getCaseSubscription(caseId)
      .then((result) => {
        if (alive) setSubscribed(result.subscribed);
      })
      .catch(() => {
        // Comments remain usable if subscription state is unavailable.
      });
    return () => {
      alive = false;
    };
  }, [caseId]);

  useEffect(() => {
    if (expanded) textareaRef.current?.focus();
  }, [expanded]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError("");
    try {
      const r = await postCaseComment(caseId, body, mentionIds);
      setComments((cs) => [...cs, r.comment]);
      setDraft("");
      setMentionIds([]);
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  async function toggleSubscription() {
    if (savingSubscription) return;
    setSavingSubscription(true);
    setError("");
    try {
      const result = await updateCaseSubscription(caseId, !subscribed);
      setSubscribed(result.subscribed);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to update task notifications");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function remove(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    try {
      await apiDeleteCaseComment(caseId, commentId);
      setComments((cs) => cs.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return null;

  if (comments.length === 0 && !expanded) {
    return (
      <section className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={expanded}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            <MessageSquare size={14} aria-hidden="true" />
            Write a comment
          </button>
          <TaskFollowButton
            subscribed={subscribed}
            saving={savingSubscription}
            onToggle={() => void toggleSubscription()}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {comments.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          {compact ? (
            <h3 className="text-xs font-semibold text-stone-700">
              Comments <span className="font-normal text-stone-400">· {comments.length}</span>
            </h3>
          ) : (
            <h2 className="text-lg font-black tracking-tight text-stone-900">
              Comments
              <span className="ml-2 text-sm font-semibold text-stone-400">{comments.length}</span>
            </h2>
          )}
          <TaskFollowButton
            subscribed={subscribed}
            saving={savingSubscription}
            onToggle={() => void toggleSubscription()}
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              isAuthor={!!user && user.id === c.author.id}
              onDelete={() => remove(c.id)}
            />
          ))}
        </ul>
      )}

      {expanded ? (
        <form onSubmit={post} className="flex gap-3 items-start pt-1">
          <Avatar
            pictureUrl={user?.picture_url ?? null}
            name={user?.display_name ?? user?.email ?? null}
            size={32}
          />
          <div className="flex-1 space-y-2">
            <MentionTextarea
              ref={textareaRef}
              value={draft}
              members={members}
              mentionIds={mentionIds}
              onChange={(value, ids) => {
                setDraft(value);
                setMentionIds(ids);
              }}
              placeholder="Add a comment — type @ to mention someone."
            />
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                <AtSign size={12} aria-hidden /> Mention teammates to notify them
              </span>
              <button
                type="submit"
                disabled={posting || !draft.trim()}
                className="px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 disabled:opacity-50 transition-all"
              >
                {posting ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={expanded}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
        >
          <MessageSquare size={14} aria-hidden="true" />
          Reply
        </button>
      )}
    </section>
  );
}

function TaskFollowButton({
  subscribed,
  saving,
  onToggle,
}: {
  subscribed: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      aria-pressed={subscribed}
      className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        subscribed
          ? "bg-stone-100 text-stone-800 hover:bg-stone-200"
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
      }`}
    >
      {subscribed ? "Following task" : "Follow task"}
    </button>
  );
}

function CommentRow({
  comment,
  isAuthor,
  onDelete,
}: {
  comment: CaseComment;
  isAuthor: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="flex gap-3 group">
      <Avatar
        pictureUrl={comment.author.picture_url}
        name={comment.author.display_name}
        size={32}
      />
      <div className="flex-1 min-w-0 bg-white border border-stone-200 rounded-xl px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-bold text-stone-900 truncate">
              {comment.author.display_name || "Anonymous"}
            </span>
            <span className="text-[11px] text-stone-400 shrink-0">
              {new Date(comment.created_at).toLocaleString()}
            </span>
          </div>
          {isAuthor && (
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 text-[11px] text-stone-400 hover:text-red-500 transition-all"
              title="Delete your comment"
            >
              Delete
            </button>
          )}
        </div>
        <CommentBody body={comment.body} mentions={comment.mentioned_accounts} />
      </div>
    </li>
  );
}
