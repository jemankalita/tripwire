import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { UrlError } from "@/core/url";
import { BlockedTargetError } from "@/core/ssrf";
import { dbReady } from "@/db/client";
import { authenticateRequest, SESSION_COOKIE, SESSION_TTL_MS, type AuthResult } from "./auth";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, error: string, details?: unknown): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json({ ok: false, error, ...(details ? { details } : {}) }, { status });
}

type RouteContext<P> = { params: Promise<P> };

/** Uniform error handling + envelope for every route handler. */
export function route<P = Record<string, string>>(
  fn: (req: Request, ctx: RouteContext<P>) => Promise<Response>,
): (req: Request, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    try {
      await dbReady;
      return await fn(req, ctx);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.message, error.details);
      if (error instanceof ZodError) {
        return fail(
          400,
          error.issues[0]?.message ?? "Invalid input",
          error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      if (error instanceof UrlError || error instanceof BlockedTargetError) return fail(400, error.message);
      console.error(`[api] ${req.method} ${new URL(req.url).pathname} failed:`, error);
      return fail(500, "Something went wrong on our side. Please try again.");
    }
  };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF defence for cookie-authenticated mutations: the Origin must be our own. */
function assertSameOrigin(req: Request): void {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients; SameSite=Lax still protects the cookie
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
}

export async function requireAuth(req: Request): Promise<AuthResult> {
  const auth = await authenticateRequest(req);
  if (!auth) throw new HttpError(401, "Sign in to continue");
  if (auth.via === "session") assertSameOrigin(req);
  return auth;
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
  return schema.parse(body);
}

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;
const BUCKET_TTL_MS = 60 * 60_000;

function pruneBuckets(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, hits] of buckets) if (!hits.length || now - hits[hits.length - 1] > BUCKET_TTL_MS) buckets.delete(key);
}

/** Simple in-process sliding-window limiter (single-node deployment). */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  pruneBuckets(now);
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    throw new HttpError(429, `Too many requests — try again in ${retryAfter}s`);
  }
  buckets.set(key, [...recent, now]);
}

/** Forwarding headers are spoofable; trust them only when a proxy we control sets them (TRUST_PROXY=1). */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY !== "1") return "direct";
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || req.headers.get("x-real-ip") || "direct";
}

export function withSessionCookie<T extends NextResponse>(res: T, token: string): T {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}

export function clearSessionCookie<T extends NextResponse>(res: T): T {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
}
