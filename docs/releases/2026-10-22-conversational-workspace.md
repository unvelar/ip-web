# Conversational AI workspace

This release adds read-only conversational replies for questions about the current search and ranking rationale. It keeps the query, filters, membership and draft intact during explanations. Search confirmations name the ranking basis without repetitive reset receipts. The previous generic infringement footer is removed.

The AI workspace uses chat and results panes, history in a modal drawer, compact desktop navigation with an overlay expander, and a results-focus toggle. Existing saved chats and manual Listings remain available. The frontend preserves confirmed category labels from the current API.

Validation before publication: 409 tests, lint, TypeScript and production build passed in the isolated release checkout. API runtime tests and source/migration inventory checks run in the focused image build. Authenticated live verification follows publication.

The API advertises `listing-conversation-answers-v1`; the frontend sends the opt-in only when negotiated. Deploy API before frontend. Older clients remain compatible. No new schema or environment variable is required.

Rollback: revert this release commit on current frontend main, preserving later commits. Restore the captured pre-release API image only while this release is current. The pre-release digest, full configuration snapshots, guarded release and rollback scripts, test logs, source manifest and production evidence are stored in `/private/tmp/unvelar-conversation-layout-release-20261022`. No stored chats or database schema need to be rolled back.
