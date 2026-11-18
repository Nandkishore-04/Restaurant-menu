"use client";

import { useState } from "react";

/**
 * Single-series column chart (one hue, no legend: the card title names the series).
 * Bars <= 24px with a 4px rounded top and square baseline, recessive gridlines,
 * a hover/focus tooltip with an oversized hit target, sparse direct labels
 * (only the peak and the latest value), and a table view.
 */
export function ColumnChart({
  points,
  format,
  formatAxis,
  caption,
}: {
  points: { key: string; label: string; detail: string; value: number; sub?: string }[];
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  caption: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...points.map((p) => p.value), 0);
  const top = niceCeil(max);
  const ticks = [0, top / 2, top];
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const last = points.length - 1;

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          className="text-xs font-medium text-muted underline underline-offset-2 hover:text-text"
        >
          {asTable ? "View as chart" : "View as table"}
        </button>
      </div>
      {asTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-medium">Day</th>
              <th className="py-1.5 text-right font-medium">Value</th>
              <th className="py-1.5 text-right font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {points.map((p) => (
              <tr key={p.key}>
                <td className="py-1.5">{p.detail}</td>
                <td className="py-1.5 text-right">{format(p.value)}</td>
                <td className="py-1.5 text-right text-muted">{p.sub}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <figure aria-label={caption} className="relative">
          <div className="relative ml-12 h-56">
            {/* recessive gridlines + y labels */}
            {ticks.map((t) => (
              <div
                key={t}
                className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                style={{ bottom: `${(t / (top || 1)) * 100}%` }}
              >
                <span className="absolute -top-2 -left-12 w-10 text-right text-[11px] text-muted tabular-nums">
                  {formatAxis(t)}
                </span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end">
              {points.map((p, i) => {
                const h = top ? (p.value / top) * 100 : 0;
                const active = hover === i;
                const showLabel = p.value > 0 && (i === peak || i === last);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-label={`${p.detail}: ${format(p.value)}${p.sub ? `, ${p.sub}` : ""}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  >
                    {active && <span className="absolute inset-y-0 inset-x-1 rounded-md bg-surface-2/60" aria-hidden />}
                    {showLabel && !active && (
                      <span
                        className="absolute text-[11px] font-medium text-muted tabular-nums"
                        style={{ bottom: `calc(${h}% + 4px)` }}
                      >
                        {formatAxis(p.value)}
                      </span>
                    )}
                    <span
                      className={`relative w-full max-w-6 rounded-t-[4px] transition-colors ${
                        active ? "bg-chart-hover" : "bg-chart"
                      }`}
                      style={{ height: `${h}%`, minHeight: p.value > 0 ? 2 : 0 }}
                    />
                    {active && (
                      <span
                        role="tooltip"
                        className="absolute z-10 w-max rounded-lg border border-border bg-bg px-3 py-2 text-left text-xs shadow-xl"
                        style={{ bottom: `calc(${Math.min(h, 80)}% + 12px)` }}
                      >
                        <span className="block font-semibold text-text">{p.detail}</span>
                        <span className="block text-text tabular-nums">{format(p.value)}</span>
                        {p.sub && <span className="block text-muted">{p.sub}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ml-12 mt-2 flex">
            {points.map((p, i) => (
              <span
                key={p.key}
                className={`flex-1 text-center text-[11px] ${i === last ? "font-semibold text-text" : "text-muted"}`}
              >
                {points.length > 16 && i % 2 === 1 && i !== last ? "" : p.label}
              </span>
            ))}
          </div>
        </figure>
      )}
    </div>
  );
}

/** Ranked horizontal bars (magnitude, one hue) with the value as a text label. */
export function RankBars({
  rows,
  caption,
}: {
  rows: { key: string; label: string; value: number; valueLabel: string; sub?: string }[];
  caption: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol aria-label={caption} className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key} title={r.sub}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="mr-2 text-muted tabular-nums">{i + 1}.</span>
              {r.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{r.valueLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-chart" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-xs text-muted tabular-nums">{r.sub}</p>}
        </li>
      ))}
    </ol>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/** ₹1.2L / ₹45k style compact rupees for axes. */
export function compactRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(r)}`;
}
