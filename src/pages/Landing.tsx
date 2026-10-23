import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";
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
              <p className="mt-6 text-base sm:text-lg text-stone-500 leading-relaxed max-w-lg mx-auto lg:mx-0">
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
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-16">
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

          <div className="mt-16 pt-12 border-t border-stone-900/10">
            <h2 className="text-center text-lg sm:text-xl font-bold tracking-tight text-stone-900">
              250+ platforms covered. Add any site you want.
            </h2>
            <PlatformMarquee />
          </div>
        </div>
      </Reveal>

      {/* ================= Contrast ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-center text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Most brand protection happens{" "}
            <span className="text-gradient-red">out of sight.</span>
          </h2>

          <div className="mt-12 rounded-3xl bg-white border border-stone-200/80 card-elevated overflow-hidden">
            <div className="hidden sm:grid grid-cols-2 text-xs uppercase tracking-[0.2em] font-bold">
              <div className="px-8 py-5 text-stone-500 bg-stone-100">Usually</div>
              <div className="px-8 py-5 text-red-600 bg-red-50 border-l border-red-100">With Unvelar</div>
            </div>
            {CONTRAST_ROWS.map(([before, after]) => (
              <div key={after} className="grid sm:grid-cols-2 border-t border-stone-200/70 first:border-t-0 sm:first:border-t">
                <div className="px-6 sm:px-8 pt-5 pb-2 sm:py-6 sm:bg-stone-50 flex items-center gap-4 text-[15px] sm:text-base text-stone-600">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-stone-200 flex items-center justify-center">
                    <X className="w-3.5 h-3.5 text-stone-500" strokeWidth={2.5} aria-label="Usually" />
                  </span>
                  <span>{before}</span>
                </div>
                <div className="px-6 sm:px-8 pt-1 pb-5 sm:py-6 sm:border-l sm:border-red-100 sm:bg-red-50/30 flex items-center gap-4 text-[15px] sm:text-base font-semibold text-stone-900">
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
      <Reveal className="relative bg-cream-dark overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
                Stop chasing listings.{" "}
                <span className="text-gradient-red">Find who's behind them.</span>
              </h2>
              <p className="mt-5 text-stone-500 leading-relaxed max-w-lg">
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
              <p className="mt-8 text-lg sm:text-xl font-bold tracking-tight text-stone-900 text-balance">
                Spend your budget on the 20 sellers that matter, not the 2,000
                listings they run.
              </p>
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

        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-center mb-14 text-3xl sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05]">
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
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-center mb-12 text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05]">
            What companies <span className="text-gradient-red">say about us</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
            {QUOTES.map((q) => (
              <figure
                key={q.company}
                className="relative flex flex-col bg-white rounded-2xl sm:rounded-3xl border border-stone-200/80 p-6 sm:p-8 card-elevated"
              >
                <span className="text-5xl font-black leading-none text-gradient-red select-none" aria-hidden>
                  “
                </span>
                <blockquote className="mt-1 flex-1 text-[15px] sm:text-base text-stone-700 leading-relaxed">
                  {q.quote}
                </blockquote>
                <figcaption className="mt-6 pt-5 border-t border-stone-100">
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
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Pricing <span className="text-gradient-red">you can see,</span> too.
          </h2>

          <div className="mt-10 mx-auto max-w-md rounded-3xl bg-white border border-stone-200/80 card-elevated p-5 sm:p-10">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">From</div>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-[2.4rem] sm:text-6xl font-black tracking-[-0.04em] text-stone-900">$995</span>
              <span className="text-base font-semibold text-stone-500">/month</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-700">
              Monthly billing. No annual contract.
            </p>
            <div className="my-7 h-px bg-stone-100" />
            <p className="text-sm text-stone-500 leading-relaxed">
              Start with a free pilot on your own products. No commitment.
            </p>
            <button type="button" onClick={openContact} className={`${BTN_PRIMARY} mt-6 w-full`}>
              Start a free pilot
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </div>
        </div>
      </Reveal>

      {/* ================= FAQ ================= */}
      <Reveal id="faq" className="relative bg-cream scroll-mt-16 overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-center mb-12 text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Frequently asked <span className="text-gradient-red">questions</span>
          </h2>
          <div className="space-y-10">
            {FAQ_GROUPS.map((group, gi) => (
              <div key={group.title}>
                <h3 className="mb-3.5 px-1 flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />
                  {group.title}
                </h3>
                <div className="space-y-3">
                  {group.entries.map((entry, ei) => (
                    <FaqItem
                      key={entry.question}
                      question={entry.question}
                      answer={entry.answer}
                      defaultOpen={gi === 0 && ei === 0}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ================= Who it's for ================= */}
      <Reveal className="relative bg-cream-dark overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <Eyebrow>Who it's for</Eyebrow>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Built for the teams{" "}
              <span className="text-gradient-red">that protect brands.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <UseCaseCard
              icon="registry"
              title="In-house legal, IP and brand teams"
              description="Cover your whole portfolio (trademarks, copyright and registered designs) across marketplaces, social platforms and the open web. One queue, with the evidence already gathered."
            />
            <UseCaseCard
              icon="megaphone"
              title="Law firms"
              description="Protecting brands on behalf of clients? We work with firms on referral and white label partnerships."
            />
          </div>
        </div>
      </Reveal>

      {/* ================= CTA ================= */}
      <Reveal className="relative bg-stone-950 text-white overflow-hidden rounded-t-[2.5rem]">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600/15" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05] text-balance">
            See what's out there{" "}
            <span className="text-gradient-cream">on your brand.</span>
          </h2>
          <p className="mt-5 text-white/55 max-w-lg mx-auto text-balance leading-relaxed">
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
    <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
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
  { name: "Seller A", stores: 6, listings: 412, exposure: "$384,986", share: 100 },
  { name: "Seller B", stores: 4, listings: 268, exposure: "$250,429", share: 65 },
  { name: "Seller C", stores: 3, listings: 141, exposure: "$131,755", share: 34 },
];

function SellerNetworkIllustration() {
  return (
    <div className="relative rounded-3xl bg-white border border-stone-200/80 card-elevated p-5 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-stone-900">Seller networks</div>
          <div className="text-xs text-stone-400">Ranked by exposure</div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {NETWORK_ROWS.map((r, i) => (
          <div key={r.name} className="rounded-2xl border border-stone-100 bg-stone-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-stone-900 whitespace-nowrap">{r.name}</span>
              </div>
              <span className="text-sm font-bold text-stone-900 tabular-nums">{r.exposure} Exposure</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-stone-200/70 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-700" style={{ width: `${r.share}%` }} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
              <span>{r.stores} linked stores</span>
              <span>{r.listings} listings</span>
            </div>
          </div>
        ))}
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
  registry:
    "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z M8 8h8M8 12h8M8 16h5",
  megaphone:
    "M11 5L6 9H2v6h4l5 4V5z M15.54 8.46a5 5 0 010 7.07 M19.07 4.93a10 10 0 010 14.14",
};

/* ---------- Use case card ---------- */
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
    <div className="group relative bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-7 card-elevated card-elevated-hover transition-all overflow-hidden flex flex-col">
      <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl" />
      <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-stone-100 to-stone-50 border border-stone-200/60 flex items-center justify-center mb-5 group-hover:from-red-50 group-hover:to-orange-50 group-hover:border-red-200/60 transition-colors">
        <svg
          className="w-5 h-5 text-stone-500 group-hover:text-red-600 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
        </svg>
      </div>
      <h3 className="relative font-bold text-stone-900 text-base sm:text-lg mb-2 tracking-tight">
        {title}
      </h3>
      <p className="relative text-sm text-stone-500 leading-relaxed">{description}</p>
    </div>
  );
}
