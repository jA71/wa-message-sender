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
            disabled={pendingCount === 0 || !activeSentColumn.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50"
          >
            Continue
          </button>
        </>
      )}
    </form>
  );
}
