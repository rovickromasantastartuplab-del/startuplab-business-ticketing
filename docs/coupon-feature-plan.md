# Implementation Plan: Event Coupons

**Status:** All 6 phases code complete, plus a post-Phase-6 capability change (see below).
Pending live verification, especially Phase 4 (touches live checkout).
**Owner:** —
**Source:** User request 2026-08-16, discount type / scope / creation-method confirmed via
clarifying questions. Title changed from "Single-Use" to "Event Coupons" — see amendment below.

## Post-Phase-6 amendment: configurable max uses + redemption log (2026-08-16)

The original plan was scoped strictly to single-use coupons ("each coupon should be 1 time use
only" — the user's own words when this was first scoped). After all 6 phases shipped, the user
asked for a genuine capability change: **admin-configurable usage limits**, plus **visibility
into who redeemed each coupon, for every use**.

**What changed, additively (new migration, no destructive changes):**
- `coupons` gained `maxUses` (default `1`, so every existing/未-configured coupon keeps today's
  exact single-use behavior unless an admin explicitly raises it) and `usesCount`.
- New `couponRedemptions` table — one row per successful redemption (`couponId`, `orderId`,
  `redeemedAt`), joined to `orders` for buyer name/email when displayed. This exists because
  with `maxUses > 1`, a single coupon can be used by multiple different people, and "who used
  it" needs a per-use record, not a single `redeemedOrderId` field.
- **Redemption became a Postgres RPC function** (`redeem_coupon`/`unredeem_coupon`) instead of a
  plain client-side `.update()`. This is a correctness requirement, not a style choice: the old
  approach flipped `status: 'ACTIVE' → 'REDEEMED'`, a boolean CAS that's safe to do from the
  client. A counter (`usesCount`) is not — computing `usesCount + 1` in JS from a value read
  earlier in the request and writing that back is a classic lost-update race under concurrent
  redemptions. The limit check and the increment must happen inside the same SQL statement,
  evaluated against the live row. **Verified directly against the database** (not just code
  review): inserted a test coupon with `maxUses=2`, called `redeem_coupon` three times in
  sequence — first two succeeded and incremented correctly, third correctly returned null
  (limit enforced). Also verified the redemption log records and joins to buyer info correctly.
  All test rows cleaned up afterward.
- `CouponStatus` narrowed to `'ACTIVE' | 'DISABLED'` — it's now purely an admin on/off switch,
  independent of usage. A coupon can be `ACTIVE` and fully used at the same time; capacity is
  `usesCount`/`maxUses`, not a third status value. `updateCouponStatus` (Phase 3's disable/
  enable toggle) simplified accordingly — no more "can't touch a REDEEMED coupon" special case.
- Admin UI (`CouponManager` in `EventsManagement.tsx`): a "Max Uses" field on both the single
  Create form and the Bulk Generate form (default `1`), a "`X`/`Y` used" badge per coupon, and
  a "Used by (N)" expandable list per coupon showing buyer name/email/timestamp for every
  redemption — not just the most recent.
- **Edit existing coupon** (`updateCouponStatus` generalized to `updateCoupon`, `PATCH
  /api/admin/coupons/:id` now accepts any of `{ status, code, discountType, discountValue,
  maxUses, expiresAt }`, all optional/partial): an inline "Edit" mode per coupon row in the
  admin list. Guardrails: `maxUses` can never be edited below the coupon's current `usesCount`
  (checked both client-side for immediate feedback and server-side as the real enforcement);
  editing discount/expiry/code never rewrites history — a past redemption's `discountAmount` was
  already computed and frozen into that order's `metadata` at redemption time, so edits only
  affect *future* validation attempts against the coupon.

**Not changed:** the atomic single-use *guarantee* itself (the thing that actually matters for
correctness) — a coupon with `maxUses=1` behaves exactly as before; the mechanism just
generalized from "flip a flag" to "increment a bounded counter," both equally race-safe.

## Post-Phase-6 amendment: coupon field moved to the registration page + paid-only (2026-08-16)

Two more changes after live-testing the Phase 4 UI:

1. **Field relocated.** The coupon input used to live on `EventDetails.tsx` (the "Get Tickets"
   panel), with the applied code carried to `RegistrationForm.tsx` via a `?coupon=` URL param
   and re-validated read-only there. It's now entered and applied **directly on
   `RegistrationForm.tsx`**, in the Reservation Summary — no URL param, no cross-page
   hand-off. `EventDetails.tsx` reverted to exactly its pre-coupon state (selection + navigate
   only). This is strictly simpler: one page owns the coupon lifecycle (input → apply → applied
   display → submit) instead of splitting entry and validation across two pages.
2. **Coupons are rejected on free ($0) orders**, enforced in three places so it can't be
   bypassed by skipping the UI: `couponController.js`'s `validateCoupon` returns
   `valid:false` for `subtotal === 0`; `orderController.js`'s pre-check computes the real
   subtotal from the submitted `items` and rejects the whole order (400) if a `couponCode` is
   present alongside a $0 subtotal; and client-side, the coupon field only renders on
   `RegistrationForm.tsx` when `subtotal > 0` in the first place.

## Goal

Let an admin generate discount coupons **per event** (fixed-amount or percentage off, admin's
choice per coupon), created either one at a time or in a bulk batch. A guest enters a code in a
new field on the event's "Get Tickets" panel; each code is usable **exactly once**.

## How to use this doc

Same convention as `docs/dynamic-registration-fields-plan.md`: each phase is a self-contained,
shippable chunk. Don't start phase N+1 until phase N's verification checklist passes. Update the
Status column as you go.

## Tracking Table

| Phase | Name | Status | Risk |
|---|---|---|---|
| 0 | Schema (additive only) | Done | None |
| 1 | Backend: validate + manual create (dark) | Code complete, pending live verification | None — no UI calls it yet |
| 2 | Backend: bulk-generate + atomic redeem-on-order | Code complete, CAS verified at DB level | None until Phase 4 wires the public form |
| 3 | Admin UI: coupon management per event | Code complete, pending live verification | None — admin-only, doesn't touch checkout |
| 4 | Public UI: coupon field + checkout wiring | Code complete, pending live verification | **Highest risk** — touches live checkout/order creation |
| 5 | Polish (optional) | Done | None |

---

## Non-Negotiable Constraints

1. **Single-use is enforced atomically, server-side**, using the same compare-and-swap pattern
   already used for ticket inventory (`ticketTypes.quantitySold` in `orderController.js`) — a
   coupon's `status` only flips `ACTIVE → REDEEMED` if the update's `WHERE status = 'ACTIVE'`
   actually matched a row. Two simultaneous orders racing to use the same code must not both
   succeed.
2. **Redeeming a coupon is part of the same rollback path as ticket/order cleanup.** If order
   creation fails after a coupon was redeemed, the coupon must be reset back to `ACTIVE` in
   `cleanupOrder()`, exactly like reserved ticket inventory is rolled back today.
3. **Known, accepted scope limit — not a bug to "fix" along the way:** this app already trusts
   the client-submitted `totalAmount`/`items[].price` when creating an order (`orderController.js`
   has no server-side re-pricing against `ticketTypes.priceAmount`). This plan does **not**
   change that trust model. The backend's job for a coupon is strictly: (a) confirm the code is
   real, `ACTIVE`, belongs to the submitted event, and unexpired, and (b) atomically redeem it.
   The discount *amount* shown/applied is computed the same way the rest of the pricing already
   is — client-side, from the subtotal — and is not independently re-verified server-side beyond
   the coupon's own validity. If real payment-integrity hardening is wanted later, that's a
   separate, larger effort (server-side re-pricing for the whole order flow, not just coupons).
4. **No destructive migrations.** New `coupons` table only; nothing existing is altered.
5. **A coupon is scoped to exactly one event** (`coupons.eventId` is `not null`) — it cannot be
   validated or redeemed against any other event.

---

## Phase 0 — Schema (additive only)

**Changes:** new `coupons` table.

```sql
create table public.coupons (
  "couponId" uuid not null default gen_random_uuid(),
  code character varying not null,
  "eventId" uuid not null,
  "discountType" character varying not null,   -- 'FIXED' | 'PERCENT'
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
```

Codes are unique **per event**, not globally — the same code text could exist on two different
events without conflict (matches "tied to one event" scoping decision).

**Verification checklist:**
- [x] Migration applies cleanly.
- [x] No existing table/column touched.

---

## Phase 1 — Backend: validate + manual create (dark launch)

**Changes:**
- `backend/controller/couponController.js` (new):
  - `validateCoupon` — `POST /api/coupons/validate` (public, no auth). Body `{ eventId, code,
    subtotal }`. Looks up by `(code, eventId)`, checks `status === 'ACTIVE'` and not expired,
    computes `discountAmount` from `subtotal` (`FIXED`: `min(discountValue, subtotal)`;
    `PERCENT`: `round(subtotal * discountValue / 100)`). Returns `{ valid, discountAmount,
    discountType, discountValue }` or `{ valid: false, error }`. Read-only — does not redeem.
  - `listAdminCoupons` — `GET /api/admin/coupons?eventId=...` (auth required).
  - `createCoupon` — `POST /api/admin/coupons` (auth required). Body `{ eventId, code?,
    discountType, discountValue, expiresAt? }`. If `code` omitted, auto-generate one (see Phase 2
    for the generator, reused here).
- `backend/routes/couponRoutes.js` (public) + `backend/routes/adminCouponRoutes.js` (admin),
  mounted in `app.js` following the exact pattern of `footerRoutes`/`adminFooterRoutes`.

**Do NOT in this phase:**
- Do not touch `orderController.js` — redemption comes in Phase 2.
- Do not touch any frontend file.

**Verification checklist:**
- [ ] Manually create a coupon via the admin endpoint (curl/SQL), then validate it via the public
      endpoint — correct discount computed for both `FIXED` and `PERCENT`.
- [ ] Validating an unknown code, wrong event, expired, or `DISABLED` coupon returns
      `valid: false` with a clear error, not a 500.

---

## Phase 2 — Backend: bulk-generate + atomic redeem-on-order

**Changes:**
- `couponController.js`: `bulkCreateCoupons` — `POST /api/admin/coupons/bulk`. Body `{ eventId,
  count, discountType, discountValue, expiresAt? }`. Generates `count` random unique codes
  (reusing the single-create generator), inserts them in one batch, returns the full list of
  generated codes (this is the only time an admin can see them all at once — no bulk "reveal"
  view is otherwise needed).
- `orderController.js` (`createOrder`): accept optional `couponCode`. If present:
  1. Fetch the coupon by `(couponCode, eventId)`.
  2. Reject the order (400) if missing, `DISABLED`, already `REDEEMED`, or expired.
  3. Atomically redeem via CAS: `update coupons set status='REDEEMED', redeemedOrderId=orderId,
     redeemedAt=now() where couponId=X and status='ACTIVE'` — if zero rows affected (lost a race
     to another concurrent order), reject with 409, same pattern as inventory reservation
     conflicts.
  4. Record what was applied in `orders.metadata` (additive, same precedent as `company`/
     `customFields`): `{ ...existing, coupon: { code, discountType, discountValue,
     discountAmount } }`.
  5. On any failure after redemption (`cleanupOrder()`), reset the coupon back to `ACTIVE` and
     clear `redeemedOrderId`/`redeemedAt`.

**Do NOT in this phase:**
- Do not touch any frontend file — `couponCode` is never sent by anything yet, so this is dark
  exactly like Phase 1 of the custom-fields plan.
- Do not re-derive/override the client-submitted `totalAmount` — see Non-Negotiable Constraint 3.

**Verification checklist:**
- [ ] Bulk-generate 5 codes for a test event; confirm 5 unique rows created.
- [x] The CAS update's race-safety verified directly at the DB level: two sequential
      `UPDATE ... WHERE status='ACTIVE'` attempts against the same coupon — first succeeds,
      second returns zero rows. (Full end-to-end via the API, with real concurrent requests
      hitting `createOrder`, still pending — this confirms the underlying guarantee the code
      relies on, not the full request path.)
- [ ] Force an order-creation failure after a coupon redeems (e.g. bad `ticketTypeId` in a later
      step) — confirm the coupon is back to `ACTIVE` afterward, not stuck `REDEEMED`.
- [ ] Order with no `couponCode` behaves identically to today (legacy behavior, unaffected).

---

## Phase 3 — Admin UI: coupon management per event

**Changes:**
- `frontend/views/Admin/EventsManagement.tsx`: new "Coupons" section (likely alongside the
  existing Ticket Inventory modal, since coupons are per-event like ticket types) —
  - List of existing coupons for the event: code, discount, status, redeemed-at/order if used.
  - "Create Coupon" form: optional code (blank = auto-generate), discount type toggle
    (Fixed/Percent), value, optional expiry date.
  - "Bulk Generate" form: count, discount type/value, optional expiry → on submit, shows the
    generated code list in a modal (copyable) since that's the only time they're all visible.
  - Disable/re-enable action per coupon (soft — toggles `status` between `ACTIVE`/`DISABLED`,
    never deletes; blocked entirely once a coupon is `REDEEMED`).
- `frontend/services/apiService.ts`: `getAdminCoupons`, `createCoupon`, `bulkCreateCoupons`,
  `setCouponStatus`.
- `frontend/types.ts`: `Coupon` interface.

> **Deviation from original scope (discovered during implementation):** the plan only listed a
> one-way "disable," but toggling it back on is one line of UI work once the endpoint exists, and
> "created a coupon by mistake, want to turn it back on" is an obvious real need — so the backend
> endpoint (not originally scoped for this phase) supports both directions. Added
> `updateCouponStatus` (`PATCH /api/admin/coupons/:id`, body `{ status }`) to
> `backend/controller/couponController.js` and `backend/routes/adminCouponRoutes.js`. It only
> ever accepts `ACTIVE`/`DISABLED` — a `REDEEMED` coupon is a permanent record of a real order
> and this endpoint refuses to touch it either direction.

**Do NOT in this phase:**
- Do not touch `EventDetails.tsx` or `RegistrationForm.tsx` — public checkout is untouched until
  Phase 4, so this phase carries zero live-checkout risk despite the redemption logic already
  existing server-side since Phase 2.

**Verification checklist:**
- [ ] Create a single coupon and a bulk batch from the UI; both appear in the list correctly.
- [ ] Disabling a coupon updates its status and it no longer validates successfully (Phase 1's
      endpoint, tested directly).

---

## Phase 4 — Public UI: coupon field + checkout wiring (highest-risk phase)

**Changes:**
- `frontend/views/Public/EventDetails.tsx`: new coupon code text field + "Apply" button in the
  "Get Tickets" panel (per the screenshot). On apply, calls the Phase 1 validate endpoint with
  the current subtotal; shows the discount inline (e.g. "Coupon SAVE10 applied: -PHP 200") or an
  error. The applied code is carried forward into the `selections` URL param already used to hand
  off to `RegistrationForm.tsx` (add a sibling `coupon` param).
- `frontend/views/Public/RegistrationForm.tsx`: reads `coupon` from the URL; re-validates it on
  load (selection may have changed the subtotal since `EventDetails`), shows it in the
  Reservation Summary, factors the discount into `totalPayable` before the HitPay fee is
  calculated (discount applies to subtotal, fee calculated on the post-discount amount — matches
  how a real discount should interact with a percentage-based processing fee), and includes
  `couponCode` in the order submission payload built in Phase 2.

**Do NOT in this phase:**
- Do not change the Payment Method logic or Name/Email/Contact Number fields — out of scope.
- Do not remove the ability to check out **without** a coupon — the field is optional; omitting
  it must behave exactly as today.

**Verification checklist:**
- [ ] An event with no coupon entered checks out identically to today (free and paid paths).
- [ ] A valid coupon reduces the shown total correctly, the fee recalculates off the discounted
      subtotal, and the resulting order's stored `totalAmount` reflects it.
- [ ] Attempting to reuse an already-redeemed coupon (e.g. open two tabs, redeem in one, submit
      in the other) is rejected with a clear error, not a silent partial success.
- [ ] An expired or wrong-event coupon code shows a clear inline error and does not block
      checking out *without* a coupon.

---

## Phase 5 — Polish (optional)

- [x] Copy-to-clipboard / plain-text export for a bulk-generated code batch — already shipped as
      part of Phase 3 (`CouponManager`'s "Copy All" button, newline-separated codes).
- [x] Coupon redemption visibility in Dashboard order-detail — added a "Coupon Applied" block to
      `renderOrderDetails` in `frontend/views/Admin/Dashboard.tsx` (code, discount type/value,
      amount saved), reading `order.metadata.coupon` which Phase 2 already writes. Purely
      additive — same pattern as the custom-fields Phase 4 display work.
      (Not extended to `RegistrationsList.tsx`'s attendee detail popup — the plan only scoped
      this to Dashboard/order-detail, and `RegistrationView`/its backing endpoints don't
      currently carry `orders.metadata` at all, so that would be new scope, not this checklist
      item.)
