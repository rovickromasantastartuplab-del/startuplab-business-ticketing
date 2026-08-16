-- ============================================================================
-- footerLinks — admin-editable footer content (custom links + social links)
-- ============================================================================
create table public."footerLinks" (
  "footerLinkId" uuid not null default gen_random_uuid (),
  type character varying not null,
  label character varying null,
  platform character varying null,
  url character varying not null,
  "sortOrder" integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp without time zone null,
  constraint "footerLinks_pkey" primary key ("footerLinkId"),
  constraint "footerLinks_type_check" check (type in ('CUSTOM', 'SOCIAL'))
) TABLESPACE pg_default;

alter table public."footerLinks" enable row level security;
