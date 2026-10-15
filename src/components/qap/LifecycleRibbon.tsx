import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Check, AlertTriangle } from "lucide-react";
import type { LifecycleStage } from "@/lib/types";

export const LIFECYCLE: LifecycleStage[] = [
  "Received",
  "Classified",
  "Extracted",
  "Validated",
  "Matched",
  "Approved",
  "Posted",
  "Payment Scheduled",
  "Payment Released",
  "Beneficiary Credited",
];

export function LifecycleRibbon({
  stage,
  compact,
}: {
  stage: LifecycleStage;
  compact?: boolean;
}) {
  const exception = stage === "Review Required";
  const idx = exception ? 4 : LIFECYCLE.indexOf(stage);
  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto pb-1">
      {LIFECYCLE.map((s, i) => {
        const done = i < idx;
        const current = i === idx && !exception;
        const blocked = exception && i === 4;
        return (
          <div key={s} className="flex min-w-0 flex-1 items-center gap-1">
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1.5",
                done && "border-success/30 bg-success-soft text-success",
                current && "border-brand bg-brand text-brand-foreground shadow-sm",
                blocked && "border-danger/40 bg-danger-soft text-danger",
                !done && !current && !blocked && "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-3 shrink-0" />
              ) : blocked ? (
                <AlertTriangle className="size-3 shrink-0" />
              ) : (
                <span className="tabular text-[10px] font-bold">{String(i + 1).padStart(2, "0")}</span>
              )}
              {!compact && <span className="truncate text-[10.5px] font-semibold">{blocked ? "Review Required" : s}</span>}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
