import { clearSessionCookie } from "@/lib/auth/session";
import { logoutUser } from "@/lib/services/auth-service";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json(
    {
      success: true,
      message: "Logout successful",
      data: logoutUser(),
    },
    { status: 200 },
  );
  return clearSessionCookie(response);
}
