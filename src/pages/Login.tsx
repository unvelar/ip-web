import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  // If we're already signed in (e.g. landed here directly), bounce to the
  // dashboard.
  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <svg width="42" height="27" viewBox="0 0 56 36" className="mx-auto mb-4">
            <path d="M2,10 L2,4 L8,4" stroke="#1c1917" strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round"/>
            <path d="M48,4 L54,4 L54,10" stroke="#1c1917" strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round"/>
            <path d="M2,26 L2,32 L8,32" stroke="#1c1917" strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round"/>
            <path d="M48,32 L54,32 L54,26" stroke="#b91c1c" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round"/>
            <rect x="8" y="8" width="8" height="20" rx="2" fill="#1c1917"/>
            <rect x="19" y="8" width="8" height="20" rx="2" fill="#1c1917"/>
            <rect x="30" y="8" width="8" height="20" rx="2" fill="#1c1917"/>
            <rect x="41" y="8" width="8" height="20" rx="2" fill="#b91c1c"/>
          </svg>
          <h1 className="text-2xl font-bold text-stone-900">Welcome</h1>
          <p className="mt-2 text-sm text-stone-500">
            Sign in to access your IP registry, cases and monitored sources.
          </p>
        </div>

        <button
          onClick={signIn}
          className="w-full px-4 py-3 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 transition-all"
        >
          Continue with WorkOS
        </button>

        <p className="text-center text-xs text-stone-400 leading-relaxed">
          Sign in with Google, Microsoft, or your company SSO.
          <br />
          Everyone with an email at the same domain shares the same workspace.
        </p>
      </div>
    </div>
  );
}
