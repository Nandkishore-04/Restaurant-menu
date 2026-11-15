import { Suspense } from "react";
import { MenuEditor } from "@/components/menu-editor";

// Staff-only screens: content renders after the client-side sign-in check, so there is
// nothing to prerender and instant-navigation validation can't apply.
export const instant = false;

export default function MenuPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading menu…</p>}>
      <MenuEditor />
    </Suspense>
  );
}
