import type { Schemas } from "@qrmenu/api-client";

type Dietary = Schemas["Dietary"];

const LABEL: Record<Dietary, string> = {
  veg: "Vegetarian",
  vegan: "Vegan",
  egg: "Contains egg",
  non_veg: "Non-vegetarian",
};

/** Indian food-type mark: square outline with a dot (veg) or triangle (non-veg). */
export function DietMark({ dietary }: { dietary: Dietary }) {
  const color =
    dietary === "non_veg" ? "var(--nonveg)" : dietary === "egg" ? "var(--egg)" : "var(--veg)";
  return (
    <span
      role="img"
      aria-label={LABEL[dietary]}
      title={LABEL[dietary]}
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
