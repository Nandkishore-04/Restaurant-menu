"use client";

import { formatMoney, type Bill, type PaymentMethod } from "@qrmenu/api-client";
import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";
import type { GuestSession } from "@/lib/guest-session";
import { usePay } from "@/lib/queries";
import { CheckIcon, CloseIcon } from "./icons";

type Props = {
  qr: string;
  session: GuestSession;
  bill: Bill;
  onClose: () => void;
  onToast: (text: string, error?: boolean) => void;
};

/** Full-screen checkout: bill summary -> UPI (QR / app) or cash -> pending -> paid. */
export function PaymentPage({ qr, session, bill, onClose, onToast }: Props) {
  const pay = usePay(qr, session);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [changing, setChanging] = useState(false);
  const [confirmingUpi, setConfirmingUpi] = useState(false);
  const [utr, setUtr] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const pending = bill.pending_payment;
  const lastDecided = [...bill.payments].reverse().find((p) => p.status !== "cancelled");
  const wasRejected = !pending && lastDecided?.status === "rejected";
  const fullyPaid = bill.total_paise > 0 && bill.due_paise === 0;

  const submit = (m: PaymentMethod, reference?: string) =>
    pay.mutate(
      { method: m, reference: reference?.trim() || null },
      {
        onSuccess: () => {
          setChanging(false);
          setConfirmingUpi(false);
          setUtr("");
        },
        onError: (e) => onToast(e instanceof Error ? e.message : "Payment failed", true),
      },
    );

  let body: ReactNode;
  let footer: ReactNode = null;

  if (fullyPaid) {
    body = <PaidView bill={bill} />;
    footer = (
      <button type="button" onClick={onClose} className={primaryBtn}>
        Done
      </button>
    );
  } else if (pending && !changing) {
    body = <PendingView bill={bill} />;
    footer = (
      <button
        type="button"
        onClick={() => {
          setMethod(pending.method === "upi" ? "cash" : "upi");
          setChanging(true);
        }}
        className={secondaryBtn}
      >
        Pay a different way
      </button>
    );
  } else {
    body = (
      <>
        <AmountCard bill={bill} />
        {wasRejected && (
          <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            The restaurant couldn&apos;t confirm your last payment. Please try again or pay in cash.
          </p>
        )}
        <h2 className="mt-7 mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
          Choose payment method
        </h2>
        <div className="space-y-3">
          <MethodOption
            selected={method === "upi"}
            onSelect={() => setMethod("upi")}
            title="UPI"
            subtitle="Google Pay, PhonePe, Paytm or any UPI app"
            icon={<UpiMark />}
          />
          <MethodOption
            selected={method === "cash"}
            onSelect={() => setMethod("cash")}
            title="Cash"
            subtitle="Pay our staff at your table"
            icon={<CashMark />}
          />
        </div>
        {method === "upi" ? <UpiPanel bill={bill} onToast={onToast} /> : <CashPanel bill={bill} />}
      </>
    );
    footer =
      method === "cash" ? (
        <button type="button" disabled={pay.isPending} onClick={() => submit("cash")} className={primaryBtn}>
          {pay.isPending ? "Letting staff know…" : `Pay ${formatMoney(bill.due_paise, bill.currency)} in cash`}
        </button>
      ) : confirmingUpi ? (
        <div>
          <label className="block text-sm font-medium">
            UPI transaction ID <span className="font-normal text-muted">(optional, helps staff verify)</span>
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 40))}
              inputMode="numeric"
              placeholder="12-digit UTR from your UPI app"
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-4 tracking-wider outline-none focus:border-brand"
            />
          </label>
          {utr.length > 0 && utr.length < 6 && (
            <p className="mt-1 text-xs text-danger">That looks too short.</p>
          )}
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => setConfirmingUpi(false)} className={`${secondaryBtn} flex-1`}>
              Back
            </button>
            <button
              type="button"
              disabled={pay.isPending || (utr.length > 0 && utr.length < 6)}
              onClick={() => submit("upi", utr)}
              className={`${primaryBtn} flex-[2]`}
            >
              {pay.isPending ? "Submitting…" : "Submit payment"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmingUpi(true)} className={primaryBtn}>
          I&apos;ve completed the payment
        </button>
      );
  }

  return (
    <div className="animate-sheet fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal aria-label="Pay bill">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={changing ? () => setChanging(false) : onClose}
          aria-label="Close payment"
          className="grid size-10 place-items-center rounded-full bg-surface-2"
        >
          <CloseIcon />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-lg leading-tight font-semibold">
            {fullyPaid ? "Payment complete" : "Pay bill"}
          </h1>
          <p className="truncate text-xs text-muted">
            {bill.restaurant_name} · Table {bill.table_label}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted">
          <LockIcon /> Secure
        </span>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 py-5">{body}</main>
      {footer && (
        <footer className="mx-auto w-full max-w-md border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      )}
    </div>
  );
}

const primaryBtn =
  "h-13 w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-brand-ink shadow-sm transition active:scale-[0.99] disabled:opacity-60";
const secondaryBtn =
  "h-13 w-full rounded-2xl border border-border bg-surface py-3.5 text-base font-semibold";

function AmountCard({ bill }: { bill: Bill }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl bg-brand p-5 text-brand-ink shadow-lg">
      <p className="text-sm opacity-80">Amount to pay</p>
      <p className="mt-1 font-display text-4xl font-semibold tabular-nums">
        {formatMoney(bill.due_paise, bill.currency)}
      </p>
      <p className="mt-1 text-xs opacity-75">
        {bill.order_count} order{bill.order_count === 1 ? "" : "s"} · incl. GST
        {bill.paid_paise > 0 && ` · ${formatMoney(bill.paid_paise, bill.currency)} already paid`}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-4 text-sm font-semibold underline underline-offset-4"
      >
        {open ? "Hide bill details" : "View bill details"}
      </button>
      {open && (
        <div className="mt-3 rounded-2xl bg-black/15 p-4 text-sm">
          <BillLines bill={bill} />
        </div>
      )}
    </section>
  );
}

function BillLines({ bill }: { bill: Bill }) {
  const m = (p: number) => formatMoney(p, bill.currency);
  return (
    <dl className="space-y-1.5 tabular-nums">
      {bill.lines.map((l) => (
        <div key={`${l.name}-${l.unit_price_paise}`} className="flex justify-between gap-3">
          <dt>
            {l.quantity} × {l.name}
          </dt>
          <dd>{m(l.amount_paise)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-current/20 pt-2 opacity-85">
        <dt>Item total</dt>
        <dd>{m(bill.subtotal_paise)}</dd>
      </div>
      <div className="flex justify-between opacity-85">
        <dt>GST</dt>
        <dd>{m(bill.tax_paise)}</dd>
      </div>
      {bill.paid_paise > 0 && (
        <div className="flex justify-between opacity-85">
          <dt>Paid</dt>
          <dd>−{m(bill.paid_paise)}</dd>
        </div>
      )}
      <div className="flex justify-between font-semibold">
        <dt>Total</dt>
        <dd>{m(bill.total_paise)}</dd>
      </div>
    </dl>
  );
}

function MethodOption(p: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={p.selected}
      onClick={p.onSelect}
      className={`flex w-full items-center gap-4 rounded-2xl border bg-surface p-4 text-left transition ${
        p.selected ? "border-brand ring-2 ring-brand/15" : "border-border"
      }`}
    >
      {p.icon}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{p.title}</span>
        <span className="block text-sm text-muted">{p.subtitle}</span>
      </span>
      <span
        className={`grid size-6 place-items-center rounded-full border-2 ${
          p.selected ? "border-brand bg-brand text-brand-ink" : "border-border"
        }`}
      >
        {p.selected && <CheckIcon width={14} height={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

const UPI_APPS: { name: string; scheme: string; color: string; short: string }[] = [
  { name: "Google Pay", scheme: "tez://upi/pay", color: "#1a73e8", short: "G" },
  { name: "PhonePe", scheme: "phonepe://pay", color: "#5f259f", short: "Pe" },
  { name: "Paytm", scheme: "paytmmp://pay", color: "#00b9f1", short: "P" },
  { name: "Other UPI", scheme: "upi://pay", color: "#4b5563", short: "UPI" },
];

function UpiPanel({ bill, onToast }: { bill: Bill; onToast: (t: string, e?: boolean) => void }) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const query = bill.upi.uri.split("?")[1] ?? "";

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(bill.upi.uri, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then((url) => alive && setQrSrc(url))
      .catch(() => alive && setQrSrc(null));
    return () => {
      alive = false;
    };
  }, [bill.upi.uri]);

  const copyVpa = async () => {
    try {
      await navigator.clipboard.writeText(bill.upi.vpa);
      onToast("UPI ID copied");
    } catch {
      onToast("Couldn't copy. Long-press the UPI ID instead.", true);
    }
  };

  return (
    <section className="mt-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-white p-5 text-center text-[#16181d] shadow-sm">
        {bill.upi.is_demo && (
          <p className="absolute top-3 -right-9 rotate-45 bg-[#9a7542] px-10 py-1 text-[10px] font-bold tracking-widest text-white">
            DEMO
          </p>
        )}
        <p className="text-sm font-semibold">Scan &amp; pay with any UPI app</p>
        <div className="mx-auto mt-4 grid size-56 place-items-center rounded-2xl border border-[#e4e1da] p-2">
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={qrSrc} alt={`UPI QR code to pay ${formatMoney(bill.due_paise, bill.currency)}`} className="size-full" />
          ) : (
            <div className="size-full animate-pulse rounded-xl bg-[#efede8]" />
          )}
        </div>
        <p className="mt-4 font-display text-2xl font-semibold tabular-nums">
          {formatMoney(bill.due_paise, bill.currency)}
        </p>
        <p className="mt-1 text-sm text-[#6b6f76]">to {bill.upi.payee_name}</p>
        <button
          type="button"
          onClick={copyVpa}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#efede8] px-3.5 py-1.5 font-mono text-xs"
          aria-label={`Copy UPI ID ${bill.upi.vpa}`}
        >
          {bill.upi.vpa}
          <span className="font-sans font-semibold text-[#1e3a33]">Copy</span>
        </button>
        {bill.upi.is_demo && (
          <p className="mt-4 rounded-xl bg-[#f6efe3] px-3 py-2 text-xs text-[#7a5a2e]">
            Demo QR: the restaurant hasn&apos;t added its UPI ID yet, so no real money will move.
          </p>
        )}
      </div>

      <h3 className="mt-6 mb-3 text-sm font-semibold text-muted">Paying from this phone?</h3>
      <div className="grid grid-cols-4 gap-2">
        {UPI_APPS.map((app) => (
          <a
            key={app.name}
            href={`${app.scheme}?${query}`}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-1 py-3 text-center"
          >
            <span
              className="grid size-10 place-items-center rounded-full text-xs font-bold text-white"
              style={{ background: app.color }}
              aria-hidden
            >
              {app.short}
            </span>
            <span className="text-[11px] leading-tight font-medium">{app.name}</span>
          </a>
        ))}
      </div>
      <ol className="mt-5 space-y-1.5 text-sm text-muted">
        <li>1. Scan the QR or tap your UPI app above.</li>
        <li>2. Check the amount and approve the payment.</li>
        <li>3. Come back here and tap &ldquo;I&apos;ve completed the payment&rdquo;.</li>
      </ol>
    </section>
  );
}

function CashPanel({ bill }: { bill: Bill }) {
  return (
    <section className="mt-6 rounded-3xl border border-border bg-surface p-5">
      <p className="font-semibold">Paying in cash</p>
      <p className="mt-1 text-sm text-muted">
        Tap the button below and we&apos;ll let the staff know Table {bill.table_label} is ready to pay{" "}
        <strong className="text-text">{formatMoney(bill.due_paise, bill.currency)}</strong>. Someone will
        come over to collect it.
      </p>
    </section>
  );
}

function PendingView({ bill }: { bill: Bill }) {
  const p = bill.pending_payment!;
  const isUpi = p.method === "upi";
  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <div className="relative grid size-24 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
        <span className="relative grid size-20 place-items-center rounded-full bg-brand-soft text-brand">
          {isUpi ? <UpiMark plain /> : <CashMark plain />}
        </span>
      </div>
      <h2 className="mt-6 font-display text-2xl font-semibold">
        {isUpi ? "Confirming your payment" : "Staff are on the way"}
      </h2>
      <p className="mt-2 max-w-xs text-muted">
        {isUpi
          ? "The restaurant is checking that your UPI payment arrived. This usually takes a minute."
          : `Please keep ${formatMoney(p.amount_paise, bill.currency)} ready. A staff member will collect it at your table.`}
      </p>
      <dl className="mt-8 w-full space-y-2 rounded-2xl bg-surface p-4 text-left text-sm">
        <Row k="Amount" v={formatMoney(p.amount_paise, bill.currency)} />
        <Row k="Method" v={isUpi ? "UPI" : "Cash"} />
        {p.reference && <Row k="UPI reference" v={p.reference} mono />}
        <Row k="Requested by" v={p.guest_name} />
      </dl>
      <p className="mt-4 text-xs text-muted">This page updates automatically.</p>
    </div>
  );
}

function PaidView({ bill }: { bill: Bill }) {
  const last = [...bill.payments].reverse().find((p) => p.status === "paid");
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-ok text-white shadow-lg">
        <CheckIcon width={40} height={40} strokeWidth={2.5} />
      </span>
      <h2 className="mt-5 font-display text-3xl font-semibold">Payment received</h2>
      <p className="mt-2 text-muted">
        {formatMoney(bill.paid_paise, bill.currency)} paid to {bill.restaurant_name}
        {last && ` via ${last.method === "upi" ? "UPI" : "cash"}`}
      </p>
      <div className="mt-7 w-full rounded-2xl bg-surface p-5 text-left text-sm shadow-sm">
        <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
          Receipt · Table {bill.table_label}
        </p>
        <BillLines bill={{ ...bill, paid_paise: 0 }} />
      </div>
      <p className="mt-6 font-display text-lg">Thank you for dining with us!</p>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`font-medium ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  );
}

function UpiMark({ plain }: { plain?: boolean }) {
  return (
    <span
      className={`grid size-11 shrink-0 place-items-center rounded-xl text-[11px] font-black tracking-tight ${
        plain ? "" : "bg-brand-soft text-brand"
      }`}
    >
      UPI
    </span>
  );
}

function CashMark({ plain }: { plain?: boolean }) {
  return (
    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${plain ? "" : "bg-brand-soft text-brand"}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9v.01M18 15v.01" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
