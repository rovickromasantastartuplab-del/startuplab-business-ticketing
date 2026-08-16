-- ============================================================================
-- Phase 0 — Dynamic registration fields (additive only)
-- See docs/dynamic-registration-fields-plan.md
--
-- Adds storage for admin-configurable per-event registration fields.
-- Purely additive: nullable columns, no defaults other than null, no existing
-- column touched. Inert until later phases add code that reads/writes them.
-- ============================================================================

alter table public.events
  add column "formFields" jsonb null;

alter table public.attendees
  add column "responses" jsonb null;
