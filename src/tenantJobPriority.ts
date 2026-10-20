export const TENANT_JOB_PRIORITIES = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
] as const;

export type TenantJobPriority = (typeof TENANT_JOB_PRIORITIES)[number]["value"];
