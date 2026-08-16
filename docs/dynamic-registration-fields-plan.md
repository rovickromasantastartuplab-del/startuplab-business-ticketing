# Implementation Plan: Admin-Configurable Registration Fields

**Status:** All 6 phases code complete, pending live verification (Phase 3 is highest-risk — verify thoroughly)
**Owner:** —
**Source:** Audit conducted 2026-08-16 (see conversation history / this doc's "Audit Summary" section)

## Goal

Let an admin add/edit/delete/reorder custom registration fields **per event**, instead of the
current fixed set (Full Name, Email, Contact Number, Company). Name and Email stay
permanently fixed — see Non-Negotiable Constraints.

> **Post-Phase-6 amendment (requested after live testing):** the public form no longer falls
> back to showing Contact Number + Company for an event with an empty `formFields` config.
> An unconfigured event now shows **only** Name + Email — Contact Number, Company, and
> everything else are just regular configurable fields an admin adds explicitly (the "Adopt
> Legacy Fields" button from Phase 6 adds them back in one click, per event, if wanted). This
> supersedes the "identical legacy behavior for `formFields = null`" half of Constraint 3 below —
> Name/Email-only-by-default is now the deliberate legacy behavior. Changed in
> `frontend/views/Public/RegistrationForm.tsx` only: the `{!hasCustomFormFields && (...)}` guard
> around the hardcoded Contact Number/Company inputs was removed, and `configuredFields` (i.e.
> `event.formFields || []`) is now rendered unconditionally instead of only when non-empty.

## How to use this doc

Each phase is a self-contained, shippable chunk. Do not start phase N+1 until phase N's
verification checklist passes. Update the **Status** column in the tracking table as you go.
If a phase is skipped or descoped, note why instead of deleting the row.

## Tracking Table

| Phase | Name | Status | Risk to live registration |
|---|---|---|---|
| 0 | Schema (additive only) | Done | None — no code reads new columns yet |
| 1 | Backend dynamic-field support (dark) | Code complete, pending live verification | None — no-op unless `formFields` set, and nothing sets it yet |
| 2 | Admin config UI (dark) | Code complete, pending live verification | None — public form untouched |
| 3 | Public form goes dynamic | Code complete, pending live verification | **Highest risk phase** — touches live registration |
| 4 | Display surfaces catch-up | Code complete, pending live verification | Low — additive rendering only |
| 5 | Required-field enforcement hardening | Code complete, pending live verification | Low — server-side only |
| 6 | Search + optional legacy-adoption tool | Code complete, pending live verification | None — opt-in, off by default |

---

## Non-Negotiable Constraints (apply to every phase)

1. **Never remove, rename, or make deletable the Name or Email fields**, in the DB, the admin
   config UI, or the public form. HitPay checkout and the Make.com webhook both depend on
   `buyerName`/`buyerEmail` by exact key — breaking either breaks payments or notifications.
2. **Never drop or rename existing columns** (`attendees.name/email/phoneNumber/company`,
   `orders.buyerName/buyerEmail/buyerPhone/metadata`). All new storage is additive (new nullable
   columns). This keeps every phase reversible by simply not calling the new code path.
3. **`NULL`/empty `formFields` on an event must always mean "use today's fixed field set"** —
   the exact current behavior, byte-for-byte. This is the fallback that guarantees old events
   and any event an admin hasn't touched keep working unchanged, forever, with no migration
   required.
4. **No phase may silently drop submitted data.** If the public form ever collects a field, the
   backend for that phase must already know how to store it — do not ship a public-form change
   ahead of the backend storage it depends on (this is why phase ordering matters: 1 before 3).
5. **No destructive/irreversible DB operations.** Every migration in this plan is `ADD COLUMN`
   only. No `DROP COLUMN`, no `NOT NULL` additions to existing columns, no data backfills that
   overwrite existing rows.
6. **Each phase should be its own commit/PR**, scoped to only the files listed in that phase.
   Do not combine phases in one change — that's what makes this "surgical."

---

## Phase 0 — Schema (additive only)

**Goal:** Add storage for dynamic config/responses without any code touching it yet.

**Changes:**
- `events` table: add `"formFields" jsonb null` (default `null`)
- `attendees` table: add `"responses" jsonb null` (default `null`)

**Files touched:** one new migration file in `supabase/migrations/`.

**Do NOT in this phase:**
- Do not touch any backend controller.
- Do not touch any frontend file.
- Do not set a default value other than `null` — `null` is the "legacy behavior" signal per
  Constraint 3.

**Verification checklist:**
- [x] Migration applies cleanly to the live DB.
- [x] Existing app (backend + frontend, unmodified) still runs with zero behavior change —
      confirms the new columns are inert.

---

## Phase 1 — Backend dynamic-field support (dark launch)

**Goal:** Backend can accept, validate, and store dynamic field responses — but nothing calls
this path yet, because no event has `formFields` set (Phase 2 hasn't shipped).

**Changes:**
- `backend/controller/orderController.js` (`createOrder`): accept an optional `customFields`
  object in `req.body`. If the target event has `formFields` set, validate required fields are
  present; if not set, ignore `customFields` entirely (legacy behavior, per Constraint 3).
  Store the submitted values in `orders.metadata` alongside the existing `{ company }` shape
  (e.g. `{ company, customFields }`), following the precedent already in the codebase.
- `backend/controller/paymentController.js` (HitPay webhook attendee-issuance path): unpack
  `customFields` from `orders.metadata` the same way `company` is unpacked today, and write it
  to the new `attendees.responses` column.
- Also update the **free-order** attendee-creation path in `orderController.js` to do the same
  `responses` write.

**Files touched:** `backend/controller/orderController.js`, `backend/controller/paymentController.js`.

**Do NOT in this phase:**
- Do not change `RegistrationForm.tsx` or any other frontend file — no UI sends `customFields`
  yet, so this phase is inert in production until Phase 3 ships.
- Do not change the existing required-check for `buyerName`/`buyerEmail` (Constraint 1).
- Do not remove or alter the existing `company`-in-metadata handling — extend it, don't replace it.

**Verification checklist:**
- [ ] Existing registration flow (no `customFields` sent) behaves identically to before —
      test both free and paid order paths.
- [ ] Manually POST an order with a `customFields` payload against a test event that has
      `formFields` set directly via SQL — confirm it lands in `attendees.responses`.
- [ ] Manually POST an order with `customFields` against an event with `formFields = null` —
      confirm `customFields` is ignored/discarded without error (legacy behavior).

---

## Phase 2 — Admin config UI (dark launch)

**Goal:** Admin can build a field list per event and save it. Public form still ignores it
entirely (Phase 3 not shipped), so this phase carries no live-registration risk.

**Changes:**
- New UI section in `frontend/views/Admin/EventsManagement.tsx` (event create/edit modal, or a
  dedicated sub-tab): add/edit/delete/reorder custom fields. Each field: `key`, `label`, `type`
  (text/email/phone/select/checkbox), `required` (bool).
- Name and Email are **not editable list items** — they're implicit/always-on and shown as
  fixed, greyed-out entries at the top of the builder (or omitted from the builder entirely with
  a note that they're always collected).
- Reject any field `key` that collides with reserved keys: `name`, `email`, `phone`, `company`
  (client-side check; also enforce server-side in the same PUT/POST call).
- Wire into `apiService.createEvent`/`updateEvent` (already accept `Partial<Event>`; add
  `formFields` to the payload type).

**Files touched:** `frontend/views/Admin/EventsManagement.tsx`, `frontend/services/apiService.ts`,
`frontend/types.ts` (add `formFields` to `Event` type), `backend/controller/adminEventController.js`
(accept/persist `formFields` on create/update, with reserved-key rejection).

**Do NOT in this phase:**
- Do not modify `RegistrationForm.tsx`.
- Do not modify any of the 6 display surfaces from the audit — they still show only the fixed
  fields, which is correct since no attendee will have `responses` populated yet (Phase 3 hasn't
  shipped, so nothing sends `customFields` from the public form).

**Verification checklist:**
- [ ] Admin can create/save a `formFields` config on a test event and see it persist on reload.
- [ ] Saving a config with a reserved key (`email`, etc.) is rejected with a clear error.
- [ ] Public registration page for that same test event is visually and functionally unchanged
      (confirms this phase is truly dark).

---

## Phase 3 — Public form goes dynamic (highest-risk phase)

**Goal:** The public registration form renders admin-configured fields. This is the first phase
that touches the live registration path, so treat it with the most care.

**Changes:**
- `frontend/views/Public/RegistrationForm.tsx`: fetch the event's `formFields`. If `null`/empty,
  render **exactly** today's hardcoded fields (Name, Email, Contact Number, Company) — no visual
  or behavioral change (Constraint 3). If set, render Name + Email (always) followed by the
  configured fields, and submit the extra values as `customFields` in the order payload built in
  Phase 1.
- Client-side required-field validation generated from the config, layered on top of the
  existing (unchanged) Name/Email validation.

**Files touched:** `frontend/views/Public/RegistrationForm.tsx` only.

**Do NOT in this phase:**
- Do not touch the Name/Email inputs, their validation, or their error messages.
- Do not touch the Payment Method dropdown/logic — out of scope for this feature entirely.
- Do not flip any **real, live** event to a custom config until this phase's checklist passes
  end-to-end in a staging/test event first.

**Verification checklist:**
- [ ] Every existing event (with `formFields = null`) — full registration flow (free + paid)
      works identically to before this phase, with no visual diff.
- [ ] A test event with a custom config — required custom fields block submission client-side;
      submission succeeds and data appears in `attendees.responses` (verified via Phase 1's
      backend path).
- [ ] HitPay checkout still receives correct `buyerName`/`buyerEmail` for a custom-config event
      (confirms Constraint 1 held).

---

## Phase 4 — Display surfaces catch-up

**Goal:** Admin/attendee-facing views show the dynamic responses, additively, without disturbing
existing layout for the fixed fields.

**Changes (one file at a time, each independently verifiable):**
1. `frontend/views/Public/TicketView.tsx` — append configured field values after existing
   name/email/company block.
2. `frontend/views/Admin/RegistrationsList.tsx` — detail popup appends dynamic responses after
   existing name/email/phone/company; list view unchanged (avoid widening the table).
3. `frontend/views/Admin/EventsManagement.tsx` (attendee popup) — same additive approach.
4. `frontend/views/Admin/Dashboard.tsx` (order detail) — same additive approach.
5. `frontend/views/Admin/CheckIn.tsx` — evaluate whether custom fields are useful at check-in
   time at all (may be a deliberate no-op; check-in is safety-critical and code-based per the
   audit — avoid adding anything that could slow down or complicate the scan-and-confirm flow).

> **Deviation from original scope (discovered during implementation):** the plan above only
> listed frontend files, but every one of these views is fed by a backend endpoint that used an
> **explicit column select** on `attendees` (e.g. `'attendeeId, name, email, phoneNumber, company'`)
> — `responses` was silently excluded. Without a backend fix, the frontend would have had no data
> to render at all. Additive one-line fix applied to each: add `responses` to the `.select()`
> string, and add a matching `attendeeResponses`/`responses` key to the JSON the endpoint already
> returns (no restructuring, no new endpoints). Actual files touched, beyond the plan's list:
> - `backend/controller/ticketController.js` (`getRegistrationsByEvent`, `getAllRegistrations`,
>   `getTicketById`)
> - `backend/controller/analyticsController.js` (`loadOrderDetails`, `loadTicketDetails`)
> - `frontend/services/apiService.ts` (`getTicketDetails` does manual field-by-field mapping —
>   needed one added line to pass `attendeeResponses` through)
> - `frontend/types.ts` (`RegistrationView` needed a new optional `attendeeResponses` field)

**Do NOT in this phase:**
- Do not restructure the existing fixed-field layout in any of these files — insert, don't
  rearrange.
- Do not change `CheckIn.tsx`'s matching logic (ticketCode/qrPayload only, per the audit) —
  this phase is display-only.

**Verification checklist (per file):**
- [ ] Existing fixed-field display unchanged for events without custom fields.
- [ ] Dynamic responses render correctly for a custom-config test event.
- [ ] No layout regression (spot-check each updated view).

---

## Phase 5 — Required-field enforcement hardening

**Goal:** Close the gap where a field marked "required" in the admin config isn't actually
enforced server-side (client-side-only validation can be bypassed).

**Changes:**
- `backend/controller/orderController.js`: reject order creation if a required custom field
  (per the event's `formFields`) is missing from `customFields`, mirroring the existing
  `buyerName`/`buyerEmail` required-check.

> **Note:** the base version of this check actually shipped as part of Phase 1 (Phase 1's own
> spec already called for it — "validate required fields are present"). What Phase 5 actually
> delivered: a **type-aware correctness fix**. The Phase 1 check used
> `!customFields?.[f.key]?.toString?.().trim?.()` for every field type, which has a real bug for
> `checkbox` fields — `false.toString()` is the non-empty string `"false"`, so an unchecked
> required checkbox was silently treated as present. Phase 5 special-cases `checkbox` to require
> `value === true`, matching `RegistrationForm.tsx`'s client-side `validate()` exactly (a `false`
> answer is valid for an optional checkbox, but never satisfies a required one).

**Files touched:** `backend/controller/orderController.js`.

**Do NOT in this phase:**
- Do not retroactively validate or void orders/attendees created before this phase ships —
  this is forward-only enforcement.

**Verification checklist:**
- [ ] Submitting an order via direct API call (bypassing the frontend) without a required
      custom field is rejected with a clear error.
- [ ] Existing legacy events (`formFields = null`) are unaffected.

---

## Phase 6 — Search + optional legacy-adoption tool (stretch, optional)

**Goal:** Quality-of-life additions. Fully optional; ship only if there's appetite after Phase 5.

**Changes:**
- Extend the Attendees search (`RegistrationsList.tsx` + its backend query) to also match
  against `attendees.responses` values.
- Optional admin action: "adopt legacy fields into config" — one-click, per-event, opt-in
  conversion that generates a `formFields` entry mirroring the existing Contact Number/Company
  fields, so an admin can migrate an old event onto the new system if they want to. **Must never
  run automatically** — it's a manual, explicit action only.

**What actually shipped:**
- `backend/controller/ticketController.js`: added `findAttendeeIdsByResponsesSearch()` — fetches
  attendees with a non-null `responses`, then does a case-insensitive substring match against
  `JSON.stringify(responses)` in JS (no raw SQL/jsonb casting, avoids injection surface). Wired
  into both `getRegistrationsByEvent` and `getAllRegistrations` search branches, unioned with the
  existing name/email `.ilike()` match — same query, same behavior, just OR'd with more IDs.
  `RegistrationsList.tsx` needed no change: it already just forwards the `search` term, matching
  happens entirely server-side.
- `frontend/views/Admin/EventsManagement.tsx`: `handleAdoptLegacyFields()` + an "Adopt Legacy
  Fields" button in the form-fields builder header. Generates two `formFields` entries (Contact
  Number → `phone`, Company → `text`, both optional, matching original behavior) into local
  `formData.formFields` state only — nothing persists until Save/Create is clicked, and it only
  ever touches the single event whose modal is open.

**Do NOT in this phase:**
- Do not make the legacy-adoption tool run automatically or in bulk across all events.
- Do not change search behavior for events without custom fields.

**Verification checklist:**
- [ ] Search still returns correct results for legacy events (no regression).
- [ ] Legacy-adoption tool only affects the single event an admin explicitly runs it on.

---

## Audit Summary (reference)

Condensed from the audit conducted before this plan — see conversation history for full detail.

- **Fixed today:** `attendees.name/email/phoneNumber/company`, `orders.buyerName/buyerEmail/buyerPhone`.
  No jsonb/custom-fields column exists yet.
- **`company` precedent:** already flows through `orders.metadata` as free-form JSON, unpacked
  into the `attendees.company` column at creation time — proof this pattern already works in
  this codebase.
- **Check-in is unaffected:** matches purely by opaque `ticketCode`/`qrPayload`, no field
  dependency at all.
- **QR codes are opaque:** no attendee data embedded, so nothing to update there.
- **Hard dependencies on Name/Email specifically:** HitPay checkout API (`paymentController.js`)
  and the Make.com webhook notification both key off `buyerName`/`buyerEmail` by exact name.
- **No CSV export exists** and **no duplicate-registration check exists** — neither needs
  updating or risks breaking.
- **6 display surfaces** currently hardcode field access and will silently fail to show new
  custom fields until updated in Phase 4 (not a crash — a completeness gap).
