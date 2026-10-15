import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { WatchState, Sensitivity } from "@/core/decide";
import type { KeywordRule } from "@/core/keywords";
import type { NumberRule } from "@/core/numbers";
import type { SensitivityPreview } from "@/core/calibrate";

const id = () => text("id").primaryKey();
const createdAt = () => integer("created_at").notNull();

export type Box = { x: number; y: number; w: number; h: number };
export type PickerElement = { selector: string; tag: string; text: string; box: Box };

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  apiTokenHash: text("api_token_hash"),
  digestHour: integer("digest_hour").notNull().default(9),
  timezone: text("timezone").notNull().default("UTC"),
  lastDigestDate: text("last_digest_date"),
  /** In-app alerts newer than this are unread. */
  alertsSeenAt: integer("alerts_seen_at"),
  /** Show pop-up alerts while Tripwire is open. */
  inAppPopups: integer("in_app_popups", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // sha256(token)
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: createdAt(),
});

export type TargetStatus = "pending" | "ok" | "error" | "blocked";

/** One row per canonical URL — shared by every watch on that page. */
export const targets = sqliteTable(
  "targets",
  {
    id: id(),
    url: text("url").notNull().unique(),
    host: text("host").notNull(),
    status: text("status").$type<TargetStatus>().notNull().default("pending"),
    statusReason: text("status_reason"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    healthAlerted: integer("health_alerted", { mode: "boolean" }).notNull().default(false),
    intervalMin: integer("interval_min").notNull().default(60),
    nextCheckAt: integer("next_check_at").notNull(),
    lastCheckedAt: integer("last_checked_at"),
    lastChangedAt: integer("last_changed_at"),
    lastOkAt: integer("last_ok_at"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastTextLength: integer("last_text_length"),
    currentSnapshotId: text("current_snapshot_id"),
    title: text("title"),
    createdAt: createdAt(),
  },
  (t) => [index("targets_next_check_idx").on(t.nextCheckAt)],
);

/** Stored only when the page's content hash changes. */
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: id(),
    targetId: text("target_id").notNull().references(() => targets.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    title: text("title"),
    text: text("text").notNull(),
    views: text("views", { mode: "json" }).$type<Record<string, string>>().notNull(),
    boxes: text("boxes", { mode: "json" }).$type<Record<string, Box>>().notNull(),
    screenshotKey: text("screenshot_key"),
    width: integer("width"),
    height: integer("height"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("snapshots_target_hash_idx").on(t.targetId, t.contentHash)],
);

export type CheckResultValue = "ok" | "error" | "blocked" | "not_modified" | "robots";

export const checks = sqliteTable(
  "checks",
  {
    id: id(),
    targetId: text("target_id").notNull().references(() => targets.id, { onDelete: "cascade" }),
    startedAt: integer("started_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    httpStatus: integer("http_status"),
    result: text("result").$type<CheckResultValue>().notNull(),
    reason: text("reason"),
    contentHash: text("content_hash"),
    snapshotId: text("snapshot_id"),
    confirm: integer("confirm", { mode: "boolean" }).notNull().default(false),
    /** Number of watches evaluated by this single fetch (Q2: 200 watchers → 1 fetch). */
    watchers: integer("watchers").notNull().default(0),
  },
  (t) => [index("checks_target_idx").on(t.targetId, t.startedAt)],
);

export const watches = sqliteTable(
  "watches",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetId: text("target_id").notNull().references(() => targets.id),
    name: text("name").notNull(),
    intervalMin: integer("interval_min").notNull(),
    sensitivity: text("sensitivity").$type<Sensitivity>().notNull().default("medium"),
    watchSelectors: text("watch_selectors", { mode: "json" }).$type<string[]>().notNull(),
    ignoreSelectors: text("ignore_selectors", { mode: "json" }).$type<string[]>().notNull(),
    autoIgnoreSelectors: text("auto_ignore_selectors", { mode: "json" }).$type<string[]>().notNull(),
    ignoreLines: text("ignore_lines", { mode: "json" }).$type<string[]>().notNull(),
    keywordRules: text("keyword_rules", { mode: "json" }).$type<KeywordRule[]>().notNull(),
    keywordOnly: integer("keyword_only", { mode: "boolean" }).notNull().default(false),
    numberSelector: text("number_selector"),
    numberRule: text("number_rule", { mode: "json" }).$type<NumberRule | null>(),
    digest: integer("digest", { mode: "boolean" }).notNull().default(false),
    paused: integer("paused", { mode: "boolean" }).notNull().default(false),
    state: text("state", { mode: "json" }).$type<WatchState>().notNull(),
    feedToken: text("feed_token").notNull().unique(),
    lastChangedAt: integer("last_changed_at"),
    unseen: integer("unseen").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("watches_user_idx").on(t.userId), index("watches_target_idx").on(t.targetId)],
);

/** Per-watch timeline: the watched view's raw text at each meaningful version. */
export const versions = sqliteTable(
  "versions",
  {
    id: id(),
    watchId: text("watch_id").notNull().references(() => watches.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id").notNull().references(() => snapshots.id),
    hash: text("hash").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("versions_watch_idx").on(t.watchId, t.createdAt)],
);

export type ChangeKind = "content" | "keyword" | "number" | "down" | "up";

export const changes = sqliteTable(
  "changes",
  {
    id: id(),
    watchId: text("watch_id").notNull().references(() => watches.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChangeKind>().notNull(),
    fromVersionId: text("from_version_id"),
    toVersionId: text("to_version_id"),
    /** Dedupe key: same watch + same event identity is processed once. */
    dedupeKey: text("dedupe_key").notNull(),
    fingerprint: text("fingerprint"),
    summary: text("summary").notNull(),
    aiSummary: text("ai_summary"),
    added: integer("added").notNull().default(0),
    removed: integer("removed").notNull().default(0),
    visualRatio: real("visual_ratio"),
    shareToken: text("share_token").notNull().unique(),
    alerted: integer("alerted", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("changes_dedupe_idx").on(t.watchId, t.dedupeKey),
    index("changes_watch_idx").on(t.watchId, t.createdAt),
  ],
);

export type ChannelType = "email" | "discord" | "telegram";
export type ChannelConfig = { email?: string; webhookUrl?: string; chatId?: string };

export const channels = sqliteTable("channels", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<ChannelType>().notNull(),
  label: text("label").notNull(),
  config: text("config", { mode: "json" }).$type<ChannelConfig>().notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export type DeliveryStatus = "pending" | "sent" | "failed" | "digest" | "digested";

/** UNIQUE(change, channel): a retry can never send the same alert twice. */
export const deliveries = sqliteTable(
  "deliveries",
  {
    id: id(),
    changeId: text("change_id").notNull().references(() => changes.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    status: text("status").$type<DeliveryStatus>().notNull(),
    error: text("error"),
    sentAt: integer("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("deliveries_unique_idx").on(t.changeId, t.channelId)],
);

export const numberPoints = sqliteTable(
  "number_points",
  {
    id: id(),
    watchId: text("watch_id").notNull().references(() => watches.id, { onDelete: "cascade" }),
    value: real("value").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("number_points_watch_idx").on(t.watchId, t.at)],
);

export type JobType = "check" | "notify" | "digest" | "summarize";
export type JobStatus = "queued" | "running" | "done" | "failed";

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type").$type<JobType>().notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    host: text("host"),
    dedupeKey: text("dedupe_key"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAt: integer("run_at").notNull(),
    lockedUntil: integer("locked_until"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("jobs_ready_idx").on(t.status, t.runAt), index("jobs_dedupe_idx").on(t.dedupeKey, t.status)],
);

export const previews = sqliteTable("previews", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  screenshotKey: text("screenshot_key").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  elements: text("elements", { mode: "json" }).$type<PickerElement[]>().notNull(),
  volatileSelectors: text("volatile_selectors", { mode: "json" }).$type<string[]>().notNull(),
  sensitivityPreview: text("sensitivity_preview", { mode: "json" }).$type<SensitivityPreview>().notNull(),
  createdAt: createdAt(),
});

/** Dev inbox: every email is recorded here (and also sent via SMTP when configured). */
export const outbox = sqliteTable("outbox", {
  id: id(),
  userId: text("user_id"),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type Watch = typeof watches.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type Change = typeof changes.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Job = typeof jobs.$inferSelect;
