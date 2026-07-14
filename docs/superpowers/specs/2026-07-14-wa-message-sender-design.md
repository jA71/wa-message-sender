# WhatsApp Mass Message Sender — Design Spec
**Date:** 2026-07-14
**Status:** Approved

## Overview

A Next.js web application that connects to the WhatsApp Business API (Meta) to send template messages in bulk to contacts listed in a CSV file. The app tracks which contacts have already been messaged by updating a column in the same CSV, which the user downloads at the end.

## Goals

- Allow a user to upload a CSV of contacts and send a WhatsApp template message to all contacts where the "sent" column is empty.
- Display real-time progress during sending.
- Return an updated CSV with the send status per contact (success or error).
- Store no data on the server — credentials stay in the browser session only.

## Non-Goals

- Persistent database storage of contacts or send history.
- Support for non-template messages (required by Meta for business-initiated conversations).
- Scheduling or delayed sends.
- Multi-user / authentication system.

## Architecture

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS

Three layers:

1. **UI (React components)** — User uploads the CSV, configures the template, and monitors sending progress.
2. **Route Handlers (Next.js API)** — Parse the CSV, call the WhatsApp Cloud API, stream progress via SSE, and return the updated CSV.
3. **WhatsApp Cloud API (Meta)** — External API that receives send requests and delivers messages.

No database. Send state is persisted exclusively in the CSV the user downloads after sending.

### Data Flow

```
User uploads CSV
  → Client sends CSV + config to POST /api/send-messages
    → Server parses CSV, filters rows where "sent" column is empty
    → For each pending contact:
        → POST to Meta Graph API (send template message)
        → Emit SSE event with { index, total, phone, status }
        → Update "sent" column: "SI" (success) or "ERROR: <reason>" (failure)
    → Emit final SSE event with base64-encoded updated CSV
  → Client renders progress and triggers CSV download
```

## UI — Three-Step Flow

### Step 1: Configuration

Form fields (persisted in `localStorage`):
- `Phone Number ID` — from Meta Business Manager
- `WhatsApp Business Account ID`
- `Access Token` — Meta temporary or permanent token

Template selector — populated by calling `GET /api/templates`, which proxies the Meta API to list approved templates for the account.

### Step 2: Upload CSV & Preview

- Drag & drop or file picker for CSV upload.
- Preview of the first 5 rows to help the user identify columns.
- Column selectors:
  - "Which column contains the phone number?" — dropdown of existing column names.
  - "Which column is the sent status?" — dropdown of existing columns OR a text input to create a new column (e.g., "enviado"). If the column doesn't exist in the CSV, it will be appended.
- Counter: "X pending contacts out of Y total".

### Step 3: Send & Result

- "Send messages" button.
- Real-time progress bar (row by row) via SSE stream.
- Per-contact log: phone number, status icon (✓ sent / ✗ error with reason).
- "Download updated CSV" button that appears when sending completes.

## API Routes

### `GET /api/templates`

Proxies to Meta Graph API to list approved message templates.

**Request headers (passed from client):**
- `x-phone-number-id`
- `x-waba-id`
- `x-access-token`

**Response:** `{ templates: [{ name, language, status, components }] }` — `language` (e.g., `"es"`, `"en_US"`) is passed through to the send endpoint as `templateLanguage`.

**Errors:** Returns Meta's error response directly to the client so the user sees the exact failure reason.

### `POST /api/send-messages`

Accepts `multipart/form-data`:
- `file` — CSV file
- `config` — JSON string with `{ phoneNumberId, accessToken, templateName, templateLanguage, phoneColumn, sentColumn }`

Returns a Server-Sent Events (SSE) stream.

**SSE event types:**

```typescript
// Progress event (one per contact)
{ type: "progress", index: number, total: number, phone: string, status: "sent" | "error", error?: string }

// Completion event
{ type: "done", csv: string } // base64-encoded updated CSV
```

**Send logic:**
1. Parse CSV with `papaparse`.
2. Filter rows where `sentColumn` is empty, null, or whitespace.
3. For each pending row, sequentially:
   a. Call `POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages` with template payload.
   b. On success (HTTP 200): set `sentColumn = "SI"`.
   c. On failure: set `sentColumn = "ERROR: <Meta error message>"`.
   d. Emit SSE progress event.
   e. Wait 100ms before next request (rate limit buffer).
4. Serialize updated CSV and emit `done` event.

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid token | `GET /api/templates` fails; error shown in UI before send is allowed |
| Invalid phone number | Meta returns error 131030; row marked `ERROR: invalid number` |
| Unapproved template | Meta returns error 132000; row marked `ERROR: template not approved` |
| Rate limit (HTTP 429) | Wait 1s, retry once; if retry fails, mark row as error |
| CSV has < 2 columns | Client-side validation rejects file before upload |
| Network failure mid-send | SSE connection drops; client shows last known progress; user can re-upload the partially updated CSV (already-sent contacts are skipped) |

## Key Dependencies

| Package | Purpose |
|---|---|
| `papaparse` | CSV parsing and serialization |
| `tailwindcss` | Styling |
| `next` 14 | Framework (App Router, Route Handlers, SSE) |

No ORM, no database, no auth library.

## Security Considerations

- The Meta Access Token is sent from the browser to the server **only during the active request** — it is never logged, cached, or stored server-side.
- The token is stored in `localStorage` (client-side only) so the user does not have to re-enter it each session. Users should be made aware of this in the UI with a brief note.
- The server validates that the `phoneColumn` and `sentColumn` values correspond to actual columns in the uploaded CSV before processing.

## File Structure

```
wa-message-sender/
├── app/
│   ├── page.tsx                  # Main UI (3-step flow)
│   ├── layout.tsx
│   └── api/
│       ├── templates/route.ts    # GET /api/templates
│       └── send-messages/route.ts # POST /api/send-messages (SSE)
├── components/
│   ├── ConfigStep.tsx
│   ├── UploadStep.tsx
│   └── SendStep.tsx
├── lib/
│   ├── csv.ts                    # CSV parse/serialize helpers
│   └── meta-api.ts               # WhatsApp Cloud API client
├── docs/
│   └── superpowers/specs/
│       └── 2026-07-14-wa-message-sender-design.md
└── .env.local.example            # Empty — no server-side env vars needed
```
