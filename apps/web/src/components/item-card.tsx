import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { DietMark } from "./diet-mark";
import { Stepper } from "./stepper";

type Props = {
  item: Schemas["MenuItemOut"];
  currency: string;
  myQty: number;
  othersQty: number;
  busy: boolean;
  onAdd: () => void;
  onChangeQty: (next: number) => void;
  onOpen: () => void;
};

export function ItemCard({ item, currency, myQty, othersQty, busy, onAdd, onChangeQty, onOpen }: Props) {
  const soldOut = !item.is_available;
  return (
    <li className={`flex gap-3 py-4 ${soldOut ? "opacity-55" : ""}`}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <DietMark dietary={item.dietary} />
          <h3 className="font-medium leading-snug">{item.name}</h3>
        </div>
        <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(item.price_paise, currency)}</p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{item.description}</p>
        )}
        {othersQty > 0 && (
          <p className="mt-1.5 text-xs font-medium text-brand">
            {othersQty} added by others at your table
          </p>
        )}
      </button>
      <div className="flex w-28 shrink-0 flex-col items-center justify-start gap-2">
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- restaurant-supplied URLs
          <img src={item.image_url} alt="" className="size-24 rounded-xl object-cover" />
        )}
        {soldOut ? (
          <span className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted">
            Sold out
          </span>
        ) : myQty > 0 ? (
          <Stepper quantity={myQty} onChange={onChangeQty} disabled={busy} />
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className="h-9 w-24 rounded-lg border border-brand bg-surface text-sm font-bold tracking-wide text-brand shadow-sm active:scale-95 disabled:opacity-50"
          >
            ADD
          </button>
        )}
      </div>
    </li>
  );
}
