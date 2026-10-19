import { CheckCircle2Icon, LockIcon } from "lucide-react";
import {
  GATE_LOCKED_MESSAGE,
  GATE_LOCKED_TITLE,
  GATE_UNLOCKED_MESSAGE,
  GATE_UNLOCKED_TITLE,
  gateProgress,
} from "@/lib/conditions/messages";
import { cn } from "@/lib/utils";

type Props = { unlocked: boolean; completed: number; required: number };

/** Port of BmApp `FeeFirstGateBanner`. */
export function FeeFirstGateBanner({ unlocked, completed, required }: Props) {
  const Icon = unlocked ? CheckCircle2Icon : LockIcon;
  const ratio = required > 0 ? Math.min(1, completed / required) : 0;
  return (
    <section
      aria-label={unlocked ? GATE_UNLOCKED_TITLE : GATE_LOCKED_TITLE}
      data-state={unlocked ? "unlocked" : "locked"}
      className={cn(
        "flex flex-col gap-2 rounded-[10px] p-3",
        unlocked ? "bg-gate-unlocked text-gate-unlocked-foreground" : "bg-gate-locked text-gate-locked-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-bold">{unlocked ? GATE_UNLOCKED_TITLE : GATE_LOCKED_TITLE}</p>
          <p className="text-sm">{unlocked ? GATE_UNLOCKED_MESSAGE : GATE_LOCKED_MESSAGE}</p>
        </div>
      </div>
      {required > 0 && (
        <>
          <p className="text-xs font-semibold">{gateProgress(completed, required)}</p>
          <div
            role="progressbar"
            aria-label="Campos completados"
            aria-valuemin={0}
            aria-valuemax={required}
            aria-valuenow={completed}
            className="h-1.5 w-full overflow-hidden rounded bg-current/20"
          >
            <div className="h-full rounded bg-current" style={{ width: `${ratio * 100}%` }} />
          </div>
        </>
      )}
    </section>
  );
}
