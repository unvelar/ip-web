# Conversation category selection and seller listing-price totals

Release implementation and rollback record. Bundled with the dedicated AI workspace and category drill-down increments.

The reported conversation exposed three separate problems: category report rows were omitted from inference context; selecting a category used the unrestricted filter-patch tool; and seller ranking had no total listing-price metric. Empty UI fields also produced misleading filter-change summaries.

## Resulting behavior

- Send the latest report's category keys and labels only while it belongs to the current search. Prioritize those verified types in the bounded server vocabulary.
- Offer a category-selection command that can change only `semantic.categories`. The host preserves the other filters and returns to individual items, including leaving a prior seller ranking.
- Offer seller grouping by total known USD listing price. Aggregate the complete owned saved membership before sorting/paging. Share canonical deduplication with category totals; never multiply by stock quantity or category component count. Unknown prices stay unknown and coverage remains visible.
- Grouping an existing search reuses its membership. A fresh seller-value chat creates one membership and commits its view with the search. Replies, reload, explicit top limits and Undo retain their intended view.
- Compare canonical predicates in change summaries so absent versus empty fields, and legacy versus structured prices, do not appear as filter changes.

## Boundaries and release

New server capabilities are `listing-conversation-actions-v1` and `task-seller-value-v1`. Clients send the corresponding opt-ins only when advertised. Legacy clients do not receive the category-selection tool or total-price seller sort. `FILTERING_CONVERSATION_ENABLED=false` disables advertising and translation opt-ins before inference. The saved-membership read routes require authenticated account/tenant ownership and bounded inputs. No migrations are needed.

Publish the API before the frontend. The backend checkout contains unrelated concurrent work: build a focused overlay on the current production source, including the pending category membership dependencies, rather than deploying the entire checkout.

## Verification and rollback

Verification artifacts and before/after hashes: `/private/tmp/unvelar-conversation-seller-value-20261022`. The matching frontend/backend patches are incremental against the captured local sources, not a clean historic commit. Reverse-check them before reverting; do not reset shared work or blindly roll back a later production revision.

Tests replay category report → selected category items → seller value with retained filters and no extra grouping scan; cover fresh chat, Undo, old capability behavior, database deduplication, quantities, exact cents, missing prices, full-set order, paging and ownership. Live model inference is unverified: Azure returned `401 PermissionDenied` for the signed-in identity. Automatic approval review rejected retrieving the resource API key as a way around that denial. No API key was retrieved, and no production searches or jobs were started for this change.
