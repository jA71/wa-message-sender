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
