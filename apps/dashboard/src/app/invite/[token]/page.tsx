import { Suspense } from "react";
import { InviteAccept } from "@/components/invite-accept";

// Staff-only screens render after the client-side sign-in check, so there is
// nothing to prerender and instant-navigation validation can't apply.
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
      <InviteAccept />
    </Suspense>
  );
}
