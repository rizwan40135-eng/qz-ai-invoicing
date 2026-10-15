import { createFileRoute, Link } from "@tanstack/react-router";
import { DuplicateReview } from "@/components/qap/DuplicateReview";
import { EscalationPanel, nextLevel, slaStage } from "@/components/qap/Escalation";
import { approvalChain, tolerancesFor } from "@/lib/pipeline";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money, AiBlock } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useAiAsk } from "@/lib/useAiAsk";
import { useAdminConfig } from "@/lib/adminConfig";
import type { ExceptionType, Invoice } from "@/lib/types";

export const Route = createFileRoute("/exceptions")({
  head: () => ({
    meta: [
      { title: "Exception Center — Q-AP AI" },
      { name: "description", content: "Resolve only what needs human intervention: exception queue, AI recommendations, SLA countdown and root-cause Pareto." },
      { property: "og:title", content: "Exception Center — Q-AP AI" },
      { property: "og:description", content: "AI-assisted exception triage with SLA workflow and resolution actions." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ tab: s["tab"] === "duplicates" ? "duplicates" : undefined }) as { tab?: "duplicates" },
  component: Exceptions,
});

const CATEGORIES: ExceptionType[] = [
  "PO Missing",
  "GRN Missing",
  "Quantity Variance",
  "Price Variance",
  "Tax Variance",
  "Vendor Mismatch",
  "Duplicate Risk",
  "Invalid Coding",
  "Approval Missing",
  "Bank Detail Change",
  "Compliance Issue",
];

function severityOf(inv: Invoice) {
  if (inv.exceptionType === "Duplicate Risk" || inv.exceptionType === "Compliance Issue") return "Critical";
  if (inv.grossAmount > 150000 || inv.exceptionAgeHours > inv.slaHours) return "High";
  if (inv.grossAmount > 40000) return "Medium";
  return "Low";
}

function recommendation(inv: Invoice) {
  switch (inv.exceptionType) {
    case "GRN Missing":
      return "No goods receipt has been posted. Confirm whether delivery occurred before releasing any payment.";
    case "Quantity Variance":
      return "Part of the invoiced quantity remains unreceived. Check whether goods are physically pending or the GRN was incompletely posted. Do not approve payment for unmatched quantity without business confirmation.";
    case "Price Variance":
      return "Unit price exceeds the purchase order. Request a PO amendment from procurement or short-pay to the agreed price.";
    case "Duplicate Risk":
      return "A near-identical invoice exists for this vendor. Block until the duplicate review is cleared.";
    case "PO Missing":
      return "No purchase order reference was found. Route to the business owner for non-PO validation and coding.";
    case "Tax Variance":
      return "The effective tax rate deviates from the expected country treatment. Verify the tax code before posting.";
    case "Bank Detail Change":
      return "Vendor bank details changed recently. Apply dual control verification before any payment release.";
    default:
      return "Review the supporting documents and confirm with the business owner before proceeding.";
  }
}

function Exceptions() {
  const search_ = Route.useSearch();
  const cfg = useAdminConfig();
  const store = useStore();
  const ai = useAiAsk();
  const [category, setCategory] = useState("All");
  const [severity, setSeverity] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Invoice | null>(null);
  const [copilot, setCopilot] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      store.filteredInvoices
        .filter((i) => i.exceptionType)
        .filter((i) => category === "All" || i.exceptionType === category)
        .filter((i) => severity === "All" || severityOf(i) === severity)
        .filter((i) => !search || i.id.toLowerCase().includes(search.toLowerCase()) || i.vendorName.toLowerCase().includes(search.toLowerCase())),
    [store.filteredInvoices, category, severity, search],
  );

  const pareto = useMemo(() => {
    const all = store.invoices.filter((i) => i.exceptionType);
    const m = new Map<string, number>();
    all.forEach((i) => m.set(i.exceptionType!, (m.get(i.exceptionType!) ?? 0) + 1));
    return [...m.entries()]
      .map(([name, count]) => ({ name, count, pct: (count / Math.max(1, all.length)) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [store.invoices]);

  const resolve = (inv: Invoice, action: string) => {
    const who = store.persona;
    if (action === "GRN update requested") {
      store.updateInvoice(inv.id, { owner: "Receiving — Warehouse" }, { actor: who, actorType: "Human", action: "GRN update requested from Receiving", reason: action });
      store.pushNotification({ severity: "High", title: `GRN update requested for ${inv.id}`, body: `Receiving asked to confirm delivered quantities for ${inv.poNumber ?? "the PO"}.`, link: "/exceptions" });
      toast.success(`${inv.id}: GRN update requested`, { description: "Receiving has been notified. The invoice stays on hold." });
      setOpen(null);
      return;
    }
    if (action === "Returned to vendor") {
      store.updateInvoice(inv.id, { exceptionType: null, approvalStatus: "Rejected", lifecycle: "Review Required", owner: "Supplier" }, { actor: who, actorType: "Human", action: "Returned to supplier for correction", oldValue: inv.exceptionType ?? "", newValue: "Rejected", reason: action });
      store.pushNotification({ severity: "Medium", title: `${inv.id} returned to ${inv.vendorName}`, body: "Supplier notified through the vendor portal.", link: "/vendors" });
      toast.success(`${inv.id} returned to supplier`);
      setOpen(null);
      return;
    }
    if (action === "Short pay to received quantity") {
      const lines = inv.lines.map((l) => (l.grnQty !== null && l.grnQty < l.invoiceQty ? { ...l, invoiceQty: l.grnQty } : l));
      const net = Math.round(lines.reduce((s, l) => s + l.invoiceQty * l.invoicePrice, 0) * 100) / 100;
      const rate = inv.netAmount ? inv.taxAmount / inv.netAmount : 0;
      const tax = Math.round(net * rate * 100) / 100;
      store.updateInvoice(inv.id, { lines, netAmount: net, taxAmount: tax, grossAmount: Math.round((net + tax) * 100) / 100, matchStatus: "Matched" }, {
        actor: who,
        actorType: "Human",
        action: "Short pay — invoice reduced to received quantity",
        oldValue: `${inv.currency} ${inv.grossAmount.toLocaleString()}`,
        newValue: `${inv.currency} ${(net + tax).toLocaleString()}`,
      });
    }
    store.approveAndPost(inv.id, who, action);
    toast.success(`${inv.id}: ${action}`, { description: `Posted to ${inv.erp} and scheduled for payment.` });
    setOpen(null);
  };

  if (search_.tab === "duplicates") return (
    <div className="space-y-5">
      <ExTabs />
      <DuplicateReview />
    </div>
  );

  return (
    <div className="space-y-5">
      <ExTabs />
      <PageHeader
        eyebrow="05 · Exception Center"
        title="Resolve only what needs human intervention"
        subtitle={`${rows.length} open exceptions in the current filter · review deadlines set per exception type in Settings`}
      />

      <div className="flex flex-wrap gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice or vendor" className="h-9 w-[240px]" />
        <Button
          variant="outline"
          className="h-9"
          onClick={() => {
            const overdue = rows.filter((r) => r.exceptionAgeHours >= r.slaHours * 0.75);
            const owners = new Set(overdue.map((r) => r.owner));
            overdue.forEach((r) => store.updateInvoice(r.id, {}, { actor: "SLA Monitor", actorType: "System", action: `Reminder sent to ${r.owner}` }));
            store.pushNotification({ severity: "Medium", title: `Reminders sent for ${overdue.length} exceptions`, body: `${owners.size} owner(s) notified about items near or past SLA.`, link: "/exceptions" });
            toast.success(`${overdue.length} reminders sent to ${owners.size} owner(s)`);
          }}
        >
          Send SLA reminders
        </Button>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["All", ...CATEGORIES].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["All", "Critical", "High", "Medium", "Low"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Panel title="Exception queue" dense>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                {["Invoice", "Vendor", "BU", "Value", "Exception", "Severity", "Age", "Owner", "SLA", "AI Recommendation", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((i) => {
                const sev = severityOf(i);
                const slaPct = Math.min(100, (i.exceptionAgeHours / i.slaHours) * 100);
                return (
                  <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-semibold text-brand"><div>{i.invoiceNumber}</div><div className="text-[10px] font-normal text-muted-foreground">{i.id}</div></td>
                    <td className="px-4 py-2.5">{i.vendorName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{i.businessUnit}</td>
                    <td className="tabular px-4 py-2.5">{money(i.grossAmount, i.currency)}</td>
                    <td className="px-4 py-2.5">{i.exceptionType}</td>
                    <td className="px-4 py-2.5"><Pill tone={sev === "Critical" ? "fail" : sev === "High" ? "high" : sev === "Medium" ? "warning" : "neutral"}>{sev}</Pill></td>
                    <td className="tabular px-4 py-2.5">{i.exceptionAgeHours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{i.owner}</td>
                    <td className="px-4 py-2.5">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", slaPct > 85 ? "bg-danger" : slaPct > 60 ? "bg-warning" : "bg-success")} style={{ width: `${slaPct}%` }} />
                      </div>
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-2.5 text-[12px] text-muted-foreground">{recommendation(i)}</td>
                    <td className="px-4 py-2.5">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setOpen(i); setCopilot([]); }}>Open</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Root cause analysis" description="Exception Pareto across all invoices">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pareto} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, _n, p) => [`${v} (${(p.payload as { pct: number }).pct.toFixed(0)}%)`, "Exceptions"]} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {pareto.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "var(--flame)" : "var(--brand)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <EscalationPanel items={rows} />
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.id} · {open.exceptionType}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <KV label="Vendor" value={open.vendorName} />
                  <KV label="Value" value={money(open.grossAmount, open.currency)} />
                  <KV label="Invoice qty" value={String(open.lines.reduce((a, l) => a + l.invoiceQty, 0))} />
                  <KV label="PO qty" value={String(open.lines.reduce((a, l) => a + l.poQty, 0))} />
                  <KV label="GRN qty" value={String(open.lines.reduce((a, l) => a + (l.grnQty ?? 0), 0))} />
                  <KV label="Tolerance" value={`±${tolerancesFor(open, store.tolerances).tol.quantity}% qty · ±${tolerancesFor(open, store.tolerances).tol.price}% price`} />
                </div>
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Approval chain & escalation</div>
                    <Pill tone="neutral">{slaStage(open, cfg.reminderPct, cfg.escalateAfterPct)}</Pill>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                    {approvalChain(open).map((s, i) => <span key={s} className="rounded-md bg-muted px-2 py-1">{i + 1}. {s}</span>)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>Current owner: <strong className="text-foreground">{open.owner}</strong> · {open.exceptionAgeHours.toFixed(1)}h of {open.slaHours}h</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => {
                      const to = nextLevel(open);
                      store.updateInvoice(open.id, { owner: to }, { actor: store.persona, actorType: "Human", action: `Escalated to ${to}`, oldValue: open.owner, newValue: to });
                      store.pushNotification({ severity: "High", title: `${open.invoiceNumber} escalated to ${to}`, body: `${open.exceptionType} · ${open.vendorName}.`, link: "/exceptions" });
                      toast.success(`Escalated to ${to}`);
                      setOpen({ ...open, owner: to });
                    }}>Escalate to {nextLevel(open)}</Button>
                  </div>
                </div>
                <AiBlock title="AI exception summary">{recommendation(open)}</AiBlock>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">AI resolution copilot</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      "Why is this blocked?",
                      "Who should resolve it?",
                      "What happened on similar invoices?",
                      "Can we short-pay only the received quantity?",
                      "Is this vendor frequently creating this exception?",
                    ].map((q) => (
                      <button
                        key={q}
                        disabled={ai.busy}
                        onClick={async () => {
                          setCopilot((c) => [...c, `${q}||Q AI is analysing…`]);
                          const a = await ai.ask(`${q} (invoice ${open.id})`, "Exception Copilot", open, () => copilotAnswer(q, open, store.invoices));
                          setCopilot((c) => c.map((x, i) => (i === c.length - 1 ? `${q}||${a}` : x)));
                        }}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:border-brand/50 hover:bg-brand-soft"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 space-y-2">
                    {copilot.map((c, i) => {
                      const [q, a] = c.split("||");
                      return (
                        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border p-3">
                          <div className="text-[11px] font-semibold text-brand">{q}</div>
                          <div className="mt-1 whitespace-pre-line text-sm">{a}</div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => resolve(open, "GRN update requested")}>Request GRN Update</Button>
                  <Button variant="outline" onClick={() => resolve(open, "Short pay to received quantity")}>Short Pay</Button>
                  <Button variant="outline" onClick={() => resolve(open, "Tolerance override approved")}>Approve Override</Button>
                  <Button variant="outline" onClick={() => resolve(open, "Returned to vendor")}>Return to Vendor</Button>
                  <Button
                    variant="ghost"
                    className="col-span-2"
                    onClick={() => {
                      store.updateInvoice(open.id, { owner: "M. Haddad" }, { actor: store.persona, actorType: "Human", action: "Exception reassigned", oldValue: open.owner, newValue: "M. Haddad" });
                      toast.success("Exception assigned to M. Haddad");
                    }}
                  >
                    Assign to another owner
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function copilotAnswer(q: string, inv: Invoice, all: Invoice[]) {
  const s = q.toLowerCase();
  const received = inv.lines.reduce((a, l) => a + (l.grnQty ?? 0), 0);
  const invoiced = inv.lines.reduce((a, l) => a + l.invoiceQty, 0);
  if (s.includes("who")) return `${inv.owner} owns this exception. For ${inv.exceptionType}, the receiving team at ${inv.businessUnit} must confirm before AP can close it.`;
  if (s.includes("similar")) {
    const similar = all.filter((i) => i.vendorId === inv.vendorId && i.exceptionType === inv.exceptionType).length;
    return `${similar} invoices from ${inv.vendorName} carried the same exception type. Most were resolved by posting the missing receipt within two days.`;
  }
  if (s.includes("short-pay")) return `Yes. Paying only the received quantity would settle ${money((received / Math.max(1, invoiced)) * inv.grossAmount, inv.currency)} and hold the remaining ${money(((invoiced - received) / Math.max(1, invoiced)) * inv.grossAmount, inv.currency)} until receipt is confirmed.`;
  if (s.includes("frequently")) {
    const rate = (all.filter((i) => i.vendorId === inv.vendorId && i.exceptionType).length / Math.max(1, all.filter((i) => i.vendorId === inv.vendorId).length)) * 100;
    return `${inv.vendorName} has an exception rate of ${rate.toFixed(1)}% across all invoices — ${rate > 20 ? "materially above" : "in line with"} the group average.`;
  }
  return `${inv.id} is blocked by ${inv.exceptionType}. ${recommendation(inv)} Invoiced ${invoiced} units against ${received} received, against a ±2% quantity tolerance.`;
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function ExTabs() {
  const { tab } = Route.useSearch();
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 text-[12px] font-semibold">
      <Link to="/exceptions" search={{}} className={cn("rounded-md px-3 py-1.5", !tab ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>Exceptions</Link>
      <Link to="/exceptions" search={{ tab: "duplicates" }} className={cn("rounded-md px-3 py-1.5", tab === "duplicates" ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>Duplicate review</Link>
    </div>
  );
}
