CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`content` text,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachment_message_idx` ON `attachment` (`message_id`);--> statement-breakpoint
CREATE INDEX `attachment_mailbox_idx` ON `attachment` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `mailbox` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`expires_at` integer NOT NULL,
	`catch_all` integer DEFAULT false NOT NULL,
	`owner_id` text,
	`note` text,
	`share_token` text,
	`share_locked` integer DEFAULT false NOT NULL,
	`share_expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_address_unique` ON `mailbox` (`address`);--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_share_token_unique` ON `mailbox` (`share_token`);--> statement-breakpoint
CREATE INDEX `mailbox_expires_idx` ON `mailbox` (`expires_at`);--> statement-breakpoint
CREATE INDEX `mailbox_owner_idx` ON `mailbox` (`owner_id`);--> statement-breakpoint
CREATE INDEX `mailbox_share_expires_idx` ON `mailbox` (`share_expires_at`) WHERE "mailbox"."share_expires_at" is not null;--> statement-breakpoint
CREATE INDEX `mailbox_catch_all_idx` ON `mailbox` (`expires_at`) WHERE "mailbox"."catch_all" = 1;--> statement-breakpoint
CREATE TABLE `mailbox_member` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_mailbox_user_idx` ON `mailbox_member` (`mailbox_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `mailbox_member` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `member_expires_idx` ON `mailbox_member` (`expires_at`) WHERE "mailbox_member"."expires_at" is not null;--> statement-breakpoint
CREATE TABLE `mailbox_share_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox_id` text NOT NULL,
	`address` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`target_id` text,
	`target_name` text,
	`detail` text,
	`source` text DEFAULT 'user' NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `share_event_mailbox_idx` ON `mailbox_share_event` (`mailbox_id`,`at`);--> statement-breakpoint
CREATE INDEX `share_event_at_idx` ON `mailbox_share_event` (`at`,`id`);--> statement-breakpoint
CREATE INDEX `share_event_action_idx` ON `mailbox_share_event` (`action`,`at`);--> statement-breakpoint
CREATE INDEX `share_event_actor_idx` ON `mailbox_share_event` (`actor_id`,`at`);--> statement-breakpoint
CREATE INDEX `share_event_target_idx` ON `mailbox_share_event` (`target_id`,`at`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`from_address` text NOT NULL,
	`from_name` text,
	`subject` text DEFAULT '' NOT NULL,
	`text` text,
	`html` text,
	`preview` text DEFAULT '' NOT NULL,
	`code` text,
	`size` integer DEFAULT 0 NOT NULL,
	`seen` integer DEFAULT false NOT NULL,
	`headers` text,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_list_idx` ON `message` (`mailbox_id`,`received_at`,`seen`,`code`,`preview`);--> statement-breakpoint
CREATE INDEX `message_received_idx` ON `message` (`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `message_unread_idx` ON `message` (`mailbox_id`) WHERE "message"."seen" = 0;--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);