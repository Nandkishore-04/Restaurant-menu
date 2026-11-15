import { Suspense } from "react";
import { KitchenBoard } from "@/components/kitchen-board";

// Staff-only screens: content renders after the client-side sign-in check, so there is
// nothing to prerender and instant-navigation validation can't apply.
export const instant = false;

export default function KitchenPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading kitchen…</p>}>
      <KitchenBoard />
    </Suspense>
  );
}
