/**
 * @jest-environment node
 */

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
