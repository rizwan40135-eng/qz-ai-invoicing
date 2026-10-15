import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-flame">{eyebrow}</div>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  dense,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={cn("panel", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={dense ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  trend,
  accent,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
  accent?: "brand" | "flame" | "success" | "warning" | "danger";
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const tone =
    accent === "flame"
      ? "text-flame"
      : accent === "success"
        ? "text-success"
        : accent === "warning"
          ? "text-warning"
          : accent === "danger"
            ? "text-danger"
            : "text-brand";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn(
        "panel group w-full p-4 text-left transition-colors",
        onClick ? "cursor-pointer hover:border-brand/40" : "cursor-default",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {icon && <span className={cn("opacity-70", tone)}>{icon}</span>}
      </div>
      <div className={cn("tabular mt-2 text-2xl font-semibold tracking-tight", tone)}>{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {sub && <span>{sub}</span>}
        {trend && <span className="font-medium text-success">{trend}</span>}
      </div>
    </motion.button>
  );
}

const STATUS_TONES: Record<string, string> = {
  pass: "bg-success-soft text-success border-success/25",
  match: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  fail: "bg-danger-soft text-danger border-danger/25",
  exception: "bg-danger-soft text-danger border-danger/25",
  critical: "bg-danger-soft text-danger border-danger/25",
  high: "bg-flame-soft text-flame border-flame/25",
  medium: "bg-warning-soft text-warning border-warning/25",
  low: "bg-muted text-muted-foreground border-border",
  info: "bg-brand-soft text-brand border-brand/25",
  opportunity: "bg-brand-soft text-brand border-brand/25",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof STATUS_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        STATUS_TONES[tone] ?? STATUS_TONES['neutral'],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(s: string): keyof typeof STATUS_TONES {
  const v = s.toLowerCase();
  if (["matched", "pass", "match", "approved", "auto approved", "posted", "credited", "beneficiary credited", "released", "healthy", "connected"].includes(v))
    return "pass";
  if (["review required", "pending", "warning", "processing", "scheduled", "monitor", "medium"].includes(v)) return "warning";
  if (["failed", "fail", "rejected", "exception", "not matched", "critical", "returned", "high risk"].includes(v)) return "fail";
  if (["high", "opportunity"].includes(v)) return v === "high" ? "high" : "opportunity";
  return "neutral";
}

export function Confidence({ value, showBar = true }: { value: number; showBar?: boolean }) {
  const tone = value >= 95 ? "bg-success" : value >= 90 ? "bg-brand" : value >= 80 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      {showBar && (
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn("h-full rounded-full", tone)}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, value)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      )}
      <span className="tabular text-xs font-semibold">{value.toFixed(1)}%</span>
    </div>
  );
}

export function DemoBadge({ label = "DEMO DATA" }: { label?: string }) {
  return (
    <Badge
      variant="outline"
      className="border-flame/40 bg-flame-soft text-[10px] font-bold tracking-[0.14em] text-flame"
    >
      {label}
    </Badge>
  );
}

export function money(value: number, currency = "AED", compact = false) {
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${currency} ${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${currency} ${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${currency} ${(value / 1e3).toFixed(1)}K`;
  }
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AiBlock({ title = "AI EXPLANATION", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft/60 p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}
