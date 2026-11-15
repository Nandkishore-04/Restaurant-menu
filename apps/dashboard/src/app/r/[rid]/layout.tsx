import { Suspense, type ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";
import { RestaurantShell } from "@/components/restaurant-shell";

// Staff-only screens: content renders after the client-side sign-in check, so there is
// nothing to prerender and instant-navigation validation can't apply.
export const instant = false;

export default function RestaurantLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RequireAuth>
        <RestaurantShell>{children}</RestaurantShell>
      </RequireAuth>
    </Suspense>
  );
}
