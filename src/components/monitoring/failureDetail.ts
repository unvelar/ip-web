export function failureDetail(reason: string | null): string {
  if (!reason) return "Search setup has not completed.";
  if (reason === "strategy_policy_unsupported") return "A worker was running an older monitoring version. This attempt could not run.";
  if (["discovery_disabled", "discovery_key_missing", "collection_interpreter_unavailable"].includes(reason)) return "Search discovery was unavailable on the worker.";
  if (reason === "authenticated_profile_not_supported") return "Search setup could not use this website's signed-in session.";
  if (reason === "marketplace_api_not_configured") return "The marketplace connection needs configuration.";
  if (reason === "no_search_control") return "A usable search control could not be found.";
  if (reason.includes("uncertain_dialog")) return "A page popup could not be safely identified or dismissed. The search did not start.";
  if (reason.includes("authentication")) return "The website required a signed-in session before the search could continue.";
  if (reason.includes("challenge")) return "The website blocked the browser with a verification challenge.";
  if (reason.startsWith("page_not_ready")) return "A page dialog or unavailable control prevented the search from starting.";
  if (reason === "collection_unproved") return "The browser reached the website, but could not verify that the page contained the requested search results.";
  if (reason === "stage_failed" || reason === "stage_timed_out" || reason === "capture_unavailable") return "Search setup stopped before it could be verified.";
  return "The search could not be verified. This does not establish that the website has no matching listings.";
}
