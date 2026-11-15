import { Suspense } from "react";
import { TableMenu } from "./table-menu";

// Entry point printed in each table's QR code: /t/{qr_token}
export default function TableMenuPage() {
  return (
    <Suspense fallback={null}>
      <TableMenu />
    </Suspense>
  );
}
