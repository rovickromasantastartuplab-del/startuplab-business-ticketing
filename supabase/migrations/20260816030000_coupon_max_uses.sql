-- ============================================================================
-- Coupon max-uses + redemption log (additive)
-- See docs/coupon-feature-plan.md
--
-- Adds a configurable per-coupon usage limit (defaults to 1, preserving today's
-- single-use behavior for every existing row) and a redemption log so admins
-- can see WHO used a coupon, for every use, not just the most recent one.
--
-- Redemption/rollback are exposed as atomic Postgres functions rather than
-- plain client-side updates: a client-computed "usesCount + 1" write is
-- vulnerable to a lost-update race under concurrent redemptions. The limit
-- check and the increment must happen inside the same statement, evaluated
-- against the live row — not a stale value read earlier in the request.
-- ============================================================================

alter table public.coupons
  add column "maxUses" integer not null default 1,
  add column "usesCount" integer not null default 0;

create table public."couponRedemptions" (
  "redemptionId" uuid not null default gen_random_uuid (),
  "couponId" uuid not null,
  "orderId" uuid not null,
  "redeemedAt" timestamp with time zone not null default now(),
  constraint "couponRedemptions_pkey" primary key ("redemptionId"),
  constraint "couponRedemptions_couponId_fkey" foreign key ("couponId") references public.coupons ("couponId") on delete cascade,
  constraint "couponRedemptions_orderId_fkey" foreign key ("orderId") references public.orders ("orderId") on delete cascade,
  constraint "couponRedemptions_coupon_order_unique" unique ("couponId", "orderId")
);

alter table public."couponRedemptions" enable row level security;

create or replace function public.redeem_coupon(p_coupon_id uuid, p_order_id uuid)
returns public.coupons
language plpgsql
as $$
declare
  result public.coupons;
begin
  update public.coupons
  set "usesCount" = "usesCount" + 1,
      "redeemedOrderId" = p_order_id,
      "redeemedAt" = now()
  where "couponId" = p_coupon_id
    and status = 'ACTIVE'
    and "usesCount" < "maxUses"
  returning * into result;

  if result."couponId" is not null then
    insert into public."couponRedemptions" ("couponId", "orderId")
    values (p_coupon_id, p_order_id)
    on conflict do nothing;
  end if;

  return result;
end;
$$;

create or replace function public.unredeem_coupon(p_coupon_id uuid, p_order_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public."couponRedemptions" where "couponId" = p_coupon_id and "orderId" = p_order_id;

  update public.coupons
  set "usesCount" = greatest(0, "usesCount" - 1),
      "redeemedOrderId" = case when "redeemedOrderId" = p_order_id then null else "redeemedOrderId" end,
      "redeemedAt" = case when "redeemedOrderId" = p_order_id then null else "redeemedAt" end
  where "couponId" = p_coupon_id;
end;
$$;
