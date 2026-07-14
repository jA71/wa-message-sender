# WhatsApp Mass Message Sender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app that reads a CSV of contacts, sends a WhatsApp Business API template message to all contacts where the "sent" column is empty, and returns an updated CSV with per-row send status.

**Architecture:** Next.js 14 App Router with two route handlers (`GET /api/templates` and `POST /api/send-messages`). The send route streams progress via Server-Sent Events (SSE) so the UI can display a real-time progress bar. No database — send state is tracked in the CSV file the user downloads at the end.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, papaparse, Jest + @testing-library/react

## Global Constraints

- Next.js version: 14 (App Router, not Pages Router)
- No database, no ORM, no auth library
- Access Token persisted in `localStorage` only — never stored server-side
- All Meta API calls use `https://graph.facebook.com/v19.0`
- Template messages only (Meta requires templates for business-initiated conversations)
- Rate limit buffer: 100ms delay between sends; 1s wait + 1 retry on HTTP 429
- CSV with fewer than 2 columns is rejected client-side before upload
- `sentColumn` may be a new column name (server appends it if missing)

---

## File Map

| File | Responsibility |
|---|---|
| `lib/csv.ts` | Parse, serialize, extend CSV; count pending rows |
| `lib/meta-api.ts` | WhatsApp Cloud API client (send message, list templates) |
| `app/api/templates/route.ts` | Proxy `GET` to Meta to list approved templates |
| `app/api/send-messages/route.ts` | SSE streaming: parse CSV → send → emit progress → return updated CSV |
| `components/ConfigStep.tsx` | Step 1: credentials form + template selector (localStorage) |
| `components/UploadStep.tsx` | Step 2: CSV upload, column selectors, pending count |
| `components/SendStep.tsx` | Step 3: SSE consumer, progress bar, log, download button |
| `app/layout.tsx` | Root layout with title and global styles |
| `app/page.tsx` | Orchestrates 3-step flow, owns cross-step state |

---

## Task 1: Project Scaffold + Jest Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `next.config.ts`, `app/globals.css` (via create-next-app)
- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Create: `.env.local.example`

**Interfaces:**
- Produces: runnable Next.js 14 dev server; `npm test` runs with zero test files (exit 0)

- [ ] **Step 1: Scaffold the project**

Run in `/Users/javi/Developer/wa-message-sender`:

```bash
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --no-import-alias
```

If prompted "The directory . contains files that could conflict", answer **Y** (it will not touch `docs/`). Accept all other defaults.

Expected output ends with: `Success! Created wa-message-sender`

- [ ] **Step 2: Install runtime dependency**

```bash
npm install papaparse
npm install -D @types/papaparse
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install -D jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom @types/jest
```

- [ ] **Step 4: Create `jest.config.ts`**

```typescript
import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default createJestConfig(config);
```

- [ ] **Step 5: Create `jest.setup.ts`**

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 6: Add test script to `package.json`**

Open `package.json` and ensure the `scripts` block contains:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 7: Create `.env.local.example`**

```
# No server-side environment variables required.
# The Meta Access Token is provided by the user in the UI and never stored server-side.
```

- [ ] **Step 8: Verify setup**

```bash
npm test -- --passWithNoTests
```

Expected: `Test Suites: 0 of 0 total`, exit 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 project with Jest setup"
```

---

## Task 2: `lib/csv.ts` + Tests

**Files:**
- Create: `lib/csv.ts`
- Create: `lib/csv.test.ts`

**Interfaces:**
- Produces:
  - `parseCSV(text: string): CSVResult`
  - `serializeCSV(headers: string[], rows: Record<string, string>[]): string`
  - `ensureColumn(result: CSVResult, columnName: string): CSVResult`
  - `countPending(rows: Record<string, string>[], sentColumn: string): number`
  - `type CSVResult = { headers: string[]; rows: Record<string, string>[] }`

- [ ] **Step 1: Write failing tests**

Create `lib/csv.test.ts`:

```typescript
import { parseCSV, serializeCSV, ensureColumn, countPending } from "@/lib/csv";

describe("parseCSV", () => {
  it("returns headers and rows", () => {
    const csv = "name,phone,enviado\nAlice,5491112345678,\nBob,5491198765432,SI";
    const result = parseCSV(csv);
    expect(result.headers).toEqual(["name", "phone", "enviado"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe("Alice");
    expect(result.rows[0].phone).toBe("5491112345678");
  });

  it("skips empty lines", () => {
    const csv = "a,b\n1,2\n\n3,4";
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });
});

describe("serializeCSV", () => {
  it("roundtrips headers and rows", () => {
    const headers = ["name", "phone"];
    const rows = [{ name: "Alice", phone: "5491112345678" }];
    const csv = serializeCSV(headers, rows);
    const reparsed = parseCSV(csv);
    expect(reparsed.headers).toEqual(["name", "phone"]);
    expect(reparsed.rows[0].name).toBe("Alice");
  });
});

describe("ensureColumn", () => {
  it("returns unchanged result when column already exists", () => {
    const input = { headers: ["a", "b"], rows: [{ a: "1", b: "2" }] };
    const result = ensureColumn(input, "b");
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("appends new column with empty string value on each row", () => {
    const input = { headers: ["a"], rows: [{ a: "1" }, { a: "2" }] };
    const result = ensureColumn(input, "enviado");
    expect(result.headers).toEqual(["a", "enviado"]);
    expect(result.rows[0].enviado).toBe("");
    expect(result.rows[1].enviado).toBe("");
  });
});

describe("countPending", () => {
  it("counts rows where sentColumn is empty or whitespace", () => {
    const rows = [
      { phone: "111", enviado: "" },
      { phone: "222", enviado: "SI" },
      { phone: "333", enviado: "   " },
      { phone: "444", enviado: "ERROR: something" },
    ];
    expect(countPending(rows, "enviado")).toBe(2);
  });

  it("returns 0 when all contacts already sent", () => {
    const rows = [{ phone: "111", enviado: "SI" }];
    expect(countPending(rows, "enviado")).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test lib/csv.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/csv'`

- [ ] **Step 3: Implement `lib/csv.ts`**

```typescript
import Papa from "papaparse";

export interface CSVResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(text: string): CSVResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data };
}

export function serializeCSV(
  headers: string[],
  rows: Record<string, string>[]
): string {
  return Papa.unparse({ fields: headers, data: rows });
}

export function ensureColumn(result: CSVResult, columnName: string): CSVResult {
  if (result.headers.includes(columnName)) return result;
  return {
    headers: [...result.headers, columnName],
    rows: result.rows.map((row) => ({ ...row, [columnName]: "" })),
  };
}

export function countPending(
  rows: Record<string, string>[],
  sentColumn: string
): number {
  return rows.filter((row) => !row[sentColumn]?.trim()).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test lib/csv.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/csv.ts lib/csv.test.ts
git commit -m "feat: add CSV parse/serialize/ensureColumn/countPending utilities"
```

---

## Task 3: `lib/meta-api.ts` + Tests

**Files:**
- Create: `lib/meta-api.ts`
- Create: `lib/meta-api.test.ts`

**Interfaces:**
- Produces:
  - `sendTemplateMessage(phoneNumberId, accessToken, to, templateName, templateLanguage): Promise<MetaSendResult>`
  - `listTemplates(wabaId, accessToken): Promise<Template[]>`
  - `type MetaSendResult = { success: boolean; error?: string }`
  - `type Template = { name: string; language: string; status: string; components: unknown[] }`

- [ ] **Step 1: Write failing tests**

Create `lib/meta-api.test.ts`:

```typescript
import { sendTemplateMessage, listTemplates } from "@/lib/meta-api";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("sendTemplateMessage", () => {
  it("returns success: true on HTTP 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await sendTemplateMessage(
      "phoneId",
      "token",
      "5491112345678",
      "hello_world",
      "es"
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns success: false with error: 'rate_limited' on HTTP 429", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    const result = await sendTemplateMessage(
      "phoneId",
      "token",
      "5491112345678",
      "hello_world",
      "es"
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("rate_limited");
  });

  it("returns Meta error message on other failures", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid phone number format" } }),
    });
    const result = await sendTemplateMessage(
      "phoneId",
      "token",
      "bad",
      "hello_world",
      "es"
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid phone number format");
  });

  it("sends correct payload to Meta API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await sendTemplateMessage("phoneId", "myToken", "5491112345678", "hello_world", "es");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v19.0/phoneId/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer myToken",
        }),
      })
    );
  });
});

describe("listTemplates", () => {
  it("returns templates array on success", async () => {
    const templates = [
      { name: "hello_world", language: "es", status: "APPROVED", components: [] },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: templates }),
    });
    const result = await listTemplates("wabaId", "token");
    expect(result).toEqual(templates);
  });

  it("returns empty array when data field is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const result = await listTemplates("wabaId", "token");
    expect(result).toEqual([]);
  });

  it("throws with Meta error message on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Invalid access token" } }),
    });
    await expect(listTemplates("wabaId", "token")).rejects.toThrow(
      "Invalid access token"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test lib/meta-api.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/meta-api'`

- [ ] **Step 3: Implement `lib/meta-api.ts`**

```typescript
const GRAPH_API = "https://graph.facebook.com/v19.0";

export interface MetaSendResult {
  success: boolean;
  error?: string;
}

export interface Template {
  name: string;
  language: string;
  status: string;
  components: unknown[];
}

export async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  templateLanguage: string
): Promise<MetaSendResult> {
  const response = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
      },
    }),
  });

  if (response.ok) return { success: true };
  if (response.status === 429) return { success: false, error: "rate_limited" };

  const data = await response.json().catch(() => ({}));
  const errorMsg = (data?.error?.message as string | undefined) ?? `HTTP ${response.status}`;
  return { success: false, error: errorMsg };
}

export async function listTemplates(
  wabaId: string,
  accessToken: string
): Promise<Template[]> {
  const response = await fetch(
    `${GRAPH_API}/${wabaId}/message_templates?fields=name,language,status,components`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data?.error?.message as string | undefined) ?? `HTTP ${response.status}`
    );
  }

  const data = await response.json();
  return (data.data as Template[]) ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test lib/meta-api.test.ts
```

Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add lib/meta-api.ts lib/meta-api.test.ts
git commit -m "feat: add Meta WhatsApp Cloud API client"
```

---

## Task 4: `GET /api/templates` Route + Tests

**Files:**
- Create: `app/api/templates/route.ts`
- Create: `app/api/templates/route.test.ts`

**Interfaces:**
- Consumes: `listTemplates` from `@/lib/meta-api`
- Produces: `GET /api/templates` → `200 { templates: Template[] }` or `400 | 500 { error: string }`

- [ ] **Step 1: Write failing tests**

Create `app/api/templates/route.test.ts`:

```typescript
import { GET } from "@/app/api/templates/route";

jest.mock("@/lib/meta-api", () => ({
  listTemplates: jest.fn(),
}));

import { listTemplates } from "@/lib/meta-api";

const mockListTemplates = listTemplates as jest.MockedFunction<typeof listTemplates>;

beforeEach(() => mockListTemplates.mockReset());

describe("GET /api/templates", () => {
  it("returns 400 when x-waba-id header is missing", async () => {
    const req = new Request("http://localhost/api/templates", {
      headers: { "x-access-token": "token" },
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing required headers");
  });

  it("returns 400 when x-access-token header is missing", async () => {
    const req = new Request("http://localhost/api/templates", {
      headers: { "x-waba-id": "wabaId" },
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 200 with templates on success", async () => {
    const templates = [
      { name: "hello_world", language: "es", status: "APPROVED", components: [] },
    ];
    mockListTemplates.mockResolvedValueOnce(templates);
    const req = new Request("http://localhost/api/templates", {
      headers: {
        "x-waba-id": "wabaId",
        "x-access-token": "token",
      },
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toEqual(templates);
  });

  it("returns 500 with Meta error message on failure", async () => {
    mockListTemplates.mockRejectedValueOnce(new Error("Invalid access token"));
    const req = new Request("http://localhost/api/templates", {
      headers: {
        "x-waba-id": "wabaId",
        "x-access-token": "bad_token",
      },
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Invalid access token");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test app/api/templates/route.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/templates/route'`

- [ ] **Step 3: Implement `app/api/templates/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { listTemplates } from "@/lib/meta-api";

export async function GET(request: NextRequest) {
  const wabaId = request.headers.get("x-waba-id");
  const accessToken = request.headers.get("x-access-token");

  if (!wabaId || !accessToken) {
    return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
  }

  try {
    const templates = await listTemplates(wabaId, accessToken);
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch templates" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test app/api/templates/route.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/templates/
git commit -m "feat: add GET /api/templates route"
```

---

## Task 5: `POST /api/send-messages` Route + Tests

**Files:**
- Create: `app/api/send-messages/route.ts`
- Create: `app/api/send-messages/route.test.ts`

**Interfaces:**
- Consumes: `parseCSV`, `serializeCSV`, `ensureColumn` from `@/lib/csv`; `sendTemplateMessage` from `@/lib/meta-api`
- Produces: `POST /api/send-messages` → SSE stream of `{ type: "progress", index, total, phone, status, error? }` events, then `{ type: "done", csv: string }`

- [ ] **Step 1: Write failing tests**

Create `app/api/send-messages/route.test.ts`:

```typescript
import { POST } from "@/app/api/send-messages/route";

jest.mock("@/lib/meta-api", () => ({
  sendTemplateMessage: jest.fn(),
}));

import { sendTemplateMessage } from "@/lib/meta-api";

const mockSend = sendTemplateMessage as jest.MockedFunction<typeof sendTemplateMessage>;

const BASE_CONFIG = {
  phoneNumberId: "phoneId",
  accessToken: "token",
  templateName: "hello_world",
  templateLanguage: "es",
  phoneColumn: "phone",
  sentColumn: "enviado",
};

function makeRequest(csv: string, config = BASE_CONFIG) {
  const formData = new FormData();
  formData.append("file", new Blob([csv], { type: "text/csv" }), "contacts.csv");
  formData.append("config", JSON.stringify(config));
  return new Request("http://localhost/api/send-messages", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => mockSend.mockReset());

describe("POST /api/send-messages", () => {
  it("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("config", JSON.stringify(BASE_CONFIG));
    const req = new Request("http://localhost/api/send-messages", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 400 when phoneColumn does not exist in CSV", async () => {
    const csv = "name,phone,enviado\nAlice,5491112345678,";
    const req = makeRequest(csv, { ...BASE_CONFIG, phoneColumn: "nonexistent" });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("nonexistent");
  });

  it("streams progress event and done event for one pending contact", async () => {
    mockSend.mockResolvedValueOnce({ success: true });
    const csv = "name,phone,enviado\nAlice,5491112345678,\nBob,5491198765432,SI";
    const req = makeRequest(csv);
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await res.text();
    const events = text
      .split("\n\n")
      .filter((e) => e.startsWith("data: "))
      .map((e) => JSON.parse(e.slice(6)));

    const progressEvent = events.find((e) => e.type === "progress");
    expect(progressEvent).toMatchObject({
      type: "progress",
      index: 1,
      total: 1,
      phone: "5491112345678",
      status: "sent",
    });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(typeof doneEvent.csv).toBe("string");
  });

  it("marks row as ERROR on send failure", async () => {
    mockSend.mockResolvedValueOnce({ success: false, error: "Invalid phone number format" });
    const csv = "phone,enviado\n5491112345678,";
    const req = makeRequest(csv);
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const text = await res.text();
    const events = text
      .split("\n\n")
      .filter((e) => e.startsWith("data: "))
      .map((e) => JSON.parse(e.slice(6)));

    expect(events.find((e) => e.type === "progress")?.status).toBe("error");

    const doneEvent = events.find((e) => e.type === "done");
    const csvOut = Buffer.from(doneEvent.csv, "base64").toString("utf-8");
    expect(csvOut).toContain("ERROR: Invalid phone number format");
  });

  it("retries once on rate limit then marks error", async () => {
    mockSend
      .mockResolvedValueOnce({ success: false, error: "rate_limited" })
      .mockResolvedValueOnce({ success: false, error: "rate_limited" });
    const csv = "phone,enviado\n5491112345678,";
    const req = makeRequest(csv);
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const text = await res.text();
    const events = text
      .split("\n\n")
      .filter((e) => e.startsWith("data: "))
      .map((e) => JSON.parse(e.slice(6)));
    expect(events.find((e) => e.type === "progress")?.status).toBe("error");
    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 5000);

  it("appends sentColumn if it does not exist in CSV", async () => {
    mockSend.mockResolvedValueOnce({ success: true });
    const csv = "name,phone\nAlice,5491112345678";
    const req = makeRequest(csv, { ...BASE_CONFIG, sentColumn: "enviado" });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const text = await res.text();
    const doneEvent = text
      .split("\n\n")
      .filter((e) => e.startsWith("data: "))
      .map((e) => JSON.parse(e.slice(6)))
      .find((e) => e.type === "done");
    const csvOut = Buffer.from(doneEvent.csv, "base64").toString("utf-8");
    expect(csvOut).toContain("enviado");
    expect(csvOut).toContain("SI");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test app/api/send-messages/route.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/send-messages/route'`

- [ ] **Step 3: Implement `app/api/send-messages/route.ts`**

```typescript
import { type NextRequest } from "next/server";
import { parseCSV, serializeCSV, ensureColumn } from "@/lib/csv";
import { sendTemplateMessage } from "@/lib/meta-api";

function sseChunk(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SendConfig {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
  phoneColumn: string;
  sentColumn: string;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const configRaw = formData.get("config") as string | null;

  if (!file || !configRaw) {
    return new Response("Missing file or config", { status: 400 });
  }

  const config = JSON.parse(configRaw) as SendConfig;
  const text = await file.text();
  let { headers, rows } = parseCSV(text);

  if (!headers.includes(config.phoneColumn)) {
    return new Response(
      `Column "${config.phoneColumn}" not found in CSV`,
      { status: 400 }
    );
  }

  ({ headers, rows } = ensureColumn({ headers, rows }, config.sentColumn));

  const pendingIndices = rows
    .map((row, i) => (row[config.sentColumn]?.trim() ? null : i))
    .filter((i): i is number => i !== null);

  const total = pendingIndices.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (let pos = 0; pos < pendingIndices.length; pos++) {
        const i = pendingIndices[pos];
        const phone = rows[i][config.phoneColumn]?.trim() ?? "";

        let result = await sendTemplateMessage(
          config.phoneNumberId,
          config.accessToken,
          phone,
          config.templateName,
          config.templateLanguage
        );

        if (!result.success && result.error === "rate_limited") {
          await sleep(1000);
          result = await sendTemplateMessage(
            config.phoneNumberId,
            config.accessToken,
            phone,
            config.templateName,
            config.templateLanguage
          );
        }

        rows[i] = {
          ...rows[i],
          [config.sentColumn]: result.success
            ? "SI"
            : `ERROR: ${result.error}`,
        };

        controller.enqueue(
          encoder.encode(
            sseChunk({
              type: "progress",
              index: pos + 1,
              total,
              phone,
              status: result.success ? "sent" : "error",
              ...(result.error && !result.success && { error: result.error }),
            })
          )
        );

        if (pos < pendingIndices.length - 1) {
          await sleep(100);
        }
      }

      const updatedCsv = serializeCSV(headers, rows);
      const base64Csv = Buffer.from(updatedCsv).toString("base64");
      controller.enqueue(encoder.encode(sseChunk({ type: "done", csv: base64Csv })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test app/api/send-messages/route.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/send-messages/
git commit -m "feat: add POST /api/send-messages SSE streaming route"
```

---

## Task 6: `components/ConfigStep.tsx` + Tests

**Files:**
- Create: `components/ConfigStep.tsx`
- Create: `components/ConfigStep.test.tsx`

**Interfaces:**
- Consumes: `GET /api/templates` via `fetch`
- Produces: `onComplete(data: ConfigCompleteData)` callback where `ConfigCompleteData = { phoneNumberId: string; wabaId: string; accessToken: string; selectedTemplate: { name: string; language: string } }`

- [ ] **Step 1: Write failing tests**

Create `components/ConfigStep.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConfigStep from "@/components/ConfigStep";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

describe("ConfigStep", () => {
  it("renders Phone Number ID, WABA ID, and Access Token fields", () => {
    render(<ConfigStep onComplete={jest.fn()} />);
    expect(screen.getByLabelText(/Phone Number ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/WhatsApp Business Account ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Access Token/i)).toBeInTheDocument();
  });

  it("Load Templates button is disabled when fields are empty", () => {
    render(<ConfigStep onComplete={jest.fn()} />);
    expect(screen.getByRole("button", { name: /Load Templates/i })).toBeDisabled();
  });

  it("shows template dropdown after successful template fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [
          { name: "hello_world", language: "es", status: "APPROVED", components: [] },
        ],
      }),
    });
    render(<ConfigStep onComplete={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "456" },
    });
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: "tok" } });
    fireEvent.click(screen.getByRole("button", { name: /Load Templates/i }));
    await waitFor(() =>
      expect(screen.getByText(/hello_world \(es\)/i)).toBeInTheDocument()
    );
  });

  it("shows error message when template fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid access token" }),
    });
    render(<ConfigStep onComplete={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /Load Templates/i }));
    await waitFor(() =>
      expect(screen.getByText(/Invalid access token/i)).toBeInTheDocument()
    );
  });

  it("restores saved config from localStorage on mount", () => {
    localStorage.setItem(
      "wa_sender_config",
      JSON.stringify({ phoneNumberId: "savedPhone", wabaId: "savedWaba", accessToken: "savedTok" })
    );
    render(<ConfigStep onComplete={jest.fn()} />);
    expect(screen.getByLabelText(/Phone Number ID/i)).toHaveValue("savedPhone");
    expect(screen.getByLabelText(/WhatsApp Business Account ID/i)).toHaveValue("savedWaba");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test components/ConfigStep.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ConfigStep'`

- [ ] **Step 3: Implement `components/ConfigStep.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import type { Template } from "@/lib/meta-api";

export interface ConfigCompleteData {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  selectedTemplate: { name: string; language: string };
}

interface Props {
  onComplete: (data: ConfigCompleteData) => void;
}

const LS_KEY = "wa_sender_config";

export default function ConfigStep({ onComplete }: Props) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    const data = JSON.parse(saved) as Partial<typeof { phoneNumberId: string; wabaId: string; accessToken: string }>;
    if (data.phoneNumberId) setPhoneNumberId(data.phoneNumberId);
    if (data.wabaId) setWabaId(data.wabaId);
    if (data.accessToken) setAccessToken(data.accessToken);
  }, []);

  const canLoad = phoneNumberId.trim() && wabaId.trim() && accessToken.trim();

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        headers: {
          "x-phone-number-id": phoneNumberId,
          "x-waba-id": wabaId,
          "x-access-token": accessToken,
        },
      });
      const data = await res.json() as { templates?: Template[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch templates");
      setTemplates((data.templates ?? []).filter((t) => t.status === "APPROVED"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const selectedTemplate = templates.find(
    (t) => `${t.name}|${t.language}` === selectedKey
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ phoneNumberId, wabaId, accessToken }));
    onComplete({ phoneNumberId, wabaId, accessToken, selectedTemplate });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="phoneNumberId" className="block text-sm font-medium text-gray-700">
          Phone Number ID
        </label>
        <input
          id="phoneNumberId"
          type="text"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          required
        />
      </div>

      <div>
        <label htmlFor="wabaId" className="block text-sm font-medium text-gray-700">
          WhatsApp Business Account ID
        </label>
        <input
          id="wabaId"
          type="text"
          value={wabaId}
          onChange={(e) => setWabaId(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          required
        />
      </div>

      <div>
        <label htmlFor="accessToken" className="block text-sm font-medium text-gray-700">
          Access Token
        </label>
        <input
          id="accessToken"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Stored in localStorage — do not use on shared devices.
        </p>
      </div>

      <button
        type="button"
        onClick={fetchTemplates}
        disabled={!canLoad || loading}
        className="px-4 py-2 bg-gray-200 rounded-md text-sm disabled:opacity-50"
      >
        {loading ? "Loading..." : "Load Templates"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {templates.length > 0 && (
        <div>
          <label htmlFor="template" className="block text-sm font-medium text-gray-700">
            Template
          </label>
          <select
            id="template"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            required
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={!selectedTemplate}
        className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test components/ConfigStep.test.tsx
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add components/ConfigStep.tsx components/ConfigStep.test.tsx
git commit -m "feat: add ConfigStep component with localStorage persistence"
```

---

## Task 7: `components/UploadStep.tsx` + Tests

**Files:**
- Create: `components/UploadStep.tsx`
- Create: `components/UploadStep.test.tsx`

**Interfaces:**
- Consumes: `parseCSV`, `countPending` from `@/lib/csv`
- Produces: `onComplete(data: UploadCompleteData)` callback where `UploadCompleteData = { csvText: string; phoneColumn: string; sentColumn: string; pendingCount: number; totalCount: number }`

- [ ] **Step 1: Write failing tests**

Create `components/UploadStep.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import UploadStep from "@/components/UploadStep";

describe("UploadStep", () => {
  it("renders the drag-and-drop upload zone", () => {
    render(<UploadStep onComplete={jest.fn()} />);
    expect(screen.getByText(/Drag & drop a CSV/i)).toBeInTheDocument();
  });

  it("does not render column selectors before a file is loaded", () => {
    render(<UploadStep onComplete={jest.fn()} />);
    expect(screen.queryByText(/Phone number column/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test components/UploadStep.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/UploadStep'`

- [ ] **Step 3: Implement `components/UploadStep.tsx`**

```typescript
"use client";
import { useState, useRef } from "react";
import { parseCSV, countPending } from "@/lib/csv";

export interface UploadCompleteData {
  csvText: string;
  phoneColumn: string;
  sentColumn: string;
  pendingCount: number;
  totalCount: number;
}

interface Props {
  onComplete: (data: UploadCompleteData) => void;
}

type SentColumnMode = "existing" | "new";

export default function UploadStep({ onComplete }: Props) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [phoneColumn, setPhoneColumn] = useState("");
  const [sentColumnMode, setSentColumnMode] = useState<SentColumnMode>("existing");
  const [sentColumn, setSentColumn] = useState("");
  const [newSentColumn, setNewSentColumn] = useState("enviado");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      alert("Please upload a CSV file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      const { headers, rows } = parseCSV(text);
      if (headers.length < 2) {
        alert("CSV must have at least 2 columns.");
        return;
      }
      setCsvText(text);
      setHeaders(headers);
      setPreview(rows.slice(0, 5));
      setRows(rows);
      setPhoneColumn(headers[0]);
      setSentColumn(headers[headers.length - 1]);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const activeSentColumn =
    sentColumnMode === "existing" ? sentColumn : newSentColumn;
  const pendingCount =
    rows.length > 0 ? countPending(rows, activeSentColumn) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText || !phoneColumn || !activeSentColumn) return;
    onComplete({
      csvText,
      phoneColumn,
      sentColumn: activeSentColumn,
      pendingCount,
      totalCount: rows.length,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-md p-8 text-center cursor-pointer hover:border-green-500"
      >
        <p className="text-gray-500">Drag & drop a CSV or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {headers.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="border px-2 py-1 bg-gray-100 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.map((h) => (
                      <td key={h} className="border px-2 py-1">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label htmlFor="phoneColumn" className="block text-sm font-medium text-gray-700">
              Phone number column
            </label>
            <select
              id="phoneColumn"
              value={phoneColumn}
              onChange={(e) => setPhoneColumn(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Sent status column
            </label>
            <div className="flex gap-2 mt-1">
              <select
                value={sentColumnMode}
                onChange={(e) => setSentColumnMode(e.target.value as SentColumnMode)}
                className="border border-gray-300 rounded-md p-2"
              >
                <option value="existing">Existing column</option>
                <option value="new">New column</option>
              </select>
              {sentColumnMode === "existing" ? (
                <select
                  value={sentColumn}
                  onChange={(e) => setSentColumn(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md p-2"
                >
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newSentColumn}
                  onChange={(e) => setNewSentColumn(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md p-2"
                  placeholder="e.g. enviado"
                />
              )}
            </div>
          </div>

          <p className="text-sm text-gray-600">
            <strong>{pendingCount}</strong> pending contacts out of{" "}
            <strong>{rows.length}</strong> total.
          </p>

          <button
            type="submit"
            disabled={pendingCount === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50"
          >
            Continue
          </button>
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test components/UploadStep.test.tsx
```

Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add components/UploadStep.tsx components/UploadStep.test.tsx
git commit -m "feat: add UploadStep component with CSV preview and column selectors"
```

---

## Task 8: `components/SendStep.tsx` + Tests

**Files:**
- Create: `components/SendStep.tsx`
- Create: `components/SendStep.test.tsx`

**Interfaces:**
- Consumes: `POST /api/send-messages` SSE stream via `fetch`
- Produces: triggers CSV download via `URL.createObjectURL` when done

```typescript
export interface SendStepConfig {
  csvText: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
  phoneColumn: string;
  sentColumn: string;
  pendingCount: number;
}
```

- [ ] **Step 1: Write failing tests**

Create `components/SendStep.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import SendStep from "@/components/SendStep";
import type { SendStepConfig } from "@/components/SendStep";

const baseConfig: SendStepConfig = {
  csvText: "phone,enviado\n5491112345678,",
  phoneNumberId: "phoneId",
  accessToken: "token",
  templateName: "hello_world",
  templateLanguage: "es",
  phoneColumn: "phone",
  sentColumn: "enviado",
  pendingCount: 1,
};

describe("SendStep", () => {
  it("shows Send button with pending count before sending starts", () => {
    render(<SendStep config={baseConfig} />);
    expect(screen.getByRole("button", { name: /Send 1 messages/i })).toBeInTheDocument();
  });

  it("does not show download button before sending starts", () => {
    render(<SendStep config={baseConfig} />);
    expect(screen.queryByRole("button", { name: /Download/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test components/SendStep.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/SendStep'`

- [ ] **Step 3: Implement `components/SendStep.tsx`**

```typescript
"use client";
import { useState } from "react";

export interface SendStepConfig {
  csvText: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
  phoneColumn: string;
  sentColumn: string;
  pendingCount: number;
}

interface LogEntry {
  phone: string;
  status: "sent" | "error";
  error?: string;
}

interface ProgressEvent {
  type: "progress";
  index: number;
  total: number;
  phone: string;
  status: "sent" | "error";
  error?: string;
}

interface DoneEvent {
  type: "done";
  csv: string;
}

interface Props {
  config: SendStepConfig;
}

export default function SendStep({ config }: Props) {
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(config.pendingCount);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [csvBase64, setCsvBase64] = useState<string | null>(null);

  async function startSending() {
    setStarted(true);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([config.csvText], { type: "text/csv" }),
      "contacts.csv"
    );
    formData.append(
      "config",
      JSON.stringify({
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        templateName: config.templateName,
        templateLanguage: config.templateLanguage,
        phoneColumn: config.phoneColumn,
        sentColumn: config.sentColumn,
      })
    );

    const response = await fetch("/api/send-messages", {
      method: "POST",
      body: formData,
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6)) as ProgressEvent | DoneEvent;
        if (event.type === "progress") {
          setProgress(event.index);
          setTotal(event.total);
          setLog((prev) => [
            ...prev,
            { phone: event.phone, status: event.status, error: event.error },
          ]);
        } else if (event.type === "done") {
          setCsvBase64(event.csv);
          setDone(true);
        }
      }
    }
  }

  function downloadCSV() {
    if (!csvBase64) return;
    const bytes = Uint8Array.from(atob(csvBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts_updated.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {!started && (
        <button
          onClick={startSending}
          className="px-4 py-2 bg-green-600 text-white rounded-md"
        >
          Send {total} messages
        </button>
      )}

      {started && (
        <>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-green-500 h-4 rounded-full transition-all duration-200"
              style={{
                width: total > 0 ? `${Math.round((progress / total) * 100)}%` : "0%",
              }}
            />
          </div>
          <p className="text-sm text-gray-600">
            {progress} / {total} processed
          </p>

          <div className="max-h-64 overflow-y-auto border rounded-md p-2 space-y-1">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={entry.status === "sent" ? "text-green-600" : "text-red-600"}>
                  {entry.status === "sent" ? "✓" : "✗"}
                </span>
                <span className="font-mono">{entry.phone}</span>
                {entry.error && (
                  <span className="text-red-600 text-xs">{entry.error}</span>
                )}
              </div>
            ))}
          </div>

          {done && (
            <button
              onClick={downloadCSV}
              className="px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              Download updated CSV
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test components/SendStep.test.tsx
```

Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add components/SendStep.tsx components/SendStep.test.tsx
git commit -m "feat: add SendStep component with SSE progress and CSV download"
```

---

## Task 9: `app/layout.tsx` + `app/page.tsx`

**Files:**
- Modify: `app/layout.tsx` (update title/metadata)
- Replace: `app/page.tsx` (3-step flow orchestration)

**Interfaces:**
- Consumes: `ConfigStep` → `ConfigCompleteData`; `UploadStep` → `UploadCompleteData`; `SendStep` with combined config

- [ ] **Step 1: Update `app/layout.tsx`**

Replace the content of `app/layout.tsx` with:

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WA Message Sender",
  description: "Send WhatsApp Business template messages to CSV contacts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import ConfigStep, { type ConfigCompleteData } from "@/components/ConfigStep";
import UploadStep, { type UploadCompleteData } from "@/components/UploadStep";
import SendStep from "@/components/SendStep";

type Step = "config" | "upload" | "send";

const STEP_LABELS: Record<Step, string> = {
  config: "1. Configure",
  upload: "2. Upload CSV",
  send: "3. Send",
};

export default function Home() {
  const [step, setStep] = useState<Step>("config");
  const [configData, setConfigData] = useState<ConfigCompleteData | null>(null);
  const [uploadData, setUploadData] = useState<UploadCompleteData | null>(null);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2 text-gray-900">
        WhatsApp Mass Sender
      </h1>

      <nav className="flex gap-6 mb-8 text-sm">
        {(Object.keys(STEP_LABELS) as Step[]).map((s) => (
          <span
            key={s}
            className={
              step === s
                ? "text-green-700 font-semibold"
                : "text-gray-400"
            }
          >
            {STEP_LABELS[s]}
          </span>
        ))}
      </nav>

      {step === "config" && (
        <ConfigStep
          onComplete={(data) => {
            setConfigData(data);
            setStep("upload");
          }}
        />
      )}

      {step === "upload" && (
        <UploadStep
          onComplete={(data) => {
            setUploadData(data);
            setStep("send");
          }}
        />
      )}

      {step === "send" && configData && uploadData && (
        <SendStep
          config={{
            csvText: uploadData.csvText,
            phoneNumberId: configData.phoneNumberId,
            accessToken: configData.accessToken,
            templateName: configData.selectedTemplate.name,
            templateLanguage: configData.selectedTemplate.language,
            phoneColumn: uploadData.phoneColumn,
            sentColumn: uploadData.sentColumn,
            pendingCount: uploadData.pendingCount,
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All test suites PASS — 0 failures.

- [ ] **Step 4: Start dev server and verify the UI**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Step indicator shows "1. Configure" highlighted.
- All three form fields render.
- "Load Templates" button is disabled when fields are empty.
- Filling the fields enables "Load Templates".

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: add main page with 3-step flow orchestration"
```

---

## Final Verification

- [ ] Run `npm test` — all suites pass, no skipped tests
- [ ] Run `npm run build` — production build succeeds with no TypeScript errors
- [ ] Run `npm run dev` — app loads at http://localhost:3000 with no console errors
