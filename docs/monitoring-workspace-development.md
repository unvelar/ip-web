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

The editor supports brand/product creation and naming, product search, keywords,
website and country selection, shared/custom coverage, cadence, exact query
preview, save/discard and stale-edit conflict handling. A brand coverage change
shows the number of inheriting products it affects. The backend is the authority
for normalization and preview. Brand terms are never silently inherited by a
product. Incomplete configurations can be saved as drafts; preview explains what
is missing. Source/country support is marked unverified until it can be validated.

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

Validation: frontend lint, 235 tests, TypeScript and production build; backend
TypeScript, full empty-database migrations and replay, seven focused tests
including real HTTP/database ownership, concurrency, retry and no-job checks.
Unvelar Chrome checks covered saving/reloading product keywords and custom
coverage, exact query preview with duplicate normalization, company switching,
product search/creation, a conflicting save from two tabs, retaining local edits,
and reloading the winning revision. Creating a second brand and unsaved-change
protection were also checked. Desktop and 390 px layouts were inspected, with
no horizontal overflow. Browser console warnings came from an unrelated extension;
no application errors were observed. The expected 409 conflict was shown in the UI.
The production output contains neither the new entry nor local client/fixtures.
The pushes skip deployment; no production migrations or monitoring runs are part
of this iteration.
