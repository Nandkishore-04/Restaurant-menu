import { Suspense } from "react";
import { DemoSignIn } from "@/components/demo-sign-in";

export const instant = false;

export default function DemoPage() {
  return (
    <Suspense fallback={null}>
      <DemoSignIn />
    </Suspense>
  );
}
