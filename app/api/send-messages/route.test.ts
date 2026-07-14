/**
 * @jest-environment node
 */

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
