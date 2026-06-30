import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Check, ImagePlus, Loader2, Mail, ShieldCheck } from "lucide-react";
import BrandMark from "../components/BrandMark";
import {
  startPublicIntakeEmail,
  submitPublicIpIntake,
  verifyPublicIntakeEmail,
  type PublicIntakeEmailStart,
} from "../api";

type Step = "details" | "email" | "code" | "done";
type PublicIntakeLocationState = {
  productName?: string;
};

export default function PublicIntake() {
  const { state } = useLocation();
  const initialProductName = (state as PublicIntakeLocationState | null)?.productName ?? "";
  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState("");
  const [verification, setVerification] = useState<PublicIntakeEmailStart | null>(null);
  const [code, setCode] = useState("");

  const [productName, setProductName] = useState(initialProductName);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [dragActive, setDragActive] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intakeId, setIntakeId] = useState("");

  function handleDetailsContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!productName.trim() || files.length === 0) return;
    setError("");
    setStep("email");
  }

  async function handleStartEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await startPublicIntakeEmail(email.trim());
      setVerification(res);
      setEmail(res.email);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!verification || code.trim().length !== 6 || !productName.trim() || files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await verifyPublicIntakeEmail(verification.verification_id, code.trim());
      const submitRes = await submitPublicIpIntake({
        verification_id: verification.verification_id,
        verification_token: res.verification_token,
        product_name: productName.trim(),
        images: files,
      });
      setIntakeId(submitRes.intake_id);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleFiles(next: FileList | File[] | null) {
    if (!next) return;
    const incoming = Array.from(next).filter((file) => !file.type || file.type.startsWith("image/"));
    setFiles((current) => {
      const merged = [...current];
      const seen = new Set(current.map(fileKey));
      for (const file of incoming) {
        const key = fileKey(file);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(file);
        if (merged.length >= 5) break;
      }
      return merged;
    });
  }

  function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      for (const item of next) URL.revokeObjectURL(item.url);
    };
  }, [files]);

  return (
    <div className="min-h-screen bg-cream text-stone-950">
      <header className="border-b border-stone-200/70 bg-cream/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold">
            <BrandMark className="h-7 w-7" />
            Unvelar
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900">
            <ArrowLeft size={14} />
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10 lg:py-16">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr] gap-8 lg:gap-12 items-start">
          <aside className="space-y-5">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-bold text-red-700">
              <ShieldCheck size={14} />
              IP monitoring intake
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
              See where your IP is being copied.
            </h1>
            <p className="text-sm sm:text-base text-stone-600 leading-7 max-w-md">
              Submit the property you want watched and a few reference images. We'll ask for a company email after that.
            </p>
            <StepRail current={step} />
          </aside>

          <section className="bg-white border border-stone-200 rounded-lg shadow-sm shadow-stone-200/60">
            {error && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {step === "email" && (
              <form onSubmit={handleStartEmail} className="p-5 sm:p-7 space-y-5">
                <FormHeader icon={<Mail size={18} />} title="Work email" />
                <label className="block">
                  <span className="block text-xs font-bold text-stone-500 mb-1.5">Company email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full h-11 px-3 rounded-md border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    autoFocus
                  />
                </label>
                <div className="flex items-center gap-2">
                  <SecondaryButton type="button" onClick={() => setStep("details")}>
                    Back
                  </SecondaryButton>
                  <PrimaryButton disabled={busy || !email.trim()}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                    Send code
                  </PrimaryButton>
                </div>
              </form>
            )}

            {step === "code" && verification && (
              <form onSubmit={handleVerifyCode} className="p-5 sm:p-7 space-y-5">
                <FormHeader icon={<Mail size={18} />} title="Verification code" />
                <div className="rounded-md bg-stone-50 border border-stone-200 px-3 py-2 text-sm text-stone-600">
                  {verification.email}
                  {verification.debug_code && (
                    <span className="ml-2 text-xs font-bold text-red-700">
                      {verification.debug_code}
                    </span>
                  )}
                </div>
                <label className="block">
                  <span className="block text-xs font-bold text-stone-500 mb-1.5">Code</span>
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full h-12 px-3 rounded-md border border-stone-200 text-center text-xl font-black tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    autoFocus
                  />
                </label>
                <div className="flex items-center gap-2">
                  <SecondaryButton type="button" onClick={() => setStep("email")}>
                    Change email
                  </SecondaryButton>
                  <PrimaryButton disabled={busy || code.length !== 6}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Verify & submit
                  </PrimaryButton>
                </div>
              </form>
            )}

            {step === "details" && (
              <form onSubmit={handleDetailsContinue} className="p-5 sm:p-7 space-y-5">
                <FormHeader icon={<ImagePlus size={18} />} title="Product references" />
                <label className="block">
                  <span className="block text-xs font-bold text-stone-500 mb-1.5">Product or IP</span>
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Character, brand, artwork"
                    className="w-full h-11 px-3 rounded-md border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    autoFocus
                  />
                </label>
                <div className="block">
                  <span className="block text-xs font-bold text-stone-500 mb-1.5">Reference images</span>
                  <p className="mb-2 text-xs leading-5 text-stone-500">
                    Add different variations of the same IP, such as angles, poses, packaging, or product shots. More varied references help us match copies more accurately.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    className="sr-only"
                    id="public-intake-images"
                  />
                  <label
                    htmlFor="public-intake-images"
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                    }}
                    onDrop={handleDrop}
                    className={[
                      "min-h-28 rounded-md border border-dashed transition-colors cursor-pointer flex items-center justify-center text-sm font-semibold",
                      dragActive
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-600",
                    ].join(" ")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ImagePlus size={18} />
                      {dragActive ? "Drop images" : "Add varied images"}
                    </span>
                  </label>
                </div>
                {previews.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {previews.map(({ file, url }) => (
                      <div key={`${file.name}-${file.size}`} className="aspect-square rounded-md overflow-hidden border border-stone-200 bg-stone-100">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                <PrimaryButton disabled={!productName.trim() || files.length === 0}>
                  <ShieldCheck size={16} />
                  Continue
                </PrimaryButton>
              </form>
            )}

            {step === "done" && (
              <div className="p-7 sm:p-10 text-center space-y-5">
                <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Check size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Request received</h2>
                  <p className="mt-2 text-sm text-stone-500">
                    We'll review the references and email you with the next steps.
                  </p>
                  {intakeId && (
                    <p className="mt-3 text-[11px] font-mono text-stone-400">{intakeId}</p>
                  )}
                </div>
                <Link
                  to="/"
                  className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800"
                >
                  Done
                </Link>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function FormHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-black text-stone-900">
      <span className="h-8 w-8 rounded-md bg-red-50 text-red-700 flex items-center justify-center">
        {icon}
      </span>
      {title}
    </div>
  );
}

function PrimaryButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-stone-200 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-50"
    />
  );
}

function StepRail({ current }: { current: Step }) {
  const steps = [
    ["details", "Reference images"],
    ["email", "Company email"],
    ["code", "Verification"],
  ] as const;
  const index = steps.findIndex(([key]) => key === current);
  return (
    <div className="space-y-2 pt-2">
      {steps.map(([key, label], i) => {
        const active = key === current;
        const done = current === "done" || i < index;
        return (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span
              className={[
                "h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black",
                done ? "bg-emerald-600 text-white" : active ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-500",
              ].join(" ")}
            >
              {done ? <Check size={13} /> : i + 1}
            </span>
            <span className={active ? "font-bold text-stone-900" : "text-stone-500"}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
