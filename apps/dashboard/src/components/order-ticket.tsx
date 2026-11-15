"use client";

import type { Order, OrderStatus } from "@qrmenu/api-client";
import { useState } from "react";

type Action = { label: string; to: OrderStatus };

const NEXT: Partial<Record<OrderStatus, Action>> = {
  placed: { label: "Accept", to: "accepted" },
  accepted: { label: "Start cooking", to: "preparing" },
  preparing: { label: "Mark ready", to: "ready" },
  ready: { label: "Served", to: "served" },
};
const CANCELLABLE: OrderStatus[] = ["placed", "accepted", "preparing"];

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

export function OrderTicket({
  order,
  now,
  busy,
  onMove,
}: {
  order: Order;
  now: number;
  busy: boolean;
  onMove: (to: OrderStatus) => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ageMin = Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60_000));
  const isFresh = order.status === "placed" && ageMin < 1;
  const ageColor = ageMin >= 20 ? "text-danger" : ageMin >= 10 ? "text-warn" : "text-muted";
  const next = NEXT[order.status];
  const itemCount = (order.items ?? []).reduce((n, i) => n + i.quantity, 0);

  return (
    <article
      className={`rounded-xl border bg-surface ${
        order.status === "placed" ? "border-new/60" : "border-border"
      } ${isFresh ? "animate-arrive" : ""}`}
      aria-label={`Order ${order.order_number}, table ${order.table_label}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tabular-nums">#{order.order_number}</span>
          <span className="rounded-md bg-brand px-2 py-0.5 text-sm font-bold text-brand-ink">
            {order.table_label ?? "—"}
          </span>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold tabular-nums ${ageColor}`}>
            {ageMin < 1 ? "just now" : `${ageMin} min`}
          </p>
          <p className="text-xs text-muted">{timeFmt.format(new Date(order.created_at))}</p>
        </div>
      </header>

      <ul className="space-y-2 px-4 py-3">
        {(order.items ?? []).map((it) => (
          <li key={it.id}>
            <p className="flex gap-2 text-[17px] leading-snug">
              <span className="min-w-7 font-bold tabular-nums">{it.quantity}×</span>
              <span className="font-medium">{it.name}</span>
            </p>
            {it.note && (
              <p className="mt-1 ml-9 rounded bg-note/15 px-2 py-0.5 text-sm font-semibold text-note">
                ⚠ {it.note}
              </p>
            )}
          </li>
        ))}
      </ul>

      <footer className="border-t border-border px-4 py-3">
        <p className="mb-2 text-xs text-muted">
          {itemCount} item{itemCount === 1 ? "" : "s"} · by {order.placed_by_name}
        </p>
        {confirmCancel ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="h-11 flex-1 rounded-lg bg-surface-2 font-semibold"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onMove("cancelled")}
              className="h-11 flex-1 rounded-lg bg-danger font-semibold text-black disabled:opacity-50"
            >
              Cancel order
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {CANCELLABLE.includes(order.status) && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="h-11 rounded-lg px-3 text-sm font-medium text-muted hover:text-danger"
              >
                Cancel
              </button>
            )}
            {next && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMove(next.to)}
                className={`h-11 flex-1 rounded-lg font-semibold text-black disabled:opacity-50 ${
                  order.status === "placed"
                    ? "bg-new"
                    : order.status === "ready"
                      ? "bg-ok"
                      : "bg-brand"
                }`}
              >
                {next.label}
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
