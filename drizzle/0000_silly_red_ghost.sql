CREATE TABLE `cash_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` text NOT NULL,
	`opening_cash` real NOT NULL,
	`closed_at` text,
	`counted_cash` real,
	`approved_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cash_sessions_location_opened` ON `cash_sessions` (`location_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`cash_session_id` text NOT NULL,
	`recorded_by` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`payment_method` text NOT NULL,
	`receipt_photo_key` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_session_created` ON `expenses` (`cash_session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`imei_1` text,
	`imei_2` text,
	`serial` text,
	`cost` real,
	`status` text DEFAULT 'available' NOT NULL,
	`photo_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_code_unique` ON `inventory_items` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_imei1_unique` ON `inventory_items` (`imei_1`);--> statement-breakpoint
CREATE INDEX `idx_inventory_location_status` ON `inventory_items` (`location_id`,`status`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`category` text NOT NULL,
	`serialised` integer NOT NULL,
	`photo_key` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE TABLE `receipt_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`supplier_id` text NOT NULL,
	`location_id` text NOT NULL,
	`receipt_number` text,
	`receipt_photo_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_lots_code_unique` ON `receipt_lots` (`code`);--> statement-breakpoint
CREATE INDEX `idx_receipt_lots_supplier_status` ON `receipt_lots` (`supplier_id`,`status`);--> statement-breakpoint
CREATE TABLE `sale_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`inventory_item_id` text,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`unit_cost` real NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`location_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_dni` text,
	`customer_phone` text,
	`customer_address` text,
	`status` text NOT NULL,
	`total` real NOT NULL,
	`signed_pdf_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_code_unique` ON `sales` (`code`);--> statement-breakpoint
CREATE INDEX `idx_sales_location_created` ON `sales` (`location_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stock_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`average_cost` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_balance_product_location_unique` ON `stock_balances` (`product_id`,`location_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ruc` text,
	`phone` text,
	`contact` text,
	`address` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`dni` text,
	`phone` text,
	`email` text,
	`username` text NOT NULL,
	`role` text NOT NULL,
	`location_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);