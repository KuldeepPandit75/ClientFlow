import { SuperAdminResource } from "@/screens/SuperAdmin";

export default function WhatsappSessionsPage() {
  return <SuperAdminResource title="WhatsApp Sessions" endpoint="/api/super-admin/whatsapp-sessions" columns={["_id", "businessId", "instanceName", "phoneNumber", "status", "lastSyncAt"]} />;
}
