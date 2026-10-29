"use client";

import { Button } from "@/components/ui/button";
import { COMPREHENSIVE_REPORT } from "@/lib/proposals/messages";

/**
 * Premium "Informe completo" top-bar action, styled like `CreateReportButton`.
 * Disabled until `report-web-export` wires generation and sharing.
 */
export function PremiumReportButton() {
  return (
    <Button
      variant="ghost"
      aria-label={COMPREHENSIVE_REPORT}
      disabled
      className="h-11 min-w-11 px-3 text-sm font-semibold text-foreground"
    >
      {COMPREHENSIVE_REPORT}
    </Button>
  );
}
