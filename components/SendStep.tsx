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
  const [sendError, setSendError] = useState<string | null>(null);

  async function startSending() {
    setStarted(true);
    try {
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

      if (!response.body) {
        throw new Error("No response body from server");
      }
      const reader = response.body.getReader();
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

      // flush remaining buffer after stream closes
      if (buffer.startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.slice(6)) as ProgressEvent | DoneEvent;
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
        } catch { /* ignore malformed final chunk */ }
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Failed to send messages");
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

          {sendError && (
            <p className="text-red-600 text-sm">{sendError}</p>
          )}
        </>
      )}
    </div>
  );
}
