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
