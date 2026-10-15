import { z } from "zod";

export const DISCORD_WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isDiscordWebhook(url: string): boolean {
  return DISCORD_WEBHOOK.test(url);
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const selector = z.string().trim().min(1).max(500);

const keywordRule = z.object({
  mode: z.enum(["appears", "disappears"]),
  text: z.string().trim().min(1, "Keyword can't be empty").max(200),
});

const numberRule = z
  .object({ op: z.enum(["any", "above", "below"]), value: z.number().finite().optional() })
  .refine((r) => r.op === "any" || r.value !== undefined, "Enter a threshold value");

const fields = {
  name: z.string().trim().min(1, "Give the watch a name").max(120),
  intervalMin: z.number().int().min(15, "The minimum interval is 15 minutes").max(1440, "The maximum interval is 24 hours"),
  sensitivity: z.enum(["low", "medium", "high"]),
  watchSelectors: z.array(selector).max(20),
  ignoreSelectors: z.array(selector).max(50),
  autoIgnoreSelectors: z.array(selector).max(50),
  keywordRules: z.array(keywordRule).max(20),
  keywordOnly: z.boolean(),
  numberSelector: selector.nullable(),
  numberRule: numberRule.nullable(),
  digest: z.boolean(),
};

export const createWatchSchema = z.object({
  url: z.string().trim().min(1, "Enter a URL").max(2048),
  previewId: z.string().max(64).optional(),
  name: fields.name.optional(),
  intervalMin: fields.intervalMin.default(60),
  sensitivity: fields.sensitivity.default("medium"),
  watchSelectors: fields.watchSelectors.default([]),
  ignoreSelectors: fields.ignoreSelectors.default([]),
  autoIgnoreSelectors: fields.autoIgnoreSelectors.default([]),
  keywordRules: fields.keywordRules.default([]),
  keywordOnly: fields.keywordOnly.default(false),
  numberSelector: fields.numberSelector.default(null),
  numberRule: fields.numberRule.default(null),
  digest: fields.digest.default(false),
});
export type CreateWatchInput = z.infer<typeof createWatchSchema>;

export const updateWatchSchema = z.object({ ...fields, paused: z.boolean() }).partial();
export type UpdateWatchInput = z.infer<typeof updateWatchSchema>;

export const ignoreLinesSchema = z.object({ lines: z.array(z.string().max(1000)).min(1).max(50) });

export const previewSchema = z.object({ url: z.string().trim().min(1, "Enter a URL").max(2048) });

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(200),
});

const label = z.string().trim().max(60).optional();

export const channelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), label, email: z.email("Enter a valid email") }),
  z.object({
    type: z.literal("discord"),
    label,
    webhookUrl: z.string().trim().refine(isDiscordWebhook, "Paste a Discord webhook URL (https://discord.com/api/webhooks/…)"),
  }),
  z.object({
    type: z.literal("telegram"),
    label,
    chatId: z.string().trim().regex(/^-?\d{4,20}$/, "Telegram chat IDs are numbers, e.g. 123456789"),
  }),
]);

export const channelPatchSchema = z.object({ enabled: z.boolean(), label: z.string().trim().min(1).max(60) }).partial();

export const settingsSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    digestHour: z.number().int().min(0).max(23),
    timezone: z.string().refine(isValidTimezone, "Unknown time zone"),
  })
  .partial();
