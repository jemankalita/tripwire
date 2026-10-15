import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbReady } from "@/db/client";
import { publicUser, SESSION_COOKIE, userFromSessionToken } from "@/server/auth";
import { AppShell } from "@/components/app/AppShell";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  await dbReady;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await userFromSessionToken(token);
  if (!user) redirect("/login?next=/app");
  return <AppShell user={publicUser(user)}>{children}</AppShell>;
}
