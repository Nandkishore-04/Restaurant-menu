"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    // Come back here after signing in (e.g. an invite link).
    if (auth.status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [auth.status, router, pathname]);
  if (auth.status !== "signedIn") {
    return <p className="p-8 text-muted">Checking sign-in…</p>;
  }
  return children;
}
