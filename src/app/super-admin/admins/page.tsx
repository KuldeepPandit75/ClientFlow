import { SuperAdminResource } from "@/screens/SuperAdmin";

export default function AdminsPage() {
  return <SuperAdminResource title="Admins" endpoint="/api/super-admin/admins" columns={["name", "email", "businessName", "plan", "businessStatus", "paymentStatus", "lastPaymentAmount", "lastPaymentAt", "status"]} />;
}
