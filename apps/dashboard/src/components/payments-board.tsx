"use client";

import { formatMoney, type Payment } from "@qrmenu/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, unwrap } from "@/lib/api";
import { POLL_MS } from "@/lib/config";
import { useLiveChannel } from "@/lib/live";
import { useNow } from "@/lib/use-now";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

export function PaymentsBoard() {
  const { rid } = useParams<{ rid: string }>();
  const qc = useQueryClient();
  const now = useNow(15_000);
  const [error, setError] = useState<string | null>(null);
  useLiveChannel(`restaurant:${rid}`);

  const path = { restaurant_id: rid };
  const payments = useQuery({
    queryKey: ["payments", rid],
    queryFn: () =>
      unwrap(api.GET("/v1/restaurants/{restaurant_id}/payments", { params: { path, query: { limit: 60 } } })),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; status: "paid" | "rejected" }) =>
      unwrap(
        api.POST("/v1/restaurants/{restaurant_id}/payments/{payment_id}/decision", {
          params: { path: { ...path, payment_id: v.id } },
          body: { status: v.status },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", rid] }),
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Could not update the payment");
      setTimeout(() => setError(null), 4000);
    },
  });

  const list = payments.data ?? [];
  const pending = list.filter((p) => p.status === "pending").reverse(); // oldest first
  const recent = list.filter((p) => p.status === "paid" || p.status === "rejected").slice(0, 20);
  const today = new Date(now).toDateString();
  const collectedToday = list
    .filter((p) => p.status === "paid" && p.confirmed_at && new Date(p.confirmed_at).toDateString() === today)
    .reduce((n, p) => n + p.amount_paise, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Payments</h1>
            <p className="mt-1 text-sm text-muted">
              Confirm UPI payments once they show in your bank or UPI app, and collect cash at the table.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-2 text-right">
            <p className="text-xs text-muted">Confirmed today</p>
            <p className="font-display text-xl font-semibold tabular-nums">{formatMoney(collectedToday)}</p>
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-black">{error}</p>}

        <h2 className="mt-8 mb-3 flex items-center gap-2 font-semibold">
          <span className="size-2.5 rounded-full bg-warn" /> Waiting for you
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm tabular-nums">{pending.length}</span>
        </h2>
        {payments.isPending ? (
          <p className="text-muted">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
            No payments waiting. New ones appear here automatically.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map((p) => (
              <PendingCard
                key={p.id}
                payment={p}
                now={now}
                busy={decide.isPending && decide.variables?.id === p.id}
                onDecide={(status) => decide.mutate({ id: p.id, status })}
              />
            ))}
          </div>
        )}

        <h2 className="mt-10 mb-3 font-semibold">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="w-14 rounded-md bg-brand px-2 py-0.5 text-center font-bold text-brand-ink">
                  {p.table_label}
                </span>
                <span className="w-12 font-medium uppercase">{p.method}</span>
                <span className="flex-1 truncate text-muted">
                  {p.guest_name}
                  {p.reference && <span className="font-mono"> · {p.reference}</span>}
                </span>
                <span className="text-muted">{timeFmt.format(new Date(p.confirmed_at ?? p.created_at))}</span>
                <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(p.amount_paise)}</span>
                <span className={`w-20 text-right font-medium ${p.status === "paid" ? "text-ok" : "text-danger"}`}>
                  {p.status === "paid" ? "Received" : "Rejected"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PendingCard({
  payment: p,
  now,
  busy,
  onDecide,
}: {
  payment: Payment;
  now: number;
  busy: boolean;
  onDecide: (status: "paid" | "rejected") => void;
}) {
  const mins = Math.max(0, Math.floor((now - new Date(p.created_at).getTime()) / 60_000));
  const isUpi = p.method === "upi";
  return (
    <article className="rounded-2xl border border-warn/40 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-brand px-2.5 py-1 text-lg font-bold text-brand-ink">{p.table_label}</span>
          <div>
            <p className="font-semibold">{isUpi ? "UPI payment to verify" : "Cash to collect"}</p>
            <p className="text-xs text-muted">
              by {p.guest_name} · {mins < 1 ? "just now" : `${mins} min ago`}
            </p>
          </div>
        </div>
        <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(p.amount_paise)}</p>
      </div>
      <p className="mt-3 text-sm text-muted">
        {isUpi
          ? p.reference
            ? <>Match UPI ref <span className="font-mono text-text">{p.reference}</span> in your UPI app.</>
            : "Check your UPI app for this amount."
          : "Go to the table and collect the cash."}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide("rejected")}
          className="h-11 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50"
        >
          Not received
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide("paid")}
          className="h-11 flex-1 rounded-lg bg-ok font-semibold text-black disabled:opacity-50"
        >
          {isUpi ? "Confirm received" : "Cash collected"}
        </button>
      </div>
    </article>
  );
}
