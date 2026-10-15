import type { Channel } from "@/db/schema";

/** Never echo webhook secrets back to the browser. */
export function serializeChannel(c: Channel) {
  const target =
    c.type === "email"
      ? (c.config.email ?? "")
      : c.type === "discord"
        ? `…/webhooks/${(c.config.webhookUrl ?? "").split("/").slice(-2, -1)[0] ?? ""}/••••`
        : `chat ${c.config.chatId ?? ""}`;
  return { id: c.id, type: c.type, label: c.label, target, enabled: c.enabled, createdAt: c.createdAt };
}

export type ChannelView = ReturnType<typeof serializeChannel>;
