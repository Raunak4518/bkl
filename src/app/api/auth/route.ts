import { NextRequest, NextResponse } from "next/server";

/**
 * POST — Validate PIN and set session cookie.
 * Body: { pin: string }
 *
 * DELETE — Clear session cookie (logout).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pin = body.pin?.toString().trim();

    if (!pin) {
      return NextResponse.json(
        { error: "PIN is required." },
        { status: 400 },
      );
    }

    const accessPin = process.env.ACCESS_PIN;
    const sessionSecret = process.env.SESSION_SECRET;

    if (!accessPin || !sessionSecret) {
      return NextResponse.json(
        { error: "Server auth not configured. Set ACCESS_PIN and SESSION_SECRET in .env.local." },
        { status: 500 },
      );
    }

    if (pin !== accessPin) {
      return NextResponse.json(
        { error: "Wrong PIN." },
        { status: 401 },
      );
    }

    // PIN is correct — set session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: "session",
      value: sessionSecret,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 2, // 2 hours
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auth error." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: "session",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0, // Expire immediately
  });
  return response;
}
