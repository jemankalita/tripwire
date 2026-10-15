import { rawClient } from "@/db/client";
import { ok, route } from "@/server/http";

/** Liveness + database check for the hosting platform's health checks. */
export const GET = route(async () => {
  await rawClient.execute("select 1");
  return ok({ status: "ok", db: true }, { headers: { "Cache-Control": "no-store" } });
});
