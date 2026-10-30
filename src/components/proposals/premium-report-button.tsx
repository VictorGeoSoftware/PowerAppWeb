"use client";

import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPREHENSIVE_REPORT } from "@/lib/proposals/messages";

/** Premium "Informe completo" top-bar action, styled like `CreateReportButton`. */
export function PremiumReportButton({
  generating,
  onClick,
}: {
  generating: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      aria-label={COMPREHENSIVE_REPORT}
      aria-busy={generating}
      disabled={generating}
      onClick={onClick}
      className="h-11 min-w-11 px-3 text-sm font-semibold text-foreground"
    >
      {generating ? <Loader2Icon className="size-[18px] animate-spin" aria-hidden /> : COMPREHENSIVE_REPORT}
    </Button>
  );
}
