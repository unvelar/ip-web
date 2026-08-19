import { UserRound } from "lucide-react";
import type { TenantMember } from "../../../api";
import Avatar from "../../Avatar";

type AssigneeIdentity = {
  accountId?: string | null;
  displayName?: string | null;
  email?: string | null;
  pictureUrl?: string | null;
};

function assigneeDisplayName(
  identity: Pick<AssigneeIdentity, "displayName" | "email">,
) {
  return identity.displayName?.trim() || identity.email?.trim() || "Assigned user";
}

/** Compact task owner indicator, matching issue-list UIs where the avatar is
 * the primary ownership signal and the full identity stays in the tooltip. */
export function AssigneeAvatar({
  accountId,
  displayName,
  email,
  pictureUrl,
  size = 22,
  showUnassigned = false,
  className = "",
}: AssigneeIdentity & {
  size?: number;
  showUnassigned?: boolean;
  className?: string;
}) {
  if (!accountId) {
    if (!showUnassigned) return null;
    return (
      <span
        style={{ width: size, height: size }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-stone-300 bg-white text-stone-400 ${className}`}
        title="Unassigned"
        aria-label="Unassigned"
      >
        <UserRound size={Math.max(11, Math.round(size * 0.55))} aria-hidden="true" />
      </span>
    );
  }

  const label = assigneeDisplayName({ displayName, email });
  const title = displayName?.trim() && email?.trim()
    ? `Assigned to ${displayName.trim()} (${email.trim()})`
    : `Assigned to ${label}`;

  return (
    <span className={`inline-flex shrink-0 ${className}`} title={title}>
      <Avatar
        key={`${accountId}:${pictureUrl ?? "fallback"}`}
        pictureUrl={pictureUrl}
        name={label}
        size={size}
        className="ring-1 ring-white shadow-sm"
      />
    </span>
  );
}

export function AssigneeAvatarStack({
  members,
  size = 18,
}: {
  members: TenantMember[];
  size?: number;
}) {
  const visibleMembers = members.slice(0, 3);
  if (visibleMembers.length === 0) {
    return <AssigneeAvatar showUnassigned size={size} />;
  }

  return (
    <span
      className="inline-flex -space-x-1.5"
      title="All assignees"
      aria-hidden="true"
    >
      {visibleMembers.map((member) => (
        <Avatar
          key={member.id}
          pictureUrl={member.picture_url}
          name={member.display_name || member.email}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
    </span>
  );
}
