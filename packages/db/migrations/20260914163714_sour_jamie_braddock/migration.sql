CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE SCHEMA "members";
--> statement-breakpoint
CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "proposals";
--> statement-breakpoint
CREATE SCHEMA "engagement";
--> statement-breakpoint
CREATE SCHEMA "crm";
--> statement-breakpoint
CREATE SCHEMA "personalization";
--> statement-breakpoint
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TYPE "platform"."delivery_status" AS ENUM('pending', 'done', 'dead', 'paused');--> statement-breakpoint
CREATE TYPE "members"."member_status" AS ENUM('active', 'waitlist', 'deleted');--> statement-breakpoint
CREATE TYPE "members"."notification_category" AS ENUM('transactional', 'offers_personal', 'offers_broadcast');--> statement-breakpoint
CREATE TYPE "notifications"."device_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "notifications"."notification_category" AS ENUM('transactional', 'offers_personal', 'offers_broadcast');--> statement-breakpoint
CREATE TYPE "notifications"."notification_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "proposals"."cabin_class" AS ENUM('business', 'first');--> statement-breakpoint
CREATE TYPE "proposals"."offer_source" AS ENUM('crm_agent', 'marketing_campaign');--> statement-breakpoint
CREATE TYPE "proposals"."offer_status" AS ENUM('draft', 'scheduled', 'active', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "proposals"."offer_targeting" AS ENUM('user', 'segment', 'broadcast');--> statement-breakpoint
CREATE TYPE "engagement"."response_kind" AS ENUM('interested', 'dismissed');--> statement-breakpoint
CREATE TYPE "crm"."sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "personalization"."candidate_status" AS ENUM('suggested', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "platform"."domain_events" (
	"id" bigserial,
	"type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"member_id" text,
	"payload" jsonb NOT NULL,
	"published_by" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "domain_events_pkey" PRIMARY KEY("id","occurred_at"),
	CONSTRAINT "domain_events_version_pos" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "platform"."event_deliveries" (
	"id" bigserial PRIMARY KEY,
	"event_id" bigint NOT NULL,
	"event_occurred_at" timestamp with time zone NOT NULL,
	"consumer" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"status" "platform"."delivery_status" DEFAULT 'pending'::"platform"."delivery_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_attempts_nonneg" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform"."event_dlq" (
	"delivery_id" bigint PRIMARY KEY,
	"event_id" bigint NOT NULL,
	"consumer" text NOT NULL,
	"attempts" integer NOT NULL,
	"last_error" text NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."external_inbox" (
	"source" text,
	"external_id" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_inbox_pkey" PRIMARY KEY("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "platform"."flags" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."job_runs" (
	"id" bigserial PRIMARY KEY,
	"job" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"metrics" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "platform"."rate_limits" (
	"key" text PRIMARY KEY,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_nonneg" CHECK ("count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "members"."notification_preferences" (
	"member_id" text,
	"category" "members"."notification_category",
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_pkey" PRIMARY KEY("member_id","category"),
	CONSTRAINT "prefs_transactional_always_on" CHECK (NOT ("category" = 'transactional' AND "enabled" = false))
);
--> statement-breakpoint
CREATE TABLE "members"."profile" (
	"member_id" text PRIMARY KEY,
	"crm_client_id" text,
	"display_name" text,
	"phone" text,
	"home_airport" text,
	"preferences" jsonb DEFAULT '{}' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"status" "members"."member_status" DEFAULT 'waitlist'::"members"."member_status" NOT NULL,
	"linked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_iata_len" CHECK ("home_airport" IS NULL OR length("home_airport") = 3),
	CONSTRAINT "profile_linked_consistent" CHECK (("crm_client_id" IS NULL) = ("linked_at" IS NULL)),
	CONSTRAINT "profile_deleted_consistent" CHECK (("status" = 'deleted') = ("deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "notifications"."device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"member_id" text NOT NULL,
	"device_id" text NOT NULL,
	"platform" "notifications"."device_platform" NOT NULL,
	"native_token" text NOT NULL,
	"expo_token" text,
	"app_version" text,
	"active" boolean DEFAULT true NOT NULL,
	"deactivated_reason" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"member_id" text NOT NULL,
	"category" "notifications"."notification_category" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"deep_link" text,
	"offer_id" uuid,
	"source_event_id" text,
	"status" "notifications"."notification_status" DEFAULT 'pending'::"notifications"."notification_status" NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ticket_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notif_attempts_nonneg" CHECK ("attempts" >= 0),
	CONSTRAINT "notif_sent_has_ticket_or_error" CHECK ("status" <> 'failed' OR "last_error" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "proposals"."offer_targets" (
	"offer_id" uuid,
	"member_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_targets_pkey" PRIMARY KEY("offer_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "proposals"."offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"idempotency_key" text NOT NULL,
	"source" "proposals"."offer_source" NOT NULL,
	"targeting" "proposals"."offer_targeting" NOT NULL,
	"target_member_id" text,
	"route_from" char(3) NOT NULL,
	"route_to" char(3) NOT NULL,
	"cabin" "proposals"."cabin_class" NOT NULL,
	"price" numeric(10,2) NOT NULL,
	"published_price" numeric(10,2),
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"context_line" text,
	"flight_facts" jsonb,
	"media_url" text,
	"media_blurhash" text,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" "proposals"."offer_status" DEFAULT 'active'::"proposals"."offer_status" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_price_pos" CHECK ("price" > 0),
	CONSTRAINT "offers_published_gte_price" CHECK ("published_price" IS NULL OR "published_price" >= "price"),
	CONSTRAINT "offers_valid_after_publish" CHECK ("valid_until" > "publish_at"),
	CONSTRAINT "offers_iata" CHECK (length("route_from") = 3 AND length("route_to") = 3 AND "route_from" <> "route_to"),
	CONSTRAINT "offers_targeting_consistent" CHECK (("targeting" = 'user') = ("target_member_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "engagement"."offer_responses" (
	"offer_id" uuid,
	"member_id" text,
	"response" "engagement"."response_kind" NOT NULL,
	"synced_to_crm" boolean DEFAULT false NOT NULL,
	"crm_activity_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_responses_pkey" PRIMARY KEY("offer_id","member_id"),
	CONSTRAINT "responses_sync_consistent" CHECK (("synced_to_crm" = false) OR ("crm_activity_id" IS NOT NULL AND "synced_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "crm"."mirror" (
	"crm_client_id" text PRIMARY KEY,
	"email_normalized" text NOT NULL,
	"full_name" text,
	"phone" text,
	"home_airport" text,
	"route_history" jsonb DEFAULT '[]' NOT NULL,
	"last_flight_at" timestamp with time zone,
	"advisor_name" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirror_email_lower" CHECK ("email_normalized" = lower("email_normalized"))
);
--> statement-breakpoint
CREATE TABLE "crm"."sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "crm"."sync_status" DEFAULT 'running'::"crm"."sync_status" NOT NULL,
	"rows_upserted" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "personalization"."member_features" (
	"member_id" text PRIMARY KEY,
	"features" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personalization"."proposal_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"member_id" text NOT NULL,
	"offer_draft" jsonb NOT NULL,
	"score" numeric(6,4) NOT NULL,
	"reasons" jsonb NOT NULL,
	"ranker_version" text NOT NULL,
	"status" "personalization"."candidate_status" DEFAULT 'suggested'::"personalization"."candidate_status" NOT NULL,
	"published_offer_id" uuid,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_score_range" CHECK ("score" BETWEEN 0 AND 1),
	CONSTRAINT "candidates_decided_consistent" CHECK (("status" = 'suggested') = ("decided_at" IS NULL)),
	CONSTRAINT "candidates_accepted_has_offer" CHECK ("status" <> 'accepted' OR "published_offer_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."jwks" (
	"id" text PRIMARY KEY,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."rate_limit" (
	"id" text PRIMARY KEY,
	"key" text,
	"count" integer,
	"last_request" integer
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "domain_events_type" ON "platform"."domain_events" ("type","id");--> statement-breakpoint
CREATE INDEX "domain_events_aggregate" ON "platform"."domain_events" ("aggregate_type","aggregate_id","id");--> statement-breakpoint
CREATE INDEX "domain_events_member" ON "platform"."domain_events" ("member_id") WHERE "member_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_event_consumer" ON "platform"."event_deliveries" ("event_id","consumer");--> statement-breakpoint
CREATE INDEX "deliveries_ready" ON "platform"."event_deliveries" ("run_after","id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "deliveries_consumer_status" ON "platform"."event_deliveries" ("consumer","status");--> statement-breakpoint
CREATE INDEX "deliveries_cleanup" ON "platform"."event_deliveries" ("processed_at") WHERE "status" = 'done';--> statement-breakpoint
CREATE INDEX "dlq_consumer" ON "platform"."event_dlq" ("consumer","failed_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_started" ON "platform"."job_runs" ("job","started_at");--> statement-breakpoint
CREATE INDEX "rate_limits_expires" ON "platform"."rate_limits" ("expires_at");--> statement-breakpoint
CREATE INDEX "profile_crm_client" ON "members"."profile" ("crm_client_id") WHERE "crm_client_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "profile_status" ON "members"."profile" ("status");--> statement-breakpoint
CREATE INDEX "profile_home_airport" ON "members"."profile" ("home_airport") WHERE "home_airport" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "device_member_device" ON "notifications"."device_tokens" ("member_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_native_token" ON "notifications"."device_tokens" ("native_token");--> statement-breakpoint
CREATE INDEX "device_active_by_member" ON "notifications"."device_tokens" ("member_id") WHERE "active";--> statement-breakpoint
CREATE INDEX "device_last_seen" ON "notifications"."device_tokens" ("last_seen_at");--> statement-breakpoint
CREATE INDEX "notif_dispatch" ON "notifications"."notifications" ("scheduled_for","category") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "notif_inbox" ON "notifications"."notifications" ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "notif_unread" ON "notifications"."notifications" ("member_id") WHERE "read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notif_offer" ON "notifications"."notifications" ("offer_id") WHERE "offer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notif_member_offer_cat" ON "notifications"."notifications" ("member_id","offer_id","category") WHERE "offer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "offer_targets_member" ON "proposals"."offer_targets" ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_idempotency" ON "proposals"."offers" ("idempotency_key");--> statement-breakpoint
CREATE INDEX "offers_feed" ON "proposals"."offers" ("status","publish_at");--> statement-breakpoint
CREATE INDEX "offers_expiry" ON "proposals"."offers" ("valid_until") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "offers_target_member" ON "proposals"."offers" ("target_member_id") WHERE "target_member_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "responses_unsynced" ON "engagement"."offer_responses" ("created_at") WHERE "synced_to_crm" = false AND "response" = 'interested';--> statement-breakpoint
CREATE INDEX "responses_member" ON "engagement"."offer_responses" ("member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mirror_email" ON "crm"."mirror" ("email_normalized");--> statement-breakpoint
CREATE INDEX "mirror_last_flight" ON "crm"."mirror" ("last_flight_at");--> statement-breakpoint
CREATE INDEX "sync_runs_started" ON "crm"."sync_runs" ("created_at");--> statement-breakpoint
CREATE INDEX "candidates_member_status" ON "personalization"."proposal_candidates" ("member_id","status");--> statement-breakpoint
CREATE INDEX "candidates_open" ON "personalization"."proposal_candidates" ("created_at") WHERE "status" = 'suggested';--> statement-breakpoint
ALTER TABLE "proposals"."offer_targets" ADD CONSTRAINT "offer_targets_offer_id_offers_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "proposals"."offers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE;