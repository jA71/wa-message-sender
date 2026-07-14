import { render, screen } from "@testing-library/react";
import SendStep from "@/components/SendStep";
import type { SendStepConfig } from "@/components/SendStep";

const baseConfig: SendStepConfig = {
  csvText: "phone,enviado\n5491112345678,",
  phoneNumberId: "phoneId",
  accessToken: "token",
  templateName: "hello_world",
  templateLanguage: "es",
  phoneColumn: "phone",
  sentColumn: "enviado",
  pendingCount: 1,
};

describe("SendStep", () => {
  it("shows Send button with pending count before sending starts", () => {
    render(<SendStep config={baseConfig} />);
    expect(screen.getByRole("button", { name: /Send 1 messages/i })).toBeInTheDocument();
  });

  it("does not show download button before sending starts", () => {
    render(<SendStep config={baseConfig} />);
    expect(screen.queryByRole("button", { name: /Download/i })).not.toBeInTheDocument();
  });
});
