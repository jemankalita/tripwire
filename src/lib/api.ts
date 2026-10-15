"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { WatchSummary, getWatchDetail, diffBetween, visualBetween } from "@/server/watches";
import type { createPreview } from "@/server/previews";
import type { ChannelView } from "@/server/channels";
import type { publicUser } from "@/server/auth";

export type { WatchSummary, ChannelView };
export type WatchDetail = Awaited<ReturnType<typeof getWatchDetail>>;
export type DiffResult = Awaited<ReturnType<typeof diffBetween>>;
export type VisualResult = Awaited<ReturnType<typeof visualBetween>>;
export type Preview = Awaited<ReturnType<typeof createPreview>>;
export type PublicUser = ReturnType<typeof publicUser>;
export type Me = {
  user: PublicUser;
  features: { ai: boolean; smtp: boolean; telegram: boolean; confirmDelayMs: number };
};
export type InboxEmail = { id: string; to: string; subject: string; html: string; text: string; createdAt: number };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export async function api<T>(path: string, init: { method?: Method; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Can't reach Tripwire — check your connection");
  }

  let json: { ok: boolean; data?: T; error?: string; details?: ApiError["details"] };
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, "Unexpected response from the server");
  }

  // 401s are routed to the sign-in page by the SWR error handler in AppShell.
  if (!json.ok) throw new ApiError(res.status, json.error ?? "Request failed", json.details);
  return json.data as T;
}

const fetcher = <T,>(path: string) => api<T>(path);
const LIVE: SWRConfiguration = { refreshInterval: 4000, revalidateOnFocus: true, keepPreviousData: true };

export function useWatches() {
  return useSWR<{ watches: WatchSummary[] }>("/api/watches", fetcher, LIVE);
}

export function useWatch(id: string | undefined) {
  return useSWR<{ watch: WatchDetail }>(id ? `/api/watches/${id}` : null, fetcher, LIVE);
}

export function useDiff(id: string, from: string | null, to: string | null) {
  return useSWR<DiffResult>(from && to ? `/api/watches/${id}/diff?from=${from}&to=${to}` : null, fetcher, {
    keepPreviousData: true,
  });
}

export function useVisual(id: string, from: string | null, to: string | null, enabled: boolean) {
  return useSWR<VisualResult>(enabled && from && to ? `/api/watches/${id}/visual?from=${from}&to=${to}` : null, fetcher, {
    keepPreviousData: true,
  });
}

export function useChannels() {
  return useSWR<{ channels: ChannelView[] }>("/api/channels", fetcher);
}

export function useMe() {
  return useSWR<Me>("/api/me", fetcher);
}

export function useInbox() {
  return useSWR<{ emails: InboxEmail[] }>("/api/inbox", fetcher, { refreshInterval: 5000 });
}
