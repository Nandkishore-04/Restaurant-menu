"use client";

import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { DishImage } from "@qrmenu/ui";
import { useState } from "react";
import { DietMark } from "./diet-mark";
import { Sheet } from "./sheet";
import { Stepper } from "./stepper";

type Props = {
  item: Schemas["MenuItemOut"];
  category: string;
  currency: string;
  busy: boolean;
  onAdd: (quantity: number, note: string) => void;
  onClose: () => void;
};

/** Item details with quantity + kitchen note ("less spicy", "no onion"). */
export function ItemSheet({ item, category, currency, busy, onAdd, onClose }: Props) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={
        <span className="flex items-center gap-2">
          <DietMark dietary={item.dietary} /> {item.name}
        </span>
      }
      onClose={onClose}
      footer={
        item.is_available ? (
          <div className="flex items-center gap-3">
            <Stepper quantity={qty} onChange={(n) => setQty(Math.max(1, n))} />
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdd(qty, note)}
              className="h-12 flex-1 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
            >
              Add · {formatMoney(item.price_paise * qty, currency)}
            </button>
          </div>
        ) : (
          <p className="text-center font-medium text-muted">Currently sold out</p>
        )
      }
    >
      <DishImage
        name={item.name}
        category={category}
        imageUrl={item.image_url}
        soldOut={!item.is_available}
        iconSize={56}
        className="mb-5 aspect-[16/10] w-full rounded-2xl"
      />
      <p className="text-lg font-semibold tabular-nums">{formatMoney(item.price_paise, currency)}</p>
      {item.description && <p className="mt-2 text-muted">{item.description}</p>}
      {item.is_available && (
        <label className="mt-5 block">
          <span className="text-sm font-medium">Note for the kitchen (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. less spicy, no onion"
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-brand"
          />
        </label>
      )}
    </Sheet>
  );
}
