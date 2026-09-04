# Unvelar: product and brand context

Read this before writing product copy, marketing content, or anything customer-facing in this repo.

## What Unvelar is

Unvelar is a SaaS platform for automated brand protection and IP monitoring. It detects counterfeits, trademark infringement, and copyright violations across marketplaces, social platforms, and other online channels, using semantic image matching, cross-brand infringement pattern detection, and local vision models.

Core structural fact: Unvelar is a pure software product. No analyst labor is baked into the cost or delivery. Most competitors bill for a team of humans reviewing cases; Unvelar doesn't have that team, detection runs on the platform itself. That's the real, defensible differentiator, not a blanket "cheaper than everyone" claim (see pricing rules below).

## The two products

**Monitoring** — Continuous scanning of marketplaces, social platforms, and the open web for counterfeits and unauthorized use of a brand's registered IP. Every match is scored and returned as a reviewed case (match, source, evidence) for a human on the client's team to review. Unvelar prepares takedown-ready notices with evidence attached, but does not send them; the brand or its law firm sends the actual request. This is a deliberate liability containment decision, never describe it as end-to-end takedown handling.

**Clearance Review** — The same detection engine run in reverse: before a brand ships a new design, product, or creative work, it's checked against Unvelar's library of 200,000+ protected references. Returns a risk verdict with reasoning, not just a similarity score. Applies broadly (fashion, consumer goods, packaging, campaign assets), not just entertainment/media. Avoid framing around "characters" or "key art" as primary examples, that undersells the larger fashion/consumer brand market.

**Detection works across four dimensions** (both products): visual likeness (shapes/layout/silhouette), concept and style (same idea redrawn/restyled), pixel comparison (direct match to canonical reference), wordmarks and text.

## Who Unvelar sells to

1. **Law firm partner channel** (most active) — targets mid-size companies through the law firms representing them; pilots underway at several Am Law 100 firms.
2. **Direct enterprise** — in-house legal and brand protection teams at large global brands.
3. **Emerging: data/API channel** — selling detection data via API to existing brand protection service providers. A data layer/white-label play behind an existing service, not a head-on replacement pitch.

## Pricing, be precise

True and defensible: priced leaner than fully staffed competitors because there's no analyst labor in the cost structure.

Never claim: a blanket "cheaper than every competitor" or "fraction of the cost of anyone" without qualification. Does not hold at realistic seat counts, pricing lands inside the existing market range, not below it. Never present pricing as categorically cheapest on public copy. A specific competitive multiple, if ever needed, belongs in one-on-one sales collateral only, never as a standing public claim.

## Copy language rules

- Never say "one-click takedown" or imply Unvelar sends takedown notices itself.
- Avoid "infinite sources" / unlimited-coverage language; "no real cap" is the accurate framing.
- Don't overstate CAPTCHA handling, marketplace coverage, or scraping sophistication.
- Don't imply endorsement from, partnership with, or use by companies that aren't real customers (especially risky for a brand-protection company to get caught doing).
- Pilot-stage language must be accurate: don't call an in-progress conversation or trial a completed/active "pilot."
- For field investigators: Unvelar is the online intelligence layer, not a replacement for physical fieldwork.
- Whether mid-size companies want self-run takedowns vs. full outsourcing is an open, unvalidated question, don't assume self-serve is universally wanted.
- No em dashes or en dashes anywhere in copy. Use commas, periods, or parentheses instead.
- Avoid generic SaaS language: "unlock," "seamless," "elevate," "empower," "cutting-edge," "revolutionize," "game-changing," "leverage." Prefer concrete, plain, specific language.

## Competitive landscape

Tracked: Red Points, Corsearch, MarkMonitor, OpSec Security, BrandShield, MarqVision, ZeroFox, Bolster, CSC, Netcraft. OpSec and Corsearch are the two primary pricing/positioning anchors.

## Brand voice

Website and marketing copy: direct, concrete, plainspoken, natural but not informal. Short sentences, active voice, no corporate filler, straight to the point.

Cold outreach (different register): short, casual, informal, human-sounding, one clear ask per message. Website can be more polished than a cold DM but should never tip into stiff or corporate.

## Visual identity (current site)

- Background: cream/off-white (`bg-cream`)
- Text: near-black (`stone-900`)
- Accent: red (`#dc2626`, Tailwind `red-600`), gradient highlight on key headline phrases
- Typography: bold Inter, oversized black headlines
- Dark sections: `stone-950` background, white text, red/amber ambient glow effects
- Cards: soft elevated shadow (`card-elevated`), subtle background grid pattern behind sections

## Repo context

- Public marketing page: `src/pages/Landing.tsx`, rendered at `/`.
- Stack: React 19, TypeScript, Vite 8, Tailwind CSS v4, react-router-dom.
- Deployed to GitHub Pages under the custom domain unvelar.com (see `CNAME`).
- Same repo as the full product, not marketing-only: auth (WorkOS), monitoring dashboard, clearance review workflow, and admin tooling all live here.
- The hero's scan input is functional (navigates to `/monitor/start` with the typed value pre-filled), not a static mockup.
- Company contact: antonio.palma@unvelar.com, San Francisco, CA.

## Scope note

This repo is public. Don't add active deal-pipeline details (prospect names, negotiation stage, deal-specific numbers) to copy or docs here. Ask if a task genuinely needs that context.

See also [AGENTS.md](AGENTS.md) for UI validation / testing workflow rules.
