import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PremiumReportButton } from "./premium-report-button";

describe("PremiumReportButton", () => {
  it("is an enabled ghost text button named Informe completo with a 44 px target", () => {
    const onClick = vi.fn();
    render(<PremiumReportButton generating={false} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Informe completo" });
    expect(button.textContent).toBe("Informe completo");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("text-foreground");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner, aria-busy and is disabled while generating", () => {
    render(<PremiumReportButton generating onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Informe completo" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.textContent).toBe("");
  });
});
