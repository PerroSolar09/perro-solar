-- Perro Solar ticketing: reservation expiry and idempotency hardening
-- Apply after 202610290001_boleteria_schema.sql.
-- This migration does not activate sales or process payments.

create or replace function public.expire_pending_ticket_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_type record;
    v_order record;
    v_released integer;
    v_expired_count integer := 0;
begin
    -- Always lock ticket_types before orders. Reservation and payment functions
    -- must follow this same lock order to avoid deadlocks.
    for v_type in
        select tt.id
          from public.ticket_types tt
         order by tt.id
         for update skip locked
    loop
        v_released := 0;

        for v_order in
            update public.orders o
               set status = 'expired'
             where o.ticket_type_id = v_type.id
               and o.status = 'pending_payment'
               and o.expires_at <= now()
            returning o.quantity
        loop
            v_released := v_released + v_order.quantity;
            v_expired_count := v_expired_count + 1;
        end loop;

        if v_released > 0 then
            update public.ticket_types
               set reserved_count = reserved_count - v_released
             where id = v_type.id
               and reserved_count >= v_released;

            if not found then
                raise exception 'Reservation inventory inconsistency for ticket type %', v_type.id;
            end if;
        end if;
    end loop;

    return v_expired_count;
end;
$$;

revoke all on function public.expire_pending_ticket_orders() from public, anon, authenticated;
grant execute on function public.expire_pending_ticket_orders() to service_role;

create or replace function public.reserve_ticket_order(
    p_event_slug text,
    p_quantity integer,
    p_buyer_name text,
    p_buyer_email text,
    p_idempotency_key text
)
returns table (
    order_id uuid,
    total_cop bigint,
    expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_event_id uuid;
    v_ticket_type_id uuid;
    v_unit_price integer;
    v_capacity integer;
    v_sold integer;
    v_reserved integer;
    v_existing public.orders%rowtype;
    v_order_id uuid;
    v_expires_at timestamptz;
begin
    if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
        raise exception 'Invalid ticket quantity';
    end if;

    if p_buyer_name is null or char_length(trim(p_buyer_name)) not between 2 and 120 then
        raise exception 'Invalid buyer name';
    end if;

    if p_buyer_email is null or char_length(trim(p_buyer_email)) not between 5 and 254 then
        raise exception 'Invalid buyer email';
    end if;

    if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 16 and 200 then
        raise exception 'Invalid idempotency key';
    end if;

    -- Serialize retries using the same idempotency key, even across ticket types.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_idempotency_key, 0)
    );

    select e.id
      into v_event_id
      from public.events e
     where e.slug = p_event_slug
       and e.status = 'on_sale';

    if v_event_id is null then
        raise exception 'Event is not on sale';
    end if;

    -- Release expired reservations first. Cleanup locks ticket_types before orders.
    perform public.expire_pending_ticket_orders();

    -- Lock the inventory row to serialize capacity checks and reservations.
    select tt.id, tt.unit_price_cop, tt.capacity, tt.sold_count, tt.reserved_count
      into v_ticket_type_id, v_unit_price, v_capacity, v_sold, v_reserved
      from public.ticket_types tt
     where tt.event_id = v_event_id
       and tt.name = 'Preventa'
       and tt.active = true
       and (tt.sales_start_at is null or tt.sales_start_at <= now())
       and (tt.sales_end_at is null or tt.sales_end_at > now())
     for update;

    if v_ticket_type_id is null then
        raise exception 'Ticket type is not available';
    end if;

    select o.*
      into v_existing
      from public.orders o
     where o.idempotency_key = p_idempotency_key
     for update;

    if found then
        if v_existing.event_id <> v_event_id
           or v_existing.ticket_type_id <> v_ticket_type_id
           or v_existing.quantity <> p_quantity
           or v_existing.buyer_email <> lower(trim(p_buyer_email))
           or v_existing.buyer_name <> trim(p_buyer_name) then
            raise exception 'Idempotency key already used for a different request';
        end if;

        if v_existing.status <> 'pending_payment'
           or v_existing.expires_at <= now() then
            raise exception 'Previous reservation is no longer active; create a new request';
        end if;

        order_id := v_existing.id;
        total_cop := v_existing.total_cop;
        expires_at := v_existing.expires_at;
        return next;
        return;
    end if;

    if v_sold + v_reserved + p_quantity > v_capacity then
        raise exception 'Not enough tickets available';
    end if;

    v_expires_at := now() + interval '15 minutes';

    insert into public.orders (
        event_id, ticket_type_id, buyer_name, buyer_email, quantity,
        unit_price_cop, total_cop, status, idempotency_key, expires_at
    ) values (
        v_event_id, v_ticket_type_id, trim(p_buyer_name), lower(trim(p_buyer_email)),
        p_quantity, v_unit_price, v_unit_price::bigint * p_quantity,
        'pending_payment', p_idempotency_key, v_expires_at
    )
    returning id, total_cop, expires_at
      into v_order_id, total_cop, v_expires_at;

    update public.ticket_types
       set reserved_count = reserved_count + p_quantity
     where id = v_ticket_type_id;

    order_id := v_order_id;
    expires_at := v_expires_at;
    return next;
end;
$$;

revoke all on function public.reserve_ticket_order(text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ticket_order(text, integer, text, text, text) to service_role;

-- Run expire_pending_ticket_orders() from a trusted scheduled server task.
-- Payment confirmation must lock ticket_types before orders and atomically
-- transition pending_payment orders, update inventory, and issue tickets.
