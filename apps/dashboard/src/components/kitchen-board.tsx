"use client";

import type { Order, OrderStatus } from "@qrmenu/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, unwrap } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { playChime, unlockAudio } from "@/lib/chime";
import { POLL_MS, REALTIME_ENABLED } from "@/lib/config";
import { useLiveChannel } from "@/lib/live";
import { useNow } from "@/lib/use-now";
import { OrderTicket } from "./order-ticket";

const COLUMNS: { status: OrderStatus; title: string; accent: string }[] = [
  { status: "placed", title: "New", accent: "bg-new" },
  { status: "accepted", title: "Accepted", accent: "bg-violet" },
  { status: "preparing", title: "Cooking", accent: "bg-warn" },
  { status: "ready", title: "Ready to serve", accent: "bg-ok" },
];
const ACTIVE: OrderStatus[] = COLUMNS.map((c) => c.status);

export function KitchenBoard() {
  const { rid } = useParams<{ rid: string }>();
  const qc = useQueryClient();
  const now = useNow(15_000);
  const [soundOn, setSoundOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLiveChannel(`restaurant:${rid}`);

  const key = ["kitchen-orders", rid];
  const orders = useQuery<Order[], ApiError>({
    queryKey: key,
    queryFn: () =>
      unwrap(
        api.GET("/v1/restaurants/{restaurant_id}/orders", {
          params: { path: { restaurant_id: rid }, query: { status: ACTIVE, limit: 200 } },
        }),
      ),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true, // kitchen tablets often sit in the background
  });

  useEffect(() => {
    if (orders.error?.status === 401) void signOut();
  }, [orders.error]);

  // Chime when brand-new orders arrive (not on first load).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = orders.data.map((o) => o.id);
    if (seen.current && soundOn) {
      const prev = seen.current;
      if (orders.data.some((o) => o.status === "placed" && !prev.has(o.id))) playChime();
    }
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [orders.data, soundOn]);

  const move = useMutation({
    mutationFn: (v: { orderId: string; to: OrderStatus }) =>
      unwrap(
        api.PATCH("/v1/restaurants/{restaurant_id}/orders/{order_id}", {
          params: { path: { restaurant_id: rid, order_id: v.orderId } },
          body: { status: v.to },
        }),
      ),
    // Optimistic: move the ticket immediately; roll back if the server refuses.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Order[]>(key);
      qc.setQueryData<Order[]>(key, (list) =>
        (list ?? [])
          .map((o) => (o.id === v.orderId ? { ...o, status: v.to } : o))
          .filter((o) => ACTIVE.includes(o.status)),
      );
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      setError(e instanceof Error ? e.message : "Could not update the order");
      setTimeout(() => setError(null), 4000);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const byStatus = (status: OrderStatus) =>
    (orders.data ?? [])
      .filter((o) => o.status === status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest first: FIFO

  const healthy = orders.isSuccess && !orders.isError;
  const lastSync = orders.dataUpdatedAt ? Math.round((now - orders.dataUpdatedAt) / 1000) : null;

  if (orders.error?.status === 403) {
    return (
      <main className="p-8">
        <p className="text-danger">You don&apos;t have access to this restaurant&apos;s kitchen.</p>
        <Link href="/" className="mt-4 inline-block text-brand underline">
          Back to your restaurants
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
        <h1 className="font-display text-xl font-semibold">Kitchen display</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2" title={lastSync !== null ? `Synced ${lastSync}s ago` : ""}>
            <span className={`size-2.5 rounded-full ${healthy ? "bg-ok" : "bg-warn animate-pulse"}`} />
            {healthy ? (REALTIME_ENABLED ? "Live" : `Live · every ${POLL_MS / 1000}s`) : "Reconnecting…"}
          </span>
          <button
            type="button"
            aria-pressed={soundOn}
            onClick={() => {
              if (!soundOn) {
                unlockAudio();
                playChime();
              }
              setSoundOn((s) => !s);
            }}
            className={`h-9 rounded-lg border px-3 font-medium ${
              soundOn ? "border-ok text-ok" : "border-border text-muted"
            }`}
          >
            Sound {soundOn ? "on" : "off"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="bg-danger px-5 py-2 text-sm font-medium text-black">
          {error}
        </p>
      )}

      <main className="grid flex-1 auto-cols-[minmax(300px,1fr)] grid-flow-col gap-4 overflow-x-auto p-4 xl:grid-flow-row xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = byStatus(col.status);
          return (
            <section key={col.status} className="flex min-h-0 flex-col rounded-2xl bg-surface-2/50">
              <h2 className="flex items-center justify-between px-4 pt-4 pb-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span className={`size-2.5 rounded-full ${col.accent}`} />
                  {col.title}
                </span>
                <span className="rounded-full bg-surface px-2.5 py-0.5 text-sm font-bold tabular-nums">
                  {list.length}
                </span>
              </h2>
              <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                {orders.isPending ? (
                  <p className="px-1 text-sm text-muted">Loading…</p>
                ) : list.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted">No orders</p>
                ) : (
                  list.map((o) => (
                    <OrderTicket
                      key={o.id}
                      order={o}
                      now={now}
                      busy={move.isPending && move.variables?.orderId === o.id}
                      onMove={(to) => move.mutate({ orderId: o.id, to })}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
