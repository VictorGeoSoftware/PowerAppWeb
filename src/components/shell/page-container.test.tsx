import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContainer } from "./page-container";

describe("PageContainer", () => {
  it("defaults to the narrow 640px width, centered", () => {
    render(<PageContainer>contenido</PageContainer>);
    const section = screen.getByText("contenido");
    expect(section).toHaveAttribute("data-width", "narrow");
    expect(section).toHaveClass("mx-auto", "w-full", "max-w-[640px]", "py-4");
  });

  it("wide pages get the 1280px width and extra classes merge", () => {
    render(
      <PageContainer width="wide" className="py-0">
        contenido
      </PageContainer>,
    );
    const section = screen.getByText("contenido");
    expect(section).toHaveClass("max-w-[1280px]", "py-0");
    expect(section).not.toHaveClass("max-w-[640px]", "py-4");
  });
});
