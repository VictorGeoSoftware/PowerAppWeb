import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeeFirstGateBanner } from "./fee-first-gate-banner";

describe("FeeFirstGateBanner", () => {
  it("shows the locked copy and progress", () => {
    render(<FeeFirstGateBanner unlocked={false} completed={3} required={6} />);
    expect(screen.getByText("Propuestas bloqueadas")).toBeInTheDocument();
    expect(
      screen.getByText("Rellena todos los precios de potencia y energía para desbloquear el menú."),
    ).toBeInTheDocument();
    expect(screen.getByText("3 de 6 campos completados")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "6");
  });

  it("shows the unlocked copy", () => {
    render(<FeeFirstGateBanner unlocked completed={6} required={6} />);
    expect(screen.getByText("Navegación desbloqueada")).toBeInTheDocument();
    expect(screen.getByText("Ya puedes consultar Propuestas y Configuración.")).toBeInTheDocument();
    expect(screen.getByText("6 de 6 campos completados")).toBeInTheDocument();
  });

  it("hides the progress when nothing is required", () => {
    render(<FeeFirstGateBanner unlocked={false} completed={0} required={0} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
