# Unvelar web

React and TypeScript frontend for IP registration, monitoring, product review,
and administration. Vite builds the application for GitHub Pages.

## Local development

Use Node.js 22.12+ (CI uses Node.js 22) and the Bun version pinned in
`package.json`; `bun.lock` is the canonical lockfile.

```sh
bun install --frozen-lockfile
# Set VITE_API_URL=https://api.unvelar.com in your untracked .env file.
bun run dev --host 127.0.0.1
```

Reuse an existing frontend on `http://localhost:5173` when one is running.
Validate authenticated routes through the Chrome extension in the **Unvelar**
profile. Use the normal WorkOS sign-in flow. Production-backed validation is
read-only unless the user explicitly authorizes a mutation. See [AGENTS.md](AGENTS.md).

## Checks and deployment

```sh
bun run check  # lint, regression tests, TypeScript
bun run build  # brand assets, TypeScript, Vite, static route entries
```

Tests live in `tests/` and run with Bun; component tests use React and Happy DOM.
The test preload creates browser storage before importing authentication
singletons. Component suites can then install their own document and URL.
The Validate workflow checks pull requests. Production deployment depends on
validation, and PR previews run the same checks against the exact preview commit
before publishing. Dependency installs in CI use the frozen lockfile.
Configure **Lint, tests, and types** as a required status check in repository
branch protection if merges should also be blocked before deployment.

To update dependencies intentionally, run `bun install` and commit `bun.lock`
alongside `package.json`.

## Conversational review queue search

Use **Monitoring → Review queue** (`/monitoring/tasks`). Its search bar has
**Search** for literal keywords and **Ask** for explicitly submitted language
requests. Both use the queue's manual filters, current dates and review results.
In Ask mode, messages appear above a bottom multiline composer. Enter sends and
Shift+Enter adds a line. Conversation history is collapsible. Requests such as “L261 codes” use a literal, case-insensitive **Title contains** predicate; L261 also matches longer codes such as L261012. Seller names, descriptions and URLs do not qualify. The condition has an editable/removable chip and remains active during follow-ups. This requires the API policy `literal-title-substring-v1`. Model configuration and credentials stay
on the API; the MCP stdio package is not bundled in the frontend.

**New chat** prepares a fresh query, retaining only the visible brand,
queue status and dates. It clears previous text, catalog, location, price,
seller and other search predicates only when the new query is successfully
applied. **Reply** refines the confirmed filters; a successful first message switches
the composer to Reply automatically. Every text
condition is visible as a removable chip, including in Ask mode.

With API capability `listing-conversation-v1`, turns include bounded structured
conversation history. A conflict question keeps the confirmed query and results
until the user answers. Confirmed range replacements translate the pending request
against verified filters without replaying superseded range instructions. Answers
may be typed or chosen using buttons. Questions
and conversation intent survive reload within the same tab, account, tenant,
brand and exact confirmed query. **Undo last change** reapplies the previous
filter snapshot (and reruns its query); it does not restore historical counts.
Manual edits invalidate pending answer buttons and Undo for superseded queries.
With `task-queue-view-v1`, ordering and grouping are separate from listing filters.
“Takedown recommended first” preserves the saved search membership and all filters;
it uses the queue's priority rank over the complete matching set before pagination.
While a scan runs, the UI says “Ordering matching items…” rather than showing a
provisional zero count. Undo restores the previous view without starting a scan.
Category grouping and top sellers within each category are currently unavailable;
the assistant explains this directly. **Group by Product** refers to canonical
product identities and is not a substitute for product categories.
On older APIs, New/Continue still control filter retention, but contextual chat
requires the capability. Disable `FILTERING_CONVERSATION_ENABLED` on the API
and refresh clients to roll back contextual translation without a migration.

Successful search creation commits the confirmed filter draft in `queue_filters`
and its saved membership in `task_search`. Catalog ambiguity requires a choice.
Newer manual edits, scope changes and cancellation invalidate older translations.
Rejected requests keep the previous confirmed filters and results. Queue-specific
predicates (marketplace country, seller origin, evidence, source and assignment)
remain active while language refines the supported listing predicates.

Top N requests select **Group by Seller**, sort by matching article count, and
save `top_sellers` (1–100). The backend ranks identified sellers over the complete
search before pagination; it deduplicates canonical listings and breaks ties by
seller identity. Rankings stay hidden until a background search completes.
Seller-count thresholds also wait for completion, including when viewing listing
rows. A limited, failed or cancelled scan cannot claim exact matching counts.

The additive API capability `task-listing-search-v1` enables exact currency bounds,
listing locations, typed catalog selections and seller counts. Marketplace country
and listing location have distinct controls and meanings. Advanced requests fail
closed against older APIs. Searches use the existing bounded task-search scanner;
they create temporary saved search membership, never investigation jobs. Historical
FX, canonical catalog membership and same-component semantic predicates reuse the
listing search contracts. Existing `/monitoring/search` links retain the earlier
read-only prototype for compatibility; new navigation opens the queue.

Combined image/text similarity, investigation to-dos and the official public `/v1`
MCP boundary remain separate work. Translation failures never broaden a search.

## Code organization

- `src/App.tsx`: route definitions and lazy route loading, with a recoverable
  page error boundary.
- `src/api/`: transport, domain contracts, and endpoints. Import the appropriate
  domain in new feature code; `src/api.ts` remains a compatibility entry point.
  Session, registry, and job responses validate the fields needed for identity
  and UI state before reaching consumers.
- `src/features/`: feature components, data loading, and domain rules. Product
  settings and review components are shared here rather than imported from pages.
- `src/pages/`: route-level orchestration.
- `src/components/`: shared controls and application layout.

Keep async results scoped to their request identity, cancel obsolete reads,
and distinguish request failures from successful empty results. Polling must
not overlap requests or reuse a previous job's completion state. External
session changes remount the signed-in tree so identity, tenant, and cached UI
refresh together; simulated logins remain isolated to their tab.

## Brand assets

`public/logo/logo.svg` is the source of truth for the Unvelar mark. `bun run build`,
`bun run dev`, and `bun run assets:generate` generate the favicon, touch icons,
web manifest icons, and social preview image from that SVG.

## Deploy freshness

The GitHub Pages workflow injects `VITE_BUILD_SHA` and a UTC `VITE_BUILD_TIME`
captured immediately before the production build. Vite emits the same metadata
in `build.json`; open tabs can detect a newer deployment and offer a reload.
PR previews set `VITE_BASE_PATH` to their preview directory so assets and routes
stay within the preview.

With `task-category-ranking-v1`, Ask can rank product categories by **total
listing price (USD)** or matching listing count. The chat displays a table over
all matching saved members, with known/missing price counts. Total price sums
one stored USD listing price per canonical listing/category; bundles can count
in several categories, so category totals overlap. It does not multiply by stock
quantity. Current trusted component evidence and reviewer corrections determine
categories; unavailable classifications appear as Uncategorized. Unknown prices
stay unknown, while a known zero price remains priced.

An answered metric question executes the requested ranking without demanding a
price range. Continue reuses the confirmed saved search. New chat applies its
fresh filter scope and waits for the bounded search to complete before publishing
exact totals; stopped, failed and limited scans cannot produce a final ranking.
Category tables survive reload within the existing scoped conversation storage.
Category ranking is separate from grouping every listing by category or ranking
sellers within each category. Older APIs must not be offered unsupported rankings.
