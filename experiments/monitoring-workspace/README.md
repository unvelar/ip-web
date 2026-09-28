# Monitoring workspace sandbox

An editable UI prototype for Company → Brand → Products. This is the first
design iteration, not a replacement for the authenticated application or a
full-stack staging environment.

```sh
bun run dev:monitoring-sandbox
# Open http://localhost:5173 in the Unvelar Chrome profile.
bun test experiments/monitoring-workspace/model.test.js
```

The command refuses to bind when another process already owns port 5173; do not
stop someone else's frontend. Stop this sandbox before starting the regular
`bun run dev` frontend on that port. The standalone server does not load `.env`,
proxy requests, import application authentication, or start a backend. Its CSP
blocks browser connections and form submissions. Only four local assets are
served; arbitrary paths, API routes and mutation methods return 404.

Changes live in memory in the current tab. Reload restores fixtures. The server
and fixtures are outside Vite's production entry point and `public/`; the normal
production build does not publish the sandbox. Do not add it to production routes.

Try both companies, whole-brand and product scopes, keyword editing, inherited
and custom coverage, unsupported country combinations, search previews,
save/discard, switching with a pending draft, product search and adding a product.
Website capability data and product selection are illustrative, not production
measurements or a complete brand catalog. No live findings, scraping, uploads,
authentication, persistence, publishing, enforcement or automatic monitoring is
implemented here. Future configuration saving and monitoring activation must be
separate backend operations.

See [the design and migration proposal](../../docs/company-product-monitoring.md)
for the audited current behavior, target contracts, and full-stack isolation plan.
