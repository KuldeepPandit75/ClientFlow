import { attachSessionCookie } from "@/lib/auth/session";
import { fail } from "@/lib/backend/response";
import { acceptInvite, getInviteByToken } from "@/lib/services/team-service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const invite = await getInviteByToken(token);
    return NextResponse.json({ success: true, data: invite });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invite not found", 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await acceptInvite({ token: body.token, password: body.password });
    const response = NextResponse.json(
      { success: true, message: "Invite accepted", data: user },
      { status: 201 },
    );
    return attachSessionCookie(response, user.email, user.role);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invite could not be accepted", 400);
  }
}
