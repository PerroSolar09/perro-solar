# Boletería Perro Solar — entorno Supabase

## Estado
La migración inicial crea el evento del 21 de noviembre de 2026 en estado `draft` y la preventa de 100 entradas a $10.000 COP inactiva. **No permite vender todavía.** No hay integración de pagos ni emisión de QR en esta etapa.

## Preparación
1. Crea un proyecto dedicado en Supabase y conserva el acceso de propietario.
2. Abre SQL Editor y revisa/aplica `migrations/202610290001_boleteria_schema.sql`.
3. Confirma en Table Editor que el evento `perro-solar-la-estacion-2026-11-21` quedó en estado `draft` y que la preventa está inactiva.
4. Mantén Row Level Security habilitado. La migración no crea políticas públicas y revoca acceso directo a las tablas para `anon` y `authenticated`.
5. No copies llaves de Supabase, secretos de Wompi ni datos de compradores al repositorio o al chat. Los secretos se configuran en Edge Function Secrets en el dashboard de Supabase.
6. No cambies el evento a `on_sale` ni la preventa a `active=true` hasta que los endpoints de servidor, el webhook firmado, la emisión de QR, el correo y el escaneo se hayan probado en sandbox.

## Modelo de datos inicial
- `events`: evento y estado de publicación.
- `ticket_types`: precio y cupo; el cupo inicial es 100.
- `orders`: pedido y datos mínimos del comprador.
- `payments`: referencia, importe y estado del proveedor.
- `tickets`: una fila por entrada; se almacena hash del token QR, no el token en texto claro.
- `checkins`: registro único de uso de una entrada.

## Próxima fase
Añadir funciones transaccionales para reservar cupos, registrar la referencia de pago, verificar la firma de eventos Wompi, finalizar pedidos de forma idempotente, emitir QR y registrar check-in atómico. Solo después configurar Wompi Sandbox y probar flujos aprobados, rechazados, pendientes, eventos repetidos y cupos agotados.
