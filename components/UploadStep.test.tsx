import { render, screen } from "@testing-library/react";
import UploadStep from "@/components/UploadStep";

describe("UploadStep", () => {
  it("renders the drag-and-drop upload zone", () => {
    render(<UploadStep onComplete={jest.fn()} />);
    expect(screen.getByText(/Drag & drop a CSV/i)).toBeInTheDocument();
  });

  it("does not render column selectors before a file is loaded", () => {
    render(<UploadStep onComplete={jest.fn()} />);
    expect(screen.queryByText(/Phone number column/i)).not.toBeInTheDocument();
  });
});
