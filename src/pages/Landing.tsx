import { Link } from "react-router-dom";
import Nav from "../components/Nav";

const DEMO_MAILTO =
  "mailto:antonio.palma@unvelar.com?subject=Unvelar%20Demo%20Request";

export default function Landing() {
  return (
    <div className="relative bg-cream text-stone-900 font-[Inter,system-ui,sans-serif]">
      <Nav />
      {/* ================= Hero ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow animate-float-slow w-[520px] h-[520px] -top-40 -left-32 bg-stone-300/30" />
          <div className="ambient-glow animate-float-slow-reverse w-[480px] h-[480px] top-20 -right-32 bg-amber-200/25" />
          <div className="ambient-glow w-[640px] h-[640px] top-40 left-1/2 -translate-x-1/2 bg-orange-100/20" />
        </div>
        <div className="absolute inset-0 bg-grid mask-radial-top pointer-events-none" aria-hidden />

        <div className="relative max-w-6xl mx-auto px-6 pt-20 lg:pt-24 pb-16">
          <div className="text-center max-w-3xl mx-auto animate-fade-up">
            <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur-sm border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.18em] uppercase px-3.5 py-1.5 rounded-full mb-7 shadow-sm shadow-stone-900/5">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 bg-red-500 rounded-full animate-pulse-dot" />
                <span className="relative bg-red-600 rounded-full w-1.5 h-1.5" />
              </span>
              Copyright Intelligence Layer
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-black tracking-[-0.035em] leading-[1.05] text-stone-900 text-balance">
              Find and take down{" "}
              <span className="text-gradient-red">visual IP infringement</span>{" "}
              across the web.
            </h1>
            <p className="mt-7 text-lg text-stone-500 max-w-2xl mx-auto leading-relaxed text-balance">
              Unvelar continuously monitors marketplaces, social platforms, and
              the open web for infringements of your characters, brands, and
              artwork — and clears new work before it ships. Purpose-built for
              legal and IP teams in film and gaming.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 justify-center">
              <a
                href={DEMO_MAILTO}
                className="group relative px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-semibold overflow-hidden shadow-lg shadow-stone-900/20 hover:shadow-xl hover:shadow-stone-900/30 hover:-translate-y-0.5 transition-all"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Request a demo
                  <svg
                    className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </span>
              </a>
              <a
                href="#features"
                className="px-6 py-3 border border-stone-300/80 bg-white/60 backdrop-blur text-stone-700 rounded-full text-sm font-semibold hover:bg-white hover:border-stone-400 transition-all"
              >
                Explore the platform
              </a>
            </div>

            {/* Trust ribbon */}
            <div className="mt-14 inline-flex items-baseline gap-3 bg-white/70 backdrop-blur-sm border border-stone-900/10 rounded-full px-5 py-2 shadow-sm shadow-stone-900/5">
              <span className="text-2xl font-black text-stone-900 tabular-nums tracking-tight">
                200K<span className="text-stone-400">+</span>
              </span>
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-[0.18em]">
                Protected IPs indexed
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Problem ================= */}
      <section className="relative border-t border-stone-200 overflow-hidden">
        <div className="absolute inset-0 bg-grid mask-radial opacity-40 pointer-events-none" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="max-w-3xl mb-14">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-stone-600" />
              The problem
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Infringement happens everywhere, all the time.{" "}
              <span className="text-stone-400">Enforcement is still manual.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <ProblemCard
              index="01"
              title="Knock-offs spread faster than teams can find them."
              description="Counterfeit listings, fan merch, and reuploaded art appear across thousands of marketplaces and social platforms every day."
            />
            <ProblemCard
              index="02"
              title="Manual searching never keeps up."
              description="Brand teams scan a handful of sites by hand and miss the long tail — by the time a listing is found, it has already sold."
            />
            <ProblemCard
              index="03"
              title="General-purpose vision models miss real IP."
              description="They name household brands and go blank on the lesser-known characters and marks that infringers actually copy."
            />
          </div>
        </div>
      </section>

      {/* ================= Two features ================= */}
      <section id="features" className="relative scroll-mt-16 overflow-hidden">
        <div className="absolute inset-0 bg-grid mask-radial opacity-50 pointer-events-none" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-stone-600" />
              The platform
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Two ways to protect{" "}
              <span className="text-gradient-red">your visual IP.</span>
            </h2>
            <p className="mt-4 text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
              One detection engine, two workflows — catch infringement already
              live on the web, and clear new work before it ships.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <FeatureCard
              tag="Primary"
              icon="radar"
              title="Monitoring"
              tagline="Continuous web surveillance & takedowns"
              description="Register the IP you own and the places you want watched. Unvelar scans marketplaces, social platforms, and the open web around the clock, surfaces likely infringements as review-ready cases, and lets your team issue takedowns in a click."
              points={[
                "Always-on scanning across domains and platforms",
                "Infringements arrive as enriched, review-ready cases",
                "One-click takedown notices with the evidence attached",
              ]}
            />
            <FeatureCard
              icon="shield"
              title="Clearance Review"
              tagline="Pre-publication copyright clearance"
              description="Run new characters, key art, and assets against 200K+ protected references before they reach production or release. Every flag comes back with side-by-side evidence and a plain-language verdict your reviewers can act on."
              points={[
                "Check assets against indexed protected IP",
                "Multi-dimensional similarity, not a single score",
                "Risk verdict with reasoning and citations",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ================= How monitoring works (dark) ================= */}
      <section
        id="how-it-works"
        className="relative bg-stone-950 text-white scroll-mt-16 overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow w-[600px] h-[600px] -top-40 -left-40 bg-red-600/15" />
          <div className="ambient-glow w-[500px] h-[500px] top-1/3 -right-40 bg-amber-500/10" />
        </div>
        <div className="absolute inset-0 bg-grid-dark mask-radial pointer-events-none" aria-hidden />

        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-sm text-white/60 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-red-400" />
              How monitoring works
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05] text-balance">
              Watch the web.{" "}
              <span className="text-gradient-cream">Take it down.</span>
            </h2>
            <p className="mt-4 text-white/50 max-w-2xl mx-auto text-balance leading-relaxed">
              Set it up once. From then on we scan continuously, flag what
              matters, and hand your team everything they need to enforce.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Step 1 — Watch */}
            <div className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 gradient-border">
              <StepHeader label="Step One" icon="radar" />
              <h3 className="text-2xl font-black tracking-tight mb-3">Watch</h3>
              <p className="text-sm text-white/50 mb-7 leading-relaxed">
                Register the IP you own and the domains and platforms to keep an
                eye on. Unvelar scans them on a schedule — no manual searching.
              </p>
              <div className="space-y-3.5">
                <FlowRow
                  icon="registry"
                  title="Register your IP"
                  description="Characters, brands, and artwork, indexed for detection"
                />
                <FlowRow
                  icon="globe"
                  title="Pick what to watch"
                  description="Marketplaces, social platforms, and the open web"
                />
                <FlowRow
                  icon="clock"
                  title="Always-on scanning"
                  description="Continuous re-scans catch new listings as they appear"
                />
              </div>
            </div>

            {/* Step 2 — Detect */}
            <div className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 gradient-border">
              <StepHeader label="Step Two" icon="scan" />
              <h3 className="text-2xl font-black tracking-tight mb-3">Detect</h3>
              <p className="text-sm text-white/50 mb-7 leading-relaxed">
                Every asset we find is checked across four independent
                dimensions, each surfacing a different kind of similarity to your
                protected references.
              </p>
              <div className="space-y-3.5">
                <FlowRow
                  icon="eye"
                  title="Visual Likeness"
                  description="Distinctive shapes, layout, and silhouettes"
                />
                <FlowRow
                  icon="brain"
                  title="Concept & Style"
                  description="Same character or theme, even when redrawn"
                />
                <FlowRow
                  icon="scanline"
                  title="Pixel Comparison"
                  description="Side-by-side check against the canonical reference"
                />
                <FlowRow
                  icon="type"
                  title="Wordmarks & Text"
                  description="Brand names, titles, and typographic elements"
                />
              </div>
            </div>

            {/* Step 3 — Enforce */}
            <div className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 gradient-border">
              <StepHeader label="Step Three" icon="shield" />
              <h3 className="text-2xl font-black tracking-tight mb-3">Enforce</h3>
              <p className="text-sm text-white/50 mb-7 leading-relaxed">
                Likely infringements arrive as review-ready cases — the match,
                the reference, and the supporting evidence already gathered.
              </p>
              <div className="space-y-3.5">
                <FlowRow
                  icon="inbox"
                  title="Review-ready cases"
                  description="Enriched with seller, listing, and evidence"
                />
                <FlowRow
                  icon="megaphone"
                  title="One-click takedowns"
                  description="Issue notices with the evidence attached"
                />
                <FlowRow
                  icon="check"
                  title="Track to resolution"
                  description="Dismiss, escalate, or follow enforcement status"
                />
              </div>
              <div className="mt-7 pt-5 border-t border-white/10">
                <div className="text-[10px] text-red-300/80 uppercase tracking-[0.22em] font-semibold mb-2">
                  Built for enforcement teams
                </div>
                <p className="text-xs text-white/45 leading-relaxed">
                  Reviewers see the match, the source, and the reasoning —
                  everything they need to act with confidence.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Clearance Review ================= */}
      <section className="relative border-t border-stone-200 overflow-hidden">
        <div className="absolute inset-0 bg-grid mask-radial opacity-40 pointer-events-none" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
                <span className="w-1 h-1 rounded-full bg-stone-600" />
                Clearance Review
              </div>
              <h2 className="text-3xl sm:text-[2.5rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
                Clear new work{" "}
                <span className="text-gradient-red">before it ships.</span>
              </h2>
              <p className="mt-5 text-stone-500 leading-relaxed text-balance">
                The same detection engine runs in reverse. Submit a new
                character, scene, or asset and Unvelar checks it against 200K+
                protected references — so legal and IP teams catch risk before
                production, marketing, or release, not after.
              </p>
              <div className="mt-8 space-y-4">
                <VerdictStepLight
                  title="Show the evidence"
                  description="Side-by-side visuals for every flagged similarity"
                />
                <VerdictStepLight
                  title="Review the full picture"
                  description="The asset, the closest reference, and every supporting finding"
                />
                <VerdictStepLight
                  title="Verdict with reasoning"
                  description="Risk score, plain-language explanation, and citations to the evidence"
                />
              </div>
            </div>

            <div className="relative isolate rounded-3xl border border-stone-200 bg-white p-8 card-elevated overflow-hidden">
              <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-60 blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em] mb-5">
                  What a clearance check evaluates
                </div>
                <div className="space-y-3">
                  <ClearanceDimension
                    title="Visual Likeness"
                    description="Distinctive shapes, layout, and silhouettes"
                  />
                  <ClearanceDimension
                    title="Concept & Style"
                    description="Same character or theme, even when redrawn or restyled"
                  />
                  <ClearanceDimension
                    title="Pixel by Pixel Comparison"
                    description="Side-by-side check against the canonical reference"
                  />
                  <ClearanceDimension
                    title="Wordmarks & Text"
                    description="Brand names, titles, and typographic elements"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Benchmark ================= */}
      <section className="relative bg-cream-dark/40 border-t border-stone-200 overflow-hidden">
        <div className="absolute inset-0 bg-grid mask-radial opacity-50 pointer-events-none" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-emerald-600" />
              Benchmark
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance max-w-3xl mx-auto">
              Purpose-built IP detection beats{" "}
              <span className="text-stone-400">general-purpose vision models.</span>
            </h2>
          </div>

          <div className="relative isolate overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm shadow-stone-900/5 max-w-3xl mx-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-stone-400 text-[10px] uppercase tracking-[0.18em] border-b border-stone-200">
                    <th className="text-left px-6 py-5 font-semibold">Approach</th>
                    <th className="text-right px-6 py-5 font-semibold">
                      Accuracy <span className="text-stone-300 font-mono">↑</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {BENCHMARK_ROWS.map((row) => (
                    <BenchmarkRow key={row.name} {...row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-stone-400 text-center max-w-3xl mx-auto tracking-wide">
            Based on Unvelar internal benchmark. Methodology available on request.
          </p>
        </div>
      </section>

      {/* ================= Use cases ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid mask-radial opacity-50 pointer-events-none" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-stone-600" />
              Where teams use it
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Protecting{" "}
              <span className="text-gradient-red">film, gaming, and creative IP.</span>
            </h2>
            <p className="mt-4 text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
              Rightsholders use Unvelar to find and take down infringement
              across the web — and to clear new visual work before it reaches
              production, marketing, or release.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <UseCaseCard
              icon="registry"
              title="Rightsholders & studios"
              description="Monitor marketplaces and social for counterfeits and unauthorized use of your characters and brands."
            />
            <UseCaseCard
              icon="controller"
              title="Game studios"
              description="Watch for leaked or copied skins and assets — and clear new characters, environments, and marketing art."
            />
            <UseCaseCard
              icon="megaphone"
              title="Brand protection teams"
              description="Catch infringing listings early and issue takedowns with the evidence already gathered."
            />
            <UseCaseCard
              icon="sparkles"
              title="AI creative tools"
              description="Add pre-publication copyright clearance to image generation workflows."
            />
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="relative bg-stone-950 text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600/15" />
        </div>
        <div className="absolute inset-0 bg-grid-dark mask-radial pointer-events-none" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05] text-balance">
            See it on{" "}
            <span className="text-gradient-cream">your own IP.</span>
          </h2>
          <p className="mt-5 text-white/55 max-w-lg mx-auto text-balance leading-relaxed">
            Tell us the IP you want protected and where you're seeing risk.
            We'll run live monitoring on your catalog and walk you through the
            cases we surface.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a
              href={DEMO_MAILTO}
              className="group relative inline-flex items-center gap-2 px-8 py-3.5 bg-white text-stone-900 rounded-full text-sm font-semibold shadow-2xl shadow-black/40 hover:-translate-y-0.5 transition-all"
            >
              Contact us
              <svg
                className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/5 border border-white/15 backdrop-blur-sm text-white/80 rounded-full text-sm font-semibold hover:bg-white/10 hover:border-white/25 transition-all"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* ================= Footer ================= */}
      <footer className="border-t border-stone-200 py-10 bg-cream">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-stone-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <Link to="/" className="font-semibold text-stone-600 hover:text-stone-900 transition-colors">
              Unvelar
            </Link>
            <span>· Copyright Intelligence Layer</span>
          </div>
          <span className="tabular-nums">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Problem card ---------- */
function ProblemCard({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative bg-white rounded-2xl border border-stone-200/80 p-7 card-elevated card-elevated-hover transition-all overflow-hidden">
      <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl" />
      <div className="relative">
        <div className="font-mono text-[10px] font-semibold text-stone-300 tracking-[0.2em] mb-4">
          {index}
        </div>
        <h3 className="font-bold text-stone-900 text-[1.05rem] mb-2 tracking-tight leading-snug text-balance">
          {title}
        </h3>
        <p className="text-sm text-stone-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ---------- Feature pillar card ---------- */
function FeatureCard({
  tag,
  icon,
  title,
  tagline,
  description,
  points,
}: {
  tag?: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="group relative bg-white rounded-3xl border border-stone-200/80 p-8 card-elevated card-elevated-hover transition-all overflow-hidden">
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-stone-100 to-stone-50 border border-stone-200/60 flex items-center justify-center group-hover:from-red-50 group-hover:to-orange-50 group-hover:border-red-200/60 transition-colors">
            <svg
              className="w-5 h-5 text-stone-600 group-hover:text-red-600 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
            </svg>
          </div>
          {tag && (
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700 bg-red-50 border border-red-200/70 px-2.5 py-1 rounded-full">
              {tag}
            </span>
          )}
        </div>
        <h3 className="text-2xl font-black text-stone-900 tracking-tight">
          {title}
        </h3>
        <div className="mt-1 text-xs font-semibold text-stone-400 uppercase tracking-[0.14em]">
          {tagline}
        </div>
        <p className="mt-4 text-sm text-stone-500 leading-relaxed">
          {description}
        </p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <svg
                className="shrink-0 w-4 h-4 mt-0.5 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-stone-600 leading-snug">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Monitoring step header (dark) ---------- */
function StepHeader({
  label,
  icon,
}: {
  label: string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/40">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
        </svg>
      </div>
      <span className="text-[10px] font-semibold text-red-300/70 uppercase tracking-[0.2em]">
        {label}
      </span>
    </div>
  );
}

/* ---------- Flow row (dark, monitoring steps) ---------- */
function FlowRow({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group/row flex items-start gap-3">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.02] border border-white/10 flex items-center justify-center group-hover/row:border-red-400/40 group-hover/row:from-red-500/10 transition-all">
        <svg
          className="w-4 h-4 text-white/60 group-hover/row:text-red-300 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
        </svg>
      </div>
      <div className="pt-0.5">
        <div className="text-sm font-semibold text-white/85">{title}</div>
        <div className="text-xs text-white/45 mt-0.5 leading-relaxed">
          {description}
        </div>
      </div>
    </div>
  );
}

/* ---------- Clearance verdict step (light) ---------- */
function VerdictStepLight({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-6 h-6 mt-0.5 rounded-lg bg-red-50 border border-red-200/70 flex items-center justify-center text-red-600 text-xs">
        →
      </div>
      <div>
        <div className="text-sm font-semibold text-stone-800">{title}</div>
        <div className="text-xs text-stone-500 mt-0.5">{description}</div>
      </div>
    </div>
  );
}

/* ---------- Clearance dimension (light card) ---------- */
function ClearanceDimension({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-stone-200/70 bg-cream/40 px-4 py-3">
      <span className="shrink-0 w-1.5 h-1.5 mt-2 rounded-full bg-red-500" />
      <div>
        <div className="text-sm font-semibold text-stone-800">{title}</div>
        <div className="text-xs text-stone-500 mt-0.5 leading-relaxed">
          {description}
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared icon set ---------- */
const ICONS: Record<string, string> = {
  // features / steps
  radar:
    "M12 12l6-3M12 21a9 9 0 110-18 9 9 0 010 18z M12 12a4 4 0 104 4",
  shield: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z",
  globe:
    "M12 21a9 9 0 100-18 9 9 0 000 18z M3.5 9h17M3.5 15h17 M12 3c2.5 2.5 2.5 15 0 18 M12 3c-2.5 2.5-2.5 15 0 18",
  clock: "M12 7v5l3 2 M12 21a9 9 0 100-18 9 9 0 000 18z",
  inbox:
    "M3 13h4l1 3h8l1-3h4 M5 13l2-8h10l2 8 M3 13v5a1 1 0 001 1h16a1 1 0 001-1v-5",
  check: "M5 13l4 4L19 7",
  // detection dimensions
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  brain:
    "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  scanline: "M4 4h4m8 0h4v4m0 8v4h-4M8 20H4v-4M9 12h6",
  scan: "M4 4h4m8 0h4v4m0 8v4h-4M8 20H4v-4M9 12h6",
  type: "M4 6h16M4 12h8m-8 6h16",
  megaphone:
    "M11 5L6 9H2v6h4l5 4V5z M15.54 8.46a5 5 0 010 7.07 M19.07 4.93a10 10 0 010 14.14",
  registry:
    "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z M8 8h8M8 12h8M8 16h5",
};

/* ---------- Use case card ---------- */
const USE_CASE_ICONS: Record<string, string> = {
  controller:
    "M6 10h.01M10 8v4m-2-2h4m6 0h.01M16 12h.01M7 16h10a4 4 0 004-4 4 4 0 00-4-4H7a4 4 0 00-4 4 4 4 0 004 4z",
  sparkles:
    "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  registry:
    "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z M8 8h8M8 12h8M8 16h5",
  megaphone:
    "M11 5L6 9H2v6h4l5 4V5z M15.54 8.46a5 5 0 010 7.07 M19.07 4.93a10 10 0 010 14.14",
};

function UseCaseCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative bg-white rounded-2xl border border-stone-200/80 p-6 card-elevated card-elevated-hover transition-all overflow-hidden">
      <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl" />
      <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-stone-100 to-stone-50 border border-stone-200/60 flex items-center justify-center mb-5 group-hover:from-red-50 group-hover:to-orange-50 group-hover:border-red-200/60 transition-colors">
        <svg
          className="w-5 h-5 text-stone-500 group-hover:text-red-600 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={USE_CASE_ICONS[icon]}
          />
        </svg>
      </div>
      <h3 className="relative font-bold text-stone-900 text-[0.95rem] mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="relative text-xs text-stone-500 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

/* ---------- Benchmark table ---------- */
type BenchmarkRowData = {
  name: string;
  description: string;
  accuracy: number;
  highlight?: boolean;
};

const BENCHMARK_ROWS: BenchmarkRowData[] = [
  {
    name: "OpenAI CLIP",
    description: "Image-similarity AI — recognises what it has seen, blank on the rest",
    accuracy: (0.704 + 0.0) / 2,
  },
  {
    name: "Google SigLIP",
    description: "Image-similarity AI — same blind spot on lesser-known IP",
    accuracy: (0.609 + 0.0) / 2,
  },
  {
    name: "Gemini 2.5",
    description: "Names household IPs; on lesser-known marks with no readable text, returns nothing",
    accuracy: (0.962 + 0.05) / 2,
  },
  {
    name: "GPT-4.1",
    description: "Same pattern — strong on famous IPs, silent on lesser-known visual marks",
    accuracy: (0.872 + 0.04) / 2,
  },
  {
    name: "Unvelar",
    description: "Catalog matching plus AI review layer — full coverage across famous and lesser-known IP",
    accuracy: (0.981 + 0.976) / 2,
    highlight: true,
  },
];

function BenchmarkRow({
  name,
  description,
  accuracy,
  highlight,
}: BenchmarkRowData) {
  const rowCls = highlight
    ? "bg-gradient-to-r from-emerald-500/[0.08] via-emerald-500/[0.04] to-transparent"
    : "hover:bg-stone-50/60 transition-colors";
  const nameCls = highlight ? "text-emerald-700" : "text-stone-800";
  const pct = Math.round(accuracy * 100);
  const barColor = highlight
    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
    : "bg-stone-300";
  const textColor = highlight
    ? "text-emerald-700 font-bold"
    : "text-stone-600";
  return (
    <tr className={`${rowCls} border-t border-stone-100`}>
      <td className="px-6 py-5">
        <div className="flex items-center gap-2">
          {highlight && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
          )}
          <div className={`text-sm font-semibold tracking-tight ${nameCls}`}>
            {name}
          </div>
        </div>
        <div className="text-xs text-stone-400 mt-0.5">{description}</div>
      </td>
      <td className="text-right px-6 py-5 font-mono tabular-nums">
        <div className="flex items-center justify-end gap-3">
          <div className="hidden sm:block w-24 h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-sm w-10 text-right ${textColor}`}>{pct}%</span>
        </div>
      </td>
    </tr>
  );
}
