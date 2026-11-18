"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { homeFor } from "./restaurant-shell";
import { ROLES } from "./staff-page";
import { btn, errorText } from "./ui";

/** /invite/{token}: shows the invite, asks to sign in if needed, then joins. */
export function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const auth = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: () => unwrap(api.GET("/v1/invites/{token}", { params: { path: { token } } })),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/invites/{token}/accept", { params: { path: { token } } })),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["me", "restaurants"] });
      router.replace(homeFor(r.restaurant_id, r.role));
    },
  });

  const p = preview.data;
  const role = ROLES.find((r) => r.role === p?.role);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      {preview.isPending && <p className="text-muted">Checking your invite…</p>}
      {preview.isError && (
        <>
          <h1 className="font-display text-3xl font-semibold">Invite not found</h1>
          <p className="mt-2 text-muted">Check the link, or ask the restaurant owner for a new one.</p>
        </>
      )}
      {p && (
        <>
          <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">You&apos;re invited</p>
          <h1 className="mt-2 font-display text-4xl leading-tight font-semibold">{p.restaurant_name}</h1>
          {role && (
            <p className="mt-3 text-muted">
              Join as <strong className="text-text">{role.label}</strong>: {role.can.toLowerCase()}.
            </p>
          )}
          {!p.valid ? (
            <p className="mt-8 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">{p.reason}</p>
          ) : auth.status === "signedIn" ? (
            <>
              <button
                type="button"
                disabled={accept.isPending}
                onClick={() => accept.mutate()}
                className={`${btn.primary} mt-8 h-12 w-full text-base`}
              >
                {accept.isPending ? "Joining…" : `Join ${p.restaurant_name}`}
              </button>
              {accept.isError && <p className="mt-3 text-sm text-danger">{errorText(accept.error)}</p>}
            </>
          ) : auth.status === "signedOut" ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
              className={`${btn.primary} mt-8 flex h-12 w-full items-center justify-center text-base`}
            >
              Sign in to join
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}
