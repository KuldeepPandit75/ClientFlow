import { SuperAdminResource } from "@/screens/SuperAdmin";

export default function LogsPage() {
  return <SuperAdminResource title="Logs" endpoint="/api/super-admin/logs" columns={["_id", "businessId", "actorUserId", "actorRole", "action", "targetType", "targetId", "createdAt"]} />;
}
