ALTER TABLE `users` ADD `alerts_seen_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `in_app_popups` integer DEFAULT true NOT NULL;