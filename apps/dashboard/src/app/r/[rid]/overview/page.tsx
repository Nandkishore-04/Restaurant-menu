import { Suspense } from "react";
import { OverviewPage } from "@/components/overview-page";

// Staff-only screens render after the client-side sign-in check, so there is
// nothing to prerender and instant-navigation validation can't apply.
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
      <OverviewPage />
    </Suspense>
  );
}
