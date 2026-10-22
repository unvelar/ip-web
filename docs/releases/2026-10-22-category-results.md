# Category breakdown in the queue results

Implemented locally, not deployed.

An AI category-ranking reply offers Show category breakdown instead of duplicating
the table in the chat. The button collapses the transcript, focuses the results,
and replaces the listing table with category totals. Show all listings restores
the previous queue page, grouping, ordering and URL. Reports from another saved
membership cannot switch the current table.

View listings opens a paginated category slice of the same saved membership.
It does not change predicates, create searches, or depend on the visible queue
page. Back to categories refreshes the totals. Selections clear when changing
category, sorting, paging or leaving the category workspace. Priority is evaluated
before pagination. Existing task details and explicit review controls remain
available from the listing rows.

The API routes enforce tenant and account ownership. Totals and drill-down share
one canonical membership and semantic component SQL helper, including corrected
categories, semantic predicates, bundle categories and Uncategorized. Incomplete
saved searches cannot produce category results. Category assignments are current;
an updated assignment may move a listing between reads.

The category ranking response advertises task-category-listings-v1 only with
the new read route. Against the current production API the table switch works,
and View listings remains disabled. No local API was pointed at production.
The new route is GET /api/monitoring/tasks/searches/:id/categories/listings,
with exactly one category_key or uncategorized=true, bounded offset/limit and
priority/newest ordering.

Validation: 383 frontend tests, lint, TypeScript and production build pass.
Four focused backend route/database tests pass (62 assertions), covering
ownership, canonical duplicates, corrected categories, stale evidence, semantic
predicates, missing prices, ordering and pagination. Route bundle succeeds.
Chrome at localhost:5173 against api.unvelar.com confirms a real-model reply
switches the lower table using saved search 68189aa0-b30c-4a90-8226-8b7dc6b3d268.

The sibling frontend patch records only this increment, excluding earlier
experimental-agent work and unrelated local edits. Backend increment is
docs/releases/2026-10-22-category-drilldown.patch in ip-backend. Detailed before/
after source snapshots and SHA256 receipt are in
/private/tmp/unvelar-category-drilldown-20261022. Both reverse patches pass
git apply --reverse --check against the implemented sources.

Rollout: release the focused backend overlay onto the actual latest production
image first, verify the GET route, then release frontend changes. No migrations,
environment changes, worker images or database repairs are included.
Rollback: reverse only these increments, preserving subsequent unrelated work.
The prior backend is safe with this frontend: category totals remain available
and drill-down is capability gated. Production rollout has not been requested
for this iteration.
