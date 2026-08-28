import { useEffect, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import {
  updateMonitoringFindingAssignment,
  type IpReviewFinding,
  type MonitoringTaskAssignment,
  type TenantMember,
} from "../../../api";
import { useTenantMembers } from "../../../hooks/useTenantMembers";
import { AssigneeAvatar } from "./AssigneeAvatar";
import type { FindingUpdateOptions } from "./FindingActions";

function memberLabel(member: Pick<TenantMember, "display_name" | "email">) {
  const name = member.display_name?.trim();
  const email = member.email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || "Unnamed user";
}

function assignmentFromFinding(finding: IpReviewFinding): MonitoringTaskAssignment {
  return {
    assigned_to_account_id: finding.assigned_to_account_id ?? null,
    assignee_display_name: finding.assignee_display_name ?? null,
    assignee_email: finding.assignee_email ?? null,
    assignee_picture_url: finding.assignee_picture_url ?? null,
    assignment_updated_at: finding.assignment_updated_at ?? null,
  };
}

export function TaskAssigneeControl({
  finding,
  onUpdated,
}: {
  finding: IpReviewFinding;
  onUpdated: (opts?: FindingUpdateOptions) => void;
}) {
  const { members, loading: loadingMembers, error: membersError } = useTenantMembers();
  const [assignment, setAssignment] = useState<MonitoringTaskAssignment>(() =>
    assignmentFromFinding(finding),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAssignment(assignmentFromFinding(finding));
    setError("");
  }, [finding]);

  const selectedId = assignment.assigned_to_account_id ?? "";
  const selectedMemberMissing = Boolean(
    assignment.assigned_to_account_id &&
    !members.some((member) => member.id === assignment.assigned_to_account_id),
  );
  const disabled = saving || loadingMembers || Boolean(membersError) || !finding.case_id;
  const disabledReason = !finding.case_id
    ? "This task is still preparing and cannot be assigned yet."
    : membersError || undefined;

  async function changeAssignee(value: string) {
    if (saving || !finding.case_id) return;
    setSaving(true);
    setError("");
    try {
      const { assignment: next } = await updateMonitoringFindingAssignment(
        finding.result_id,
        value || null,
      );
      setAssignment(next);
      onUpdated();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to update assignee");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5" title="Assignee">
        <label
          htmlFor={`task-assignee-${finding.result_id}`}
          className="inline-flex h-8 w-6 shrink-0 items-center justify-center text-stone-400"
        >
          <UserRound size={14} aria-hidden="true" />
          <span className="sr-only">Assignee</span>
        </label>
        <div className="relative w-32 min-w-0 sm:w-40">
          <span className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2">
            <AssigneeAvatar
              accountId={assignment.assigned_to_account_id}
              displayName={assignment.assignee_display_name}
              email={assignment.assignee_email}
              pictureUrl={assignment.assignee_picture_url}
              size={22}
              showUnassigned
            />
          </span>
          <select
            id={`task-assignee-${finding.result_id}`}
            value={selectedId}
            onChange={(event) => void changeAssignee(event.target.value)}
            disabled={disabled}
            title={disabledReason}
            aria-label="Assign task to a tenant member"
            className="h-8 w-full appearance-none rounded-md border border-stone-200 bg-stone-50 pl-9 pr-7 text-[11px] font-semibold text-stone-700 hover:border-stone-300 hover:bg-white focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
          >
            <option value="">Unassigned</option>
            {selectedMemberMissing && assignment.assigned_to_account_id && (
              <option value={assignment.assigned_to_account_id}>
                {memberLabel({
                  display_name: assignment.assignee_display_name,
                  email: assignment.assignee_email,
                })}
              </option>
            )}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {memberLabel(member)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400"
            aria-hidden="true"
          />
        </div>
        <span className="sr-only" aria-live="polite">{saving ? "Saving assignee…" : ""}</span>
      </div>
      {(error || membersError || !finding.case_id) && (
        <p className={`mt-1 text-right text-[11px] ${error ? "text-red-600" : "text-stone-500"}`}>
          {error || membersError || disabledReason}
        </p>
      )}
    </div>
  );
}
