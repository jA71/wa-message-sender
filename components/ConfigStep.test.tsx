import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConfigStep from "@/components/ConfigStep";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

describe("ConfigStep", () => {
  it("renders Phone Number ID, WABA ID, and Access Token fields", () => {
    render(<ConfigStep onComplete={jest.fn()} />);
    expect(screen.getByLabelText(/Phone Number ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/WhatsApp Business Account ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Access Token/i)).toBeInTheDocument();
  });

  it("Load Templates button is disabled when fields are empty", () => {
    render(<ConfigStep onComplete={jest.fn()} />);
    expect(screen.getByRole("button", { name: /Load Templates/i })).toBeDisabled();
  });

  it("shows template dropdown after successful template fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [
          { name: "hello_world", language: "es", status: "APPROVED", components: [] },
        ],
      }),
    });
    render(<ConfigStep onComplete={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "456" },
    });
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: "tok" } });
    fireEvent.click(screen.getByRole("button", { name: /Load Templates/i }));
    await waitFor(() =>
      expect(screen.getByText(/hello_world \(es\)/i)).toBeInTheDocument()
    );
  });

  it("shows error message when template fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid access token" }),
    });
    render(<ConfigStep onComplete={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /Load Templates/i }));
    await waitFor(() =>
      expect(screen.getByText(/Invalid access token/i)).toBeInTheDocument()
    );
  });

  it("restores saved config from localStorage on mount", () => {
    localStorage.setItem(
      "wa_sender_config",
      JSON.stringify({ phoneNumberId: "savedPhone", wabaId: "savedWaba", accessToken: "savedTok" })
    );
    render(<ConfigStep onComplete={jest.fn()} />);
    expect(screen.getByLabelText(/Phone Number ID/i)).toHaveValue("savedPhone");
    expect(screen.getByLabelText(/WhatsApp Business Account ID/i)).toHaveValue("savedWaba");
  });
});
