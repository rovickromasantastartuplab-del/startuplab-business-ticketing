-- ============================================================================
-- Phase 0 — Single-use event coupons (additive only)
-- See docs/coupon-feature-plan.md
--
-- Coupons are scoped to exactly one event (not globally reusable). Codes are
-- unique per event, not globally, so the same code text may exist on two
-- different events without conflict.
-- ============================================================================

create table public.coupons (
  "couponId" uuid not null default gen_random_uuid (),
  code character varying not null,
  "eventId" uuid not null,
  "discountType" character varying not null, -- 'FIXED' | 'PERCENT'
  "discountValue" real not null,
  status character varying not null default 'ACTIVE', -- 'ACTIVE' | 'REDEEMED' | 'DISABLED'
  "redeemedOrderId" uuid null,
  "redeemedAt" timestamp with time zone null,
  "expiresAt" timestamp with time zone null,
  "createdBy" uuid null,
  created_at timestamp with time zone not null default now(),
  constraint coupons_pkey primary key ("couponId"),
  constraint coupons_code_event_key unique (code, "eventId"),
  constraint coupons_event_fkey foreign key ("eventId") references public.events ("eventId") on delete cascade,
  constraint coupons_discountType_check check ("discountType" in ('FIXED', 'PERCENT')),
  constraint coupons_status_check check (status in ('ACTIVE', 'REDEEMED', 'DISABLED'))
);

alter table public.coupons enable row level security;
