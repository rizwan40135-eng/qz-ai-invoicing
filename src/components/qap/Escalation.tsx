import { useMemo } from "react";
import { toast } from "sonner";
import { Panel, Pill, money } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { useAdminConfig } from "@/lib/adminConfig";
import { approvalChain } from "@/lib/pipeline";
import { useStore } from "@/lib/store";
import { toAed } from "@/lib/data";
import type { Invoice } from "@/lib/types";

/** SLA stage of an open item, based on Settings reminder / escalation percentages. */
export function slaStage(i: Invoice, reminderPct: number, escalatePct: number) {
  const used = (i.exceptionAgeHours / Math.max(0.1, i.slaHours)) * 100;
  const escalated = i.audit.some((a) => a.action.startsWith("Escalated"));
  if (used >= 100) return "Breached";
  if (escalated || used >= escalatePct) return "Escalated";
  if (used >= reminderPct) return "Reminder";
  return "Within SLA";
}

/** Next owner on the escalation ladder: the invoice's approval chain, then AP Manager and Finance Controller. */
export function nextLevel(i: Invoice) {
  const ladder = [...approvalChain(i), "AP Manager", "Finance Controller"].filter((x, idx, a) => a.indexOf(x) === idx);
  const at = ladder.indexOf(i.owner);
  return ladder[at + 1] ?? ladder[0]!;
}

/** Live approval levels and escalation for a set of open items. */
export function EscalationPanel({ items, title = "Approval levels & escalation", scopeLabel = "open exceptions" }: { items: Invoice[]; title?: string; scopeLabel?: string }) {
  const cfg = useAdminConfig();
  const store = useStore();
  const stages = useMemo(() => {
    const m: Record<string, Invoice[]> = { "Within SLA": [], Reminder: [], Escalated: [], Breached: [] };
    items.forEach((i) => m[slaStage(i, cfg.reminderPct, cfg.escalateAfterPct)]!.push(i));
    return m;
  }, [items, cfg.reminderPct, cfg.escalateAfterPct]);
  const bands = useMemo(() => {
    let lo = 0;
    return cfg.approvalLevels.map((l) => {
      const set = items.filter((i) => { const v = toAed(i.grossAmount, i.currency); return v > lo && v <= l.upTo; });
      const row = { from: lo, ...l, n: set.length, value: set.reduce((a, i) => a + toAed(i.grossAmount, i.currency), 0) };
      lo = l.upTo;
      return row;
    });
  }, [items, cfg.approvalLevels]);

  const escalate = (list: Invoice[]) => {
    list.forEach((i) => {
      const to = nextLevel(i);
      store.updateInvoice(i.id, { owner: to }, { actor: store.persona, actorType: "Human", action: `Escalated to ${to}`, oldValue: i.owner, newValue: to, reason: `${i.exceptionAgeHours.toFixed(1)}h of ${i.slaHours}h SLA used` });
    });
    if (list.length) store.pushNotification({ severity: "High", title: `${list.length} item(s) escalated`, body: `Moved to the next approval level by ${store.persona}.`, link: "/exceptions" });
    toast.success(`${list.length} item(s) escalated to the next level`);
  };
  const overdue = [...stages["Escalated"]!, ...stages["Breached"]!];

  return (
    <Panel title={title} description={`Ladder follows Settings: reminder at ${cfg.reminderPct}% of SLA, escalation at ${cfg.escalateAfterPct}%`}
      actions={<Button size="sm" variant="outline" disabled={!overdue.length} onClick={() => escalate(overdue)}>Escalate {overdue.length} overdue</Button>}>
      <div className="grid grid-cols-4 gap-2">
        {(["Within SLA", "Reminder", "Escalated", "Breached"] as const).map((s) => (
          <div key={s} className="rounded-lg border border-border p-2.5">
            <div className="text-[11px] text-muted-foreground">{s}</div>
            <div className="tabular text-lg font-semibold">{stages[s]!.length}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Approval levels by value (AED)</div>
      <div className="mt-1.5 space-y-1.5">
        {bands.map((b) => (
          <div key={b.upTo} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px]">
            <span className="w-[150px] text-muted-foreground">{b.from.toLocaleString()} – {b.upTo >= 99999999 ? "above" : b.upTo.toLocaleString()}</span>
            <span className="flex-1">{b.approvers}</span>
            <Pill tone={b.n ? "info" : "neutral"}>{b.n} {scopeLabel}</Pill>
            <span className="tabular w-[90px] text-right text-muted-foreground">{money(b.value, "AED", true)}</span>
          </div>
        ))}
        <div className="text-[11px] text-muted-foreground">Above AED {cfg.dualApprovalAbove.toLocaleString()} a second approver (CFO) is added.</div>
      </div>
    </Panel>
  );
}
