/**
 * Render a case-comment body. v1 is plain text with preserved whitespace.
 *
 * This component exists as a single seam: when @mention parsing or attachment
 * chips land we extend it here instead of grepping every place that renders
 * a comment. The backend already reserves `mentions` and `metadata` columns
 * on `case_comments` so adding rich rendering won't need a schema change.
 */
export default function CommentBody({ body }: { body: string }) {
  return (
    <div className="text-sm text-stone-700 whitespace-pre-wrap break-words leading-relaxed">
      {body}
    </div>
  );
}
