import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** Redirects to /login if not authenticated. Use in server components. */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects to / if not an admin. Use in server components. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** Guards an API route handler — returns 401/403 JSON if not authenticated/admin. */
export async function requireAdminApi(
  req: NextRequest
): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Неоторизиран достъп" },
        { status: 401 }
      ),
    };
  }
  if (session.user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Достъпът е забранен" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user: session.user };
}

/** Guards an API route handler — returns 401 JSON if not authenticated. */
export async function requireAuthApi(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Неоторизиран достъп" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, user: session.user };
}
