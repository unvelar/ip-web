# Seller ranking and item previews

A request for top sellers with three items each could become a seller eligibility ceiling, excluding larger sellers, or fail translation because filters and display settings could not be represented together. A negotiated `listing-query-view-v1` contract now applies filter changes with seller metric, top-N limit and displayed-item cap in one confirmed search.

The preview is view state (`items_per_seller`, 1–50), separate from `seller_listing_count` eligibility. Ranking and totals cover the entire matching set. Expanding a seller loads at most the requested number of displayed rows, labels the coverage and keeps complete aggregate counts. Preview limits survive reload and history, can be removed, and support Undo. Older API rollback omits the unsupported field from conversation context.

The API's top-N grouping fast path previously always used count order. It now applies only to count ranking; exposure and other supported orders aggregate and order the complete canonical matching set before limiting/paging. The frontend passes count ranking only when count is selected, so subsequent exposure refinements preserve that metric.

Validation: 416 frontend tests, lint, TypeScript and build; 64 focused API tests including isolated local PostgreSQL checks. Local authenticated Chrome validation against production reads shows exactly three items under a seller with 146 matches, retaining complete totals. Runtime image checks and a migration readiness gate precede API deployment, followed by authenticated live-model production canaries. No schema, environment, worker or queue configuration changes.

Deployment receipts, the focused API source patch and guarded rollback are recorded in `/private/tmp/unvelar-seller-ranking-items-20261022`. Revert this frontend commit on current main, preserving later changes. Restore the captured pre-release API image only while this release is still current; verify the restored revision and public readiness. Stored chats and schema do not require rollback.
