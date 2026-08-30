import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandMark from "../components/BrandMark";
import { isLocalApiTarget } from "../lib/apiEnvironment";
import { LocalAdminLogin } from "../features/auth/LocalAdminLogin";

export default function Login() {
  const { user, signIn, devSignIn } = useAuth();
  const navigate = useNavigate();
  const devShortcutEnabled = import.meta.env.DEV && isLocalApiTarget(
    import.meta.env.VITE_API_URL,
    window.location.origin,
  );

  // If we're already signed in (e.g. landed here directly), bounce to the
  // client portal. Otherwise immediately hand off to WorkOS AuthKit so users
  // see the email / social sign-in options without an extra intermediary click.
  useEffect(() => {
    if (user) {
      navigate("/dashboard");
      return;
    }

    if (!devShortcutEnabled) signIn();
  }, [user, navigate, signIn, devShortcutEnabled]);

  if (devShortcutEnabled) {
    return (
      <LocalAdminLogin
        onWorkOsSignIn={() => signIn({ localAdmin: true })}
        onDevSignIn={devSignIn}
      />
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <BrandMark className="mx-auto h-24 w-auto" />
        <h1 className="text-2xl font-bold text-stone-900">Redirecting to sign in…</h1>
        <p className="mt-2 text-sm text-stone-500">
          Taking you to the secure sign-in page.
        </p>
      </div>
    </div>
  );
}
