import { useAdminConfig } from "@/lib/adminConfig";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money, Kpi } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Banknote, Clock, ShieldAlert, TrendingDown, Send } from "lucide-react";
import type { PaymentRecord } from "@/lib/types";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments Command Center — Q-AP AI" },
      { name: "description", content: "Schedule, approve and release individual or bulk payments, with ERP payment IDs and live bank status from initiation to beneficiary credit." },
      { property: "og:title", content: "Payments Command Center — Q-AP AI" },
      { property: "og:description", content: "From approval to beneficiary credit with human release control." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Payments,
});

/** Payment releasers come from the active Treasury / Finance Controller users in Settings. */
const approversFrom = (users: { name: string; role: string; active: boolean }[]) => {
  const list = users.filter((u) => u.active && /treasury|controller|cfo/i.test(u.role)).map((u) => `${u.name} (${u.role})`);
  return list.length ? list : ["Treasury approver"];
};

/** ISO 13616 mod-97 check used by the bank connector before transmission. */
function ibanValid(raw: string) {
  const s = raw.replace(/^IBAN\s*/i, "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const re = s.slice(4) + s.slice(0, 4);
  const digits = re.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

function Payments() {
  const store = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [approveOpen, setApproveOpen] = useState(false);
  const APPROVERS = approversFrom(useAdminConfig().users);
  const [approver, setApprover] = useState(APPROVERS[0]!);
  const [statusFilter, setStatusFilter] = useState("Open");

  const payments = store.payments;
  const open = payments.find((p) => p.id === openId) ?? null;
  const releasable = (p: PaymentRecord) => p.status === "Scheduled" || p.status === "Approved for Payment" || p.status === "Rejected" || p.status === "Returned";
  const list = useMemo(
    () =>
      payments.filter((p) =>
        statusFilter === "All" ? true : statusFilter === "Open" ? releasable(p) || ["Initiated", "Processed", "Released"].includes(p.status) : p.status === statusFilter,
      ),
    [payments, statusFilter],
  );
  const totals = {
    scheduled: payments.filter((p) => p.status === "Scheduled").length,
    credited: payments.filter((p) => p.bankStatus === "Credited").length,
    rejected: payments.filter((p) => ["Rejected", "Returned", "Failed"].includes(p.status)).length,
    discount: payments.filter(releasable).reduce((a, p) => a + p.discountOpportunity, 0),
  };

  const execute = (p: PaymentRecord, by: string) => {
    const inv = store.getInvoice(p.invoiceId);
    const bankRef = `BNK-${Math.floor(700000 + Math.random() * 299999)}`;
    const base: PaymentRecord = { ...p, bankReference: bankRef, reason: undefined };
    const ts = () => new Date().toISOString();
    const set = (patch: Partial<PaymentRecord>, label: string, life: "Payment Scheduled" | "Payment Released" | "Beneficiary Credited" | "Review Required") => {
      Object.assign(base, patch);
      store.upsertPayment({ ...base });
      store.updateInvoice(p.invoiceId, { paymentStatus: base.status, bankStatus: base.bankStatus, lifecycle: life }, { actor: label.startsWith("Released") ? by : "Bank Connector", actorType: label.startsWith("Released") ? "Human" : "System", action: label, newValue: base.status });
    };
    set({ status: "Initiated", bankStatus: "Processing", initiatedAt: ts() }, `Released for payment by ${by} · ${p.erpPaymentId} → ${bankRef}`, "Payment Scheduled");
    const bad = inv?.bankDetails && !ibanValid(inv.bankDetails);
    const bankChange = inv?.exceptionType === "Bank Detail Change";
    setTimeout(() => {
      if (bad || bankChange) {
        set({ status: "Rejected", bankStatus: "Rejected", reason: bad ? `Bank validation failed — beneficiary IBAN ${inv!.bankDetails} fails the checksum` : "Held — unverified vendor bank detail change" }, "Bank rejected the payment", "Review Required");
        store.pushNotification({ severity: "Critical", title: `Bank rejected ${p.id}`, body: `${p.vendorName} — beneficiary validation required.`, link: "/payments" });
        toast.error(`${p.id} rejected by bank`);
        return;
      }
      set({ status: "Processed", bankStatus: "Processing", processedAt: ts() }, "Bank accepted and processing", "Payment Scheduled");
    }, 900);
    if (bad || bankChange) return;
    setTimeout(() => set({ status: "Released", bankStatus: "Released", releasedAt: ts() }, "Funds released by bank", "Payment Released"), 1900);
    setTimeout(() => {
      set({ status: "Beneficiary Credited", bankStatus: "Credited", creditedAt: ts() }, "Beneficiary account credited", "Beneficiary Credited");
      toast.success(`${p.id} credited to ${p.vendorName}`);
    }, 2900);
  };

  const releaseSelected = () => {
    const chosen = payments.filter((p) => sel.has(p.id) && releasable(p));
    chosen.forEach((p, i) => setTimeout(() => execute(p, approver), i * 250));
    store.pushNotification({ severity: "Low", title: `Payment batch released (${chosen.length})`, body: `Approved by ${approver} · ${chosen.reduce((s, p) => s + p.value, 0).toLocaleString()} total`, link: "/payments" });
    toast.success(`${chosen.length} payment(s) released to the bank`, { description: `Approved by ${approver}` });
    setSel(new Set());
    setApproveOpen(false);
  };

  const prioritySignals = [
    ["Due within 7 days", payments.filter((p) => releasable(p) && new Date(p.dueDate) < new Date(Date.now() + 7 * 864e5)).length],
    ["Early payment discount", payments.filter((p) => releasable(p) && p.discountOpportunity > 0).length],
    ["Critical priority", payments.filter((p) => releasable(p) && p.priority === "Critical").length],
    ["High value (>150K)", payments.filter((p) => releasable(p) && p.value > 150000).length],
    ["Rejected / returned", totals.rejected],
    ["In bank processing", payments.filter((p) => ["Initiated", "Processed", "Released"].includes(p.status)).length],
  ] as const;

  const selectedValue = payments.filter((p) => sel.has(p.id)).reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="08 · Payments Command Center"
        title="From approval to beneficiary credit"
        subtitle="Approved invoices arrive here automatically. Releasing money always requires a named human approver."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Scheduled" value={String(totals.scheduled)} accent="warning" icon={<Clock className="size-4" />} />
        <Kpi label="Beneficiary credited" value={String(totals.credited)} accent="success" icon={<Banknote className="size-4" />} />
        <Kpi label="Rejected / returned" value={String(totals.rejected)} accent="danger" icon={<ShieldAlert className="size-4" />} />
        <Kpi label="Discount available" value={money(totals.discount, "AED", true)} accent="flame" icon={<TrendingDown className="size-4" />} />
      </div>

      <Panel
        title="Payment queue"
        description="Select one or many payments to release · priorities are suggested, release is a human decision"
        dense
        actions={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Open", "All", "Scheduled", "Initiated", "Released", "Beneficiary Credited", "Rejected", "Returned"].map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" disabled={sel.size === 0} onClick={() => setApproveOpen(true)}>
              <Send className="size-3.5" /> Approve & release {sel.size || ""}
            </Button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">
                  <Checkbox
                    checked={list.filter(releasable).length > 0 && list.filter(releasable).every((p) => sel.has(p.id))}
                    onCheckedChange={(v) => setSel(v ? new Set(list.filter(releasable).slice(0, 60).map((p) => p.id)) : new Set())}
                  />
                </th>
                {["Payment", "Invoice", "Vendor", "Value", "Due / Scheduled", "Discount", "Priority", "Method", "ERP Status", "Bank Status", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 60).map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <Checkbox disabled={!releasable(p)} checked={sel.has(p.id)} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(p.id); else n.delete(p.id); return n; })} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.id}</td>
                  <td className="px-3 py-2 font-semibold text-brand">{p.invoiceId}</td>
                  <td className="px-3 py-2">{p.vendorName}</td>
                  <td className="tabular px-3 py-2">{money(p.value, p.currency)}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="date"
                      value={p.dueDate}
                      disabled={!releasable(p)}
                      onChange={(e) => {
                        store.upsertPayment({ ...p, dueDate: e.target.value });
                        store.updateInvoice(p.invoiceId, {}, { actor: "Treasury", actorType: "Human", action: "Payment rescheduled", oldValue: p.dueDate, newValue: e.target.value });
                      }}
                      className="h-7 w-[140px] text-xs"
                    />
                  </td>
                  <td className="tabular px-3 py-2">{p.discountOpportunity ? money(p.discountOpportunity, p.currency) : "—"}</td>
                  <td className="px-3 py-2">
                    <Select value={p.priority} onValueChange={(v) => store.upsertPayment({ ...p, priority: v as PaymentRecord["priority"] })}>
                      <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Critical", "High", "Normal"].map((x) => <SelectItem key={x} value={x} className="text-xs">{x}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.method}</td>
                  <td className="px-3 py-2"><Pill tone={["Rejected", "Returned", "Failed"].includes(p.status) ? "fail" : "info"}>{p.status}</Pill></td>
                  <td className="px-3 py-2"><Pill tone={p.bankStatus === "Credited" ? "pass" : p.bankStatus === "Rejected" ? "fail" : p.bankStatus === "—" ? "neutral" : "warning"}>{p.bankStatus}</Pill></td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setOpenId(p.id)}>Detail</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No payments in this view.</div>}
        </div>
      </Panel>

      <Panel title="Payment prioritisation" description="Computed from the live queue — advisory only">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {prioritySignals.map(([l, v]) => (
            <div key={l} className="rounded-xl border border-border p-3">
              <div className="text-[11px] text-muted-foreground">{l}</div>
              <div className="tabular mt-1 text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve payment release</DialogTitle>
            <DialogDescription>
              {sel.size} payment(s) · total {selectedValue.toLocaleString()} will be transmitted to the bank. This action is recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Approver</div>
            <Select value={approver} onValueChange={setApprover}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{APPROVERS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Segregation of duties: invoice processors cannot release payments.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button onClick={releaseSelected}>Approve & release</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.id} · {open.vendorName}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <KV label="Invoice" value={open.invoiceId} />
                  <KV label="Value" value={money(open.value, open.currency)} />
                  <KV label="ERP Payment ID" value={open.erpPaymentId} />
                  <KV label="Bank Reference" value={open.bankReference} />
                  <KV label="Initiated" value={open.initiatedAt ? new Date(open.initiatedAt).toLocaleString() : "—"} />
                  <KV label="Processed" value={open.processedAt ? new Date(open.processedAt).toLocaleString() : "—"} />
                  <KV label="Released" value={open.releasedAt ? new Date(open.releasedAt).toLocaleString() : "—"} />
                  <KV label="Credited" value={open.creditedAt ? new Date(open.creditedAt).toLocaleString() : "—"} />
                </div>
                {open.reason && <div className="rounded-lg bg-danger-soft p-3 text-xs text-danger">{open.reason}</div>}

                <div className="space-y-2">
                  {(
                    [
                      ["Payment Initiated", ["Initiated", "Processed", "Released", "Beneficiary Credited"]],
                      ["Bank Processing", ["Processed", "Released", "Beneficiary Credited"]],
                      ["Released", ["Released", "Beneficiary Credited"]],
                      ["Beneficiary Credited", ["Beneficiary Credited"]],
                    ] as const
                  ).map(([s, ok]) => {
                    const done = (ok as readonly string[]).includes(open.status);
                    return (
                      <motion.div key={s} animate={{ opacity: done ? 1 : 0.45 }} className={cn("flex items-center gap-3 rounded-lg border p-2.5", done ? "border-success/30 bg-success-soft" : "border-border")}>
                        <span className="size-2 rounded-full bg-current opacity-60" />
                        <span className="text-[13px] font-semibold">{s}</span>
                      </motion.div>
                    );
                  })}
                </div>

                {releasable(open) && (
                  <Button className="w-full" onClick={() => { setSel(new Set([open.id])); setApproveOpen(true); }}>
                    {open.status === "Rejected" || open.status === "Returned" ? "Retry payment" : "Approve & release payment"}
                  </Button>
                )}
                {open.status === "Beneficiary Credited" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      store.upsertPayment({ ...open, status: "Returned", bankStatus: "Rejected", reason: "Funds returned by beneficiary bank" });
                      store.updateInvoice(open.invoiceId, { paymentStatus: "Returned", bankStatus: "Rejected", lifecycle: "Review Required" }, { actor: "Bank Connector", actorType: "System", action: "Payment returned by beneficiary bank" });
                      toast.error(`${open.id} recorded as returned`);
                    }}
                  >
                    Record bank return
                  </Button>
                )}

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Audit trail</div>
                  <div className="mt-2 space-y-1.5">
                    {(store.getInvoice(open.invoiceId)?.audit ?? []).slice(-8).reverse().map((a) => (
                      <div key={a.id} className="rounded-lg border border-border p-2 text-[11px]">
                        <div className="font-semibold">{a.action}</div>
                        <div className="text-muted-foreground">{a.actor} · {new Date(a.ts).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
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
