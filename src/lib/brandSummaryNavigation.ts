/** Keep the API country value intact: map labels may use a different name. */
export function brandCountryTasksPath(ipId: string, country: string): string {
  return `/monitoring/tasks?${new URLSearchParams({ ip_id: ipId, status: "all", sort: "found_desc", country })}`;
}
