// 由 scripts/bundle-migrations.mjs 生成，不要手动修改
export const migrations: { name: string; statements: string[] }[] = [
  {
    "name": "0000_init.sql",
    "statements": [
      "CREATE TABLE `app_setting` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `attachment` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`message_id` text NOT NULL,\n\t`mailbox_id` text NOT NULL,\n\t`filename` text NOT NULL,\n\t`mime_type` text NOT NULL,\n\t`size` integer NOT NULL,\n\t`content` text,\n\tFOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `attachment_message_idx` ON `attachment` (`message_id`);",
      "CREATE INDEX `attachment_mailbox_idx` ON `attachment` (`mailbox_id`);",
      "CREATE TABLE `mailbox` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`address` text NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`catch_all` integer DEFAULT false NOT NULL,\n\t`owner_id` text,\n\t`note` text,\n\t`share_token` text,\n\t`share_locked` integer DEFAULT false NOT NULL,\n\t`share_expires_at` integer,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `mailbox_address_unique` ON `mailbox` (`address`);",
      "CREATE UNIQUE INDEX `mailbox_share_token_unique` ON `mailbox` (`share_token`);",
      "CREATE INDEX `mailbox_expires_idx` ON `mailbox` (`expires_at`);",
      "CREATE INDEX `mailbox_owner_idx` ON `mailbox` (`owner_id`);",
      "CREATE INDEX `mailbox_share_expires_idx` ON `mailbox` (`share_expires_at`) WHERE \"mailbox\".\"share_expires_at\" is not null;",
      "CREATE INDEX `mailbox_catch_all_idx` ON `mailbox` (`expires_at`) WHERE \"mailbox\".\"catch_all\" = 1;",
      "CREATE TABLE `mailbox_member` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`mailbox_id` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`role` text DEFAULT 'viewer' NOT NULL,\n\t`status` text DEFAULT 'pending' NOT NULL,\n\t`invited_by` text,\n\t`expires_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`accepted_at` integer,\n\tFOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `member_mailbox_user_idx` ON `mailbox_member` (`mailbox_id`,`user_id`);",
      "CREATE INDEX `member_user_idx` ON `mailbox_member` (`user_id`,`status`);",
      "CREATE INDEX `member_expires_idx` ON `mailbox_member` (`expires_at`) WHERE \"mailbox_member\".\"expires_at\" is not null;",
      "CREATE TABLE `mailbox_share_event` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`mailbox_id` text NOT NULL,\n\t`address` text NOT NULL,\n\t`action` text NOT NULL,\n\t`actor_id` text,\n\t`actor_name` text,\n\t`target_id` text,\n\t`target_name` text,\n\t`detail` text,\n\t`source` text DEFAULT 'user' NOT NULL,\n\t`at` integer NOT NULL\n);",
      "CREATE INDEX `share_event_mailbox_idx` ON `mailbox_share_event` (`mailbox_id`,`at`);",
      "CREATE INDEX `share_event_at_idx` ON `mailbox_share_event` (`at`,`id`);",
      "CREATE INDEX `share_event_action_idx` ON `mailbox_share_event` (`action`,`at`);",
      "CREATE INDEX `share_event_actor_idx` ON `mailbox_share_event` (`actor_id`,`at`);",
      "CREATE INDEX `share_event_target_idx` ON `mailbox_share_event` (`target_id`,`at`);",
      "CREATE TABLE `message` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`mailbox_id` text NOT NULL,\n\t`from_address` text NOT NULL,\n\t`from_name` text,\n\t`subject` text DEFAULT '' NOT NULL,\n\t`text` text,\n\t`html` text,\n\t`preview` text DEFAULT '' NOT NULL,\n\t`code` text,\n\t`size` integer DEFAULT 0 NOT NULL,\n\t`seen` integer DEFAULT false NOT NULL,\n\t`headers` text,\n\t`received_at` integer NOT NULL,\n\tFOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `message_list_idx` ON `message` (`mailbox_id`,`received_at`,`seen`,`code`,`preview`);",
      "CREATE INDEX `message_received_idx` ON `message` (`received_at`,`id`);",
      "CREATE INDEX `message_unread_idx` ON `message` (`mailbox_id`) WHERE \"message\".\"seen\" = 0;",
      "CREATE TABLE `session` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`last_seen_at` integer NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `session_user_idx` ON `session` (`user_id`,`last_seen_at`);",
      "CREATE TABLE `user` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`username` text NOT NULL,\n\t`password_hash` text NOT NULL,\n\t`password_salt` text NOT NULL,\n\t`disabled` integer DEFAULT false NOT NULL,\n\t`last_seen_at` integer,\n\t`created_at` integer NOT NULL\n);",
      "CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);"
    ]
  },
  {
    "name": "0001_session_device.sql",
    "statements": [
      "ALTER TABLE `session` ADD `ip` text;",
      "ALTER TABLE `session` ADD `model` text;"
    ]
  }
];
