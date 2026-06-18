import { useEffect, useState } from "react";
import {
  listCaseComments,
  postCaseComment,
  deleteCaseComment as apiDeleteCaseComment,
  type CaseComment,
} from "../api";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import CommentBody from "./CommentBody";

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
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listCaseComments(caseId)
      .then((r) => alive && setComments(r.comments))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [caseId]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError("");
    try {
      const r = await postCaseComment(caseId, body);
      setComments((cs) => [...cs, r.comment]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
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

  return (
    <section className="space-y-3">
      {compact ? (
        <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          Discussion{comments.length > 0 && ` · ${comments.length}`}
        </h3>
      ) : (
        <h2 className="text-lg font-black text-stone-900 tracking-tight">
          Comments
          {comments.length > 0 && (
            <span className="ml-2 text-sm font-semibold text-stone-400">{comments.length}</span>
          )}
        </h2>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-4 flex justify-center">
          <div className="w-5 h-5 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="text-sm text-stone-400">No comments yet.</p>
          ) : (
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

          <form onSubmit={post} className="flex gap-3 items-start pt-1">
            <Avatar
              pictureUrl={user?.picture_url ?? null}
              name={user?.display_name ?? user?.email ?? null}
              size={32}
            />
            <div className="flex-1 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Add a comment — visible to everyone in your workspace."
                className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
              />
              <div className="flex items-center justify-end">
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
        </>
      )}
    </section>
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
        <CommentBody body={comment.body} />
      </div>
    </li>
  );
}
