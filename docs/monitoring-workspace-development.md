# Monitoring setup: website and isolated development

The website includes authenticated `/monitoring/setup` and admin-only
`/admin/marketplaces` routes. They reuse the editor components through the normal
session/acting-company API transport; the company setup ignores the legacy working-IP
filter. **Monitoring setup** is always visible in the sidebar, the **Manage IPs**
page header and Settings' monitoring section. The routes explain when their API is
not enabled, rather than hiding the entry point. Static route entries are generated
for both URLs, so direct links and refreshes work on GitHub Pages.

## Preview inside the normal website

Use the existing normal frontend at `http://localhost:5173` against
`https://api.unvelar.com`. From **Monitoring setup**, click **Open local preview**,
then choose a sample company. The direct links are:

- `http://localhost:5173/monitoring/setup?preview=local`
- `http://localhost:5173/admin/marketplaces?preview=local` (website admins)

The preview uses the same website layout and editor components, with a persistent
sample-data banner and an **Exit preview** link. It uses synthetic local tenants;
it does not copy the signed-in company's data or replace the website's authentication.
The sample chooser preserves existing saved local edits. **Switch sample company**
protects unsaved changes. The toolbar links company setup and the sample catalog.
The backend sandbox below must be running; no second frontend is needed.

This is explicit opt-in: the query parameter is accepted only in Vite development
on localhost or 127.0.0.1. The ordinary routes still use the authenticated production
API and its rollout checks. A production build removes the preview's dynamic import,
local client and synthetic fixtures; the build script verifies these are absent.

Verified in the Unvelar Chrome profile through the normal Manage IPs and Settings
links: both sample companies open, Bianco Latte inherits brand coverage with 15
requested searches, switching samples protects unsaved edits, and the linked Admin
catalog filters by country/sector and opens marketplace editing. Exiting restores
the signed-in acting company. Desktop and 390 px preview layouts had no horizontal
overflow; no application console errors were observed (browser extension warnings
were unrelated). Frontend lint, type checking, all 243 tests and the production
build including the local-client exclusion check passed.

## Standalone isolated development

The separate entry remains at `http://localhost:5173/monitoring-workspace.html`
when using the dedicated mode below. Styles are scoped to the editor. The earlier
`dev:monitoring-sandbox` command remains a separate, memory-only visual prototype.

Start the backend's dedicated sandbox from its root:

```sh
cd api
bun install --frozen-lockfile
cd ..
docker compose --env-file /dev/null -f api/docker-compose.monitoring.yml up -d
```

For the standalone mode, stop the normal frontend first and run from this repository:

```sh
bun run dev:monitoring-workspace
```

Open the URL above in the **Unvelar Chrome profile**. Choose the one-product or
larger-catalog example. These use separate synthetic local tenants. Saved edits
survive reloads and restarts; unsaved edits stay in memory and prompt before
leaving. No production accounts or authentication tokens are used.

The scope selector follows **company → brand → product**. Entire company combines
all explicit brand/product searches; brand-only targets its own keywords, and a
product targets only its own keywords. Equivalent company searches are combined
only when source, country, normalized phrase and schedule match; preview retains
the originating scopes. No scope affects classification confidence.

Coverage uses compact country tabs with flags. Select a country, then choose its
marketplaces in a consistent table with local brand SVGs, storefront domains and
category tags. Search, category and selected-only filters aid navigation without
changing saved selections. Each country's choices are independent; a new country
starts empty. Coverage is configured only at the brand level; every product automatically inherits
its countries, marketplaces and schedule. Products show a compact read-only
summary and an “Edit brand coverage” link, with no inheritance toggle or overrides.
The brand summary shows how many products inherit its changes.

The backend stores country/category metadata in additive migration 126. This is
an initial curated catalog, not proof of monitoring support or complete marketplace
availability. Version-1 and version-2 drafts normalize to version 3 on read, keeping brand
coverage and product keywords. Historical product overrides are ignored; changed
saves persist automatic inheritance. Version-3 overrides are rejected by the API.
Unmapped saved brand choices remain visible for review. Backend preview remains the
authority for normalization and the exact requested searches. Incomplete plans
can be saved as drafts.

Brand icons are supplied by [Font Awesome Free 6.7.2](https://fontawesome.com/),
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for SVG icons.
The dependency retains its attribution and license. Marks identify their respective
services; platforms without a bundled icon use a consistent monogram. No external
image request is made. Country/storefront evidence URLs are stored in the backend
catalog alongside review dates.

The dedicated sandbox backend exposes only draft/catalog/auth endpoints, with no jobs or activation.
Its API/database network cannot reach the Internet. Vite's monitoring mode ignores
`.env`, removes the normal API proxy, and limits browser connections with CSP.
The dedicated client fixes the API to loopback port 53000, verifies `/ready`
identifies the monitoring sandbox before signing in, and keeps tokens in memory.
Normal website routes use a separate adapter that reuses normal authentication.
Only the explicit development preview uses synthetic login on the isolated loopback
API. The website's real credentials and acting-company header never enter that client.

Scope IDs identify draft items. They do not create companies, confirmed products
or IP registrations in production. Existing canonical identities can be linked
through the backend contract, with tenant checks, but mapping UI, activation,
workers and catalog reconciliation are subsequent work. Existing IPs/products are not guessed into brands or migrated on page load.

Validation: frontend lint, focused workspace tests, TypeScript and production build;
backend TypeScript, complete empty-database migrations through 126 and replay,
and eleven focused tests including real HTTP/database ownership, concurrency, retry,
legacy upgrades, catalog metadata, scope union and no-job checks.

Unvelar Chrome validation covered country-specific selection and persistence
(Amazon selected for Italy, unselected for Spain), category filtering, local logos,
company/brand/product scope switching and automatic brand coverage for existing
products, including Bianco Latte's historical override. Its three explicit phrases
now use the brand's selected websites and weekly schedule (15 searches). Changing
the brand to daily immediately updates the product summary. The product view has
no coverage checkbox or editable marketplace controls; its edit link opens the
brand coverage editor. Desktop and 390 px layouts were inspected without
horizontal overflow. Browser logs contained unrelated extension warnings; no
application console/network errors were observed during these checks.

Earlier checks also covered creating/searching products, adding a brand, unsaved
change protection and two-tab conflict recovery. The production output contains
neither the standalone development entry nor its local client/fixtures. Shared editors and bundled icons are now included through the website routes.

## Admin marketplace catalog

On the local welcome screen, **Open catalog admin** opens Admin → Marketplace
catalog using a separate synthetic local admin account. Company example accounts
remain ordinary users. The same editor is used in the website’s Admin → Marketplaces page.

Admins can add or edit a marketplace's name, bundled logo choice, country
storefronts and reference URLs, and sectors. The main domain is immutable after
creation so saved monitoring references remain stable. New sectors can be created
inline and are saved globally immediately. Country choices use the API's ISO
country list; countries added to the catalog also appear in the brand selector.

The list supports name/domain, country and sector filters. Changes are shared
across companies and become available on reopening/reloading a workspace. Existing
brand selections are not automatically changed. Removing a country association
leaves previously selected pairs visible for review. Products still inherit brand
coverage; sectors do not influence classification or start jobs.

The admin endpoints require an authenticated admin and the marketplace rollout flag (or the isolated local draft flag).
Migration 127 adds per-marketplace revisions and audited change snapshots. Updates
are atomic, duplicate retries converge, and stale edits return a conflict with the
user's form retained. Catalog metadata does not establish scraper readiness.

Verified: API permission denial for company users, cross-company discovery,
creation, editing, sector retries, save retries, concurrent conflict handling,
audit entries and unchanged jobs/monitors. Chrome checks created “Sandbox Market”
for Italy and Peru with “Outdoor & sport,” found it through brand country/sector
filters, reloaded it, edited a storefront and checked unsaved-change protection.
Desktop and 390 px forms had no horizontal overflow or application console errors.
This synthetic sample remains in the local catalog for review.


## Hosted rollout

Deploy backend migrations 125–128 and the updated API before enabling either feature.
`MONITORING_MARKETPLACE_ADMIN_ENABLED=true` enables the shared catalog editor for
existing admins. Draft setup requires both `MONITORING_WORKSPACE_DRAFTS_ENABLED=true`
and a comma-separated `MONITORING_WORKSPACE_TENANT_IDS` allowlist of company UUIDs.
Hosted drafts stay unavailable with the old local flag alone. No wildcard is accepted.
The session-only capabilities endpoint exposes availability for the effective company
and admin role; API routes independently enforce it. Turning off either flag preserves
saved data. The standalone sandbox remains local-only regardless of hosted rollout.

Draft setup can save and preview plans. It cannot activate searches, create canonical
products or replace existing live monitor configuration. The website labels this clearly
and links to active monitors. Activation requires reviewed IP/brand/product mappings and
a separate scheduler cutover; search origins must not become classification evidence.


Website integration verification: production build/static entries, frontend lint and
transport checks, backend type checking and isolated HTTP/database tests passed.
Chrome in the Unvelar profile verified both authenticated website routes against the
production API read-only, including disabled-feature states. A temporary isolated-data
harness verified the exact embedded editors with the website CSS: admin list/modal,
company/brand/product scopes, inherited coverage, navigation protection, and 390 px
layout without horizontal overflow. No application errors were observed. The harness
was removed afterward; it is not shipped.


The Azure release on 2026-09-28 failed because the draft migrations assumed legacy
`anon`/`authenticated` database roles existed. Backend migration 128 supplies missing
NOLOGIN roles without privileges before the historical revocations, preserving all
previous migration checksums. The sandbox no longer masks this prerequisite by
creating roles during initialization. The repaired migration sequence and replay were
verified on an isolated PostgreSQL instance initially containing neither role.
