-- ============================================================================
-- ORIGINAL SCHEMA — startuplab-business-ticketing
-- ============================================================================
-- Sources (in order of authority):
--   [FACT-KB]   = verbatim DDL from "knowledge base/readme.txt" (your own
--                 schema doc, dated Feb 2026) and backend/database/auditLogs.sql
--   [FACT-CODE] = column/table required by the reverted original codebase
--                 (file:line cited) but missing from readme.txt
--   [FACT-LIVE] = object verified in the live DB and used by original code,
--                 with no readme entry (e.g. invites table, delete trigger)
--   [INFERRED]  = marked explicitly; review before relying on it
--
-- Deliberately EXCLUDED (coworker-era objects not referenced anywhere in the
-- original codebase): organizers, eventLikes, notifications, plans,
-- planFeatures, promotions, organizersubscriptions, organizerFollowers,
-- settings, support_messages, email_quota_tracking, promoted_events,
-- event_categories, announcements, tbl_popular_places, newsletter_subscribers,
-- search_history, organizer_ratings, reviews, review_likes, review_replies,
-- user_notification_settings, archived_events (view), and all extra columns
-- on core tables (orders.promotionId/discountAmount/promoCode/deleted_at/
-- archived_by, events.organizerId/brandColor/is_archived/faqs/likes_count/etc,
-- users.status/failed_login_attempts/locked_until/employerId,
-- ticketTypes.capacity_per_ticket/saleDiscountPercent).
-- ============================================================================

-- [FACT-KB] auditLogs uses extensions.uuid_generate_v4()
create extension if not exists "uuid-ossp" with schema extensions;

-- ============================================================================
-- users  [FACT-KB]
-- ============================================================================
create table public.users (
  "userId" uuid not null default gen_random_uuid (),
  role character varying null,
  name character varying null,
  updated_at timestamp without time zone null,
  created_at timestamp with time zone not null default now(),
  email character varying null,
  "imageUrl" jsonb null,
  constraint users_pkey primary key ("userId")
) TABLESPACE pg_default;

-- [FACT-CODE] permission flags — required by:
--   backend/middleware/permissions.js:49 (select canviewevents, caneditevents, canmanualcheckin)
--   backend/controller/userController.js:227 (update of all three flags)
alter table public.users add column canviewevents boolean null default false;
alter table public.users add column caneditevents boolean null default false;
alter table public.users add column canmanualcheckin boolean null default false;

-- ============================================================================
-- events  [FACT-KB]
-- ============================================================================
create table public.events (
  "eventId" uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  slug character varying null,
  description character varying null,
  "startAt" timestamp without time zone null,
  "endAt" timestamp without time zone null,
  timezone character varying null,
  "locationType" character varying null,
  "locationText" character varying null,
  "capacityTotal" integer null,
  "regOpenAt" date null,        -- [FACT-KB] readme says date; live DB (post-coworker) has timestamptz. Kept per readme.
  "regCloseAt" date null,       -- [FACT-KB] same note as regOpenAt.
  "createdBy" uuid null default gen_random_uuid (),
  updated_at timestamp without time zone null,
  "eventName" character varying null,
  status character varying null,
  "imageUrl" jsonb null,
  constraint events_pkey primary key ("eventId"),
  constraint events_slug_key unique (slug),
  constraint "events_createdBy_fkey" foreign key ("createdBy") references auth.users (id) on delete cascade
) TABLESPACE pg_default;

-- [FACT-CODE] streamingPlatform — required by:
--   backend/controller/adminEventController.js:134 (insert payload)
--   backend/controller/paymentController.js:148, orderController.js:219, ticketController.js:63
alter table public.events add column "streamingPlatform" character varying null;

-- ============================================================================
-- ticketTypes  [FACT-KB]
-- ============================================================================
create table public."ticketTypes" (
  "ticketTypeId" uuid not null default gen_random_uuid (),
  name character varying null,
  description character varying null,
  "priceAmount" real null,
  currency character varying null,
  "quantityTotal" integer null,
  "quantitySold" integer null default 0,
  "salesStartAt" timestamp without time zone null,
  "salesEndAt" timestamp without time zone null,
  status boolean null,
  updated_at timestamp without time zone null,
  created_at timestamp with time zone not null default now(),
  "createdBy" uuid null default gen_random_uuid (),
  "eventId" uuid null default gen_random_uuid (),
  constraint "ticketTypes_pkey" primary key ("ticketTypeId"),
  constraint "ticketTypes_createdBy_fkey" foreign key ("createdBy") references auth.users (id) on delete cascade,
  constraint "ticketTypes_eventId_fkey" foreign key ("eventId") references events ("eventId") on delete cascade
) TABLESPACE pg_default;

-- ============================================================================
-- orders  [FACT-KB]  (note: readme has NO FK on eventId — kept that way)
-- ============================================================================
create table public.orders (
  "orderId" uuid not null default gen_random_uuid (),
  status character varying null,
  "totalAmount" real null,
  currency character varying null,
  "expiresAt" timestamp without time zone null,
  updated_at timestamp without time zone null,
  created_at timestamp with time zone not null default now(),
  "buyerName" character varying null,
  "buyerEmail" character varying null,
  "buyerPhone" character varying null,
  metadata json null,
  "eventId" uuid null default gen_random_uuid (),
  constraint orders_pkey primary key ("orderId")
) TABLESPACE pg_default;

-- ============================================================================
-- orderItems  [FACT-KB]
-- ============================================================================
create table public."orderItems" (
  "orderItemId" uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  "ticketTypeId" uuid null default gen_random_uuid (),
  quantity integer null,
  price real null,
  "lineTotal" real null,
  "orderId" uuid null default gen_random_uuid (),
  constraint "orderItems_pkey" primary key ("orderItemId"),
  constraint "orderItems_orderId_fkey" foreign key ("orderId") references orders ("orderId") on delete cascade,
  constraint "orderItems_ticketTypeId_fkey" foreign key ("ticketTypeId") references "ticketTypes" ("ticketTypeId") on delete cascade
) TABLESPACE pg_default;

-- ============================================================================
-- attendees  [FACT-KB]
-- ============================================================================
create table public.attendees (
  "attendeeId" uuid not null default gen_random_uuid (),
  "eventId" uuid null default gen_random_uuid (),
  name character varying null,
  email character varying null,
  "phoneNumber" character varying null,
  company character varying null,
  notes character varying null,
  consent boolean null,
  created_at timestamp without time zone null,
  "orderId" uuid null default gen_random_uuid (),
  constraint attendees_pkey primary key ("attendeeId"),
  constraint "attendees_eventId_fkey" foreign key ("eventId") references events ("eventId") on delete cascade,
  constraint "attendees_orderId_fkey" foreign key ("orderId") references orders ("orderId") on delete cascade
) TABLESPACE pg_default;

-- ============================================================================
-- tickets  [FACT-KB]
-- ============================================================================
create table public.tickets (
  "ticketId" uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  "eventId" uuid null default gen_random_uuid (),
  "ticketTypeId" uuid null default gen_random_uuid (),
  "orderId" uuid null default gen_random_uuid (),
  "ticketCode" uuid null default gen_random_uuid (),
  "qrPayload" character varying null,
  status character varying null,
  "issuedAt" timestamp without time zone null,
  "usedAt" timestamp without time zone null,
  "attendeeId" uuid null default gen_random_uuid (),
  constraint tickets_pkey primary key ("ticketId"),
  constraint "tickets_ticketCode_key" unique ("ticketCode"),
  constraint "tickets_attendeeId_fkey" foreign key ("attendeeId") references attendees ("attendeeId") on delete cascade,
  constraint "tickets_eventId_fkey" foreign key ("eventId") references events ("eventId") on delete cascade,
  constraint "tickets_orderId_fkey" foreign key ("orderId") references orders ("orderId") on delete cascade,
  constraint "tickets_ticketTypeId_fkey" foreign key ("ticketTypeId") references "ticketTypes" ("ticketTypeId") on delete cascade
) TABLESPACE pg_default;

-- ============================================================================
-- paymentTransactions  [FACT-KB]
-- ============================================================================
create table public."paymentTransactions" (
  "paymentTransactionId" uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  "orderId" uuid null default gen_random_uuid (),
  gateway jsonb null,
  "hitpayReferenceId" character varying null,
  amount real null,
  currency character varying null,
  status character varying null,
  "rawPayload" jsonb null,
  updated_at timestamp without time zone null,
  constraint "paymentTransactions_pkey" primary key ("paymentTransactionId"),
  constraint "paymentTransactions_orderId_fkey" foreign key ("orderId") references orders ("orderId") on delete cascade
) TABLESPACE pg_default;

-- ============================================================================
-- webhookEvents  [FACT-KB]
-- ============================================================================
create table public."webhookEvents" (
  "webhookEventsId" uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  gateway jsonb null,
  "eventType" character varying null,
  "externalId" uuid not null default gen_random_uuid (),
  payload jsonb null,
  "receivedAt" timestamp without time zone null,
  "processedAt" timestamp without time zone null,
  "processingStatus" character varying null,
  constraint "webhookEvents_pkey" primary key ("webhookEventsId"),
  constraint "webhookEvents_externalId_key" unique ("externalId")
) TABLESPACE pg_default;

-- ============================================================================
-- auditLogs  [FACT-KB] verbatim from backend/database/auditLogs.sql
-- ============================================================================
create table public."auditLogs" (
  "auditLogId" uuid not null default extensions.uuid_generate_v4 (),
  "createdAt" timestamp with time zone not null default now(),
  "actorUserId" uuid null,
  "actionType" character varying(32) not null,
  "orderId" uuid null,
  "ticketId" uuid null,
  "paymentTransactionId" uuid null,
  "webhookEventsId" uuid null,
  details jsonb null,
  "ipAddress" character varying(64) null,
  "userAgent" text null,
  constraint "auditLogs_pkey" primary key ("auditLogId"),
  constraint "auditLogs_orderId_fkey" foreign key ("orderId") references orders ("orderId") on delete set null,
  constraint "auditLogs_paymentTransactionId_fkey" foreign key ("paymentTransactionId") references "paymentTransactions" ("paymentTransactionId") on delete set null,
  constraint "auditLogs_ticketId_fkey" foreign key ("ticketId") references tickets ("ticketId") on delete set null,
  constraint "auditLogs_webhookEventsId_fkey" foreign key ("webhookEventsId") references "webhookEvents" ("webhookEventsId") on delete set null
) TABLESPACE pg_default;

-- ============================================================================
-- invites  [FACT-LIVE + FACT-CODE]
-- Not in readme.txt, but required by backend/controller/inviteController.js
-- (insert {email, token, role, expiresAt} at :14/:46; select * by token at :74).
-- Column definitions taken from the live DB, which the original code matches.
-- ============================================================================
create table public.invites (
  "inviteId" uuid not null default gen_random_uuid (),
  email character varying not null,
  token character varying not null,
  role character varying null,
  "expiresAt" timestamp without time zone not null,
  "invitedBy" uuid null,
  constraint invites_pkey primary key ("inviteId"),
  constraint "invites_invitedBy_fkey" foreign key ("invitedBy") references users ("userId") on delete cascade
) TABLESPACE pg_default;

-- ============================================================================
-- Auth sync functions & triggers
-- ============================================================================
-- [FACT-LIVE] handle_new_user() exists in the live DB verbatim as below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users ("userId", email, role, created_at)
  values (new.id, new.email, 'STAFF', new.created_at);
  return new;
end;
$$;

-- [INFERRED] The INSERT trigger wiring handle_new_user to auth.users is
-- MISSING in the live DB (possibly dropped by your coworker). The function
-- exists and nothing else in the codebase inserts users rows on signup, so
-- the original almost certainly had this standard trigger. Review before use.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- [FACT-LIVE] both function and trigger verified present in the live DB.
create or replace function public.handle_user_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.users where "userId" = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_user_delete();

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- [FACT-CODE] backend/database/db.js uses SUPABASE_SERVICE_KEY (bypasses RLS),
-- so the app works regardless. [FACT-LIVE] In the live DB the core tables have
-- RLS enabled with NO policies (blocks all anon access — safe default), while
-- invites and auditLogs have RLS disabled. Reproduced as-is:
alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public."ticketTypes" enable row level security;
alter table public.orders enable row level security;
alter table public."orderItems" enable row level security;
alter table public.attendees enable row level security;
alter table public.tickets enable row level security;
alter table public."paymentTransactions" enable row level security;
alter table public."webhookEvents" enable row level security;
-- invites, auditLogs: RLS left disabled (matches live DB). Since only the
-- service key touches them, you may safely ENABLE RLS on these too.

-- ============================================================================
-- Storage  [FACT-CODE + FACT-LIVE]
-- Code references STORAGE_BUCKET (adminEventController.js, userController.js);
-- live project has a PUBLIC bucket named "startuplab-business-ticketing".
-- Create it in the new project via Dashboard > Storage, or:
insert into storage.buckets (id, name, public)
values ('startuplab-business-ticketing', 'startuplab-business-ticketing', true)
on conflict (id) do nothing;
