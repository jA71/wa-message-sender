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
