# Listings and dedicated AI workspace

Implemented locally; not deployed.

The manual listing search was compared with commit 94aecd3, before Search/Ask
were combined. Listings now contains that manual keyword search, status list
and automatic filter controls, retaining current semantic filters, grouping,
paging and review actions. It does not mount the AI translator or composer.

A separate AI search tab owns its conversation and query. Its empty state
focuses on a central composer; the result pane appears when a query has results.
Conversation, results and chat history have separate visual regions. Completed
category replies open the result table automatically without moving keyboard
focus or duplicating the full table in the chat. Fresh category reports are reused on first open; returning to an older report or manually refreshing reads current totals. Recoverable server errors keep the previous report visible with a retry message. Listings and AI retain their
own query context when switching tabs. The Listings position uses tab-local session storage, so another open queue cannot overwrite it. Open in Listings is an explicit transfer.

Chat history retains drafts, clarification choices, messages, category reports
and confirmed search URLs. It is scoped by account, acting tenant and monitored
brand. Storage is bounded to 25 chats on this browser; no cross-device sync is
claimed. Each chat is a separate browser-storage record; storage events synchronize other tabs without rewriting their conversations. Removing an active chat in another tab leaves that chat before a late response can resurrect it. Earlier aggregate history is migrated without clearing its entries. History can be renamed and removed; removal has Undo. Invalid stored
messages and oversized input are rejected. Storage failure keeps the active
session usable and labels it accordingly.

Restoring a chat, opening a tab or creating an empty chat does not create a
search. Existing saved memberships resume through authenticated reads. Starting
a requested query uses the existing APIs and preserves account ownership checks.
No backend, worker, database runtime or migration changes are part of this
redesign. Category listing drill-down remains capability gated until the earlier
local API increment is deployed.

Design references: Emil Kowalski's Great Animations
(https://emilkowal.ski/ui/great-animations) and official design engineering guide
(https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md).
Applied restrained, short feedback transitions, explicit focus states,
immediate keyboard navigation and reduced-motion support. No animation library
or design dependency was added.

The sibling patch is only this redesign, on top of the previous local category
table iteration. Before/after source snapshots, SHA256 receipt and test/build
logs are in /private/tmp/unvelar-ai-workspace-redesign-20261022.
git apply --reverse --check passes for this focused increment. Reverse only this
patch to restore the previous local UI, preserving unrelated changes.
