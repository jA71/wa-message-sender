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
    try {
      const data = JSON.parse(saved) as { phoneNumberId?: string; wabaId?: string; accessToken?: string };
      if (data.phoneNumberId) setPhoneNumberId(data.phoneNumberId);
      if (data.wabaId) setWabaId(data.wabaId);
      if (data.accessToken) setAccessToken(data.accessToken);
    } catch { /* ignore corrupt localStorage value */ }
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
