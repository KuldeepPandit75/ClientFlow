import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/auth/session";

export default async function HomePage() {
  const email = await getSessionEmail();
  redirect(email ? "/inbox" : "/landing");
}
