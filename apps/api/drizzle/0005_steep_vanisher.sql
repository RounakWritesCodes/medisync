CREATE TABLE "doctor_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"registration_number" text NOT NULL,
	"council" text NOT NULL,
	"qualification" text NOT NULL,
	"year_of_registration" integer,
	"id_document_ref" text,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "doctor_verifications_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "granted_scope" jsonb;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "consent_model" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "patient_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "guardian_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "responded_by" uuid;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD COLUMN "scope" text DEFAULT 'records' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_status" text;--> statement-breakpoint
ALTER TABLE "doctor_verifications" ADD CONSTRAINT "doctor_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_request_per_pair" ON "access_requests" USING btree ("doctor_id","patient_id") WHERE "access_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_guardian_per_patient" ON "guardian_links" USING btree ("patient_id") WHERE "guardian_links"."status" = 'active_shared_control';