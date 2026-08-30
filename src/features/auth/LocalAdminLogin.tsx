import { useState, type FormEvent } from "react";
import BrandMark from "../../components/BrandMark";

export function LocalAdminLogin({
  onWorkOsSignIn,
  onDevSignIn,
}: {
  onWorkOsSignIn: () => void;
  onDevSignIn: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("owner@example-store.test");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || busy) return;
    setBusy(true);
    setError("");
    try {
      await onDevSignIn(normalizedEmail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <form onSubmit={(event) => void handleSubmit(event)} className="w-full max-w-sm space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <BrandMark className="mx-auto h-20 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-stone-900">Local development</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">Sign in through WorkOS as a local admin, or use the local shortcut for faster testing.</p>
        </div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button type="button" onClick={onWorkOsSignIn} className="h-11 w-full rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">Continue with WorkOS</button>
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-stone-400"><span className="h-px flex-1 bg-stone-200" />Local shortcut<span className="h-px flex-1 bg-stone-200" /></div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-stone-500">Local admin email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border border-stone-200 px-3 text-sm focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
        </label>
        <button type="submit" disabled={!email.trim() || busy} className="h-11 w-full rounded-md bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-45">{busy ? "Signing in…" : "Continue as local admin"}</button>
      </form>
    </div>
  );
}
