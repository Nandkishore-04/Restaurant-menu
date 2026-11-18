"use client";

import { formatMoney, type Order, type OrderStatus } from "@qrmenu/api-client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, unwrap } from "@/lib/api";
import { POLL_MS } from "@/lib/config";
import { Badge, PageHeader } from "./ui";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

const STATUS: Record<OrderStatus, { label: string; tone: "new" | "brand" | "warn" | "ok" | "muted" | "danger" }> = {
  placed: { label: "New", tone: "new" },
  accepted: { label: "Accepted", tone: "brand" },
  preparing: { label: "Cooking", tone: "warn" },
  ready: { label: "Ready", tone: "ok" },
  served: { label: "Served", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "served", label: "Served" },
  { key: "cancelled", label: "Cancelled" },
] as const;

function localToday(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function OrdersHistory() {
  const { rid } = useParams<{ rid: string }>();
  const [day, setDay] = useState(localToday);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [open, setOpen] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["orders-history", rid, day],
    queryFn: () =>
      unwrap(
        api.GET("/v1/restaurants/{restaurant_id}/orders", {
          params: { path: { restaurant_id: rid }, query: { day, limit: 500 } },
        }),
      ),
    refetchInterval: day === localToday() ? POLL_MS * 3 : false,
  });

  const all = orders.data ?? [];
  const list = all.filter((o) =>
    filter === "all"
      ? true
      : filter === "active"
        ? !["served", "cancelled"].includes(o.status)
        : o.status === filter,
  );
  const billable = all.filter((o) => o.status !== "cancelled");
  const revenue = billable.reduce((n, o) => n + o.total_paise, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <PageHeader
          title="Orders"
          subtitle={
            orders.isSuccess
              ? `${billable.length} orders · ${formatMoney(revenue)} incl. GST${
                  all.length > billable.length ? ` · ${all.length - billable.length} cancelled` : ""
                }`
              : " "
          }
          actions={
            <input
              type="date"
              value={day}
              max={localToday()}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label="Day"
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm [color-scheme:dark]"
            />
          }
        />

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`h-8 rounded-full border px-3.5 text-sm font-medium ${
                filter === f.key ? "border-brand bg-brand/10" : "border-border text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {orders.isPending && <p className="mt-8 text-muted">Loading…</p>}
        {orders.isError && <p className="mt-8 text-danger">{orders.error.message}</p>}
        {orders.isSuccess && list.length === 0 && (
          <p className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            No orders for this day{filter !== "all" ? " with this status" : ""}.
          </p>
        )}

        {list.length > 0 && (
          <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-surface">
            {list.map((o) => (
              <OrderRow key={o.id} order={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order: o, open, onToggle }: { order: Order; open: boolean; onToggle: () => void }) {
  const items = o.items ?? [];
  const summary = items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
  const st = STATUS[o.status];
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-2/50"
      >
        <span className="w-12 font-semibold tabular-nums">#{o.order_number}</span>
        <span className="w-16 text-sm text-muted tabular-nums">{timeFmt.format(new Date(o.created_at))}</span>
        <span className="w-14 rounded-md bg-brand px-2 py-0.5 text-center text-sm font-bold text-brand-ink">
          {o.table_label}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{summary}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className={`w-24 text-right font-semibold tabular-nums ${o.status === "cancelled" ? "text-muted line-through" : ""}`}>
          {formatMoney(o.total_paise)}
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-border bg-bg/40 px-4 py-4 text-sm sm:grid-cols-2">
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  {i.quantity} × {i.name}
                  {i.note && <span className="text-note"> · {i.note}</span>}
                  <span className="text-muted"> · {i.guest_name}</span>
                </span>
                <span className="tabular-nums text-muted">{formatMoney(i.line_total_paise)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 tabular-nums sm:pl-6">
            <div className="flex justify-between"><dt className="text-muted">Item total</dt><dd>{formatMoney(o.subtotal_paise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">GST</dt><dd>{formatMoney(o.tax_paise)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatMoney(o.total_paise)}</dd></div>
            <div className="flex justify-between pt-2 text-muted"><dt>Placed by</dt><dd>{o.placed_by_name}</dd></div>
          </dl>
        </div>
      )}
    </li>
  );
}
