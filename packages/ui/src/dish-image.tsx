"use client";

import { useState, type CSSProperties } from "react";

export type DishImageProps = {
  name: string;
  /** Category name helps pick a fitting placeholder icon (e.g. "Drinks" -> cup). */
  category?: string;
  imageUrl?: string | null;
  soldOut?: boolean;
  className?: string;
  /** Icon size in px for the placeholder. */
  iconSize?: number;
};

type Kind = "drink" | "dessert" | "bread" | "starter" | "rice" | "main";

const KIND_WORDS: [Kind, RegExp][] = [
  ["drink", /drink|beverage|lassi|chaas|juice|tea|coffee|chai|shake|soda|water|mocktail|cooler|soup/i],
  ["dessert", /dessert|sweet|jamun|rasmalai|halwa|kheer|ice ?cream|kulfi|cake|brownie|gulab|rasgulla|payasam/i],
  ["bread", /bread|naan|roti|paratha|kulcha|chapati|puri|bhatura|appam|dosa/i],
  ["rice", /rice|biryani|pulao|khichdi|fried rice|noodle/i],
  ["starter", /starter|appetizer|tikka|kebab|65|pakora|papad|chaat|samosa|tandoori|fries|snack/i],
];

function kindOf(name: string, category = ""): Kind {
  for (const [kind, re] of KIND_WORDS) if (re.test(name)) return kind;
  for (const [kind, re] of KIND_WORDS) if (re.test(category)) return kind;
  return "main";
}

/** Muted, food-friendly hues so every dish gets a stable, distinct tint. */
const HUES = [24, 36, 48, 140, 165, 195, 345, 12];

function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

const ICONS: Record<Kind, string> = {
  // steaming bowl
  main: "M3 11h18a9 9 0 0 1-18 0Z M7 7c0-1.5 1-1.5 1-3 M12 7c0-1.5 1-1.5 1-3 M17 7c0-1.5 1-1.5 1-3",
  // cup
  drink: "M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Z M17 10h1.5a2.5 2.5 0 0 1 0 5H17 M8 3v2 M12 3v2",
  // dessert bowl with scoops
  dessert: "M4 13h16l-2 6H6l-2-6Z M8 13a3 3 0 0 1 6 0 M12 13a3 3 0 0 1 6 0",
  // flatbread
  bread: "M4 14c0-4 3.5-7 8-7s8 3 8 7c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3Z M9 11l1 2 M13 10l1 2 M16 12l.5 1",
  // skewer
  starter: "M4 20 20 4 M8 12l4 4 M11 9l4 4 M14 6l4 4",
  // rice plate
  rice: "M3 14h18 M5 14a7 7 0 0 1 14 0 M9 10h.01 M12 9h.01 M15 10h.01 M11 12h.01 M14 12h.01",
};

/**
 * Dish photo, or a tasteful generated placeholder when there is no photo
 * (or the photo fails to load). Adapts to light/dark via CSS light-dark().
 */
export function DishImage({
  name,
  category,
  imageUrl,
  soldOut,
  className = "",
  iconSize = 32,
}: DishImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = !!imageUrl && failedUrl !== imageUrl;
  const muted: CSSProperties = soldOut ? { filter: "grayscale(1)", opacity: 0.6 } : {};

  if (showPhoto) {
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        onError={() => setFailedUrl(imageUrl)}
        className={`object-cover ${className}`}
        style={muted}
      />
    );
  }

  const h = hueOf(name);
  const style: CSSProperties = {
    background: `linear-gradient(135deg, light-dark(hsl(${h} 38% 94%), hsl(${h} 18% 18%)), light-dark(hsl(${h + 18} 34% 85%), hsl(${h + 18} 20% 12%)))`,
    color: `light-dark(hsl(${h} 30% 38%), hsl(${h} 30% 68%))`,
    ...muted,
  };
  return (
    <div
      role="img"
      aria-label={`${name} (photo coming soon)`}
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={style}
    >
      {/* soft dotted texture */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(currentColor 0.8px, transparent 0.8px)",
          backgroundSize: "10px 10px",
          opacity: 0.12,
        }}
      />
      <svg
        aria-hidden
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
      >
        <path d={ICONS[kindOf(name, category)]} />
      </svg>
    </div>
  );
}
