# Marketplace filtering and grouping — 2026-10-23

Implemented; not deployed. Frontend branch: `codex/marketplace-search-and-groups`, based on `27b3e92286aa42f31dcab485689afa8c6d27ce80`.

## Behavior

AI search recognizes marketplace names/domains as listing origins. The model returns a marketplace query; the client resolves it through authenticated website options before applying country, price, catalog, or display changes. Unknown/ambiguous matches leave current filters and results intact; ambiguities request a domain. There is no hardcoded marketplace registry or Goofish-specific production logic. The existing native website selector supplies manual filtering. This selector supports one website at a time.

The manual Group by menu adds Marketplace when the API advertises `task-grouping-v1`. AI requests can combine marketplace filtering and grouping. Groups use canonical saved membership across the complete search, not loaded rows. Each marketplace expands to an initial listing preview and supports loading more; totals include all matches. The reused generic grouping service supports one or two dimensions, server ordering, counts, total listing price and exposure. Existing seller/category behavior remains negotiated separately. Marketplace keys are recorded domains; different storefront domains remain distinct.

New policies: `task-marketplace-selection-v1` and `task-grouping-v1`. Old clients omit these features and old APIs do not advertise them. No schema, migration, worker, or environment changes.

## Grounded AI analysis

The AI now has a filter → group → completed-results → explanation loop. `listing-result-analysis-v1` negotiates an owned saved-search evidence read in the ordinary translation endpoint. The caller supplies only the saved search ID and chosen view; numerical evidence is loaded by the server, scoped to tenant, account, brand, status and catalog. Injected client evidence is rejected. Follow-up explanations read fresh server evidence rather than trusting prior assistant text.

Server aggregates provide full canonical totals, known/missing price counts, exact rounded metric shares, up to five leading groups, and up to three subgroups for each of the first three parents. Shares use the complete matching set before top-N and preview limits. Overall category totals deduplicate overlapping listings; category shares are explicitly nonadditive. Incomplete/failed/limited/cancelled searches supply no final rankings. Saved scope and bounded evidence are disclosed to the model; no sales, trends, recommendation reasons, or enforcement evidence is invented by the host.

Completed grouped or seller searches receive a short automatic conversational analysis. The summary path offers only answer/clarification tools and the browser rejects any returned action. Failures offer a retry without changing results. Late responses are aborted/discarded on scope changes, and successful analyses are retained in chat history to avoid duplicate summaries. Clear analytical filter-and-group requests use atomic search changes plus grouping; undefined importance asks for a metric. The AI is instructed to compare actual concentration, explain material missing data and suggest a supported next drill-down.

This evidence supports analysis, not an autonomous investigation or enforcement workflow. The model still proposes one validated query/view action per turn; filter-plus-group operations are one atomic action, and the completed-result read is automatic. There are no background scheduled investigations or account mutations.

The analysis increment remains isolated in the runtime source above so ongoing discussion/tracing changes in the shared checkout are preserved. The cumulative companion patch includes it. `2026-10-23-result-analysis.patch` separately reverses just the analysis increment against the marketplace-only source. Actual model quality and authenticated Chrome validation remain pending deployment; model tests use recorded tool fixtures.

## Source and rollout

Frontend implementation is isolated in `/private/tmp/unvelar-marketplaces-20261023/frontend` to preserve unrelated dirty work in the original checkout and the other checkout serving localhost:5173.

The companion API patch `2026-10-23-marketplace-search.patch` contains only fifteen required files, relative to API revision 495 source (image `sha256:882ba9b138f63fc4e679c80e479837861e597d17adf03f75e4bcdfe249c14bbd`). Its complete buildable source is `/private/tmp/unvelar-marketplaces-20261023/api`. Narrow marketplace additions were also copied into the shared backend source without replacing ongoing discussion/tracing work. The isolated native `/tasks/capability` grouping advertisement is included in the patch; the older shared route implementation was deliberately not overwritten.

Before deployment, compare the currently serving API image/source to this baseline and preserve any newer changes. Deploy API capabilities before frontend. Do not deploy either dirty shared checkout wholesale. The runtime patch includes the existing unfinished grouping service and its required routes/contracts, but excludes unrelated work.

## Verification

- Frontend: 436 passing tests, 2,368 assertions; lint, TypeScript and production build passed.
- API: 73 focused tests passed, 568 assertions; full API runtime bundle passed.
- Isolated local PostgreSQL: six grouping/analysis/contract tests, 90 assertions passed, covering complete canonical membership, nested groups, independent preview totals, pagination and ownership.
- Earlier authenticated Chrome diagnosis confirmed manual Goofish filtering returns 369 matches. The new implementation has not yet received authenticated browser validation: localhost:5173 serves another checkout and the connected API lacks the new capabilities. No console/network claim is made for the new flow.
- Real-model evaluation was not completed. A noninteractive production-container command failed before execution with websocket URI-too-long; automatic approval review rejected a subsequent interactive production shell because that privileged access was not specifically authorized. No shell was opened and no model evaluation ran through that path. Use normal authenticated API/app validation after deployment.

## Acceptance checks after rollout

1. `show me the goofish listings`: website resolves to goofish.com, literal text/catalog predicates stay empty, matching domains are Goofish.
2. `group by marketplaces`: all matching websites remain included, totals sum over complete membership, expand a group and load more rows.
3. `Goofish listings under $20, grouped by marketplace`: website, price and grouping apply together; changing to an unknown domain changes none of them.
4. An ambiguous marketplace name asks for a domain; choosing one retains the requested country/price. Undo restores previous website and view.
5. Manual Marketplace grouping retains existing product-detail filters and native selectors; clearing grouping restores individual listings.

## Reversal

Before rollout, close the frontend draft/revert its branch and leave production untouched. After rollout, revert the marketplace frontend commit on current main and publish it, preserving later commits. Restore the exact API image recorded immediately before deployment only if the active revision still belongs to this release. The cumulative API patch reverse dry run verifies source reversal; do not reverse it over newer edits without resolving conflicts. No data/schema rollback is required.
