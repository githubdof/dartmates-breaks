CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_bucket_window_uq" ON "rate_limits" USING btree ("bucket","window_start");
--> statement-breakpoint
-- Deny-all RLS backstop, as 0000 did for every table that existed then (tests/ci/rls.test.ts checks every public table).
alter table rate_limits enable row level security;
--> statement-breakpoint
alter table rate_limits force row level security;
