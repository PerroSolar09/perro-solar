-- Perro Solar ticketing foundation
-- Apply only to a dedicated Supabase project after reviewing this migration.
-- This migration creates the event in DRAFT status. It does not enable sales.

create extension if not exists pgcrypto;

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    venue_name text not null,
    city text not null default 'Bogotá, Colombia',
    event_date date not null,
    status text not null default 'draft'
        check (status in ('draft', 'on_sale', 'sold_out', 'cancelled', 'completed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.ticket_types (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    name text not null,
    currency char(3) not null default 'COP' check (currency = 'COP'),
    unit_price_cop integer not null check (unit_price_cop > 0),
    capacity integer not null check (capacity > 0),
    sold_count integer not null default 0 check (sold_count >= 0),
    reserved_count integer not null default 0 check (reserved_count >= 0),
    sales_start_at timestamptz,
    sales_end_at timestamptz,
    active boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ticket_counts_within_capacity
        check (sold_count + reserved_count <= capacity),
    constraint ticket_sales_window
        check (sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at)
);

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
    buyer_name text not null check (char_length(trim(buyer_name)) between 2 and 120),
    buyer_email text not null check (char_length(trim(buyer_email)) between 5 and 254),
    quantity integer not null check (quantity between 1 and 10),
    unit_price_cop integer not null check (unit_price_cop > 0),
    total_cop bigint not null check (total_cop > 0),
    status text not null default 'pending_payment'
        check (status in ('pending_payment', 'paid', 'expired', 'cancelled', 'refunded')),
    idempotency_key text not null unique,
    expires_at timestamptz not null default (now() + interval '15 minutes'),
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists orders_event_status_idx on public.orders(event_id, status);
create index if not exists orders_expiry_idx on public.orders(expires_at) where status = 'pending_payment';

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    provider text not null default 'wompi' check (provider in ('wompi')),
    provider_reference text not null unique,
    provider_transaction_id text unique,
    amount_cop bigint not null check (amount_cop > 0),
    currency char(3) not null default 'COP' check (currency = 'COP'),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'declined', 'error', 'voided', 'refunded')),
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
    ticket_code text not null unique,
    qr_token_hash text not null unique,
    status text not null default 'valid'
        check (status in ('valid', 'used', 'cancelled', 'refunded')),
    issued_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists tickets_event_status_idx on public.tickets(event_id, status);

create table if not exists public.checkins (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null unique references public.tickets(id) on delete restrict,
    event_id uuid not null references public.events(id) on delete restrict,
    checked_in_at timestamptz not null default now(),
    operator_id uuid,
    note text
);

create index if not exists checkins_event_time_idx on public.checkins(event_id, checked_in_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists ticket_types_set_updated_at on public.ticket_types;
create trigger ticket_types_set_updated_at before update on public.ticket_types
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();

-- Public users receive no direct table access. All writes and private reads must
-- go through server-side Edge Functions using secrets kept outside the browser.
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.checkins enable row level security;

revoke all on public.events, public.ticket_types, public.orders,
    public.payments, public.tickets, public.checkins from anon, authenticated;

-- Initial event data is intentionally unpublished and inactive.
insert into public.events (slug, name, venue_name, city, event_date, status)
values (
    'perro-solar-la-estacion-2026-11-21',
    'Perro Solar en La Estación Rock and Roll',
    'La Estación Rock and Roll',
    'Bogotá, Colombia',
    date '2026-11-21',
    'draft'
)
on conflict (slug) do nothing;

insert into public.ticket_types (event_id, name, currency, unit_price_cop, capacity, active)
select id, 'Preventa', 'COP', 10000, 100, false
from public.events
where slug = 'perro-solar-la-estacion-2026-11-21'
and not exists (
    select 1 from public.ticket_types tt
    where tt.event_id = events.id and tt.name = 'Preventa'
);

-- Important: no payment or QR issuance function is exposed in this first migration.
-- These will be added after the Wompi sandbox webhook and idempotency flow are tested.
