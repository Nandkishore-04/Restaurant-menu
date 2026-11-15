type Props = {
  quantity: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function Stepper({ quantity, onChange, disabled, size = "md" }: Props) {
  const h = size === "sm" ? "h-8" : "h-9";
  const w = size === "sm" ? "w-8" : "w-9";
  return (
    <div
      className={`inline-flex ${h} items-center overflow-hidden rounded-lg border border-brand bg-brand-soft text-brand`}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled}
        onClick={() => onChange(quantity - 1)}
        className={`${h} ${w} text-lg font-semibold disabled:opacity-40`}
      >
        −
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || quantity >= 50}
        onClick={() => onChange(quantity + 1)}
        className={`${h} ${w} text-lg font-semibold disabled:opacity-40`}
      >
        +
      </button>
    </div>
  );
}
