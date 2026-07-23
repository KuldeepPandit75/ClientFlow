import { SuperAdminResource } from "@/screens/SuperAdmin";

export default function UsersPage() {
  return <SuperAdminResource title="Users" endpoint="/api/super-admin/users" columns={["_id", "name", "email", "role", "businessId", "status"]} />;
}
