# Boletería Perro Solar — Supabase

## Estado del proyecto

La implementación de la boletería está integrada en `main`. El sitio conserva el interruptor `PUBLIC_SALES_ENABLED = false`; por tanto, el formulario no debe iniciar compras públicas. El evento de 21 de noviembre de 2026 debe permanecer en `draft` y el tipo de entrada Preventa inactivo hasta completar la validación final.

Configuración prevista: Wompi Producción, Cloudflare Turnstile, Supabase Edge Functions, emisión de QR por correo y check-in autenticado para personal autorizado.

**No ejecutar nuevamente las migraciones sobre el proyecto Supabase existente sin comparar primero el esquema.** El proyecto ya fue configurado y probado manualmente; este repositorio no debe tratarse como una instalación limpia reproducible todavía.

## Archivos versionados

### Migraciones

1. `migrations/202610290001_boleteria_schema.sql`: tablas `events`, `ticket_types`, `orders`, `payments`, `tickets`, `checkins`, RLS, datos iniciales en borrador y RPC `reserve_ticket_order`.
2. `migrations/202611020001_reservation_expiry_hardening.sql`: expiración de reservas y endurecimiento de idempotencia.
3. `migrations/202611040001_validate_ticket_qr.sql`: RPC `validate_ticket_qr`, que marca el ticket como utilizado de forma atómica.

La migración antigua incompatible `20261029000000_ticketing_schema.sql` fue retirada y no debe restaurarse.

### Edge Functions

- `create-ticket-order`: valida origen, Turnstile y datos del comprador; reserva cupos en servidor y genera la firma de integridad para el checkout Wompi.
- `wompi-webhook`: valida la firma del evento, consulta la transacción directamente con Wompi y solicita la confirmación del pedido.
- `send-ticket-email`: genera y envía las entradas por correo mediante el servicio de correo configurado.
- `validate-ticket-qr`: exige sesión de Supabase y autorización de personal antes de validar el QR.
- `recover-approved-test-payment`: herramienta de recuperación exclusiva para pruebas; no usar para pagos de producción.

## Dependencias de base de datos que deben quedar versionadas

La revisión del repositorio detectó que las Edge Functions llaman también a estas RPC:

- `confirm_ticket_payment`, invocada por `wompi-webhook`.
- `mark_ticket_email_sent`, invocada por `send-ticket-email`.

Sus definiciones SQL no aparecen en las migraciones actualmente versionadas. El proyecto Supabase existente fue configurado y probado por separado, pero **una instalación nueva no puede reconstruir el flujo completo solo con los archivos SQL de este repositorio**. Antes de recrear el proyecto o desplegarlo en otro entorno, hay que recuperar las definiciones exactas desde el proyecto existente, revisarlas y añadirlas como una migración versionada. No improvisar ni reemplazar esas funciones con SQL nuevo sin contrastarlo con el esquema y los datos reales.

## Secretos y seguridad

Configurar los secretos únicamente en Supabase Edge Function Secrets. Nunca guardar sus valores en Git ni compartirlos en el chat.

La arquitectura utiliza:
- Turnstile para proteger la creación pública de reservas.
- Clave privada e integridad de Wompi solo en servidor.
- Verificación de firma del webhook y consulta directa de la transacción a Wompi.
- Secreto interno para la función de correo.
- Sesión autenticada y rol de operador para el check-in.
- RLS y acceso de servicio desde las funciones de servidor.

No habilitar acceso público directo a las tablas ni exponer claves de servicio en el navegador. La clave publishable/anon del cliente de check-in no es una clave secreta; la autorización efectiva debe mantenerse en Auth y en la función de validación.

## Lista de verificación antes de abrir ventas

- [ ] Confirmar en el proyecto Supabase existente que las RPC `confirm_ticket_payment` y `mark_ticket_email_sent` están presentes y corresponden a las funciones desplegadas.
- [ ] Recuperar y versionar sus definiciones SQL exactas en una migración revisada.
- [ ] Confirmar que los secretos de Wompi Producción y Turnstile están configurados, sin exponer sus valores.
- [ ] Confirmar que el webhook de Wompi apunta a `wompi-webhook`, en ambiente Producción y evento `transaction.updated`.
- [ ] Hacer una compra controlada de extremo a extremo y verificar pago aprobado, emisión de QR, correo y check-in.
- [ ] Probar que un QR válido solo se acepta una vez y que una segunda lectura se rechaza.
- [ ] Probar pago rechazado/pendiente, webhook repetido, expiración de reserva y falta de cupos.
- [ ] Confirmar que el usuario operador puede iniciar sesión y que un usuario sin rol no puede validar entradas.
- [ ] Verificar el sitio publicado y mantener ventas bloqueadas hasta aprobar todos los puntos.

**No activar** el evento, el tipo de entrada ni `PUBLIC_SALES_ENABLED` hasta terminar esta lista.
