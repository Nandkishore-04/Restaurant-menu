"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api, unwrap } from "@/lib/api";
import { signOut } from "@/lib/auth";

export function useMyRestaurants() {
  return useQuery({
    queryKey: ["me", "restaurants"],
    queryFn: () => unwrap(api.GET("/v1/me/restaurants")),
    staleTime: 60_000,
  });
}

/** The signed-in user's restaurant + what their role allows. */
export function useMyRestaurant(rid: string) {
  const mine = useMyRestaurants();
  const entry = mine.data?.find((r) => r.restaurant.id === rid);
  const role = entry?.role;
  const isEditor = role === "owner" || role === "manager";
  return {
    restaurant: entry?.restaurant,
    role,
    isOwner: role === "owner",
    canEditMenu: isEditor,
    canSeeOverview: isEditor,
    canTakePayments: !!role && role !== "kitchen",
    isPending: mine.isPending,
  };
}

export function homeFor(rid: string, role: string | undefined) {
  if (role === "owner" || role === "manager") return `/r/${rid}/overview`;
  if (role === "staff") return `/r/${rid}/tables`; // waiters work the floor
  return `/r/${rid}/kitchen`;
}

/** Header + tabs shared by every screen of one restaurant. */
export function RestaurantShell({ children }: { children: ReactNode }) {
  const { rid } = useParams<{ rid: string }>();
  const pathname = usePathname();
  const me = useMyRestaurant(rid);

  // Print views (QR cards) get the whole page, no app chrome.
  if (pathname.endsWith("/print")) return <>{children}</>;

  const tabs = [
    me.canSeeOverview && { href: "overview", label: "Overview" },
    { href: "kitchen", label: "Kitchen" },
    me.canTakePayments && { href: "orders", label: "Orders" },
    me.canTakePayments && { href: "tables", label: "Tables" },
    me.canTakePayments && { href: "payments", label: "Payments" },
    me.canEditMenu && { href: "menu", label: "Menu" },
    me.canEditMenu && { href: "staff", label: "Staff" },
    me.canEditMenu && { href: "settings", label: "Settings" },
  ].filter((t): t is { href: string; label: string } => !!t);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-4 border-b border-border px-5">
        <Link href="/" className="py-3 text-muted hover:text-text" aria-label="All restaurants">
          ←
        </Link>
        <p className="shrink-0 py-3 font-display text-lg font-semibold">{me.restaurant?.name ?? "…"}</p>
        <nav className="order-last flex basis-full flex-wrap gap-1 self-stretch lg:order-none lg:basis-auto lg:flex-1" aria-label="Restaurant sections">
          {tabs.map((t) => {
            const href = `/r/${rid}/${t.href}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={t.href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center border-b-2 px-3 py-2.5 text-sm font-medium lg:py-0 ${
                  active ? "border-brand text-text" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <span className="ml-auto shrink-0 text-xs text-muted lg:ml-0">
          <span className="hidden sm:inline">Signed in as </span>
          <span className="capitalize">{me.role}</span>
        </span>
        <button type="button" onClick={() => void signOut()} className="shrink-0 text-sm text-muted hover:text-text">
          Sign out
        </button>
      </header>
      {me.restaurant && !me.restaurant.is_active && (
        <p role="alert" className="bg-danger/15 px-5 py-2 text-sm font-medium text-danger">
          This restaurant is suspended by the platform. Guests can&apos;t scan its QR codes right now.
        </p>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
