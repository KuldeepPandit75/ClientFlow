import { GET as getMessages } from "@/app/api/conversations/[id]/messages/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const { customerId } = await params;
  return getMessages(request, { params: Promise.resolve({ id: customerId }) });
}
