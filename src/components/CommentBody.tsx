/**
 * Render a case-comment body. v1 is plain text with preserved whitespace.
 *
 * This component exists as a single seam: when @mention parsing or attachment
 * chips land we extend it here instead of grepping every place that renders
 * a comment. The backend already reserves `mentions` and `metadata` columns
 * on `case_comments` so adding rich rendering won't need a schema change.
 */
import type { TenantMember } from "../api";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function memberLabel(member: Pick<TenantMember, "display_name" | "email">) {
  return member.display_name?.trim() || member.email?.trim() || "Workspace member";
}

export default function CommentBody({
  body,
  mentions = [],
}: {
  body: string;
  mentions?: TenantMember[];
}) {
  const labels = mentions.map(memberLabel).filter(Boolean).sort((a, b) => b.length - a.length);
  const parts = labels.length > 0
    ? body.split(new RegExp(`(@(?:${labels.map(escapeRegExp).join("|")}))`, "gi"))
    : [body];
  const mentionLabels = new Set(labels.map((label) => `@${label}`.toLowerCase()));
  return (
    <div className="text-sm text-stone-700 whitespace-pre-wrap break-words leading-relaxed">
      {parts.map((part, index) => mentionLabels.has(part.toLowerCase()) ? (
        <span
          key={`${part}-${index}`}
          className="rounded bg-red-50 px-0.5 font-semibold text-red-700"
        >
          {part}
        </span>
      ) : part)}
    </div>
  );
}
