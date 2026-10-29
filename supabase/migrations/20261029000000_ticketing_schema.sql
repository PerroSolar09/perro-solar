-- Boletería Perro Solar
-- Migration: 20261029000000_ticketing_schema.sql
-- Safe baseline: all tables use RLS and no public policies are granted.
-- Public purchases must be implemented through trusted server-side functions.

create extension if not exists pgcrypto;

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    venue_name text not null,
    city text not null default 'Bogotá',
    event_date date not null,
    timezone text not null default 'America/Bogota',
    currency text not null default 'COP' check (currency = 'COP'),
    status text not null default 'draft' check (status in ('draft', 'testing', 'on_sale', 'sold_out', 'closed', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.ticket_types (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    name text not null,
    unit_price_cop integer not null check (unit_price_cop > 0),
    capacity integer not null check (capacity > 0),
    sales_start_at timestamptz,
    sales_end_at timestamptz,
    status text not null default 'draft' check (status in ('draft', 'on_sale', 'paused', 'sold_out')),
    created_at timestamptz not null default now(),
    unique (event_id, name),
    check (sales_end_at is null or sales_start_at is null or sales_end_at > sales_start_at)
);

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    public_reference text not null unique,
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
    quantity integer not null check (quantity between 1 and 6),
    unit_price_cop integer not null check (unit_price_cop > 0),
    total_cop integer not null check (total_cop > 0),
    buyer_name text not null,
    buyer_email text not null,
    buyer_phone text,
    status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'payment_failed', 'expired', 'refunded', 'cancelled')),
    hold_expires_at timestamptz,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (total_cop = unit_price_cop * quantity)
);

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    provider text not null default 'wompi' check (provider = 'wompi'),
    provider_transaction_id text unique,
    provider_reference text not null unique,
    amount_cop integer not null check (amount_cop > 0),
    currency text not null default 'COP' check (currency = 'COP'),
    status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'voided', 'error', 'refunded')),
    provider_payload jsonb,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
    ticket_number text not null unique,
    qr_token_hash text not null unique,
    status text not null default 'valid' check (status in ('valid', 'used', 'cancelled', 'refunded')),
    issued_at timestamptz not null default now(),
    used_at timestamptz,
    used_by text
);

create table if not exists public.checkins (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null unique references public.tickets(id) on delete restrict,
    event_id uuid not null references public.events(id) on delete restrict,
    checked_in_at timestamptz not null default now(),
    operator_id uuid,
    note text
);

create index if not exists idx_ticket_types_event_status on public.ticket_types(event_id, status);
create index if not exists idx_orders_event_status on public.orders(event_id, status);
create index if not exists idx_orders_email on public.orders(lower(buyer_email));
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_tickets_event_status on public.tickets(event_id, status);

alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.checkins enable row level security;

-- Deliberately no anon/authenticated policies are created here.
-- Keep private ticketing tables inaccessible to browser clients. Server functions
-- must validate all inputs and use server-side secrets only.
