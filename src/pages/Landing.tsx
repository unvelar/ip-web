import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";

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

export default function Landing() {
  const navigate = useNavigate();
  const [scanProduct, setScanProduct] = useState("");
  const [contactOpen, setContactOpen] = useState(false);

  function handleHeroScan(e: React.FormEvent) {
    e.preventDefault();
    const productName = scanProduct.trim();
    navigate("/monitor/start", { state: { productName } });
  }

  return (
    <div className="relative bg-cream text-stone-900 font-[Inter,system-ui,sans-serif]">
      <Nav />
      {/* ================= Hero ================= */}
      <section className="relative overflow-hidden min-h-[calc(100dvh-3.5rem)] flex items-center">
        <div className="relative max-w-6xl mx-auto px-6 pt-8 lg:pt-10 pb-10 w-full">
          <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-12 lg:gap-10 items-center lg:items-start">
            <div className="min-w-0 text-center lg:text-left animate-fade-up">
              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-black tracking-[-0.035em] leading-[1.15] sm:leading-[1.05] text-stone-900 text-balance">
                Stop{" "}
                <span className="text-gradient-red">infringement of your brand</span>
                , before it spreads
              </h1>
              <p className="mt-6 text-base text-stone-500 leading-relaxed max-w-md mx-auto lg:mx-0">
                Unvelar scans the web around the clock for counterfeits and
                brand misuse, and turns every match into a case ready to act
                on.
              </p>
              <form
                onSubmit={handleHeroScan}
                className="mt-6 mx-auto lg:mx-0 max-w-md rounded-2xl sm:rounded-full border border-stone-900/10 bg-white/90 sm:bg-white/75 backdrop-blur p-1.5 shadow-lg shadow-stone-900/10 flex items-center gap-1.5 sm:gap-2"
              >
                <Search className="sm:hidden ml-2 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                <input
                  value={scanProduct}
                  onChange={(e) => setScanProduct(e.target.value)}
                  placeholder="Enter a brand or IP"
                  aria-label="Enter a brand, product, or piece of IP"
                  className="sm:hidden min-w-0 flex-1 h-11 bg-transparent px-1 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Start scan"
                  className="sm:hidden h-11 w-11 shrink-0 rounded-xl bg-red-600 text-white shadow-md shadow-red-600/20 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 inline-flex items-center justify-center transition-colors"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <input
                  value={scanProduct}
                  onChange={(e) => setScanProduct(e.target.value)}
                  placeholder="Enter a brand, product, or piece of IP"
                  aria-label="Enter a brand, product, or piece of IP"
                  className="hidden sm:block min-w-0 flex-1 h-11 rounded-full bg-transparent px-4 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-500/25"
                />
                <button
                  type="submit"
                  className="hidden sm:inline-flex h-11 min-w-[5.25rem] rounded-full bg-stone-900 px-5 text-sm font-semibold text-white shadow-md shadow-stone-900/20 hover:bg-stone-800 items-center justify-center transition-colors"
                >
                  Scan
                </button>
              </form>
            </div>

            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ================= Two features ================= */}
      <Reveal
        id="features"
        className="relative bg-cream-dark scroll-mt-16 overflow-hidden rounded-t-[2.5rem]"
      >
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse-dot" />
              The platform
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Two ways to protect{" "}
              <span className="text-gradient-red">your brand</span>, one
              detection engine.
            </h2>
            <p className="mt-4 text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
              Unvelar's detection engine works two ways: watching for
              infringement that's already out there, and checking new work
              before it goes out the door.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            <FeatureCard
              icon="radar"
              title="Monitoring"
              tagline="Continuous monitoring & takedowns"
              description="Register the IP you own and tell us where to look. Unvelar scans marketplaces, social platforms, and the open web around the clock, and turns what it finds into cases your team can review and act on."
              mobileDescription="Scans marketplaces, social platforms, and the web, and turns hits into cases ready for review."
              points={[
                "Always-on scanning across marketplaces and platforms",
                "Every match arrives as a reviewed case, with the evidence attached",
                "Takedown notices ready to send, backed by the evidence behind them",
              ]}
            />
            <FeatureCard
              icon="shield"
              title="Clearance Review"
              tagline="Pre-release IP clearance"
              description="Before a new design, asset, or piece of creative work goes out, run it against Unvelar's library of more than 200,000 protected references, and get a clear answer on where the risk is and why."
              mobileDescription="Check new designs and assets against protected IP before they ship."
              points={[
                "Checked against a growing library of protected IP",
                "Similarity measured across several dimensions, not one score",
                "A plain result with the reasoning behind it, ready for legal review",
              ]}
            />
          </div>
        </div>
      </Reveal>

      {/* ================= Pricing ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
            <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse-dot" />
            Pricing
          </div>
          <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
            Full coverage,{" "}
            <span className="text-gradient-red">priced to make sense.</span>
          </h2>
          <p className="mt-5 text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
            Unvelar is priced well below what most teams expect to pay for
            comprehensive monitoring and clearance review. You get full
            coverage from day one, not a scaled-down plan trimmed to fit a
            budget.
          </p>
        </div>
      </Reveal>

      {/* ================= How monitoring works (dark) ================= */}
      <Reveal
        id="how-it-works"
        className="relative bg-stone-950 text-white scroll-mt-16 overflow-hidden rounded-t-[2.5rem]"
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="ambient-glow w-[600px] h-[600px] -top-40 -left-40 bg-red-600/15" />
          <div className="ambient-glow w-[500px] h-[500px] top-1/3 -right-40 bg-amber-500/10" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-sm text-white/60 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse-dot" />
              How monitoring works
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black tracking-[-0.03em] leading-[1.05] text-balance">
              Watch the web,{" "}
              <span className="text-gradient-cream">act on what you find.</span>
            </h2>
            <p className="mt-4 text-white/50 max-w-2xl mx-auto text-balance leading-relaxed">
              Set it up once. From there, Unvelar scans on a schedule, flags
              what matters, and gives your team everything it needs to
              enforce.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Step 1 — Watch */}
            <div className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 gradient-border">
              <StepHeader label="Step One" icon="radar" />
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">Watch</h3>
              <p className="text-[13px] sm:text-sm text-white/50 mb-4 leading-relaxed">
                Register the IP you own, along with the domains and platforms
                you want covered. Unvelar checks them on a set schedule, so
                nobody has to search by hand.
              </p>
              <div className="space-y-2.5">
                <FlowRow
                  icon="registry"
                  title="Register your IP"
                  description="Products, brands, and artwork, indexed for detection"
                />
                <FlowRow
                  icon="globe"
                  title="Choose what to watch"
                  description="Marketplaces, social platforms, and the open web"
                />
                <FlowRow
                  icon="clock"
                  title="Always-on scanning"
                  description="New listings get caught as they appear, not weeks later"
                />
              </div>
            </div>

            {/* Step 2 — Detect */}
            <div className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 gradient-border">
              <StepHeader label="Step Two" icon="scan" />
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">Detect</h3>
              <p className="text-[13px] sm:text-sm text-white/50 mb-4 leading-relaxed">
                Every asset we find is checked across four dimensions, each
                catching a different kind of similarity to what you've
                registered.
              </p>
              <div className="space-y-2.5">
                <FlowRow
                  icon="eye"
                  title="Visual Likeness"
                  description="Shapes, layout, and silhouette"
                />
                <FlowRow
                  icon="brain"
                  title="Concept & Style"
                  description="The same idea, even when it's redrawn or restyled"
                />
                <FlowRow
                  icon="scanline"
                  title="Pixel Comparison"
                  description="A direct check against the original reference"
                />
                <FlowRow
                  icon="type"
                  title="Wordmarks & Text"
                  description="Brand names, titles, and other text elements"
                />
              </div>
            </div>

            {/* Step 3 — Enforce */}
            <div className="relative isolate bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 gradient-border">
              <StepHeader label="Step Three" icon="shield" />
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">Enforce</h3>
              <p className="text-[13px] sm:text-sm text-white/50 mb-4 leading-relaxed">
                Likely infringements arrive as cases your team can review
                right away, with the match, the source, and the evidence
                already gathered.
              </p>
              <div className="space-y-2.5">
                <FlowRow
                  icon="inbox"
                  title="Reviewed cases"
                  description="With seller, listing, and evidence included"
                />
                <FlowRow
                  icon="megaphone"
                  title="Takedown notices ready to send"
                  description="With the proof attached"
                />
                <FlowRow
                  icon="check"
                  title="Track to resolution"
                  description="Dismissed, escalated, or resolved"
                />
                <FlowRow
                  icon="users"
                  title="Work cases as a team"
                  description="Assign, comment, and track status together in one shared queue"
                />
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ================= Use cases ================= */}
      <Reveal className="relative bg-cream-dark overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse-dot" />
              Who it's for
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Built for the teams{" "}
              <span className="text-gradient-red">that protect brands.</span>
            </h2>
            <p className="mt-4 text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
              You might be managing IP in-house, or protecting it on behalf of
              clients. Either way, Unvelar handles monitoring, evidence, and
              takedown prep from one place.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <UseCaseCard
              icon="registry"
              title="In-house legal & IP teams"
              description="Cover your whole portfolio, trademarks, copyrighted work, and registered designs, across marketplaces, social platforms, and the open web. Turn scattered infringement reports into a single queue, with the evidence already gathered."
            />
            <UseCaseCard
              icon="megaphone"
              title="Law firms"
              description="Run enforcement for every client from one dashboard. Continuous monitoring, evidence your client can rely on, and takedown notices ready to send, so your team spends time on strategy instead of searching marketplaces by hand."
            />
          </div>
        </div>
      </Reveal>

      {/* ================= Solutions ================= */}
      <Reveal className="relative bg-cream overflow-hidden rounded-t-[2.5rem]">
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-stone-900/5 border border-stone-900/10 text-stone-600 text-[11px] font-semibold tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full mb-5">
              <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse-dot" />
              How you can use it
            </div>
            <h2 className="text-3xl sm:text-[2.75rem] font-black text-stone-900 tracking-[-0.03em] leading-[1.05] text-balance">
              Fits how{" "}
              <span className="text-gradient-red">you already work.</span>
            </h2>
            <p className="mt-4 text-stone-500 max-w-2xl mx-auto text-balance leading-relaxed">
              Run it as your own platform, plug it into the systems you
              already have, or offer it to your clients under your own brand.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <UseCaseCard
              icon="layers"
              title="Full Platform"
              description="Monitoring, clearance review, and takedown prep in one dashboard, ready to use as it is."
            />
            <UseCaseCard
              icon="plug"
              title="API & Data Integration"
              description="Detections delivered straight into the systems you already run, filtered and scored, ready for your team to act on."
            />
            <UseCaseCard
              icon="tag"
              title="White Label"
              description="Run Unvelar under your own brand, configured separately for each client, so your team keeps the relationship."
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
            See it work on{" "}
            <span className="text-gradient-cream">your own brand.</span>
          </h2>
          <p className="mt-5 text-white/55 max-w-lg mx-auto text-balance leading-relaxed">
            Let's run a free pilot on your brand. Reach out and tell us what
            you want protected and where you're already seeing risk, we'll
            take it from there.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setContactOpen(true)}
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
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/5 border border-white/15 backdrop-blur-sm text-white/80 rounded-full text-sm font-semibold hover:bg-white/10 hover:border-white/25 transition-all"
            >
              How it works
            </a>
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

/* ---------- Feature pillar card ---------- */
function FeatureCard({
  tag,
  icon,
  title,
  tagline,
  description,
  mobileDescription,
  points,
}: {
  tag?: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  mobileDescription: string;
  points: string[];
}) {
  return (
    <div className="group relative bg-white rounded-2xl sm:rounded-3xl border border-stone-200/80 p-5 sm:p-8 card-elevated card-elevated-hover transition-all overflow-hidden">
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br from-red-100 to-orange-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl" />
      <div className="relative">
        <div className="hidden sm:flex items-center justify-between mb-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-stone-100 to-stone-50 border border-stone-200/60 flex items-center justify-center group-hover:from-red-50 group-hover:to-orange-50 group-hover:border-red-200/60 transition-colors">
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 text-stone-600 group-hover:text-red-600 transition-colors"
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
        <h3 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
          {title}
        </h3>
        <div className="hidden sm:block mt-1 text-xs font-semibold text-stone-400 uppercase tracking-[0.14em]">
          {tagline}
        </div>
        <p className="sm:hidden mt-3 text-[13px] text-stone-500 leading-[1.55]">
          {mobileDescription}
        </p>
        <p className="hidden sm:block mt-4 text-sm text-stone-500 leading-relaxed">
          {description}
        </p>
        <ul className="mt-5 sm:mt-6 space-y-2 sm:space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 sm:gap-2.5">
              <svg
                className="shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[13px] sm:text-sm text-stone-600 leading-snug">{p}</span>
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
        <div className="text-[13px] sm:text-sm font-semibold text-white/85">{title}</div>
        <div className="text-[11px] sm:text-xs text-white/45 mt-0.5 leading-relaxed">
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
  users:
    "M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M15.5 11a3 3 0 100-6 3 3 0 000 6z M2.5 19c.5-3.5 3-5.5 5.5-5.5s5 2 5.5 5.5 M14 14c2 .2 4 1.8 4.5 5",
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
  layers:
    "M12 3l8 4.5-8 4.5-8-4.5L12 3z M4 12l8 4.5 8-4.5 M4 16l8 4.5 8-4.5",
  plug:
    "M9 2v4M15 2v4M7 6h10v4a5 5 0 01-5 5 5 5 0 01-5-5V6z M12 15v3M9 21h6",
  tag:
    "M11 3h6a2 2 0 012 2v6a2 2 0 01-.6 1.4l-8 8a2 2 0 01-2.8 0l-6-6a2 2 0 010-2.8l8-8A2 2 0 0111 3z M15.5 8.5h.01",
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
      <h3 className="relative font-bold text-stone-900 text-sm sm:text-base mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="relative text-[11px] sm:text-xs text-stone-500 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
