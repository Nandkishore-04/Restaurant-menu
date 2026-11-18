"use client";

import { useRef, useState, type ReactNode } from "react";

/** Transient message in the corner: const [toast, flash] = useFlash(); */
export function useFlash(): [ReactNode, (text: string, error?: boolean) => void] {
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = (text: string, error = false) => {
    setNotice({ text, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 3500);
  };
  const node = notice ? (
    <div
      role="status"
      className={`fixed right-5 bottom-5 z-[60] max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-xl ${
        notice.error ? "bg-danger text-black" : "bg-text text-bg"
      }`}
    >
      {notice.text}
    </div>
  ) : null;
  return [node, flash];
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`mt-1 font-display text-3xl font-semibold tabular-nums ${
          tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** "+12% vs yesterday": arrow + label so direction isn't conveyed by color alone. */
export function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before === 0) return <span>{now > 0 ? `New vs ${label}` : `Same as ${label}`}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={up ? "text-ok" : "text-warn"}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% <span className="text-muted">vs {label}</span>
    </span>
  );
}

export const btn = {
  primary:
    "h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-50",
  secondary:
    "h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:border-brand disabled:opacity-50",
  ghost:
    "h-9 rounded-md px-3 text-sm text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40",
  danger: "h-9 rounded-md bg-danger px-3 text-sm font-semibold text-black disabled:opacity-50",
};

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "danger" | "new" | "brand" }) {
  const tones = {
    muted: "bg-surface-2 text-muted",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    danger: "bg-danger/15 text-danger",
    new: "bg-new/15 text-new",
    brand: "bg-brand/15 text-brand",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export const relTime = (iso: string, now: number) => {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
