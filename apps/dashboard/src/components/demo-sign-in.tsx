"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_HOME_URL, DEMO_MODE, DEMO_PASSWORD, DEMO_ROLES } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";

/** /demo/{role}: signs in as that demo account and opens the right screen. */
export function DemoSignIn() {
  const { role } = useParams<{ role: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const demo = DEMO_ROLES[role];
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!DEMO_MODE || !demo || !DEMO_PASSWORD) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: demo.email, password: DEMO_PASSWORD });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      queryClient.clear(); // drop the previous role's cached data
      router.replace(demo.next);
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, router, queryClient]);

  const unavailable = !DEMO_MODE || !demo || !DEMO_PASSWORD;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
      {unavailable ? (
        <>
          <h1 className="font-display text-2xl font-semibold">Demo sign-in isn&apos;t available</h1>
          <Link href="/login" className="mt-4 text-brand underline">
            Go to sign in
          </Link>
        </>
      ) : error ? (
        <>
          <h1 className="font-display text-2xl font-semibold">Couldn&apos;t open the demo</h1>
          <p className="mt-2 text-danger">{error}</p>
        </>
      ) : (
        <>
          <span className="mx-auto size-10 animate-spin rounded-full border-4 border-border border-t-brand" aria-hidden />
          <p className="mt-5 font-display text-xl font-semibold">Opening the {demo.label.toLowerCase()} view…</p>
          <p className="mt-1 text-sm text-muted">Signing in as {demo.email}</p>
        </>
      )}
      {DEMO_HOME_URL && (
        <a href={DEMO_HOME_URL} className="mt-8 text-sm text-muted underline">
          ← Back to demo home
        </a>
      )}
    </main>
  );
}
