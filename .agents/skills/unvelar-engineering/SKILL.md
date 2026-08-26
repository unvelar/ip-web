---
name: unvelar-engineering
description: "Apply Unvelar engineering safeguards when debugging, implementing, migrating, repairing data, or changing APIs, workers, queues, database contracts, or frontend flows. Trace root causes, model domain rules, keep boundaries clean, make retries safe, sequence checks, encode recurring lessons, and prove the real outcome."
---

# Unvelar engineering

Apply these principles together. Repository `AGENTS.md` instructions remain authoritative, and diagnosis or design work does not authorize implementation or production mutation.

## Trace before changing

Follow the real path from trigger to user-visible effect. Inspect producers, persistence, queues, workers, API contracts, filters, and UI consumers as applicable. A visible symptom may be downstream of healthy work, and an upstream success may still be hidden later.

Reproduce or observe the symptom before fixing it. Ask why until the shared cause is identified. Do not silence a failure with a guard unless absence is a valid domain state. Search for the pattern, not only the reported instance.

## Model the domain

Encode domain rules in types, state machines, registries, normalized structures, or modules that own one body of knowledge. Prefer boring local code when no structure would remove branches, duplicated rules, invalid states, or lifecycle risk.

Keep one source of truth for each invariant. Do not make several booleans, statuses, or copies stay synchronized by convention.

## Keep boundaries disciplined

Validate raw marketplace data, requests, configuration, network responses, stored payloads, and other external representations at the boundary. Convert them into honest domain types, then trust those types internally. Do not leak transport, framework, or storage shapes through domain interfaces.

Keep business decisions separate from adapters and framework wiring. Fail closed when external identity or provenance cannot be established without guessing.

## Make operations converge

For jobs, commands, migrations, backfills, deployments, and repair scripts, answer:

1. What happens if it runs twice?
2. What happens if the previous run stopped after each possible state change?
3. Does retrying converge to the same correct end state?

Add reconciliation where leftover state changes the answer. Distinguish accepted, queued, processed, active, and user-visible states instead of reporting an earlier stage as completion.

## Sequence verifiable units

Break multi-step work into the smallest units that end in a meaningful check. Establish a known baseline, make one change, check it, then continue. Keep repairs and production actions within the exact authorized records or identifiers.

Order commits and delivery steps so a reviewer can understand the progression. Do not batch unrelated risk behind one final check.

## Encode recurring lessons

When the same correction appears twice, choose the strongest practical mechanism: a type that prevents the state, a schema or API contract, a banned call or lint rule, a canonical helper, a runtime boundary check, or a deterministic script. Use prose only when the rule genuinely requires judgment.

Do not fix one row, marketplace, caller, or UI branch when the defect comes from a shared path, unless the user explicitly chose a bounded exception.

## Prove the actual outcome

Before claiming completion, inspect the real artifact or behavior named in the request. Builds, workflow success, image publication, enqueue acknowledgement, and compilation are proxies unless that is the requested outcome.

Use the cheapest decisive check needed for the next phase. Do not add or run tests by habit. Prefer existing checks, exact artifact reads, read-only queries, authenticated read-only observation, or one bounded canary when those directly prove the claim.

Report what was verified, what remains unverified, and why. Trust artifacts and runtime evidence, not summaries or intent.
