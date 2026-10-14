# Connected LLM activity

The application route is `/admin/llm-activity`, behind the existing admin gate.
The page now reads the deployed backend. All synthetic fixtures, timers, worker
counts, progress percentages, and outputs have been removed.

## Data sources

- `/api/admin/compute/workers`: registered worker identity, pool, capabilities,
  current job IDs, hardware metadata, and heartbeat observations. The visible
  registry covers workers seen in the last 14 days. Offline workers are hidden
  from the fleet view by default and can be included explicitly.
- `/api/jobs/:id`: actual claimed job input, status, error, and saved result.
  Results are exposed in this page only for completed jobs, so an earlier result
  cannot be displayed as the response of a new retry.
- `/api/admin/monitoring/jobs/:id/attempts`: recorded attempt history for the
  inspector, including worker identity and failure reasons.
- Existing monitoring overview / run-detail endpoints: optional recent history
  and human-readable brand, tenant, and source context. These reports load on a
  separate 60-second cadence and cannot block the primary compute feed. An API
  report timeout is shown as a history limitation while current activity remains
  usable.

The primary feed polls every 10 seconds after each request completes. Reads are
bounded, cancelled when the page unmounts, and paused while the page is hidden or
paused. The reader tracks jobs after workers release them, retaining up to 100
recent jobs during this page session. Completed records older than 24 hours are
excluded. Non-monitoring history covers work observed during the session; this
is not a complete historical archive of every product / catalog job.

The feed updates automatically until an inspector is open, then buffers updates
behind **Show updates** to preserve the reading position. The inspector polls its
selected job independently, showing actual saved results and attempts. Outputs
and inputs are bounded and redacted for display, including credentials, signed
URL parameters, oversized arrays, and embedding vectors.

The current API does not expose token streaming or per-inference phase events.
Running jobs therefore show the actual job type, claimed worker, input context,
capacity scope when recorded, and elapsed time, with output pending until a saved
result is available. Model identity is shown only when explicitly recorded in the
result. Provider labels come from recorded worker records, never a preferred queue
route or a guess based on the hostname. Coordinator-hosted model work appears
under its recorded provider / pool; coordinator orchestration events are not
fabricated as inference output.

## Review on the existing local frontend

Build with:

```sh
VITE_API_URL=https://api.unvelar.com bunx vite build --config prototypes/vite.config.ts --configLoader runner
```

For this session, generated preview files are copied into the running frontend's
`public/__llm-prototype` directory. The application source and running process of
that separate checkout remain unchanged. The review URL is:

`http://localhost:5173/__llm-prototype/prototypes/llm-activity.html`

The review entry reuses the real app shell, admin auth gate, shared browser
session store, and application navigation. This is an authenticated connected
page, not the former presentation-only shell. Refresh the generated static copy
after a new preview build. The normal application build includes the new admin
route directly. No backend code changes or production mutations are required.

## Validation

Meaningful regression checks cover output isolation across retries, recorded
execution identity, unknown worker availability, redaction and bounded previews,
response identity / timestamps, retention of completed output after worker release,
history failures independent of live status, and authorization failures without
sample-data fallback.

Read-only Chrome validation uses the Unvelar profile at localhost against the
production API. An initial full monitoring report reached a database deadline;
this prompted the separate lightweight compute polling path above. Saved Hivenet
and RunPod results were observed directly in the connected page.

Final Chrome checks confirmed a saved Hivenet product-pair result with 20 pairs,
its recorded input policy versions, and its completed attempt. The fleet view
showed the worker's real current job and heartbeat. Production session expiry was
handled by reopening the normal authenticated application entry. History-report
warnings are kept separate from the primary connection state.
