import { DemoHome } from "@/components/demo-home";
import { DEMO_MODE } from "@/lib/config";

export default function Home() {
  if (DEMO_MODE) return <DemoHome />;
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="font-display text-2xl font-semibold">QR Menu</h1>
      <p className="mt-2 text-muted">Scan the QR code on your table to see the menu and order.</p>
    </main>
  );
}
