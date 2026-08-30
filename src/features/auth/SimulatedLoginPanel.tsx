import { useState, type FormEvent } from "react";
import { ExternalLink, Loader2, LogIn } from "lucide-react";
import { isApiError, simulateSuccessfulLogin } from "../../api";
import { renderSimulationWindow } from "./simulationWindow";

export function SimulatedLoginPanel({
  onStarted,
  onError,
}: {
  onStarted: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || busy) return;

    const target = window.open("about:blank", "_blank");
    if (!target) {
      onError("Allow pop-ups for Unvelar to open the simulated login tab.");
      return;
    }
    target.opener = null;
    renderSimulationWindow(target, {
      title: "Preparing onboarding",
      message: `Signing in as ${normalizedEmail} and setting up the onboarding flow.`,
    });

    setBusy(true);
    onError("");
    try {
      const result = await simulateSuccessfulLogin(normalizedEmail);
      const launchUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
      launchUrl.searchParams.set("simulated_login", "1");
      launchUrl.searchParams.set("token", result.token);
      launchUrl.searchParams.set("next", result.start_path);
      target.location.replace(launchUrl.toString());
      setEmail(result.user.email);
      await onStarted();
    } catch (caught) {
      const sessionExpired = isApiError(caught, 401);
      renderSimulationWindow(target, {
        title: "Simulation could not start",
        message: sessionExpired
          ? "Your admin session is no longer valid. Sign in again in the admin tab, then retry."
          : "The simulated login could not be started. Return to the admin tab to review the error and retry.",
        error: true,
      });
      onError(sessionExpired
        ? "Your admin session expired. Reload this page and sign in again, then retry the simulation."
        : caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/40 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-100 bg-white text-red-700"><LogIn size={17} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-stone-900">Simulate successful login</h2>
          <p className="mt-1 text-xs leading-5 text-stone-600">Enter the email WorkOS would return after login. Unvelar applies the same email-domain tenant routing and opens onboarding signed in as that user. Your admin session stays active in this tab.</p>
          <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="demo@nike.com" className="h-10 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 text-sm focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
            <button type="submit" disabled={!email.trim() || busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-45">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />} Simulate login
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
