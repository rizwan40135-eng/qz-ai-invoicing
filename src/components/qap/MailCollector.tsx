import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getAdminConfig } from "@/lib/adminConfig";
import { useStore } from "@/lib/store";
import { fetchAsFile, useInvoiceProcessor } from "@/lib/useProcessor";
import type { MailItem } from "@/lib/types";

/** Collects new supplier emails automatically when auto-collection is switched on. */
export function useMailProcessing() {
  const store = useStore();
  const { processFiles, busy } = useInvoiceProcessor();
  const processMail = async (m: MailItem, auto = false) => {
    const files = await Promise.all(m.attachments.filter((a) => a.url).map((a) => fetchAsFile(a.url!, a.name)));
    const res = await processFiles(files, "Email");
    const first = res.find((r) => r.outcome);
    store.markMailProcessed(m.id, first?.outcome?.invoice.id ?? "—");
    if (first?.outcome) {
      toast.success(`${auto ? "Auto-collected" : "Processed"}: ${m.subject}`, { description: `${first.outcome.invoice.id} · ${first.outcome.decision}` });
    } else if (res[0]?.status === "blocked") {
      toast.error(`Blocked: ${m.subject}`, { description: res[0].blockedReason });
    }
    return res;
  };
  return { processMail, busy };
}

export function MailCollector() {
  const store = useStore();
  const { processMail } = useMailProcessing();
  const running = useRef(false);
  const pending = store.mail.filter((m) => !m.processed);

  useEffect(() => {
    if (!store.autoCollect || running.current || pending.length === 0) return;
    const t = setTimeout(async () => {
      running.current = true;
      try {
        await processMail(pending[0]!, true);
      } finally {
        running.current = false;
      }
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.autoCollect, pending.length]);

  return null;
}

/** Scheduled ERP batch sync and SLA reminders / escalations. */
export function BackgroundJobs() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  useEffect(() => {
    const tick = () => {
      const s = ref.current;
      (["SAP S/4HANA", "Oracle Fusion"] as const).forEach((erp) => {
        const conn = getAdminConfig().connectors.find((c) => c.name === erp);
        if (conn && !conn.enabled) return;
        if (s.erp.mode[erp] !== "Scheduled batch") return;
        const due = new Date(s.erp.lastSync[erp]).getTime() + (conn?.intervalMin ?? s.erp.intervalMin[erp]) * 60000;
        if (Date.now() >= due) s.syncErp(erp);
      });
      const now = Date.now();
      s.invoices
        .filter((i) => i.uploaded && (i.lifecycle === "Review Required" || (i.lifecycle === "Validated" && i.approvalStatus === "Pending")))
        .forEach((i) => {
          const start = new Date(i.audit[0]?.ts ?? now).getTime();
          const hrs = (now - start) / 3600000;
          const reminded = i.audit.some((a) => a.action.startsWith("Reminder sent"));
          const escalated = i.audit.some((a) => a.action.startsWith("Escalated"));
          const cfg = getAdminConfig();
          if (hrs >= i.slaHours * (cfg.escalateAfterPct / 100) && !escalated) {
            s.updateInvoice(i.id, {}, { actor: "SLA Monitor", actorType: "System", action: `Escalated to AP Manager — ${i.slaHours}h SLA breached` });
            s.pushNotification({ severity: "High", title: `${i.id} escalated`, body: `SLA of ${i.slaHours}h breached — owner ${i.owner}.`, link: "/exceptions" });
          } else if (hrs >= i.slaHours * (cfg.reminderPct / 100) && !reminded) {
            s.updateInvoice(i.id, {}, { actor: "SLA Monitor", actorType: "System", action: `Reminder sent to ${i.owner}` });
            s.pushNotification({ severity: "Medium", title: `Reminder: ${i.id} awaiting ${i.owner}`, body: `${hrs.toFixed(1)}h of ${i.slaHours}h SLA used.`, link: "/exceptions" });
          }
        });
    };
    const t = setInterval(tick, 30000);
    tick();
    return () => clearInterval(t);
  }, []);
  return null;
}
