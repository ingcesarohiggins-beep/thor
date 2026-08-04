CREATE TABLE `return_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`reviewed_by` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`evidence_photo_key` text,
	`resolution_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_return_requests_status_created` ON `return_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `sale_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`cash_session_id` text NOT NULL,
	`payment_method` text NOT NULL,
	`amount` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sale_payments_sale` ON `sale_payments` (`sale_id`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`receipt_lot_id` text,
	`cash_session_id` text,
	`amount` real NOT NULL,
	`payment_method` text NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_lot_id`) REFERENCES `receipt_lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_supplier_payments_supplier_created` ON `supplier_payments` (`supplier_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `transfer_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`inventory_item_id` text,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`approved_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfers_code_unique` ON `transfers` (`code`);--> statement-breakpoint
CREATE INDEX `idx_transfers_status_origin` ON `transfers` (`status`,`from_location_id`);