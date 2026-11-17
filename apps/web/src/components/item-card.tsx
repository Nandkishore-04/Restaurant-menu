import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { DishImage } from "@qrmenu/ui";
import { DietMark } from "./diet-mark";
import { Stepper } from "./stepper";

type Props = {
  item: Schemas["MenuItemOut"];
  category: string;
  currency: string;
  myQty: number;
  othersQty: number;
  busy: boolean;
  onAdd: () => void;
  onChangeQty: (next: number) => void;
  onOpen: () => void;
};

export function ItemCard({
  item,
  category,
  currency,
  myQty,
  othersQty,
  busy,
  onAdd,
  onChangeQty,
  onOpen,
}: Props) {
  const soldOut = !item.is_available;
  return (
    <li className="flex gap-4 py-5">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <DietMark dietary={item.dietary} />
        <h3 className={`mt-1.5 text-[17px] leading-snug font-semibold ${soldOut ? "text-muted" : ""}`}>
          {item.name}
        </h3>
        <p className="mt-1 font-medium tabular-nums">{formatMoney(item.price_paise, currency)}</p>
        {item.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{item.description}</p>
        )}
        {othersQty > 0 && (
          <p className="mt-2 inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
            {othersQty} added by others at your table
          </p>
        )}
      </button>

      <div className="relative w-32 shrink-0 self-start pb-4">
        <button type="button" onClick={onOpen} aria-label={`View ${item.name}`} className="block w-full">
          <DishImage
            name={item.name}
            category={category}
            imageUrl={item.image_url}
            soldOut={soldOut}
            className="aspect-square w-full rounded-2xl"
          />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          {soldOut ? (
            <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted shadow-sm">
              Sold out
            </span>
          ) : myQty > 0 ? (
            <div className="rounded-lg bg-surface shadow-md">
              <Stepper quantity={myQty} onChange={onChangeQty} disabled={busy} />
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={busy}
              className="h-9 w-24 rounded-lg border border-border bg-surface text-sm font-bold tracking-wider text-brand shadow-md transition active:scale-95 disabled:opacity-60"
            >
              ADD
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
