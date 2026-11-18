"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { DEMO_HOME_URL, DEMO_MODE, DEMO_ROLES, SUPABASE_AUTH_ENABLED } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";

const input =
  "mt-1.5 h-11 w-full rounded-lg border border-border bg-surface-2 px-3 outline-none focus:border-brand";

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Only allow same-site paths, never an absolute URL (open-redirect guard).
  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signedIn") router.replace(next);
  }, [auth.status, router, next]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Staff sign in</h1>
      <p className="mt-1 text-muted">Kitchen display and restaurant dashboard.</p>

      {SUPABASE_AUTH_ENABLED && (
        <form onSubmit={signIn} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
          <button
            disabled={busy}
            className="h-11 w-full rounded-lg bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}

      {DEMO_MODE && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Demo: open a role in one click</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(DEMO_ROLES).map(([key, r]) => (
              <Link
                key={key}
                href={`/demo/${key}`}
                className="flex h-10 items-center justify-center rounded-lg border border-border text-sm font-medium hover:border-brand"
              >
                {r.label}
              </Link>
            ))}
          </div>
          {DEMO_HOME_URL && (
            <a href={DEMO_HOME_URL} className="mt-3 block text-center text-sm text-muted underline">
              ← Back to demo home
            </a>
          )}
        </div>
      )}

      {!SUPABASE_AUTH_ENABLED && (
        <p className="mt-8 text-danger">
          Sign-in is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </main>
  );
}
