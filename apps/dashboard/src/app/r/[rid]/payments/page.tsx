import { Suspense } from "react";
import { PaymentsBoard } from "@/components/payments-board";

// Staff-only screens render after the client-side sign-in check (see layout).
export const instant = false;

export default function PaymentsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading payments…</p>}>
      <PaymentsBoard />
    </Suspense>
  );
}
