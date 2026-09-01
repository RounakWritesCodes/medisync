CREATE TABLE "revoked_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
