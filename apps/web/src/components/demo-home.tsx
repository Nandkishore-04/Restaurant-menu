"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { DASHBOARD_URL, DEMO_TABLES } from "@/lib/config";
import { QrCode } from "./qr-code";

/** Client-demo launcher: one link that opens every side of the product. */
export function DemoHome() {
  const [table, setTable] = useState(DEMO_TABLES[0]);
  // Absolute link so the QR works when scanned from another phone.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "", // server render: no origin yet, QR appears after hydration
  );
  const guestPath = table ? `/t/${table.token}` : null;
  const staff = (role: string) => `${DASHBOARD_URL}/demo/${role}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <header className="flex items-center gap-3">
        <span className="font-display text-2xl font-semibold">QR Menu</span>
        <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold tracking-wider text-accent uppercase">
          Live demo
        </span>
      </header>

      <section className="mt-10 max-w-3xl">
        <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          Table ordering for Indian restaurants
        </h1>
        <p className="mt-4 text-lg text-muted">
          Guests scan the QR on their table, order together from their own phones, and pay by UPI. The kitchen and the
          owner see everything live. Pick a role below to try it.
        </p>
      </section>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <RoleCard
          step="1"
          title="Customer"
          subtitle="A guest at the table"
          text="Browse the menu, add to one shared cart with your family, send the order to the kitchen and pay by UPI or cash."
        >
          {DEMO_TABLES.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choose a table">
              {DEMO_TABLES.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  aria-pressed={table?.token === t.token}
                  onClick={() => setTable(t)}
                  className={`h-8 rounded-full border px-3.5 text-sm font-medium ${
                    table?.token === t.token ? "border-brand bg-brand text-brand-ink" : "border-border bg-surface"
                  }`}
                >
                  Table {t.label}
                </button>
              ))}
            </div>
          )}
          {guestPath ? (
            <>
              <div className="flex items-center gap-4 rounded-2xl bg-white p-3 text-[#16181d]">
                {origin && <QrCode value={`${origin}${guestPath}`} size={104} />}
                <p className="text-sm">
                  <strong>Scan with your phone</strong> to order like a real guest at Table {table?.label}.
                </p>
              </div>
              <Link href={guestPath} className={`${primary} mt-4`}>
                Open as a guest on this device
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">No demo tables configured.</p>
          )}
        </RoleCard>

        <RoleCard
          step="2"
          title="Restaurant owner"
          subtitle="Runs the restaurant"
          text="Today's sales, live tables, order history, menu and prices, staff, GST and UPI settings. All in one dashboard."
        >
          <a href={staff("owner")} className={primary}>
            Open owner dashboard
          </a>
          <a href={staff("manager")} className={secondary}>
            Manager view
          </a>
        </RoleCard>

        <RoleCard
          step="3"
          title="Staff"
          subtitle="Kitchen and waiters"
          text="The kitchen sees orders the moment guests place them. Waiters watch tables, bills and payments."
        >
          <a href={staff("chef")} className={primary}>
            Open kitchen screen
          </a>
          <a href={staff("waiter")} className={secondary}>
            Waiter view
          </a>
        </RoleCard>
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-5 text-sm">
        <p className="font-semibold">Best way to demo</p>
        <p className="mt-1 text-muted">
          Open the <strong className="text-text">kitchen screen</strong> on your laptop, then let the client scan the
          customer QR with their phone and place an order. It appears on the kitchen screen instantly.
        </p>
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>Demo data only. Orders and payments here are not real.</span>
        <a href={staff("admin")} className="font-medium underline underline-offset-4 hover:text-text">
          Platform admin (for QR Menu operators) →
        </a>
      </footer>
    </main>
  );
}

const noopSubscribe = () => () => {};

const primary =
  "flex h-12 w-full items-center justify-center rounded-xl bg-brand px-4 font-semibold text-brand-ink shadow-sm transition active:scale-[0.99]";
const secondary =
  "mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:border-brand";

function RoleCard({
  step,
  title,
  subtitle,
  text,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-brand-soft font-display text-lg font-semibold text-brand">
          {step}
        </span>
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      <p className="mt-4 mb-5 flex-1 text-muted">{text}</p>
      <div>{children}</div>
    </section>
  );
}
