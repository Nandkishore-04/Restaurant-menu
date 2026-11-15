"use client";

import { formatMoney, type Cart } from "@qrmenu/api-client";
import { useState } from "react";
import { Sheet } from "./sheet";
import { Stepper } from "./stepper";

type Props = {
  cart: Cart | undefined;
  currency: string;
  tableLabel: string;
  myGuestId: string;
  busy: boolean;
  placing: boolean;
  onChangeQty: (lineId: string, next: number) => void;
  onPlaceOrder: () => void;
  onClose: () => void;
};

export function CartSheet(p: Props) {
  const [confirming, setConfirming] = useState(false);
  const items = p.cart?.items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);

  // Group lines by who added them, with "you" first.
  const groups = new Map<string, { name: string; lines: typeof items }>();
  for (const line of items) {
    const g = groups.get(line.guest_id) ?? { name: line.guest_name, lines: [] };
    g.lines.push(line);
    groups.set(line.guest_id, g);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === p.myGuestId ? -1 : b === p.myGuestId ? 1 : 0,
  );

  const totals = p.cart?.totals;
  const footer =
    items.length === 0 ? null : confirming ? (
      <div>
        <p className="mb-3 text-center text-sm">
          Send <strong>{count} items</strong> to the kitchen for Table {p.tableLabel}?
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-12 flex-1 rounded-xl border border-border font-semibold"
          >
            Not yet
          </button>
          <button
            type="button"
            disabled={p.placing}
            onClick={p.onPlaceOrder}
            className="h-12 flex-[2] rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {p.placing ? "Sending…" : "Yes, send order"}
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-12 w-full items-center justify-between rounded-xl bg-brand px-5 font-semibold text-brand-ink"
      >
        <span>Place order</span>
        <span className="tabular-nums">{totals && formatMoney(totals.total_paise, p.currency)}</span>
      </button>
    );

  return (
    <Sheet title={`Table ${p.tableLabel} cart`} onClose={p.onClose} footer={footer}>
      <p className="mb-4 rounded-xl bg-brand-soft px-3 py-2 text-sm">
        Everyone at this table shares this cart. What you add shows up on their phones, and anyone
        can place the order.
      </p>
      {items.length === 0 ? (
        <div className="py-10 text-center text-muted">
          <p className="font-medium text-text">Your table&apos;s cart is empty</p>
          <p className="mt-1 text-sm">Add dishes from the menu to get started.</p>
        </div>
      ) : (
        <>
          {ordered.map(([guestId, g]) => (
            <section key={guestId} className="mb-5">
              <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                {g.name}
                {guestId === p.myGuestId && " (you)"}
              </h3>
              <ul className="divide-y divide-border">
                {g.lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{line.name}</p>
                      {line.note && <p className="text-sm text-muted italic">“{line.note}”</p>}
                      <p className="text-sm tabular-nums text-muted">
                        {formatMoney(line.line_total_paise, p.currency)}
                      </p>
                    </div>
                    <Stepper
                      size="sm"
                      quantity={line.quantity}
                      disabled={p.busy}
                      onChange={(n) => p.onChangeQty(line.id, n)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {totals && (
            <dl className="space-y-1.5 rounded-2xl bg-surface p-4 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-muted">Item total</dt>
                <dd>{formatMoney(totals.subtotal_paise, p.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">GST</dt>
                <dd>{formatMoney(totals.tax_paise, p.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>To pay</dt>
                <dd>{formatMoney(totals.total_paise, p.currency)}</dd>
              </div>
            </dl>
          )}
        </>
      )}
    </Sheet>
  );
}
