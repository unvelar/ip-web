# Company, brand and product monitoring — proposed iteration

Status: local draft implementation, 28 September 2026. The connected editor now
persists to a dedicated Postgres sandbox and previews searches through the backend.
Production monitoring, product classification and the existing UI are unchanged.
See [running the connected editor](monitoring-workspace-development.md). The
remaining sections distinguish the target architecture from this draft-only slice.

## Recommendation

Keep the tenant as the access boundary and call it **Company** in the customer
interface. Model **Company → Brands → Products**. Hide the brand picker when the
company has only one brand. This supports the current examples without making a
single-product customer work through extra screens. Multiple brands per company
is a provisional design assumption pending business confirmation.

Separate three concerns that currently share the IP object:

1. **Identity:** the brand and products the company cares about.
2. **Monitoring:** explicit search terms, websites, markets and schedule.
3. **Protection evidence:** reference images, protected terms, rights, policies
   and the evidence behind a match or enforcement decision.

An IP registration is evidence linked to a brand or product; it is not the
workspace selector or the only way to define a monitoring target.

## What was observed

Authenticated Chrome inspection used the Unvelar profile and read-only
navigation. Counts below are a point-in-time UI observation, not a database
audit, catalog-size estimate, or classifier accuracy evaluation.

| Example | Current configuration | Consequence |
| --- | --- | --- |
| Giardini di Toscana / Bianco Latte | Brand and Bianco Latte appear as peer IPs. Bianco Latte has 2 reference images and 10 keywords, including the broad phrase `giardini di toscana`, product spellings, samples and decants. | Brand discovery and product monitoring are mixed. A peer IP list does not explain ownership. |
| Paula’s Choice | One IP has 5 reference images and 9 keywords: a broad brand query, several Youth-Extending Daily Hydrating Fluid phrases, and a Chinese brand name. | Reference images and product-specific queries share the same scope as broad brand discovery. |
| Product Lab | The needs-attention view showed 210 groups for Bianco Latte and 100 for Paula’s Choice. Bianco Latte includes repeated 100 ml titles, decants, sample listings and body cream. Paula’s Choice includes fluid, exfoliants, retinol and moisturizers, with similar names across category branches. | These groups must not be counted as confirmed catalog products. Taxonomy and inferred grouping remain evidence, not the source of business ownership. |

The code trace establishes the current path:

- `src/context/AuthContext.tsx` and `src/api/transport.ts`: company scope is the
  authenticated tenant, with an admin `X-Acting-Tenant` override.
- `src/context/ActiveIpContext.tsx`: a single working IP is selected from the
  tenant's IP list and persisted locally. It defaults to a sorted first IP.
- `src/components/AppShell.tsx`: the admin tenant switch lives inside the account
  menu; the working IP selector lives separately in the top bar.
- `src/api/registry.ts`: each IP owns keywords, references, protected terms,
  matching identity and monitoring frequency.
- Backend `api/src/services/account.ts`: corporate email domains currently
  determine tenant assignment; free-email accounts get a private tenant.
- Backend `api/src/services/monitoring_search_terms.ts` and `listDueMonitorTuples`
  in `api/src/db.ts`: name and custom keywords expand into per-source searches.
  The canonical IP name is automatically searched, even if absent from the
  visible keyword list.
- Backend `monitored_domains`: a source links one IP and carries one scrape-from
  country. Its legacy uniqueness is `(tenant, domain, IP)`, so a countries
  multi-select is not merely a frontend control change.
- Backend migrations 048 and 056 already provide durable
  `product_canonical_identities` and catalog assignments. Reuse and extend this
  foundation; do not introduce another unrelated product catalog.
- Backend migration 121 and monitoring source services distinguish search
  engines, websites and domain patterns. A discovered destination website does
  not itself prove that direct monitoring is configured.

The backend working tree has substantial pre-existing changes. It was inspected
but not modified. Local code and production may therefore differ; validate
contracts against the backend revision selected for the next implementation.

## Customer workflow

Use one company selector in the workspace chrome, a brand context when needed,
and a local monitoring scope: **Whole brand** or **a specific product**. Keep
account/profile controls separate from company navigation. Non-admin company
choices must come from actual membership, not the admin tenant roster.

The monitoring editor has three areas: search keywords, coverage, and an explicit
preview of effective searches. The preview shows unsupported country/source
pairs, inherited settings, and how many products a brand-default change affects.
Save configuration as a draft; activation and “Run now” are separate actions.
Do not claim “Active” until the relevant source and scan are actually ready.

For **Bianco Latte**, open the focal product directly. Offer whole-brand discovery
as a separate scope. Keep fragrance, body cream, sample/decant and size evidence
distinct where it changes review or price comparisons. Do not create a separate
company, brand or top-level IP for every listing or pack size.

For **Paula’s Choice**, begin with whole-brand discovery and an indexed product
list. Let the user search products, configure a few priority products, and keep
the others on shared coverage. Later add bulk selection and “Use brand coverage”
for many products; show the exact affected count before applying a bulk change.
Large catalogs need a searchable scope picker with pagination, not thousands of
options in a native select. The small prototype uses a select intentionally.

Expose **Detected products** separately from the company's confirmed/monitored
catalog. A reviewer can associate detected identities with an existing product
or confirm a new one. Preserve uncertain/unassigned findings. Brand-wide discovery
must work before every product has been created or supplied with images.

Move legal/protection setup to a brand/product detail section. Keep search phrases,
matching aliases and protected terms visibly distinct: they have different
effects. Existing protected-term searches must survive migration; the preview
must show every effective discovery term and its origin, including system terms.

## Domain rules and proposed contracts

### Ownership and identity

- Company initially maps 1:1 to the existing tenant. Keep tenant IDs and access
  checks stable. Do not merge tenants by similar name or brand.
- A brand belongs to one tenant; a product belongs to one brand in that tenant.
  Enforce composite tenant ownership in foreign keys and API lookups, not just UI
  filters. Unauthorized or stale scope IDs must fail closed.
- Extend the existing canonical product identity model with brand ownership,
  explicit origin/confirmation and monitoring intent, allowing manually created
  products before findings exist. Current IP-scoped canonical IDs must remain
  resolvable. Review reconciliation and retirement rules before making an
  inferred identity a user-managed monitoring target.
- Keep a reviewed legacy-IP mapping and provenance for brand/product/evidence
  roles. Ambiguous IPs remain unmapped until reviewed; never auto-classify solely
  by name. Preserve history, public slugs, references, decisions and legal evidence.
- Corporate email-domain discovery is not the long-term membership model for
  agencies or companies with multiple domains. Do not expand access as part of
  this UI iteration; explicit company memberships/invitations are a separate
  authorization migration.

### Monitoring configuration

Use a typed scope (`brand` or `product`), versioned draft/active configurations,
and one authoritative effective-configuration resolver shared by preview,
scheduler and manual runs. A logical target contains:

```text
tenant_id + brand_id + optional product_id
scope_kind: brand | product
discovery_terms: phrase + language/market applicability + origin + enabled
coverage: inherit_brand | override
source selections: source_catalog_key + target_market + locale + enabled
cadence + lifecycle: draft | active | paused | archived
revision + activated_revision + audit actor/time
```

Require a product ID exactly for product scope. A brand default has explicit
coverage; a product has either one inheritance marker or a complete override.
Avoid copying inherited values into every product row. Empty selections mean
none; they must not silently mean all or inherited. Pausing a brand-wide search
does not implicitly pause all product searches; a separate company-level pause
is an explicit control with an affected-scope summary.

**Coverage inherits; broad brand keywords do not.** Products have their own search
phrases. Matching may use the parent brand as evidence without running the bare
brand query once per product. Whole-brand searches are separate and remain useful
for discovering products not yet in the catalog. Future language-specific terms
should apply only to explicitly selected markets, with full preview visibility.

“Country” must have named semantics. Use **Search from** for the selected target
market/locale, resolved to a supported marketplace storefront and egress policy.
Keep seller location, shipping destination and legal territory as separate
attributes/filters. Unsupported pairs must be explained, not shown as covered.
Use canonical source keys and capability data; do not assume all websites support
all countries or that `NULL` in the old country field means worldwide coverage.

### API and execution

Proposed API surface, not implemented endpoints:

```text
GET   /api/workspace                         membership-scoped companies/brands
GET   /api/brands/:id/products               cursor + query + monitoring status
GET   /api/monitoring/targets/:id             draft, active, effective, provenance
PATCH /api/monitoring/targets/:id             expectedRevision + draft
POST  /api/monitoring/targets/:id/preview     pure plan; no jobs or provider calls
POST  /api/monitoring/targets/:id/activate    expectedRevision + idempotency key
POST  /api/monitoring/targets/:id/runs        explicit run + idempotency key
```

Return conflicts for stale revisions; do not overwrite another editor. Saving a
draft cannot create jobs. Preview and activation resolve the same immutable
configuration snapshot. Store the resolved revision and origin in every run so
later edits cannot silently change queued work. Activating twice or recovering
after a partial failure must converge to one active revision and one set of work.

Job deduplication uses tenant, normalized query, canonical source/storefront,
market, discovery parameters and schedule window. Only coalesce searches when
those inputs really match. Retain all requesting target IDs on shared discovery;
perform matching and review under their individual product/evidence scopes.
Never share tenant results or decisions merely because query strings match.

Keep one canonical listing within a tenant and record multiple discovery/match
associations. A listing found via brand and product searches must not inflate
company totals or create duplicate enforcement actions. Product totals can
overlap for bundles, so brand/company counts use distinct listings. Preserve
scope-specific evidence, uncertainty, existing dismissals and decision history.

## Safe development and testing

| Mode | Data and services | Permitted work |
| --- | --- | --- |
| Offline UI sandbox (implemented) | Hand-authored examples, memory-only edits, CSP `connect-src 'none'`, no API/auth imports | Explore and edit the proposed workflow safely |
| Local draft API (implemented) | Dedicated Postgres/pgvector DB, narrow API, loopback gateway, internal network, synthetic accounts | Draft persistence, ownership, migrations and preview tests; no workers or integrations |
| Execution sandbox (later) | Isolated jobs, storage and fixture provider adapters | Scheduler and worker contract tests |
| Shared staging (later) | Separate API, DB, bucket, signing keys, WorkOS environment, worker pool and provider credentials | Team acceptance testing and explicitly enabled bounded live checks |
| Local frontend with production API (existing) | Production data | Read-only observation only |

The existing PR preview build takes `vars.VITE_API_URL`, just like production.
A preview URL or Git branch is therefore not an isolation boundary. The existing
`api/docker-compose.staging.yml` loads `api/.env` and does not provision separate
data services. Its filename alone provides no isolation guarantee. The current
database-host guard permits both local and Azure hosts; it does not distinguish
a sandbox database from production.

Implement the full-stack environment as a separate, explicitly named Compose
project with loopback-only exposed ports (for example API 53000, Postgres 55432,
object storage 59000, and email sink 58025). Do not read either repository's
existing `.env` or copy production credentials. Use a minimal explicit environment
allowlist and generated sandbox-only secrets. Requirements before running it:

1. Put API, DB and storage on an internal Docker network; omit cloud provider,
   SMTP, takedown-mailbox, scraping, proxy and RunPod credentials. Provider
   adapters use fixtures. The worker must only reach the sandbox API/storage.
2. Set `API_SCHEDULERS_ENABLED=false`,
   `COMPUTE_COORDINATOR_ENABLED=false`, and
   `COMPUTE_COORDINATOR_DRY_RUN=true`. These are defaults, not the sole safety
   boundary: explicit HTTP actions can still enqueue work, so separate DB,
   workers, secrets and network egress are mandatory.
3. Add a sandbox startup preflight that validates both `DATABASE_URL` and
   `MIGRATIONS_DATABASE_URL`, object-storage endpoints, worker API origin,
   signing-key separation and disabled real delivery. Refuse unknown targets.
   Check an environment marker in the database before migration/seed/reset.
4. Apply the numbered migration chain to a genuinely empty DB; repeat it; test
   upgrade from a sanitized previous-schema fixture. Do not assume the legacy
   bootstrap succeeds until exercised. Seed synthetic accounts, companies,
   brands and products deterministically, with no outgoing jobs or enforcement
   requests. No production dump is required for the initial fixtures.
5. Make `seed` idempotent and `reset` require the sandbox marker and exact sandbox
   volume/database names. Never use an unscoped `docker compose down -v` helper.
6. For shared staging, provision separate WorkOS credentials/callbacks and
   sessions. Use a separate preview origin and staging-only API URL with no
   production fallback. Set CSP/CORS allowlists accordingly. A feature flag is
   useful for rollout but is not infrastructure isolation.

Docker became available during implementation. A clean backend checkout based on
remote main was used instead of the stale, dirty original checkout. Current main
already had an onboarding development stack; the monitoring editor uses a separate,
narrower Compose project without its worker/model/WorkOS integrations. The complete
migration chain through 125 passed on the new sandbox DB, then replayed as a no-op.
The draft-only API and local frontend were started and tested against synthetic data.
Production was not migrated or seeded.

## Migration and rollout units

1. **Review this sandbox:** exercise the one-product and many-product workflows;
   confirm company/brand ownership and country semantics. No production rollout.
2. **Prove isolation:** implement the local stack and boundary tests above. The
   next backend work begins here, before changing domain behavior.
3. **Add schema and read projections:** use new numbered additive migrations;
   preserve old contracts and IDs. Reuse canonical identities. Produce a dry-run
   legacy-IP mapping report with exceptions. Do not guess a migration number from
   this proposal; allocate it against the chosen backend revision.
4. **Implement draft configuration and preview:** persist explicit scopes and
   inheritance, expose effective values, and add the new UI behind a rollout
   flag. Keep the existing scheduler authoritative.
5. **Compare plans without executing:** compare old and new effective searches
   on seeded snapshots of both examples; explain additions/removals, unsupported
   markets, duplicates, references and protected-term coverage.
6. **Activate in staging:** test queued/running/succeeded/failed states, retries,
   edits during runs, pause behavior, and canonical listing deduplication. Only
   after that plan a production pilot with a reviewed mapping and exact scope.
7. **Cut over per tenant:** fence scheduler ownership transactionally, so old and
   new planners cannot enqueue the same scope simultaneously. Leave other tenants
   on the old path. Observe results and coverage, not only queue acceptance.
8. **Rollback:** switch UI/read projection back; stop new planning and reconcile
   in-flight work before restoring old scheduling. Retain additive tables and
   audit data. Reconcile any new settings into the old-compatible projection;
   do not resurrect stale schedules or delete new evidence to roll back.

Acceptance cases include cross-company ID rejection; broad discovery before
catalog setup; product-specific queries; reference-free brand searches; keyword
normalization and language preservation; inherited and custom coverage; unsupported
markets; blank configuration; stale edits; save-without-run; duplicate activation;
partial migration retries; pause during queued work; listing deduplication across
scopes; preserved legacy links, reviews and protected-term coverage; zero outbound
delivery from sandbox; keyboard access; small screens; and reduced motion.

## Interaction design

Apply Emil Kowalski's guidance about purposeful, fast motion and avoiding animation
for frequent keyboard interactions ([You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations)).
The sandbox keeps selection and keyword updates immediate, uses a restrained
120 ms button transition, and respects reduced motion. Plain labels, local scope,
visible inheritance, explicit save/discard, and a search preview are the design
choices for this domain, rather than claims that an animation style alone solves
its information architecture.

The prototype intentionally excludes authentication, live findings, reference
uploads, protection editing, bulk actions and actual activation. These need real
backend contracts; visual completion must not be mistaken for full implementation.

## Verification of the initial visual prototype

- `bun run check`: lint, 225 tests, and TypeScript passed. Eight new tests cover
  search scope, inheritance, duplicate normalization, unsupported pairs, invalid
  configuration, foreign product scopes and the offline server boundary.
- `bun run build` passed; unique sandbox markers were absent from the production
  output. No application route was added.
- Unvelar Chrome: inspected both production examples without saving changes or
  triggering jobs; restored the original Paula's Choice company selection.
- Unvelar Chrome on localhost: verified product keyword edits, custom countries
  and cadence, saving without changing brand defaults, company switching,
  unsupported-pair disclosure, the exact search preview, blank-keyword rejection,
  inherited updates after a brand save, draft retention on scope changes,
  discard, product search, product creation and
  duplicate keyword normalization. Reload restored the synthetic fixtures.
- Desktop and narrow/mobile layouts were inspected. The narrow layout had equal
  viewport and document content widths, with no horizontal overflow. Browser
  size was restored afterward. Reduced-motion behavior is implemented in CSS.
- No application console errors surfaced. Captured warnings originated from an
  unrelated Chrome extension. Full backend integration, real provider coverage,
  authentication and migration execution remain untested in this iteration.

## Implemented draft boundary

The first backend slice stores one versioned planning document per authenticated
tenant, using migration 125 and `GET/PUT /api/monitoring-workspace` plus
`POST /api/monitoring-workspace/preview`. These differ intentionally from the
proposed activation API above. Brands/products inside a document are draft scope
items; they do not create a parallel live catalog. Optional canonical identity
links are tenant checked; existing IP mappings and identities remain untouched.
Saving is atomic and conflicts on a stale company revision. An identical retry
returns the saved revision. Incomplete drafts are allowed, with preview issues.

The connected React entry lives outside the production entry graph. Its client
only connects to the local sandbox, verifies the server marker, uses an in-memory
local session and cannot fall back to the production API. Backend routes require
both local mode and an explicit flag; the dedicated server has no worker/job
routes. Country/source support is unverified until capability validation exists.
No guessed compatibility matrix from the earlier visual prototype is reused.

Search intent must not raise identity confidence. The new planner emits explicit
queries and scope provenance, and has no classification consumer. The existing
worker classifier remains unchanged. Future execution must test that the same
listing evidence and catalog revision produce the same identification regardless
of which brand/product query discovered it, including unrelated products,
inspired-by references, bundles and unknown identities.
