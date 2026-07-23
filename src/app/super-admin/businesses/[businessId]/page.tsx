import { SuperAdminBusinessDetail } from "@/screens/SuperAdmin";

export default async function BusinessDetailPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <SuperAdminBusinessDetail businessId={businessId} />;
}
