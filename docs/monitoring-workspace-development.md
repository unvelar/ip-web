# Connected monitoring draft editor

The new iteration is available at `http://localhost:5173/monitoring-workspace.html`.
It is a development entry, excluded from the production build. The earlier
`dev:monitoring-sandbox` command remains a separate, memory-only visual prototype.

Start the backend's dedicated sandbox from its root:

```sh
cd api
bun install --frozen-lockfile
cd ..
docker compose --env-file /dev/null -f api/docker-compose.monitoring.yml up -d
```

Then, from this repository:

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
starts empty. Product coverage inherits from its brand until explicitly customized.
The brand summary shows how many products inherit its changes.

The backend stores country/category metadata in additive migration 126. This is
an initial curated catalog, not proof of monitoring support or complete marketplace
availability. Existing version-1 drafts upgrade without losing any requested pairs;
unmapped saved choices remain visible for review. Backend preview remains the
authority for normalization and the exact requested searches. Incomplete plans
can be saved as drafts.

Brand icons are supplied by [Font Awesome Free 6.7.2](https://fontawesome.com/),
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for SVG icons.
The dependency retains its attribution and license. Marks identify their respective
services; platforms without a bundled icon use a consistent monogram. No external
image request is made. Country/storefront evidence URLs are stored in the backend
catalog alongside review dates.

The backend exposes only local draft/auth endpoints, with no jobs or activation.
Its API/database network cannot reach the Internet. Vite's monitoring mode ignores
`.env`, removes the normal API proxy, and limits browser connections with CSP.
The dedicated client fixes the API to loopback port 53000, verifies `/ready`
identifies the monitoring sandbox before signing in, and keeps tokens in memory.
The normal production entry and authentication code are not changed.

Scope IDs identify draft items. They do not create companies, confirmed products
or IP registrations in production. Existing canonical identities can be linked
through the backend contract, with tenant checks, but mapping UI, activation,
workers, catalog reconciliation and live rollout are subsequent work.

Validation: frontend lint, full test suite, TypeScript and production build;
backend TypeScript, complete empty-database migrations through 126 and replay,
and ten focused tests including real HTTP/database ownership, concurrency, retry,
legacy upgrades, catalog metadata, scope union and no-job checks.

Unvelar Chrome validation covered country-specific selection and persistence
(Amazon selected for Italy, unselected for Spain), category filtering, local logos,
company/brand/product scope switching, retained Bianco Latte custom coverage and
Paula's Choice inherited coverage. Product preview contained only its three
explicit phrases (18 searches); company preview combined those with the brand's
ten requests for 28 total. Desktop and 390 px layouts were inspected without
horizontal overflow. Browser logs contained unrelated extension warnings; no
application console/network errors were observed during these checks.

Earlier checks also covered creating/searching products, adding a brand, unsaved
change protection and two-tab conflict recovery. The production output contains
neither the new entry nor local client/fixtures/icons. Pushes skip deployment;
no production migrations or monitoring runs are part of this iteration.
