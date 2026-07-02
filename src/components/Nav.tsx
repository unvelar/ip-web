import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandMark from "./BrandMark";

/**
 * Marketing-page navigation bar. Only rendered by `Landing.tsx` — the
 * signed-in shell has its own sidebar in `AppShell.tsx`.
 */
export default function Nav() {
  const { user } = useAuth();
  return (
    <nav className="sticky top-0 z-50 bg-cream/80 backdrop-blur-md border-b border-stone-200/60">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="h-8 w-8 shrink-0" />
          <span className="text-sm font-bold tracking-tight text-stone-900">Unvelar</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <Link
              to="/dashboard"
              className="px-4 py-1.5 bg-stone-900 text-white text-sm font-semibold rounded-full hover:bg-stone-800 transition-colors"
            >
              Client portal
            </Link>
          ) : (
            // Sign in intentionally not surfaced — the portal is invite-only for
            // the current demo phase. /login still works as a direct URL.
            <Link
              to="/monitor/start"
              className="px-4 py-1.5 bg-stone-900 text-white text-sm font-semibold rounded-full hover:bg-stone-800 transition-colors"
            >
              Start scan
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
