import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { TenantMember } from "../api";
import Avatar from "./Avatar";

function memberLabel(member: Pick<TenantMember, "display_name" | "email">) {
  return member.display_name?.trim() || member.email?.trim() || "Workspace member";
}

type ActiveMention = { start: number; end: number; query: string };
type MentionToken = { id: string; start: number; end: number };

/** Keep mention identity attached to the selected text occurrence. A text-only
 * lookup is ambiguous when two workspace members share the same display name. */
function reconcileMentionTokens(
  previousValue: string,
  nextValue: string,
  tokens: MentionToken[],
): MentionToken[] {
  let prefix = 0;
  while (
    prefix < previousValue.length &&
    prefix < nextValue.length &&
    previousValue[prefix] === nextValue[prefix]
  ) prefix += 1;

  let suffix = 0;
  while (
    suffix < previousValue.length - prefix &&
    suffix < nextValue.length - prefix &&
    previousValue[previousValue.length - 1 - suffix] === nextValue[nextValue.length - 1 - suffix]
  ) suffix += 1;

  const previousEditEnd = previousValue.length - suffix;
  const delta = nextValue.length - previousValue.length;
  return tokens.flatMap((token) => {
    if (token.end <= prefix) return [token];
    if (token.start >= previousEditEnd) {
      return [{ ...token, start: token.start + delta, end: token.end + delta }];
    }
    return [];
  });
}

function activeMentionAt(value: string, caret: number): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([^@\n]{0,60})$/);
  if (!match) return null;
  const start = beforeCaret.lastIndexOf("@");
  return start < 0 ? null : { start, end: caret, query: match[1].trim().toLowerCase() };
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, {
  value: string;
  members: TenantMember[];
  mentionIds: string[];
  onChange: (value: string, mentionIds: string[]) => void;
  placeholder?: string;
}>(function MentionTextarea({ value, members, mentionIds, onChange, placeholder }, forwardedRef) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionTokensRef = useRef<MentionToken[]>([]);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

  useEffect(() => {
    const allowedIds = new Set(mentionIds);
    mentionTokensRef.current = mentionTokensRef.current.filter(
      (token) => allowedIds.has(token.id) && token.end <= value.length,
    );
  }, [mentionIds, value.length]);

  const suggestions = useMemo(() => {
    if (!activeMention) return [];
    return members
      .filter((member) => {
        const haystack = `${member.display_name ?? ""} ${member.email ?? ""}`.toLowerCase();
        return !activeMention.query || haystack.includes(activeMention.query);
      })
      .slice(0, 6);
  }, [activeMention, members]);

  function updateActiveMention(nextValue: string, caret: number) {
    const next = activeMentionAt(nextValue, caret);
    setActiveMention(next);
    setActiveIndex(0);
    return next;
  }

  function change(nextValue: string, caret: number) {
    const tokens = reconcileMentionTokens(value, nextValue, mentionTokensRef.current);
    mentionTokensRef.current = tokens;
    const retainedMentionIds = Array.from(new Set(tokens.map((token) => token.id)));
    onChange(nextValue, retainedMentionIds);
    updateActiveMention(nextValue, caret);
  }

  function selectMember(member: TenantMember) {
    if (!activeMention) return;
    const label = memberLabel(member);
    const suffix = value.slice(activeMention.end).startsWith(" ") ? "" : " ";
    const nextValue =
      value.slice(0, activeMention.start) + `@${label}${suffix}` + value.slice(activeMention.end);
    const nextCaret = activeMention.start + label.length + 1 + suffix.length;
    const shiftedTokens = reconcileMentionTokens(value, nextValue, mentionTokensRef.current);
    mentionTokensRef.current = [
      ...shiftedTokens,
      { id: member.id, start: activeMention.start, end: activeMention.start + label.length + 1 },
    ];
    onChange(nextValue, Array.from(new Set(mentionTokensRef.current.map((token) => token.id))));
    setActiveMention(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => change(event.target.value, event.target.selectionStart)}
        onClick={(event) => updateActiveMention(value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
          updateActiveMention(value, event.currentTarget.selectionStart);
        }}
        onKeyDown={(event) => {
          if (!activeMention || suggestions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            selectMember(suggestions[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setActiveMention(null);
          }
        }}
        rows={2}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-controls={activeMention ? "comment-mention-suggestions" : undefined}
        className="w-full resize-y rounded-xl border border-stone-200 px-4 py-3 text-sm transition-all focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20"
      />
      {activeMention && suggestions.length > 0 && (
        <ul
          id="comment-mention-suggestions"
          role="listbox"
          className="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl"
        >
          {suggestions.map((member, index) => (
            <li key={member.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMember(member)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${
                  index === activeIndex ? "bg-stone-100" : "hover:bg-stone-50"
                }`}
              >
                <Avatar
                  pictureUrl={member.picture_url}
                  name={memberLabel(member)}
                  size={26}
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-stone-800">
                    {memberLabel(member)}
                  </span>
                  {member.display_name && member.email && (
                    <span className="block truncate text-[11px] text-stone-400">{member.email}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
