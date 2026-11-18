"use client";

import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useNow } from "@/lib/use-now";
import { ColumnChart, compactRupees } from "./charts";
import { Modal } from "./modal";
import { Badge, btn, Card, errorText, relTime, StatTile, useFlash } from "./ui";

type Row = Schemas["PlatformRestaurant"];
const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

/** SaaS operator console: every restaurant on the platform. */
export function PlatformPage() {
  const me = useQuery({
    queryKey: ["platform", "me"],
    queryFn: () => unwrap(api.GET("/v1/platform/me")),
  });
  if (me.isPending) return <p className="p-8 text-muted">Loading…</p>;
  if (!me.data?.is_platform_admin) {
    return (
      <main className="p-8">
        <p className="text-danger">This area is for platform admins only.</p>
        <Link href="/" className="mt-3 inline-block text-brand underline">
          Back
        </Link>
      </main>
    );
  }
  return <PlatformConsole />;
}

function PlatformConsole() {
  const qc = useQueryClient();
  const now = useNow(60_000);
  const [toast, flash] = useFlash();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [confirm, setConfirm] = useState<Row | null>(null);

  const stats = useQuery({
    queryKey: ["platform", "stats"],
    queryFn: () => unwrap(api.GET("/v1/platform/stats", { params: { query: { days: 14 } } })),
    refetchInterval: 60_000,
  });
  const rows = useQuery({
    queryKey: ["platform", "restaurants", q],
    queryFn: () => unwrap(api.GET("/v1/platform/restaurants", { params: { query: { search: q } } })),
    placeholderData: (prev) => prev,
  });

  const toggle = useMutation({
    mutationFn: (r: Row) =>
      unwrap(
        api.PATCH("/v1/platform/restaurants/{restaurant_id}", {
          params: { path: { restaurant_id: r.id } },
          body: { is_active: !r.is_active },
        }),
      ),
    onSuccess: (r) => {
      flash(`${r.name} ${r.is_active ? "reactivated" : "suspended"}`);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e) => flash(errorText(e), true),
  });

  const s = stats.data;

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b border-border px-5 py-3">
        <Link href="/" className="text-muted hover:text-text" aria-label="Back">
          ←
        </Link>
        <p className="font-display text-lg font-semibold">QR Menu</p>
        <Badge tone="brand">Platform admin</Badge>
        <span className="flex-1" />
        <button type="button" onClick={() => void signOut()} className="text-sm text-muted hover:text-text">
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        <h1 className="font-display text-3xl font-semibold">Platform</h1>
        <p className="mt-1 text-sm text-muted">Every restaurant using QR Menu. GMV = order value incl. GST, excluding cancelled orders.</p>

        {s && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Restaurants" value={s.active_restaurants} hint={`${s.restaurants} total · ${s.new_restaurants_30d} new in 30 days`} />
              <StatTile label="Orders today" value={s.orders_today} hint={`${s.orders_30d.toLocaleString("en-IN")} in 30 days`} />
              <StatTile label="GMV today" value={formatMoney(s.gmv_today_paise)} hint={`${compactRupees(s.gmv_30d_paise)} in 30 days`} />
              <StatTile label="Tables live now" value={s.open_tables} hint="Open sittings across all restaurants" />
            </div>
            <Card className="mt-5" title="Daily GMV, last 14 days">
              <ColumnChart
                caption="Platform GMV per day, last 14 days"
                format={(v) => formatMoney(v)}
                formatAxis={compactRupees}
                points={s.series.map((p) => {
                  const d = new Date(`${p.day}T12:00:00`);
                  return {
                    key: p.day,
                    label: shortDate.format(d),
                    detail: dateFmt.format(d),
                    value: p.revenue_paise,
                    sub: `${p.orders} orders`,
                  };
                })}
              />
            </Card>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Restaurants</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or address"
            aria-label="Search restaurants"
            className="h-10 w-64 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 text-right font-medium">Tables</th>
                <th className="px-4 py-3 text-right font-medium">Staff</th>
                <th className="px-4 py-3 text-right font-medium">Orders · 30d</th>
                <th className="px-4 py-3 text-right font-medium">GMV · 30d</th>
                <th className="px-4 py-3 font-medium">Last order</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.data?.map((r) => (
                <tr key={r.id} className={r.is_active ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{r.name}</span>
                    <span className="font-mono text-xs text-muted">{r.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.owner_email ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.tables}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.staff}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.orders_30d.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(r.gmv_30d_paise)}</td>
                  <td className="px-4 py-3 text-muted">{r.last_order_at ? relTime(r.last_order_at, now) : "Never"}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {r.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Suspended</Badge>}
                      {!r.upi_configured && <Badge tone="warn">Demo UPI</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setConfirm(r)} className={btn.ghost}>
                      {r.is_active ? "Suspend" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.data?.length === 0 && <p className="p-8 text-center text-muted">No restaurants match.</p>}
        </div>
      </main>

      {confirm && (
        <Modal
          title={`${confirm.is_active ? "Suspend" : "Reactivate"} ${confirm.name}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <span className="flex-1" />
              <button type="button" onClick={() => setConfirm(null)} className={btn.ghost}>
                Cancel
              </button>
              <button
                type="button"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(confirm)}
                className={confirm.is_active ? btn.danger : btn.primary}
              >
                {confirm.is_active ? "Suspend" : "Reactivate"}
              </button>
            </>
          }
        >
          <p className="text-sm">
            {confirm.is_active
              ? "Guests won't be able to scan this restaurant's QR codes until it's reactivated. Its staff can still sign in and see their data."
              : "Guests will be able to scan its QR codes and order again."}
          </p>
        </Modal>
      )}
      {toast}
    </div>
  );
}
