import { formatMoney, type Order, type OrderStatus } from "@qrmenu/api-client";
import { CheckIcon } from "./icons";
import { Sheet } from "./sheet";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Sent" },
  { status: "accepted", label: "Accepted" },
  { status: "preparing", label: "Cooking" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Served" },
];

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

function Progress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
        This order was cancelled by the restaurant.
      </p>
    );
  }
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="flex items-start" aria-label={`Status: ${STEPS[current]?.label}`}>
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step.status} className="flex flex-1 flex-col items-center gap-1 text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done ? "bg-ok" : "bg-border"}`} />
              <span
                className={`grid size-6 place-items-center rounded-full text-white ${
                  done ? "bg-ok" : "border-2 border-border bg-surface"
                } ${i === current ? "ring-4 ring-ok/20" : ""}`}
              >
                {done && <CheckIcon width={14} height={14} strokeWidth={3} />}
              </span>
              <span
                className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "opacity-0" : i < current ? "bg-ok" : "bg-border"}`}
              />
            </div>
            <span className={`text-[11px] ${i === current ? "font-semibold" : "text-muted"}`}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrdersSheet({
  orders,
  currency,
  onClose,
}: {
  orders: Order[];
  currency: string;
  onClose: () => void;
}) {
  const billable = orders.filter((o) => o.status !== "cancelled");
  const tableTotal = billable.reduce((n, o) => n + o.total_paise, 0);
  return (
    <Sheet
      title="Your table's orders"
      onClose={onClose}
      footer={
        orders.length > 0 && (
          <div>
            <div className="flex justify-between text-base font-semibold tabular-nums">
              <span>Table total so far</span>
              <span>{formatMoney(tableTotal, currency)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Ask the staff for the bill when you&apos;re done.</p>
          </div>
        )
      }
    >
      {orders.length === 0 ? (
        <p className="py-10 text-center text-muted">No orders sent to the kitchen yet.</p>
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => (
            <li key={o.id} className="rounded-2xl bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-semibold">Order #{o.order_number}</h3>
                <span className="text-xs text-muted">
                  {timeFmt.format(new Date(o.created_at))} · by {o.placed_by_name}
                </span>
              </div>
              <Progress status={o.status} />
              <ul className="mt-3 space-y-1 text-sm">
                {(o.items ?? []).map((it) => (
                  <li key={it.id} className="flex justify-between gap-3">
                    <span>
                      {it.quantity} × {it.name}
                      {it.note && <span className="text-muted italic"> “{it.note}”</span>}
                    </span>
                    <span className="tabular-nums text-muted">
                      {formatMoney(it.line_total_paise, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-border pt-2 text-right text-sm font-semibold tabular-nums">
                {formatMoney(o.total_paise, currency)}
                <span className="font-normal text-muted"> incl. GST</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
