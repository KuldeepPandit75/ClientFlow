import { requireSessionEmail } from "@/lib/auth/session";
import { fail } from "@/lib/backend/response";
import { getEvolutionMedia } from "@/lib/evolution/client";
import { getEvolutionOwnerEmailForCustomer } from "@/lib/services/conversation-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userEmail = await requireSessionEmail();
  const { id } = await params;
  const url = new URL(_request.url);
  const remoteJid = url.searchParams.get("remoteJid") || undefined;
  const fromMeParam = url.searchParams.get("fromMe");
  const fromMe = fromMeParam === null ? undefined : fromMeParam === "true";
  const participant = url.searchParams.get("participant") || undefined;

  try {
    const ownerEmail = remoteJid ? await getEvolutionOwnerEmailForCustomer(userEmail, remoteJid) : userEmail;
    const media = await getEvolutionMedia(id, { remoteJid, fromMe, participant }, { userEmail: ownerEmail });
    return new Response(media.buffer, {
      headers: {
        "Content-Type": media.mimetype,
        "Content-Disposition": `inline; filename="${media.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Media not found", 404);
  }
}
