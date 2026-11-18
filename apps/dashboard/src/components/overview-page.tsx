"use client";

import { formatMoney } from "@qrmenu/api-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, unwrap } from "@/lib/api";
import { POLL_MS } from "@/lib/config";
import { useLiveChannel } from "@/lib/live";
import { ColumnChart, compactRupees, RankBars } from "./charts";
import { Card, Delta, PageHeader, StatTile } from "./ui";

const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short" });
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

const RANGES = [7, 14, 30] as const;

export function OverviewPage() {
  const { rid } = useParams<{ rid: string }>();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  useLiveChannel(`restaurant:${rid}`);

  const stats = useQuery({
    queryKey: ["overview", rid, days],
    queryFn: () =>
      unwrap(
        api.GET("/v1/restaurants/{restaurant_id}/overview", {
          params: { path: { restaurant_id: rid }, query: { days } },
        }),
      ),
    refetchInterval: POLL_MS * 5,
    placeholderData: (prev) => prev,
  });

  const s = stats.data;
  const live = s?.live_orders ?? {};
  const liveTotal = Object.values(live).reduce((a, b) => a + b, 0);
  const rangeRevenue = s?.series.reduce((n, p) => n + p.revenue_paise, 0) ?? 0;
  const rangeOrders = s?.series.reduce((n, p) => n + p.orders, 0) ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <PageHeader title="Overview" subtitle={dateFmt.format(new Date())} />

        {stats.isError && <p className="mt-6 text-danger">{stats.error.message}</p>}
        {!s ? (
          <p className="mt-10 text-muted">Loading…</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="Sales today"
                value={formatMoney(s.today_revenue_paise)}
                hint={<Delta now={s.today_revenue_paise} before={s.yesterday_revenue_paise} label="yesterday" />}
              />
              <StatTile
                label="Orders today"
                value={s.today_orders}
                hint={<Delta now={s.today_orders} before={s.yesterday_orders} label="yesterday" />}
              />
              <StatTile label="Average order" value={formatMoney(s.avg_order_paise)} hint="Today, incl. GST" />
              <StatTile
                label="Payments collected"
                value={formatMoney(s.collected_today_paise)}
                hint={
                  s.pending_payments > 0 ? (
                    <Link href={`/r/${rid}/payments`} className="text-warn underline">
                      {s.pending_payments} waiting for confirmation
                    </Link>
                  ) : (
                    "Confirmed today"
                  )
                }
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Link href={`/r/${rid}/tables`} className="rounded-2xl border border-border bg-surface px-5 py-4 hover:border-brand">
                <p className="text-sm text-muted">Tables occupied now</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                  {s.open_tables}
                  <span className="text-lg text-muted"> / {s.total_tables}</span>
                </p>
                <div className="mt-3 h-2 rounded-full bg-surface-2" aria-hidden>
                  <div
                    className="h-2 rounded-full bg-chart"
                    style={{ width: `${s.total_tables ? (s.open_tables / s.total_tables) * 100 : 0}%` }}
                  />
                </div>
              </Link>
              <Link
                href={`/r/${rid}/kitchen`}
                className="rounded-2xl border border-border bg-surface px-5 py-4 hover:border-brand lg:col-span-2"
              >
                <p className="text-sm text-muted">In the kitchen right now</p>
                <div className="mt-2 flex flex-wrap gap-6">
                  {[
                    ["placed", "New", "bg-new"],
                    ["accepted", "Accepted", "bg-violet"],
                    ["preparing", "Cooking", "bg-warn"],
                    ["ready", "Ready", "bg-ok"],
                  ].map(([key, label, dot]) => (
                    <div key={key}>
                      <p className="font-display text-3xl font-semibold tabular-nums">{live[key] ?? 0}</p>
                      <p className="flex items-center gap-1.5 text-sm text-muted">
                        <span className={`size-2 rounded-full ${dot}`} aria-hidden /> {label}
                      </p>
                    </div>
                  ))}
                  {liveTotal === 0 && <p className="self-center text-sm text-muted">Kitchen is clear.</p>}
                </div>
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={days === r}
                  onClick={() => setDays(r)}
                  className={`h-8 rounded-full border px-3.5 text-sm font-medium ${
                    days === r ? "border-brand bg-brand/10 text-text" : "border-border text-muted hover:text-text"
                  }`}
                >
                  Last {r} days
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Card
                className="lg:col-span-2"
                title={`Daily sales, last ${days} days`}
                actions={
                  <span className="text-sm text-muted tabular-nums">
                    {formatMoney(rangeRevenue)} · {rangeOrders} orders
                  </span>
                }
              >
                <ColumnChart
                  caption={`Daily sales for the last ${days} days`}
                  format={(v) => formatMoney(v)}
                  formatAxis={compactRupees}
                  points={s.series.map((p) => {
                    const d = new Date(`${p.day}T12:00:00`);
                    return {
                      key: p.day,
                      label: days <= 7 ? dayFmt.format(d) : shortDate.format(d),
                      detail: dateFmt.format(d),
                      value: p.revenue_paise,
                      sub: `${p.orders} orders`,
                    };
                  })}
                />
              </Card>
              <Card title={`Top dishes, last ${days} days`}>
                {s.top_dishes.length === 0 ? (
                  <p className="text-sm text-muted">No orders yet.</p>
                ) : (
                  <RankBars
                    caption="Best-selling dishes by quantity"
                    rows={s.top_dishes.map((t) => ({
                      key: t.name,
                      label: t.name,
                      value: t.quantity,
                      valueLabel: `${t.quantity} sold`,
                      sub: formatMoney(t.revenue_paise),
                    }))}
                  />
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
