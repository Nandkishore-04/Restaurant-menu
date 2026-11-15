import { RequireAuth } from "@/components/require-auth";
import { RestaurantPicker } from "@/components/restaurant-picker";

export default function DashboardHome() {
  return (
    <RequireAuth>
      <RestaurantPicker />
    </RequireAuth>
  );
}
