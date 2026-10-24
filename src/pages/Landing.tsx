import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import { FAQ_GROUPS } from "./landingFaq";
import { PLATFORMS } from "./landingPlatforms";

/* ---------- Scroll-triggered section reveal ---------- */
function Reveal({
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined"
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

/* ---------- Page content ---------- */
const STATS = [
  { value: "50M+", label: "infringing listings found" },
  { value: "$150M+", label: "in counterfeits and infringements identified" },
  { value: "20+", label: "brands, including listed companies and global law firms" },
  { value: "5x", label: "lower brand protection costs, on average" },
];

const INCLUDED = [
  "Live monitoring, real-time dashboard",
  "Computer vision and AI for precise image recognition",
  "AI copilot to run your own searches",
  "No cap on detections and takedowns",
  "No cap on team members",
  "As many automation rules as you need",
  "Technical support by email, 24/7",
];

const CONTRAST_ROWS: [string, string][] = [
  ["Annual contracts priced for the biggest brands", "Monthly plans from $995"],
  ["Reports that arrive weeks after a listing goes up", "A live dashboard, updated within minutes"],
  [
    "Fixed keyword searches that miss edited or redrawn copies",
    "A self learning platform that runs specialised searches on its own",
  ],
  ["A fixed list of major marketplaces", "Unlimited"],
  ["Takedowns counted one listing at a time", "Seller networks mapped, so you go after the source"],
  ["Updates scattered across email threads", "Every case and escalation in one place"],
];

const SOURCE_POINTS = [
  "Links stores that share photos, prices and seller details, even under different names",
  "Ranks sellers by number of listings, reach and markets, so the biggest operations come first",
  "Gives your counsel the full picture of a network, ready for a cease and desist or an investigation",
];

const STEPS = [
  {
    label: "Step One",
    icon: "radar",
    title: "Watch",
    body: "Register your products, brands and artwork. Choose the markets, price points and sources you care about, and change them any time.",
  },
  {
    label: "Step Two",
    icon: "scan",
    title: "Detect",
    body: "Unvelar runs specialised searches on its own, based on what you register. Advanced models recognise patterns across listings, sellers and marketplaces, and computer vision models match visuals.",
  },
  {
    label: "Step Three",
    icon: "brain",
    title: "Learn",
    body: "Every case your team confirms or dismisses sharpens the next results. Your team always decides what gets taken down.",
  },
  {
    label: "Step Four",
    icon: "shield",
    title: "Act",
    body: "Cases arrive with the seller, listing and evidence attached. Assign them to colleagues, escalate to outside counsel, send takedown notices, and track every case to resolution.",
  },
];

// Real customer quotes only.
const QUOTES = [
  {
    quote:
      "Fake serums kept popping up on several Chinese marketplaces at half the price. Unvelar helped us connect 600 listings to just 9 sellers using the same product photos, and get them taken down, removing over $3M in potential counterfeit sales.",
    role: "In-house counsel",
    company: "Skincare brand (EU)",
  },
  {
    quote:
      "Copies of the new home kit appeared on DHgate and Goofish two days before the official launch. Unvelar traced 70% of the 1,800 listings back to 12 seller networks, so the club had takedown notices ready on launch day.",
    role: "Merchandise Manager",
    company: "Football club, Italy",
  },
  {
    quote:
      "We run our full brand protection program with Unvelar at a third of what we paid our previous provider. And the results are better and more precise, because we can control the searches ourselves and nothing is left behind.",
    role: "Brand Protection Manager",
    company: "Fashion company, France",
  },
  {
    quote:
      "Switching to Unvelar from our previous provider was fast and smooth. The platform adapts to what we need, and the agentic approach makes our work much easier.",
    role: "CEO",
    company: "Gaming company, United Kingdom",
  },
];

const BTN_PRIMARY =
  "group inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-red-600 text-white rounded-full text-sm font-semibold shadow-lg shadow-red-600/25 hover:bg-red-700 hover:-translate-y-0.5 transition-all";
const BTN_PRIMARY_ON_DARK =
  "group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-stone-900 rounded-full text-sm font-semibold shadow-2xl shadow-black/40 hover:-translate-y-0.5 transition-all";

export default function Landing() {
  const [contactOpen, setContactOpen] = useState(false);
  const openContact = () => setContactOpen(true);

  return (
    <div className="relative bg-cream text-stone-900 font-[Inter,system-ui,sans-serif]">
      <Nav />
      {/* ================= Hero ================= */}
      <section className="relative overflow-hidden min-h-[calc(100dvh-3.5rem)] flex items-center">
        <div className="relative max-w-6xl mx-auto px-6 pt-10 pb-14 w-full">
          <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-12 lg:gap-10 items-center">
            <div className="min-w-0 text-center lg:text-left animate-fade-up">
              <Eyebrow>Brand protection for in-house teams</Eyebrow>
              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-black tracking-[-0.035em] leading-[1.15] sm:leading-[1.05] text-stone-900 text-balance">
                Stop waiting for your next{" "}
                <span className="text-gradient-red">brand protection report.</span>
              </h1>
              <p className="mt-6 text-[0.95rem] sm:text-lg text-stone-500 leading-relaxed max-w-lg mx-auto lg:mx-0">
                See every copy of your products as it appears on 250+
                platforms. Change what you monitor whenever you want. Pay
                monthly, from $995.
              </p>
              <div className="mt-8 flex justify-center lg:justify-start">
                <button type="button" onClick={openContact} className={BTN_PRIMARY}>
                  Start a free pilot
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ================= Stats + platforms ================= */}
      <Reveal className="relative bg-cream-dark overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-12 sm:pt-16 sm:pb-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {STATS.map((s) => (
              <div key={s.value} className="text-center lg:text-left lg:border-l lg:border-stone-900/10 lg:pl-6 lg:first:border-l-0 lg:first:pl-0">
                <div className="text-[clamp(1.25rem,8.5vw,2.25rem)] sm:text-5xl lg:text-[3.5rem] font-black tracking-[-0.04em] leading-none text-gradient-red tabular-nums whitespace-nowrap">
                  {s.value}
                </div>
                <div className="mt-3 text-sm text-stone-500 leading-snug max-w-[14rem] mx-auto lg:mx-0">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 pt-10 sm:mt-16 sm:pt-12 border-t border-stone-900/10">
            <h2 className="text-center text-lg sm:text-xl font-bold tracking-tight text-stone-900">
              250+ platforms covered. Add any site you want.
            </h2>
            <PlatformMarquee />
          </div>
        </div>
      </Reveal>

      {/* ================= Why Unvelar ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-12 sm:py-20">
          <div className="text-center mb-12">
            <Eyebrow>Why Unvelar</Eyebrow>
            <h2 className="text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Less work for your team.{" "}
              <span className="text-gradient-red">More protection, worldwide.</span>
            </h2>
            <p className="mt-5 text-[0.9rem] sm:text-base text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
              We have invested heavily in the technology behind Unvelar, and in
              the product itself, so in-house teams get a better experience:
              less work, more protection worldwide, and a setup customised to
              their needs.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 sm:gap-5">
            <WhyCard
              visual={
                <div className="flex w-full max-w-[15rem] flex-col gap-2">
                  {["AI models", "Computer vision", "Pattern recognition"].map((t, i) => (
                    <div
                      key={t}
                      className="why-pill flex items-center gap-2.5 rounded-full border border-stone-200/80 bg-white px-3.5 py-2 text-[13px] font-semibold text-stone-700 shadow-sm"
                      style={{ marginLeft: `${i * 14}px`, "--i": i } as React.CSSProperties}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                      {t}
                    </div>
                  ))}
                </div>
              }
              title="Invested in the technology"
              description="Unvelar is built on the latest AI and computer vision models, and we have invested heavily in both the technology and the product itself."
            />
            <WhyCard
              visual={
                <div className="flex w-full max-w-[15rem] flex-col gap-2.5">
                  {["Patterns spotted", "Sellers linked", "Evidence collected"].map((t, i) => (
                    <div
                      key={t}
                      className={`why-row-${i} flex items-center gap-3 text-[13px] font-semibold text-stone-700`}
                    >
                      <span className="why-check flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
                      </span>
                      {t}
                    </div>
                  ))}
                </div>
              }
              title="Less work, more protection"
              description="The platform recognises patterns, finds the biggest sellers across different marketplaces and collects the evidence for takedowns and removals, so your team does less work and protection reaches more markets."
            />
            <WhyCard
              visual={
                <div className="flex w-full max-w-[17rem] items-start gap-2.5 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-sm">
                  <Search className="mt-0.5 hidden h-4 w-4 shrink-0 text-stone-400 min-[360px]:block" aria-hidden />
                  <span className="min-w-0 flex-1 text-left text-[12px] leading-snug text-stone-600">
                    <TypedQuery text={AI_QUERY} />
                  </span>
                  <span className="why-ai rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                    AI
                  </span>
                </div>
              }
              title="AI searches"
              description="Your team can run very specialised searches in their own words, from broad sweeps to precise queries. For example: “Find all potential counterfeits of product A on Amazon and Etsy in China priced below $25.”"
            />
          </div>
        </div>
      </Reveal>

      {/* ================= Contrast ================= */}
      <Reveal className="relative bg-cream-dark overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-5xl mx-auto px-6 py-12 sm:py-20">
          <h2 className="text-center text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Most brand protection happens{" "}
            <span className="text-gradient-red">out of sight.</span>
          </h2>

          <div className="mt-10 rounded-3xl bg-white border border-stone-200/80 card-elevated overflow-hidden">
            <div className="hidden sm:grid grid-cols-2 text-xs uppercase tracking-[0.2em] font-bold">
              <div className="px-8 py-3.5 text-stone-500 bg-stone-100">Usually</div>
              <div className="px-8 py-3.5 text-red-600 bg-red-50 border-l border-red-100">With Unvelar</div>
            </div>
            {CONTRAST_ROWS.map(([before, after]) => (
              <div key={after} className="grid sm:grid-cols-2 border-t border-stone-200/70 first:border-t-0 sm:first:border-t">
                <div className="px-6 sm:px-8 pt-4 pb-1.5 sm:py-4 sm:bg-stone-50 flex items-center gap-4 text-[15px] sm:text-[0.9rem] text-stone-600">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-stone-200 flex items-center justify-center">
                    <X className="w-3.5 h-3.5 text-stone-500" strokeWidth={2.5} aria-label="Usually" />
                  </span>
                  <span>{before}</span>
                </div>
                <div className="px-6 sm:px-8 pt-1 pb-4 sm:py-4 sm:border-l sm:border-red-100 sm:bg-red-50/30 flex items-center gap-4 text-[15px] sm:text-[0.9rem] font-semibold text-stone-900">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-red-600 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} aria-label="With Unvelar" />
                  </span>
                  <span>{after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ================= Go after the source ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
                Stop chasing listings.{" "}
                <span className="text-gradient-red">Find who's behind them.</span>
              </h2>
              <p className="mt-5 text-[0.9rem] sm:text-base text-stone-500 leading-relaxed max-w-lg">
                Take down one listing and the same seller is back tomorrow
                under a new name. Unvelar shows you who's really running them.
              </p>
              <ul className="mt-7 space-y-3.5">
                {SOURCE_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-red-600" aria-hidden />
                    <span className="text-sm sm:text-[15px] text-stone-700 leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <SellerNetworkIllustration />
          </div>
        </div>
      </Reveal>

      {/* ================= How it works (dark) ================= */}
      <Reveal
        id="how-it-works"
        className="relative bg-stone-950 text-white scroll-mt-16 overflow-hidden rounded-t-[2.5rem]"
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow w-[600px] h-[600px] -top-40 -left-40 bg-red-600/15" />
          <div className="ambient-glow w-[500px] h-[500px] top-1/3 -right-40 bg-amber-500/10" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-12 sm:py-20">
          <h2 className="text-center mb-14 text-[1.65rem] sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05]">
            How it <span className="text-gradient-cream">works</span>
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 gradient-border transition-all duration-300 ease-out hover:bg-white/[0.07] hover:shadow-2xl hover:shadow-red-900/30 motion-safe:hover:-translate-y-2"
              >
                <StepHeader label={s.label} icon={s.icon} />
                <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">{s.title}</h3>
                <p className="text-[13px] sm:text-sm text-white/55 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ================= Customer quotes ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-12 sm:py-20">
          <h2 className="text-center mb-10 text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05]">
            What companies <span className="text-gradient-red">say about us</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
            {QUOTES.map((q) => (
              <figure
                key={q.company}
                className="relative flex flex-col bg-white rounded-2xl sm:rounded-3xl border border-stone-200/80 p-5 sm:p-6 card-elevated"
              >
                <span className="text-4xl font-black leading-none text-gradient-red select-none" aria-hidden>
                  “
                </span>
                <blockquote className="mt-1 flex-1 text-[15px] sm:text-[0.9rem] text-stone-700 leading-relaxed">
                  {q.quote}
                </blockquote>
                <figcaption className="mt-4 pt-3.5 border-t border-stone-100">
                  <div className="text-sm font-bold text-stone-900">{q.role}</div>
                  <div className="text-sm text-stone-500">{q.company}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ================= Pricing ================= */}
      <Reveal className="relative bg-cream-dark overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-4xl mx-auto px-6 py-12 sm:py-20 text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Pricing <span className="text-gradient-red">you can see,</span> too.
          </h2>

          <div className="mt-8 mx-auto max-w-md rounded-3xl bg-white border border-stone-200/80 card-elevated p-5 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">From</div>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-[2.4rem] sm:text-6xl font-black tracking-[-0.04em] text-stone-900">$995</span>
              <span className="text-base font-semibold text-stone-500">/month</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-700">
              Monthly billing. No annual contract.
            </p>
            <div className="my-5 h-px bg-stone-100" />
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">What's included</div>
            <ul className="mt-2.5 space-y-1 text-[13px] leading-snug text-stone-400">
              {INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="my-5 h-px bg-stone-100" />
            <p className="text-sm text-stone-500 leading-relaxed">
              Start with a free pilot on your own products. No commitment.
            </p>
            <button type="button" onClick={openContact} className={`${BTN_PRIMARY} mt-5 w-full`}>
              Start a free pilot
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </div>
        </div>
      </Reveal>

      {/* ================= Who it's for ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-12 sm:py-20">
          <div className="text-center mb-12">
            <Eyebrow>Who it's for</Eyebrow>
            <h2 className="text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Built for the teams{" "}
              <span className="text-gradient-red">that protect brands.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
            <WhyCard
              visual={
                <div className="w-full max-w-[19rem] rounded-xl border border-stone-200/80 bg-white/80 p-[7px] shadow-sm">
                  <div className="mb-[6px] flex items-center justify-between px-[2px]">
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400">
                      Portfolio
                    </span>
                    <div className="flex -space-x-[6px]">
                      {TEAM.map((m, i) => (
                        <span
                          key={m.initial}
                          className={`why-who-${i} flex h-[20px] w-[20px] items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white ${m.bg}`}
                        >
                          {m.initial}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-[6px]">
                    {PORTFOLIO.map((item, i) => (
                      <div
                        key={item}
                        className="flex items-center gap-[6px] rounded-lg border border-stone-200/80 bg-white px-[7px] py-[5px]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-stone-700">{item}</span>
                        <span className="relative h-[18px] w-[60px] shrink-0">
                          <span
                            className={`why-st-a-${i} absolute inset-0 flex items-center justify-center gap-[4px] rounded-full bg-stone-100 text-[8.5px] font-bold text-stone-500 opacity-0`}
                          >
                            <span className="h-[5px] w-[5px] rounded-full bg-stone-400 motion-safe:animate-pulse" />
                            Monitoring
                          </span>
                          <span
                            className={`why-st-b-${i} absolute inset-0 flex items-center justify-center rounded-full bg-red-600 text-[8.5px] font-bold text-white`}
                          >
                            Takedown
                          </span>
                        </span>
                        <span
                          className={`why-av-${i} flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${TEAM[i].bg}`}
                        >
                          {TEAM[i].initial}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              }
              title="In-house legal, IP and brand teams"
              description="Cover your whole portfolio (trademarks, copyright and registered designs) across marketplaces, social platforms and the open web. One queue, with the evidence already gathered."
            />
            <WhyCard
              visual={
                <div className="flex w-full max-w-[16rem] flex-col items-center">
                  <div className="why-firm rounded-full bg-stone-900 px-4 py-1.5 text-[12px] font-semibold text-white shadow-sm">
                    Your firm
                  </div>
                  <div className="h-4 w-px bg-stone-300" />
                  <div className="h-px w-[72%] bg-stone-300" />
                  <div className="flex w-full justify-between">
                    {["Client A", "Client B", "Client C"].map((c, i) => (
                      <div key={c} className="flex flex-col items-center">
                        <div className="h-3 w-px bg-stone-300" />
                        <div className="relative rounded-full border border-stone-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 shadow-sm">
                          {c}
                          <span
                            className={`why-badge-${i} absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 shadow-sm`}
                          >
                            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} aria-hidden />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              }
              title="Law firms"
              description="Protecting brands on behalf of clients? We work with firms on referral and white label partnerships."
            />
          </div>
        </div>
      </Reveal>

      {/* ================= FAQ ================= */}
      <Reveal id="faq" className="relative bg-cream-dark scroll-mt-16 overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-3xl mx-auto px-6 py-12 sm:py-20">
          <h2 className="text-center mb-12 text-[1.65rem] sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Frequently asked <span className="text-gradient-red">questions</span>
          </h2>
          <FaqTabs />
        </div>
      </Reveal>

      {/* ================= CTA ================= */}
      <Reveal className="relative bg-stone-950 text-white overflow-hidden rounded-t-[2.5rem]">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600/15" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 py-12 sm:py-20 text-center">
          <h2 className="text-[1.65rem] sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05] text-balance">
            See what's out there{" "}
            <span className="text-gradient-cream">on your brand.</span>
          </h2>
          <p className="mt-5 text-[0.9rem] sm:text-base text-white/55 max-w-lg mx-auto text-balance leading-relaxed">
            Tell us what you want protected. We'll run a free pilot and show
            you what we find.
          </p>
          <div className="mt-10 flex justify-center">
            <button type="button" onClick={openContact} className={BTN_PRIMARY_ON_DARK}>
              Start a free pilot
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </div>
        </div>
      </Reveal>

      {/* ================= Footer ================= */}
      <footer className="bg-cream border-t border-stone-200 pt-10 pb-6">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap justify-between gap-x-12 gap-y-6">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] uppercase text-stone-400 mb-3">
                Company
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900 mb-1">Address</div>
                <div className="text-sm text-stone-500 leading-relaxed">
                  2261 Market Street
                  <br />
                  San Francisco, CA 94114
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] uppercase text-stone-400 mb-3">
                Contact
              </div>
              <div className="mb-4">
                <div className="text-sm font-semibold text-stone-900 mb-1">Email address</div>
                <a
                  href="mailto:contact@unvelar.com"
                  className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
                >
                  contact@unvelar.com
                </a>
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900 mb-1">Social media</div>
                <a
                  href="https://www.linkedin.com/company/unvelar/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
                >
                  LinkedIn
                </a>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors">
                Unvelar
              </span>
            </Link>
            <span className="text-xs text-stone-400 tabular-nums">
              © {new Date().getFullYear()} Unvelar
            </span>
          </div>
        </div>
      </footer>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </div>
  );
}

/* ---------- Typing animation for the AI searches card ---------- */
const AI_QUERY =
  "Find all potential counterfeits of product A on Amazon and Etsy in China priced below $25";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function TypedQuery({ text }: { text: string }) {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? text.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let typed = 0;
    let hold = 0;
    const id = window.setInterval(() => {
      if (typed < text.length) {
        typed += 1;
        setCount(typed);
      } else if (hold < 55) {
        hold += 1;
      } else {
        typed = 0;
        hold = 0;
        setCount(0);
      }
    }, 45);
    return () => window.clearInterval(id);
  }, [text]);

  return (
    <span className="relative block">
      <span className="invisible">{text}</span>
      <span className="absolute inset-0">
        {text.slice(0, count)}
        <span className="ml-px inline-block h-3 w-px translate-y-0.5 bg-stone-500 motion-safe:animate-pulse" />
      </span>
    </span>
  );
}

/* ---------- "Who it's for" in-house card data ---------- */
const TEAM = [
  { initial: "L", bg: "bg-stone-900" },
  { initial: "I", bg: "bg-red-600" },
  { initial: "B", bg: "bg-stone-500" },
];
const PORTFOLIO = ["Trademark", "Copyright", "Design"];

/* ---------- Why Unvelar card ---------- */
function WhyCard({
  visual,
  title,
  description,
}: {
  visual: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-3 card-elevated card-elevated-hover transition-all">
      <div
        className="relative flex h-36 sm:h-44 items-center justify-center overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-stone-50 to-cream-dark px-3 sm:px-5"
        aria-hidden
      >
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
        <div className="relative flex w-full justify-center">{visual}</div>
      </div>
      <div className="px-3 pb-3 pt-6">
        <h3 className="mb-2 text-base font-bold tracking-tight text-stone-900 sm:text-lg">{title}</h3>
        <p className="text-sm leading-relaxed text-stone-500">{description}</p>
      </div>
    </div>
  );
}

/* ---------- FAQ tabs ---------- */
function FaqTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const group = FAQ_GROUPS[active];

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = FAQ_GROUPS.length - 1;
    let next = -1;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next >= 0) {
      e.preventDefault();
      setActive(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="FAQ topics" className="mb-8 flex flex-wrap justify-center gap-2">
        {FAQ_GROUPS.map((g, i) => (
          <button
            key={g.tab}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`faq-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls="faq-panel"
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 sm:text-sm ${
              i === active
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200/80 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
            }`}
          >
            {g.tab}
          </button>
        ))}
      </div>
      <div
        key={active}
        id="faq-panel"
        role="tabpanel"
        aria-labelledby={`faq-tab-${active}`}
        className="space-y-3 animate-fade-up"
      >
        {group.entries.map((entry, ei) => (
          <FaqItem key={entry.question} question={entry.question} answer={entry.answer} defaultOpen={ei === 0} />
        ))}
      </div>
    </div>
  );
}

/* ---------- FAQ accordion item ---------- */
function FaqItem({
  question,
  answer,
  defaultOpen,
}: {
  question: string;
  answer: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group bg-white rounded-2xl border border-stone-200/80 card-elevated"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 text-left text-[15px] sm:text-base font-bold text-stone-900 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 rounded-2xl">
        <span>{question}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-stone-400 transition-transform duration-300 group-open:rotate-180 group-open:text-red-600"
          aria-hidden
        />
      </summary>
      <p className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-1 text-sm sm:text-[15px] text-stone-500 leading-relaxed">
        {answer}
      </p>
    </details>
  );
}

/* ---------- Section eyebrow pill ---------- */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 whitespace-nowrap bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[clamp(7px,calc((100vw_-_5rem_-_8px)_/_25.1),11px)] sm:text-[11px] font-semibold tracking-[0.1em] sm:tracking-[0.2em] uppercase px-3 sm:px-3.5 py-1.5 rounded-full mb-5">
      <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse-dot" />
      {children}
    </div>
  );
}

/* ---------- Auto-scrolling platform strip ---------- */
function PlatformMarquee() {
  const items = [...PLATFORMS, { name: "and more", path: undefined }];
  return (
    <div className="marquee mt-8">
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <ul key={copy} className="marquee-group" aria-hidden={copy === 1 ? true : undefined}>
            {items.map((p) => (
              <li
                key={p.name}
                className={`flex items-center gap-2 whitespace-nowrap ${
                  p.name === "and more"
                    ? "text-stone-400 italic font-medium"
                    : "text-stone-500 font-semibold"
                }`}
              >
                {p.path && (
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current shrink-0" aria-hidden>
                    <path d={p.path} />
                  </svg>
                )}
                <span className="text-[15px] tracking-tight">{p.name}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/* ---------- Seller network illustration ---------- */
// Illustrative UI only, not customer data.
const NETWORK_ROWS = [
  { name: "Seller A", stores: 6, listings: 412, exposure: 384986, share: 100 },
  { name: "Seller B", stores: 4, listings: 268, exposure: 250429, share: 65 },
  { name: "Seller C", stores: 3, listings: 141, exposure: 131755, share: 34 },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

// Position in a repeating loop, 0 to 1. Reduced motion gets no loop.
function useLoop(periodMs: number) {
  const [reduced] = useState(prefersReducedMotion);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const id = window.setInterval(() => setT(((performance.now() - start) % periodMs) / periodMs), 50);
    return () => window.clearInterval(id);
  }, [reduced, periodMs]);
  return { t, reduced };
}

// Keeps the final text's width reserved so a counting number never changes the layout.
function Stable({ final, right, children }: { final: string; right?: boolean; children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="invisible">{final}</span>
      <span className={`absolute top-0 ${right ? "right-0" : "left-0"}`}>{children}</span>
    </span>
  );
}

function SellerNetworkIllustration() {
  const { t, reduced } = useLoop(7000);
  const fadeOut = reduced ? 0 : clamp01((t - 0.88) / 0.06);

  return (
    <div className="relative rounded-3xl bg-white border border-stone-200/80 card-elevated p-5 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-stone-900">Seller networks</div>
          <div className="text-xs text-stone-400">Ranked by exposure</div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {NETWORK_ROWS.map((r, i) => {
          const start = 0.05 + i * 0.14;
          const appear = reduced ? 1 : clamp01((t - start) / 0.05);
          const grow = reduced ? 1 : easeOut(clamp01((t - start - 0.03) / 0.3));
          const opacity = appear * (1 - fadeOut);
          return (
            <div
              key={r.name}
              className="rounded-2xl border border-stone-100 bg-stone-50/60 p-4"
              style={{ opacity, transform: `translateY(${(1 - appear) * 12}px)` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-stone-900 whitespace-nowrap">{r.name}</span>
                </div>
                <span className="text-sm font-bold text-stone-900 tabular-nums">
                  <Stable final={`$${r.exposure.toLocaleString("en-US")} Exposure`} right>
                    ${Math.round(r.exposure * grow).toLocaleString("en-US")} Exposure
                  </Stable>
                </span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-stone-200/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-700"
                  style={{ width: `${r.share * grow}%` }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 tabular-nums">
                <Stable final={`${r.stores} linked stores`}>{Math.round(r.stores * grow)} linked stores</Stable>
                <Stable final={`${r.listings} listings`}>{Math.round(r.listings * grow)} listings</Stable>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Contact modal ---------- */
const WEB3FORMS_ACCESS_KEY = "52023903-fa58-4db4-a792-9ccc83cc94a1";

function ContactModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: website ? `Free pilot request, ${website}` : "Free pilot request",
          from_name: "Unvelar website",
          email,
          website,
          message,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        setError("Something went wrong sending your message. Please try again.");
      }
    } catch {
      setError("Something went wrong sending your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl sm:rounded-3xl bg-white p-6 sm:p-8 shadow-2xl card-elevated animate-fade-up">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {sent ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 border border-red-200/70 flex items-center justify-center text-red-600 mb-4">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Message sent
            </h3>
            <p className="mt-2 text-sm text-stone-500 leading-relaxed">
              Thanks for reaching out. We'll get back to you shortly to set up
              your pilot.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex items-center justify-center px-6 py-2.5 bg-stone-900 text-white rounded-full text-sm font-semibold hover:bg-stone-800 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h3
              id="contact-modal-title"
              className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight"
            >
              Let's talk
            </h3>
            <p className="mt-2 text-sm text-stone-500 leading-relaxed">
              Tell us a bit about your brand. We'll be in touch to set up a
              free pilot.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-xs font-semibold text-stone-600 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-11 rounded-xl border border-stone-200 bg-cream/40 px-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-500/25 focus:border-red-300"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-website"
                  className="block text-xs font-semibold text-stone-600 mb-1.5"
                >
                  Company website
                </label>
                <input
                  id="contact-website"
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="yourcompany.com"
                  className="w-full h-11 rounded-xl border border-stone-200 bg-cream/40 px-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-500/25 focus:border-red-300"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-xs font-semibold text-stone-600 mb-1.5"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What do you want protected, and where are you seeing risk?"
                  rows={4}
                  className="w-full rounded-xl border border-stone-200 bg-cream/40 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-500/25 focus:border-red-300 resize-none"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-full bg-red-600 text-white text-sm font-semibold shadow-md shadow-red-600/20 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Sending..." : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Product dashboard mockup, scaled to fit its frame ---------- */
// The mockup's own page renders its dashboard card at a fixed 900x675
// "viewport" with the card centered horizontally (40px each side) but not
// vertically (56px top, ~129px bottom). We crop to a window that adds the
// same 40px margin on all four sides of the card instead, so the frame
// reads as evenly padded rather than bottom-heavy.
const MOCKUP_NATURAL_WIDTH = 900;
const MOCKUP_FULL_HEIGHT = 675;
const MOCKUP_MARGIN = 40;
const MOCKUP_CARD_TOP = 56;
const MOCKUP_CARD_BOTTOM = 544.2;
const MOCKUP_CROP_TOP = MOCKUP_CARD_TOP - MOCKUP_MARGIN;
const MOCKUP_CROP_HEIGHT = MOCKUP_CARD_BOTTOM + MOCKUP_MARGIN - MOCKUP_CROP_TOP;

function DashboardMockup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / MOCKUP_NATURAL_WIDTH);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden card-elevated border border-stone-900/5 bg-cream"
        style={{ aspectRatio: `${MOCKUP_NATURAL_WIDTH} / ${MOCKUP_CROP_HEIGHT}` }}
      >
        {scale > 0 && (
          <iframe
            src={`${import.meta.env.BASE_URL}dashboard-mockup.html`}
            title="Unvelar product dashboard preview"
            className="absolute left-0 border-0 origin-top-left pointer-events-none"
            style={{
              width: MOCKUP_NATURAL_WIDTH,
              height: MOCKUP_FULL_HEIGHT,
              top: -MOCKUP_CROP_TOP * scale,
              transform: `scale(${scale})`,
            }}
            loading="lazy"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-cream pointer-events-none" />
      </div>
    </div>
  );
}

/* ---------- Step header (dark) ---------- */
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

/* ---------- Shared icon set ---------- */
const ICONS: Record<string, string> = {
  radar:
    "M12 12l6-3M12 21a9 9 0 110-18 9 9 0 010 18z M12 12a4 4 0 104 4",
  shield: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z",
  scan: "M4 4h4m8 0h4v4m0 8v4h-4M8 20H4v-4M9 12h6",
  brain:
    "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
};
