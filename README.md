# WA Message Sender

Aplicación web para enviar mensajes masivos de WhatsApp a través de la API oficial de Meta (WhatsApp Business Cloud API). Carga un CSV de contactos, selecciona un template aprobado y envía a todos los contactos pendientes con progreso en tiempo real.

---

## Características

- **Envío masivo con templates** — usa la WhatsApp Business Cloud API (Meta), cumple con los términos de uso
- **Progreso en tiempo real** — barra de progreso y log por contacto via Server-Sent Events (SSE)
- **Seguimiento en el CSV** — marca cada fila como `SI` o `ERROR: <motivo>` directamente en el archivo
- **Reanudación automática** — al volver a subir un CSV parcialmente enviado, omite los contactos ya procesados
- **Sin base de datos** — no almacena datos en el servidor; las credenciales solo viven en `localStorage`
- **Rate limiting** — delay de 100ms entre envíos; reintento automático en caso de HTTP 429

---

## Flujo de uso

```
1. Configurar  →  2. Subir CSV  →  3. Enviar
```

### Paso 1 — Configurar

Ingresa tus credenciales de Meta Business Manager:

| Campo | Dónde encontrarlo |
|---|---|
| Phone Number ID | Meta Business Manager → WhatsApp → Configuración |
| WhatsApp Business Account ID | Meta Business Manager → Configuración del negocio |
| Access Token | Meta for Developers → Tu app → WhatsApp → API Setup |

Haz clic en **Load Templates** para cargar los templates aprobados de tu cuenta.

### Paso 2 — Subir CSV

- Arrastra o selecciona un archivo `.csv`
- Previsualiza las primeras 5 filas
- Elige qué columna contiene el número de teléfono
- Elige la columna de estado (existente o nueva, ej. `enviado`)
- El contador muestra cuántos contactos están pendientes

**Formato del CSV:**

```csv
nombre,telefono,enviado
Alice,5491112345678,
Bob,5491198765432,SI
Carlos,5491187654321,
```

Los números deben estar en formato internacional sin `+` (ej. `5491112345678` para Argentina).

### Paso 3 — Enviar

- Haz clic en **Send X messages**
- Sigue el progreso en tiempo real
- Al terminar, descarga el CSV actualizado con el resultado por contacto

---

## Instalación

```bash
git clone https://github.com/jA71/wa-message-sender.git
cd wa-message-sender
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Requisitos previos

- Cuenta de **Meta Business Manager** con un número de WhatsApp Business configurado
- Al menos un **template de mensaje aprobado** en tu cuenta
- **Access Token** con permisos de `whatsapp_business_messaging`

---

## Stack técnico

| Tecnología | Rol |
|---|---|
| Next.js 14 (App Router) | Framework full-stack |
| TypeScript | Tipado estático |
| Tailwind CSS | Estilos |
| papaparse | Parsing y serialización de CSV |
| WhatsApp Cloud API (Meta) | Envío de mensajes |

---

## Estructura del proyecto

```
├── app/
│   ├── page.tsx                    # Orquesta el flujo de 3 pasos
│   ├── layout.tsx
│   └── api/
│       ├── templates/route.ts      # GET  /api/templates
│       └── send-messages/route.ts  # POST /api/send-messages (SSE)
├── components/
│   ├── ConfigStep.tsx              # Paso 1: credenciales + selector de template
│   ├── UploadStep.tsx              # Paso 2: carga de CSV y selección de columnas
│   └── SendStep.tsx                # Paso 3: envío y descarga
└── lib/
    ├── csv.ts                      # Utilidades para CSV
    └── meta-api.ts                 # Cliente de la WhatsApp Cloud API
```

---

## API Routes

### `GET /api/templates`

Devuelve los templates aprobados de la cuenta.

**Headers requeridos:**
- `x-waba-id` — WhatsApp Business Account ID
- `x-access-token` — Access Token de Meta

**Respuesta:** `{ templates: [{ name, language, status, components }] }`

---

### `POST /api/send-messages`

Envía los mensajes y transmite el progreso via SSE.

**Body:** `multipart/form-data`
- `file` — archivo CSV
- `config` — JSON con `{ phoneNumberId, accessToken, templateName, templateLanguage, phoneColumn, sentColumn }`

**Eventos SSE:**
```typescript
// Por cada contacto procesado
{ type: "progress", index: number, total: number, phone: string, status: "sent" | "error", error?: string }

// Al finalizar
{ type: "done", csv: string } // CSV actualizado en base64
```

---

## Tests

```bash
npm test          # Ejecuta la suite completa
npm run test:watch  # Modo watch
```

33 tests en 7 suites cubriendo las utilidades de CSV, el cliente de Meta API, los route handlers y los componentes.

---

## Seguridad

- El Access Token se envía al servidor **solo durante el request activo** — nunca se persiste ni se loguea
- Las credenciales se guardan en `localStorage` del navegador (no en el servidor)
- No usar en dispositivos compartidos
