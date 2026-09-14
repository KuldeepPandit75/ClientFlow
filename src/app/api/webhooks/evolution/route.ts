import { handleEvolutionWebhook } from "@/lib/evolution/webhook";

export const maxDuration = 30;

export async function POST(request: Request) {
  return handleEvolutionWebhook(request);
}
