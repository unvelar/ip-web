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
The Validate workflow checks pull requests. Production deployment depends on
validation, and PR previews run the same checks against the exact preview commit
before publishing. Dependency installs in CI use the frozen lockfile.
Configure **Lint, tests, and types** as a required status check in repository
branch protection if merges should also be blocked before deployment.

To update dependencies intentionally, run `bun install` and commit `bun.lock`
alongside `package.json`.

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
