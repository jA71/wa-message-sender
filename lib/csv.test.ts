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
