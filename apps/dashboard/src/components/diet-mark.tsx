import type { Schemas } from "@qrmenu/api-client";

export type Dietary = Schemas["Dietary"];

export const DIET_LABEL: Record<Dietary, string> = {
  veg: "Veg",
  vegan: "Vegan",
  egg: "Egg",
  non_veg: "Non-veg",
};

const COLOR: Record<Dietary, string> = {
  veg: "#4ade80",
  vegan: "#4ade80",
  egg: "#facc15",
  non_veg: "#f87171",
};

export function DietMark({ dietary }: { dietary: Dietary }) {
  const color = COLOR[dietary];
  return (
    <span
      role="img"
      aria-label={DIET_LABEL[dietary]}
      title={DIET_LABEL[dietary]}
      className="inline-grid size-4 shrink-0 place-items-center rounded-[3px] border-[1.5px]"
      style={{ borderColor: color }}
    >
      {dietary === "non_veg" ? (
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
          <path d="M5 1 9.5 9h-9z" fill={color} />
        </svg>
      ) : (
        <span className="size-2 rounded-full" style={{ background: color }} />
      )}
    </span>
  );
}
