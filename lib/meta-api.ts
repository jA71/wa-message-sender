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
