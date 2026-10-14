import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsumptionSummary } from "./consumption-summary";

describe("ConsumptionSummary", () => {
  it("shows CUPS, tariff and es-ES formatted non-zero periods (kWh truncated, BmApp toInt)", () => {
    render(
      <ConsumptionSummary
        session={{
          cups: "ES0031607515707001RC",
          feeType: "2.0TD",
          energyPeriods: ["P1"],
          powerPeriods: ["P1"],
          energyRows: [{ period: "P1", value: 1234.9 }],
          powerRows: [{ period: "P1", value: 4.6 }],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Consumo obtenido" })).toBeInTheDocument();
    expect(screen.getByText("ES0031607515707001RC")).toBeInTheDocument();
    expect(screen.getByText("2.0TD")).toBeInTheDocument();
    expect(screen.getByText("P1 · 1.234 kWh")).toBeInTheDocument();
    expect(screen.getByText("P1 · 4,6 kW")).toBeInTheDocument();
  });
});
