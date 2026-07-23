import { handleEvolutionWebhook } from "@/lib/evolution/webhook";

export async function POST(request: Request) {
  return handleEvolutionWebhook(request);
}
