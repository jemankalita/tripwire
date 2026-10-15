import nodemailer from "nodemailer";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  changes,
  channels,
  deliveries,
  outbox,
  targets,
  users,
  watches,
  type Change,
  type Channel,
  type DeliveryStatus,
  type Target,
  type Watch,
} from "@/db/schema";
import { newId } from "@/core/hash";
import { displayUrl } from "@/core/url";
import { config } from "./config";
import { isDiscordWebhook } from "./schemas";

export type AlertMessage = {
  title: string;
  headline: string;
  detail: string;
  link: string;
  color: number;
};

const COLORS = { change: 0xffb020, down: 0xff5c5c, up: 0x3ddc97, test: 0x8a93a6 } as const;
const DIGEST_CHUNK = 10;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildMessage(change: Change, watch: Watch, target: Target): AlertMessage {
  const link = `${config.appUrl}/share/${change.shareToken}`;
  const headline = change.aiSummary ?? change.summary;
  const page = displayUrl(target.url);
  switch (change.kind) {
    case "down":
      return { title: `⚠ ${watch.name} is unreachable`, headline, detail: page, link, color: COLORS.down };
    case "up":
      return { title: `✓ ${watch.name} is back online`, headline, detail: page, link, color: COLORS.up };
    case "number":
      return { title: `${watch.name}: tracked number changed`, headline, detail: page, link, color: COLORS.change };
    default: {
      const stats = `+${change.added} / −${change.removed} lines`;
      const visual = change.visualRatio != null ? ` · ${(change.visualRatio * 100).toFixed(1)}% of pixels` : "";
      return { title: `${watch.name} changed`, headline, detail: `${page} · ${stats}${visual}`, link, color: COLORS.change };
    }
  }
}

function emailHtml(messages: AlertMessage[], intro: string): string {
  const rows = messages
    .map(
      (m) => `<tr><td style="padding:16px 20px;border-top:1px solid #e7e5df">
  <div style="font:600 15px/1.4 system-ui,sans-serif;color:#0b0d10">${escapeHtml(m.title)}</div>
  <div style="font:15px/1.5 system-ui,sans-serif;color:#0b0d10;margin-top:4px">${escapeHtml(m.headline)}</div>
  <div style="font:12px/1.5 ui-monospace,monospace;color:#6b7280;margin-top:6px">${escapeHtml(m.detail)}</div>
  <a href="${escapeHtml(m.link)}" style="display:inline-block;margin-top:10px;font:600 13px system-ui,sans-serif;color:#b36b00">View the diff →</a>
</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" style="background:#f6f5f1;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" style="background:#fff;border:1px solid #e7e5df;border-radius:10px">
<tr><td style="padding:18px 20px;font:600 13px system-ui,sans-serif;letter-spacing:.04em;color:#6b7280">TRIPWIRE · ${escapeHtml(intro)}</td></tr>
${rows}
</table></td></tr></table>`;
}

type EmailInput = { userId: string | null; to: string; subject: string; html: string; text: string };

/** Which provider delivers email. Read at call time so configuration changes need no rebuild. */
export function emailProvider(): "resend" | "smtp" | "inbox" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_URL) return "smtp";
  return "inbox";
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Resend's shared sender works without a verified domain (delivers to your own Resend account email).
const RESEND_DEFAULT_FROM = "Tripwire <onboarding@resend.dev>";

/** Email over HTTPS. Hosts such as Railway block outbound SMTP on lower plans; HTTPS always works. */
async function sendViaResend(input: EmailInput): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || RESEND_DEFAULT_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function sendEmail(input: EmailInput): Promise<void> {
  // Deliver first: if it fails, the retry won't leave a duplicate in the inbox.
  const provider = emailProvider();
  if (provider === "resend") await sendViaResend(input);
  if (provider === "smtp") {
    const transport = nodemailer.createTransport(process.env.SMTP_URL!);
    await transport.sendMail({ from: config.mailFrom, to: input.to, subject: input.subject, html: input.html, text: input.text });
  }
  // Every email also lands in the in-app inbox, so alerts are visible with no provider at all.
  await db.insert(outbox).values({ id: newId(), ...input, createdAt: Date.now() });
}

async function sendDiscord(webhookUrl: string, messages: AlertMessage[], intro: string): Promise<void> {
  if (!isDiscordWebhook(webhookUrl)) throw new Error("Invalid Discord webhook URL");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Tripwire",
      content: messages.length > 1 ? intro : undefined,
      embeds: messages.slice(0, 10).map((m) => ({
        title: m.title.slice(0, 256),
        url: m.link,
        description: `${m.headline}\n\n\`${m.detail}\``.slice(0, 4000),
        color: m.color,
        timestamp: new Date().toISOString(),
      })),
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Discord responded ${res.status}`);
}

async function sendTelegram(chatId: string, messages: AlertMessage[], intro: string): Promise<void> {
  if (!config.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured on the server");
  const body = messages
    .map((m) => `<b>${escapeHtml(m.title)}</b>\n${escapeHtml(m.headline)}\n<code>${escapeHtml(m.detail)}</code>\n<a href="${escapeHtml(m.link)}">View the diff</a>`)
    .join("\n\n");
  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${messages.length > 1 ? `${escapeHtml(intro)}\n\n` : ""}${body}`.slice(0, 4000),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Telegram responded ${res.status}`);
}

export async function sendToChannel(channel: Channel, messages: AlertMessage[], intro: string): Promise<void> {
  switch (channel.type) {
    case "email": {
      if (!channel.config.email) throw new Error("Email channel has no address");
      const subject = messages.length === 1 ? messages[0].title : intro;
      const text = messages.map((m) => `${m.title}\n${m.headline}\n${m.detail}\n${m.link}`).join("\n\n");
      await sendEmail({ userId: channel.userId, to: channel.config.email, subject, html: emailHtml(messages, intro), text });
      return;
    }
    case "discord":
      return sendDiscord(channel.config.webhookUrl ?? "", messages, intro);
    case "telegram":
      return sendTelegram(channel.config.chatId ?? "", messages, intro);
  }
}

async function setDelivery(changeId: string, channelId: string, status: DeliveryStatus, error: string | null = null): Promise<void> {
  const now = Date.now();
  await db
    .insert(deliveries)
    .values({ id: newId(), changeId, channelId, status, error, sentAt: status === "sent" ? now : null, createdAt: now })
    .onConflictDoUpdate({
      target: [deliveries.changeId, deliveries.channelId],
      set: { status, error, sentAt: status === "sent" ? now : null },
    });
}

const DONE: DeliveryStatus[] = ["sent", "digest", "digested"];

/**
 * Fan a change out to the owner's channels. UNIQUE(change, channel) + the
 * DONE check mean retries resend only what actually failed — never a duplicate.
 */
export async function notifyChange(changeId: string): Promise<void> {
  const change = await db.query.changes.findFirst({ where: eq(changes.id, changeId) });
  if (!change?.alerted) return;
  const watch = await db.query.watches.findFirst({ where: eq(watches.id, change.watchId) });
  if (!watch) return;
  const target = await db.query.targets.findFirst({ where: eq(targets.id, watch.targetId) });
  if (!target) return;

  const userChannels = await db.query.channels.findMany({
    where: and(eq(channels.userId, watch.userId), eq(channels.enabled, true)),
  });
  const existing = await db.query.deliveries.findMany({ where: eq(deliveries.changeId, changeId) });
  const message = buildMessage(change, watch, target);
  const isHealth = change.kind === "down" || change.kind === "up";

  const failures: string[] = [];
  for (const channel of userChannels) {
    const prior = existing.find((d) => d.channelId === channel.id);
    if (prior && DONE.includes(prior.status)) continue;
    if (watch.digest && !isHealth) {
      await setDelivery(changeId, channel.id, "digest");
      continue;
    }
    try {
      await sendToChannel(channel, [message], "Change alert");
      await setDelivery(changeId, channel.id, "sent");
    } catch (error) {
      const msg = (error as Error).message;
      await setDelivery(changeId, channel.id, "failed", msg);
      failures.push(`${channel.label}: ${msg}`);
    }
  }
  if (failures.length) throw new Error(failures.join("; "));
}

/** Send each channel one grouped message for everything queued for the digest. */
export async function sendDigest(userId: string, dateKey: string): Promise<number> {
  const pending = await db
    .select({ delivery: deliveries, change: changes, watch: watches, target: targets, channel: channels })
    .from(deliveries)
    .innerJoin(changes, eq(deliveries.changeId, changes.id))
    .innerJoin(watches, eq(changes.watchId, watches.id))
    .innerJoin(targets, eq(watches.targetId, targets.id))
    .innerJoin(channels, eq(deliveries.channelId, channels.id))
    .where(and(eq(watches.userId, userId), eq(deliveries.status, "digest")))
    .orderBy(desc(changes.createdAt));

  const byChannel = new Map<string, typeof pending>();
  for (const row of pending) byChannel.set(row.channel.id, [...(byChannel.get(row.channel.id) ?? []), row]);

  // Chunked so every entry fits a channel's limits (Discord: 10 embeds; Telegram: 4,000 chars).
  // Only rows that were actually sent are marked digested; a failure leaves the rest queued.
  for (const rows of byChannel.values()) {
    const parts = Math.ceil(rows.length / DIGEST_CHUNK);
    for (let i = 0; i < rows.length; i += DIGEST_CHUNK) {
      const chunk = rows.slice(i, i + DIGEST_CHUNK);
      const intro = `Daily digest — ${rows.length} change${rows.length === 1 ? "" : "s"}${parts > 1 ? ` (${i / DIGEST_CHUNK + 1}/${parts})` : ""}`;
      await sendToChannel(chunk[0].channel, chunk.map((r) => buildMessage(r.change, r.watch, r.target)), intro);
      await db
        .update(deliveries)
        .set({ status: "digested", sentAt: Date.now() })
        .where(inArray(deliveries.id, chunk.map((r) => r.delivery.id)));
    }
  }
  await db.update(users).set({ lastDigestDate: dateKey }).where(eq(users.id, userId));
  return pending.length;
}

export async function sendTestAlert(channel: Channel): Promise<void> {
  await sendToChannel(
    channel,
    [
      {
        title: "Tripwire test alert",
        headline: "If you can read this, alerts to this channel work.",
        detail: "No page changed — this is a test.",
        link: `${config.appUrl}/app`,
        color: COLORS.test,
      },
    ],
    "Test",
  );
}
