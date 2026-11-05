-- Perro Solar ticketing: atomic QR validation and check-in
-- This migration adds the server-side primitive only. It does not activate sales.
-- Apply first to a dedicated test/staging Supabase project, not production.

create or replace function public.validate_ticket_qr(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ticket record;
    v_token_hash text;
begin
    if p_qr_token is null
       or length(p_qr_token) < 32
       or length(p_qr_token) > 512 then
        return jsonb_build_object(
            'success', false,
            'status', 'invalid',
            'message', 'Código QR inválido'
        );
    end if;

    v_token_hash := encode(
        extensions.digest(convert_to(p_qr_token, 'UTF8'), 'sha256'),
        'hex'
    );

    -- Lock the ticket row so simultaneous scans cannot both admit the holder.
    select
        t.id,
        t.event_id,
        t.ticket_code,
        t.status
      into v_ticket
      from public.tickets t
     where t.qr_token_hash = v_token_hash
     for update;

    if not found then
        return jsonb_build_object(
            'success', false,
            'status', 'invalid',
            'message', 'Boleta no válida'
        );
    end if;

    if v_ticket.status = 'used' then
        return jsonb_build_object(
            'success', false,
            'status', 'already_used',
            'message', 'Boleta ya utilizada',
            'ticket_code', v_ticket.ticket_code
        );
    end if;

    if v_ticket.status <> 'valid' then
        return jsonb_build_object(
            'success', false,
            'status', v_ticket.status,
            'message', 'Boleta cancelada o no vigente',
            'ticket_code', v_ticket.ticket_code
        );
    end if;

    update public.tickets
       set status = 'used'
     where id = v_ticket.id
       and status = 'valid';

    if not found then
        -- Defensive guard; the row lock should make this unreachable.
        return jsonb_build_object(
            'success', false,
            'status', 'already_used',
            'message', 'Boleta ya utilizada',
            'ticket_code', v_ticket.ticket_code
        );
    end if;

    insert into public.checkins (
        ticket_id,
        event_id,
        checked_in_at
    ) values (
        v_ticket.id,
        v_ticket.event_id,
        now()
    );

    return jsonb_build_object(
        'success', true,
        'status', 'accepted',
        'message', 'Ingreso autorizado',
        'ticket_code', v_ticket.ticket_code,
        'checked_in_at', now()
    );
end;
$$;

revoke all on function public.validate_ticket_qr(text)
    from public, anon, authenticated;

grant execute on function public.validate_ticket_qr(text)
    to service_role;
