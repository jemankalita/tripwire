CREATE TABLE `changes` (
	`id` text PRIMARY KEY NOT NULL,
	`watch_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_version_id` text,
	`to_version_id` text,
	`dedupe_key` text NOT NULL,
	`fingerprint` text,
	`summary` text NOT NULL,
	`ai_summary` text,
	`added` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`visual_ratio` real,
	`share_token` text NOT NULL,
	`alerted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `changes_share_token_unique` ON `changes` (`share_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `changes_dedupe_idx` ON `changes` (`watch_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `changes_watch_idx` ON `changes` (`watch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checks` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`http_status` integer,
	`result` text NOT NULL,
	`reason` text,
	`content_hash` text,
	`snapshot_id` text,
	`confirm` integer DEFAULT false NOT NULL,
	`watchers` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checks_target_idx` ON `checks` (`target_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`change_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`change_id`) REFERENCES `changes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_unique_idx` ON `deliveries` (`change_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`host` text,
	`dedupe_key` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_at` integer NOT NULL,
	`locked_until` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_ready_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `jobs_dedupe_idx` ON `jobs` (`dedupe_key`,`status`);--> statement-breakpoint
CREATE TABLE `number_points` (
	`id` text PRIMARY KEY NOT NULL,
	`watch_id` text NOT NULL,
	`value` real NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `number_points_watch_idx` ON `number_points` (`watch_id`,`at`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`to` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `previews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`screenshot_key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`elements` text NOT NULL,
	`volatile_selectors` text NOT NULL,
	`sensitivity_preview` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`title` text,
	`text` text NOT NULL,
	`views` text NOT NULL,
	`boxes` text NOT NULL,
	`screenshot_key` text,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_target_hash_idx` ON `snapshots` (`target_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`host` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_reason` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`health_alerted` integer DEFAULT false NOT NULL,
	`interval_min` integer DEFAULT 60 NOT NULL,
	`next_check_at` integer NOT NULL,
	`last_checked_at` integer,
	`last_changed_at` integer,
	`last_ok_at` integer,
	`etag` text,
	`last_modified` text,
	`last_text_length` integer,
	`current_snapshot_id` text,
	`title` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `targets_url_unique` ON `targets` (`url`);--> statement-breakpoint
CREATE INDEX `targets_next_check_idx` ON `targets` (`next_check_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`api_token_hash` text,
	`digest_hour` integer DEFAULT 9 NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`last_digest_date` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`watch_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`hash` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `versions_watch_idx` ON `versions` (`watch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`name` text NOT NULL,
	`interval_min` integer NOT NULL,
	`sensitivity` text DEFAULT 'medium' NOT NULL,
	`watch_selectors` text NOT NULL,
	`ignore_selectors` text NOT NULL,
	`auto_ignore_selectors` text NOT NULL,
	`ignore_lines` text NOT NULL,
	`keyword_rules` text NOT NULL,
	`keyword_only` integer DEFAULT false NOT NULL,
	`number_selector` text,
	`number_rule` text,
	`digest` integer DEFAULT false NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`state` text NOT NULL,
	`feed_token` text NOT NULL,
	`last_changed_at` integer,
	`unseen` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watches_feed_token_unique` ON `watches` (`feed_token`);--> statement-breakpoint
CREATE INDEX `watches_user_idx` ON `watches` (`user_id`);--> statement-breakpoint
CREATE INDEX `watches_target_idx` ON `watches` (`target_id`);