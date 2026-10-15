import { getAdminConfig } from "@/lib/adminConfig";
import type { Invoice } from "@/lib/types";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { approvalChain } from "@/lib/pipeline";
import { PageHeader, Panel, Pill, money, AiBlock } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approval Center — Q-AP AI" },
      { name: "description", content: "Approve exceptions, non-PO invoices, tolerance overrides, payments, policy changes and vendor bank changes with AI summaries." },
      { property: "og:title", content: "Approval Center — Q-AP AI" },
      { property: "og:description", content: "Every approval with evidence, risk and an AI summary." },
    ],
  }),
  component: Approvals,
});

const TYPES = ["Invoice Exception", "Non-PO Invoice", "Duplicate Risk", "Vendor Bank Change", "Value Threshold"];
const typeOf = (i: Invoice) => i.exceptionType === "Bank Detail Change" ? "Vendor Bank Change" : i.exceptionType === "Duplicate Risk" || i.duplicateRisk > 75 ? "Duplicate Risk" : i.exceptionType ? "Invoice Exception" : !i.poNumber ? "Non-PO Invoice" : "Value Threshold";

function Approvals() {
  const store = useStore();
  const [tab, setTab] = useState("All");

  const items = useMemo(() => {
    const pending = store.filteredInvoices.filter((i) => i.approvalStatus === "Pending").sort((a, b) => b.exceptionAgeHours - b.slaHours - (a.exceptionAgeHours - a.slaHours));
    return pending.map((i) => ({ invoice: i, type: typeOf(i) }));
  }, [store.filteredInvoices]);

  const filtered = items.filter((i) => tab === "All" || i.type === tab);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Approvals"
        title="Approval Center"
        subtitle={`${items.length} approvals awaiting a decision · ${money(items.reduce((a, i) => a + i.invoice.grossAmount, 0), "AED", true)} in value`}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {["All", ...TYPES].map((t) => (
            <TabsTrigger key={t} value={t}>{t} ({t === "All" ? items.length : items.filter((x) => x.type === t).length})</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(({ invoice: i, type }) => (
          <Panel key={i.id} title={i.id} description={`${type} · ${i.vendorName}`}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <KV label="Amount" value={money(i.grossAmount, i.currency)} />
              <KV label="Business unit" value={i.businessUnit} />
              <KV label="Reason" value={i.exceptionType ?? `Above ${money(getAdminConfig().approvalLevels[0]?.upTo ?? 0, "AED")} auto-approval limit`} />
              <KV label="Risk" value={i.duplicateRisk > 75 || i.exceptionType === "Bank Detail Change" ? "High" : i.exceptionType || i.grossAmount > getAdminConfig().dualApprovalAbove ? "Medium" : "Low"} />
            </div>
            <div className="mt-3">
              <AiBlock title="AI summary">
                {i.exceptionType
                  ? `${i.exceptionType} raised during ${i.matchMode} matching. Match score ${i.matchScore}%, extraction confidence ${i.extractionConfidence}%.`
                  : `Within policy for ${i.invoiceType.toLowerCase()}, awaiting the configured approval level for ${money(i.grossAmount, i.currency)}.`}
              </AiBlock>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <Pill tone="info">PO {i.poNumber ?? "—"}</Pill>
              <Pill tone="info">GRN {i.grnNumber ?? "—"}</Pill>
              <Pill tone={i.duplicateRisk > 75 ? "fail" : "neutral"}>Dup {i.duplicateRisk.toFixed(0)}</Pill>
            </div>
            {(() => {
              const chain = approvalChain(i);
              const done = i.audit.filter((a) => a.action.startsWith("Approval level")).length;
              return (
                <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px]">
                  {chain.map((c, k) => (
                    <Pill key={c} tone={k < done ? "pass" : k === done ? "warning" : "neutral"}>{k + 1}. {c}</Pill>
                  ))}
                  {i.exceptionAgeHours > i.slaHours && <Pill tone="fail">Escalated — SLA breached</Pill>}
                </div>
              );
            })()}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  const chain = approvalChain(i);
                  const done = i.audit.filter((a) => a.action.startsWith("Approval level")).length;
                  const level = chain[done] ?? "Approver";
                  if (done + 1 < chain.length) {
                    store.updateInvoice(i.id, { owner: chain[done + 1]! }, { actor: store.persona, actorType: "Human", action: `Approval level ${done + 1} (${level}) approved`, newValue: `Next: ${chain[done + 1]}` });
                    store.pushNotification({ severity: "Medium", title: `${i.id} needs ${chain[done + 1]} approval`, body: `Level ${done + 1} of ${chain.length} approved by ${level}.`, link: "/approvals" });
                    toast.success(`${level} approval recorded`, { description: `Routed to ${chain[done + 1]}` });
                  } else {
                    store.updateInvoice(i.id, {}, { actor: store.persona, actorType: "Human", action: `Approval level ${done + 1} (${level}) approved` });
                    store.approveAndPost(i.id, store.persona, `final approval (${type})`);
                    toast.success(`${i.id} fully approved`, { description: `Posted to ${i.erp} and passed to payment.` });
                  }
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  store.updateInvoice(i.id, { approvalStatus: "Rejected" }, { actor: store.persona, actorType: "Human", action: `Rejected (${type})`, oldValue: "Pending", newValue: "Rejected" });
                  toast.error(`${i.id} rejected`);
                }}
              >
                Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { store.pushNotification({ severity: "Medium", title: `Information requested on ${i.id}`, body: "Approver asked for supporting documentation.", link: "/approvals" }); toast.info("Information requested"); }}>
                Info
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
