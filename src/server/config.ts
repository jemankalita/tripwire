function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Delay before the confirmation render that must reproduce a change before we alert. */
  confirmDelayMs: num(process.env.CONFIRM_DELAY_MS, 60_000),
  respectRobots: process.env.RESPECT_ROBOTS !== "0",
  checkConcurrency: num(process.env.CHECK_CONCURRENCY, 3),
  domainGapMs: num(process.env.DOMAIN_GAP_MS, 10_000),
  failuresBeforeHealthAlert: 3,
  maxScreenshotHeight: 6000,
  navTimeoutMs: 30_000,
  jobTimeoutMs: 90_000,
  smtpUrl: process.env.SMTP_URL,
  mailFrom: process.env.MAIL_FROM || "Tripwire <alerts@tripwire.local>",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.AI_SUMMARIES === "1"),
  summaryModel: process.env.CLAUDE_SUMMARY_MODEL || "claude-opus-5-5",
} as const;
