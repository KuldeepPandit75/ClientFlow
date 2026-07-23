import { attachSessionCookie } from "@/lib/auth/session";
import { fail } from "@/lib/backend/response";
import { loginUser } from "@/lib/services/auth-service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.email || !body.password) return fail("email and password are required");
    const result = await loginUser(body);
    const response = NextResponse.json(
      {
        success: true,
        message: "Login successful",
        data: result,
      },
      { status: 200 },
    );
    return attachSessionCookie(response, result.user.email, result.user.role);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Login failed", 400);
  }
}
