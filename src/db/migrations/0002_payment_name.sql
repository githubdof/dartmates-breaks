ALTER TABLE "users" ADD COLUMN "payment_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_payment_name_chk" CHECK (char_length("users"."payment_name") <= 60);