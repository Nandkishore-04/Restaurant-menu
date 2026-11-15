"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithDevToken, useAuth } from "@/lib/auth";
import { DEV_AUTH_ENABLED, SUPABASE_AUTH_ENABLED } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";

const input =
  "mt-1.5 h-11 w-full rounded-lg border border-border bg-surface-2 px-3 outline-none focus:border-brand";

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signedIn") router.replace("/");
  }, [auth.status, router]);

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
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
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

      {DEV_AUTH_ENABLED && (
        <form
          className="mt-8 rounded-xl border border-dashed border-warn/50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (devToken.trim()) signInWithDevToken(devToken);
          }}
        >
          <p className="text-sm font-semibold text-warn">Local development sign-in</p>
          <p className="mt-1 text-xs text-muted">
            Paste the <code>staff_token</code> printed by{" "}
            <code>uv run python -m scripts.seed_demo</code>.
          </p>
          <textarea
            value={devToken}
            onChange={(e) => setDevToken(e.target.value)}
            rows={3}
            aria-label="Staff token"
            className="mt-3 w-full rounded-lg border border-border bg-surface-2 p-2 font-mono text-xs outline-none focus:border-brand"
          />
          <button className="mt-2 h-10 w-full rounded-lg bg-surface-2 font-semibold">Use token</button>
        </form>
      )}

      {!SUPABASE_AUTH_ENABLED && !DEV_AUTH_ENABLED && (
        <p className="mt-8 text-danger">
          Sign-in is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </main>
  );
}
