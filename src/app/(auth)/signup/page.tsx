import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbReady } from "@/db/client";
import { SESSION_COOKIE, userFromSessionToken } from "@/server/auth";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  await dbReady;
  if (await userFromSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/app");
  return <AuthScreen mode="signup" />;
}
