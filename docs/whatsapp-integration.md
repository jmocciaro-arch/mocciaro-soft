# WhatsApp Business Cloud API — Integración multi-empresa

Guía de activación y uso de WhatsApp Business Cloud API (Meta) dentro de Moxiarsoft.

## Resumen

Cada empresa del grupo (`tt_companies`) puede tener **0, 1 o varios** números de WhatsApp conectados con sus propias credenciales de Meta. Los usuarios ven y usan solo los números de las empresas a las que tienen acceso.

**Tablas:**
- `tt_company_whatsapp_accounts` — credenciales por empresa (WABA, phone_number_id, access_token, app_secret, verify_token).
- `tt_whatsapp_messages` — log de mensajes entrantes y salientes.

**Endpoints:**
- `GET    /api/whatsapp/accounts?company_id=...` — listar cuentas.
- `POST   /api/whatsapp/accounts` — crear cuenta (admin).
- `PATCH  /api/whatsapp/accounts/:id` — editar.
- `DELETE /api/whatsapp/accounts/:id` — borrar.
- `POST   /api/whatsapp/test-connection` — probar conexión.
- `POST   /api/whatsapp/send` — enviar mensaje (selecciona cuenta por `company_id`).
- `GET    /api/whatsapp/webhook/<path>` — verificación inicial de Meta.
- `POST   /api/whatsapp/webhook/<path>` — recepción de eventos (verifica firma).

**UI:**  `/admin/whatsapp` (requiere permiso `admin_users`).

---

## 1. Checklist de activación en Meta

1. Ir a [Meta for Developers](https://developers.facebook.com/) → **My Apps** → **Create App**.
2. Tipo: **Business**.
3. En el panel de la app, agregá el producto **WhatsApp**.
4. **Phone number:**
   - Opción rápida: usá el número de prueba de Meta (tiene límite de 5 destinatarios de test).
   - Opción real: comprá o migrá un número al WABA (WhatsApp Business Account). Requiere verificación de la empresa.
5. En **WhatsApp → API Setup** copiá:
   - `Phone number ID`
   - `WhatsApp Business Account ID`
6. En **Settings → Basic** copiá el **App Secret** (se usa para verificar firmas de webhook).
7. **Access Token permanente:**
   - El token temporal de 24 hs que genera el dashboard **NO sirve** para producción.
   - Hay que generar un **System User Token** desde [Business Manager](https://business.facebook.com/) → Business Settings → System Users → Create → Assign WhatsApp asset → Generate token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
8. **Configurar webhook:**
   - Callback URL: `https://TU-APP.vercel.app/api/whatsapp/webhook/<webhook_path>`
   - Verify Token: el que definiste en el form (guardado en `webhook_verify_token`).
   - Subscribir campos: **messages**, **message_template_status_update**.

---

## 2. Conectar una empresa desde la UI

1. Entrar a **Admin → WhatsApp** (permiso `admin_users`).
2. Click en **Agregar número**.
3. Completar:
   - **Empresa**: seleccionar del dropdown.
   - **Nombre para mostrar**: "TorqueTools ES - Principal".
   - **Número (E.164)**: `+34600123456`.
   - **Phone Number ID** y **WABA ID** (paso 1.5 de arriba).
   - **Access Token** (System User permanente).
   - **App Secret** (Settings → Basic).
   - **Webhook Verify Token**: podés usar el auto-generado o poner uno propio. Tiene que coincidir con el que configures en Meta.
   - **Webhook Path**: slug único que arma la URL pública (`/api/whatsapp/webhook/<path>`). Ej: `tt-es-prod`.
   - **Default**: si la marcás, es la que se usa por default cuando alguien envía desde esa empresa sin especificar `account_id`.
4. Click en **Conectar**.
5. Click en **Probar conexión** — valida contra Meta.
6. **Copiar la Webhook URL** que aparece en la card y pegarla en Meta → Webhooks.

---

## 3. Enviar mensajes desde otros módulos

### Texto libre
```ts
await fetch('/api/whatsapp/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    company_id: 'b20884b8-...',    // empresa emisora (de CompanyContext)
    to: '+34600123456',
    type: 'text',
    body: 'Hola! Te mandamos la cotización COT-TT2026-0008.',
    client_id: 'xxx-...',          // opcional: linkeo al CRM
    related_entity_type: 'quote',
    related_entity_id: 'yyy-...',
  }),
})
```

### PDF de cotización/factura
```ts
await fetch('/api/whatsapp/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    company_id,
    to: clientPhone,
    type: 'document',
    media_url: 'https://…/cotizacion-0008.pdf',
    filename: 'cotizacion-0008.pdf',
    caption: 'Tu cotización está lista.',
    related_entity_type: 'quote',
    related_entity_id: quoteId,
  }),
})
```

### Template pre-aprobado (obligatorio para mensajes fuera de la ventana de 24 hs)
```ts
await fetch('/api/whatsapp/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    company_id,
    to: clientPhone,
    type: 'template',
    template_name: 'cotizacion_enviada',
    language: 'es_ES',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Juan' },
          { type: 'text', text: 'COT-TT2026-0008' },
        ],
      },
    ],
  }),
})
```

### Especificar cuenta (si la empresa tiene varios números)
Pasá `account_id` en el body para no usar el default.

---

## 4. Recibir mensajes (webhook)

Meta envía POST al webhook cuando:
- El cliente te escribe (`messages`).
- Un mensaje saliente cambia de estado (`statuses`: sent → delivered → read → failed).

El endpoint `/api/whatsapp/webhook/<path>`:
1. Verifica la firma `X-Hub-Signature-256` contra el `app_secret`.
2. Inserta los mensajes entrantes en `tt_whatsapp_messages` con `direction='inbound'`.
3. Actualiza el status de los salientes por `wa_message_id`.
4. Intenta **auto-matchear con un cliente existente** buscando por `tt_clients.phone` o `whatsapp`.
5. Responde `200 OK` rápido (< 5 s) para que Meta no reintente.

Los mensajes entrantes quedan disponibles para que otros módulos (CRM, bandeja de mensajes, bot) los procesen.

---

## 5. Compatibilidad con código previo

El endpoint `/api/whatsapp/send` acepta **dos formatos**:
- **Nuevo** (multi-cuenta): `{ company_id, type, ... }`.
- **Legacy** (columnas directas en `tt_companies`): `{ companyId, to, documentUrl, message }` — sigue funcionando para no romper componentes viejos como `whatsapp-send-button.tsx`.

El sistema prefiere el nuevo modelo si hay cuentas en `tt_company_whatsapp_accounts`; si no, cae al legacy.

---

## 6. Seguridad

- **Tokens en DB en claro**: el `access_token` y `app_secret` se guardan en claro pero la tabla tiene RLS estricto — solo `service_role` (server-side) y admins de la empresa pueden leerlos.
- **UI nunca expone los tokens completos**: muestra solo los últimos 4 caracteres (`access_token_last4`).
- **Firma de webhook**: todo POST entrante valida HMAC-SHA256 con el `app_secret`; firmas inválidas son rechazadas con 401.
- **Verify token único por empresa**: impide que otra empresa pueda responder a la verificación de otra.

### Mejora futura (opcional)
Encriptar tokens en DB con `pgcrypto` y desencriptar solo en el server-side antes de llamar a Meta. Requiere manejar una master key en env var.

---

## 7. Limitaciones y costos

- **Ventana de 24 hs**: después de que el cliente te escribe, tenés 24 hs para responder con texto libre. Fuera de esa ventana, solo podés mandar **templates pre-aprobados**.
- **Templates**: hay que crearlos y hacerlos aprobar en Meta (24-48 hs).
- **Costos (Meta, abril 2026)**:
  - Gratis: 1.000 conversaciones de 24 hs por mes (utility + authentication).
  - Marketing: ~USD 0.04-0.08 por conversación iniciada (según país).
  - Service (iniciada por cliente): gratis dentro de la ventana 24 hs.
- **Rate limits**: 1.000 mensajes/segundo por número según tier.

---

## 8. Ejemplos de integración futura

- **Botón "Enviar por WhatsApp"** en cada cotización/factura → genera PDF → llama a `/api/whatsapp/send` con `type:'document'`.
- **Secuencia post-venta** en `tt_email_sequences`: cuando una factura se cobra → 30 días después enviar template `upsell_consumibles` al WhatsApp del cliente.
- **Bot de consultas**: cuando llega un mensaje inbound con ciertas keywords ("stock", "precio"), auto-responder con template + crear lead en `tt_leads`.
- **Recordatorios de cobranza**: cron que corre cada día, busca facturas vencidas >7 días y manda template `recordatorio_pago`.

---

## 9. Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| `401 invalid signature` en webhook | `app_secret` mal cargado | Verificá en Settings → Basic de Meta, actualizá en el form. |
| `verify_token no coincide` en GET webhook | El token del form no es el que pusiste en Meta | Copiá el `webhook_verify_token` de la UI a Meta → Webhooks → Verify Token. |
| `Meta API HTTP 401` al enviar | Access token vencido o inválido | Regenerá el System User Token desde Business Manager. |
| Mensajes no llegan al sistema | Meta no está enviando al webhook correcto | Verificá que la URL en Meta sea exactamente la que aparece en la UI. |
| `webhook_path ya en uso` al crear | Slug duplicado entre empresas | Elegí otro slug único. |
| `No hay cuentas WhatsApp activas` al enviar | La empresa no tiene cuenta activa | Creá una cuenta o activá una existente en /admin/whatsapp. |

---

## 10. Variables de entorno requeridas

Ya existentes (no agregar nuevas):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (opcional — se usa para construir la URL del webhook; fallback a VERCEL_URL).

Los tokens de Meta **no van en env vars** — se guardan en DB por empresa.
