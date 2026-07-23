import { attachSessionCookie } from "@/lib/auth/session";
import { fail } from "@/lib/backend/response";
import { registerUser } from "@/lib/services/auth-service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.email || !body.password) {
      return fail("name, email and password are required");
    }
    const user = await registerUser(body);
    const response = NextResponse.json(
      {
        success: true,
        message: "User registered",
        data: user,
      },
      { status: 201 },
    );
    return attachSessionCookie(response, user.email, user.role);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Registration failed", 400);
  }
}
