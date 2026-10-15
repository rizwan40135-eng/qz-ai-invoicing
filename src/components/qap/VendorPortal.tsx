import { useMemo, useRef, useState } from "react";
import { Check, FileText, Loader2, Lock, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useInvoiceProcessor } from "@/lib/useProcessor";
import { sha256 } from "@/lib/extract";
import { Panel, Pill, money } from "./primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

const STAGES = ["Received", "Validated", "Matching", "Approval", "Posted", "Payment", "Paid"] as const;

function stageOf(i: Invoice): { idx: number; blocked: boolean } {
  if (i.lifecycle === "Review Required") return { idx: 2, blocked: true };
  if (i.paymentStatus === "Beneficiary Credited") return { idx: 7, blocked: false };
  if (["Scheduled", "Initiated", "Processed", "Released", "Approved for Payment"].includes(i.paymentStatus)) return { idx: 5, blocked: false };
  if (i.erpStatus === "Posted") return { idx: 5, blocked: false };
  if (i.approvalStatus === "Approved" || i.approvalStatus === "Auto Approved") return { idx: 4, blocked: false };
  if (i.lifecycle === "Validated" || i.lifecycle === "Matched") return { idx: 3, blocked: false };
  return { idx: 1, blocked: false };
}

export function reasonForVendor(i: Invoice) {
  switch (i.exceptionType) {
    case "GRN Missing":
      return "Waiting for goods receipt confirmation at the delivery location.";
    case "Quantity Variance":
      return "Received quantity differs from the invoiced quantity — the receiving team is confirming delivery.";
    case "Price Variance":
      return "Invoiced unit price differs from the purchase order — the buyer is reviewing.";
    case "PO Missing":
      return "The purchase order number on the invoice could not be found. Please confirm the PO reference.";
    case "Duplicate Risk":
      return "This invoice appears similar to one already submitted and is on hold for review.";
    case "Tax Variance":
    case "Compliance Issue":
      return "Tax or statutory details need correction. Please upload a corrected tax invoice or supporting document.";
    case "Vendor Mismatch":
      return "Supplier details do not match our records. Please confirm your registered name and tax number.";
    default:
      if (i.paymentStatus === "Beneficiary Credited") return "Paid — funds credited to your bank account.";
      if (i.erpStatus === "Posted") return `Approved and scheduled for payment on ${i.dueDate}.`;
      return "Under review by Nova Global Industries Accounts Payable.";
  }
}

export function VendorPortal() {
  const store = useStore();
  const { processFiles, busy, items } = useInvoiceProcessor();
  const [vendorId, setVendorId] = useState(store.vendors[0]!.id);
  const vendor = store.vendors.find((v) => v.id === vendorId)!;
  const mine = useMemo(() => store.invoices.filter((i) => i.vendorId === vendorId || i.vendorName === vendor.name).slice(0, 30), [store.invoices, vendorId, vendor.name]);
  const [selected, setSelected] = useState<string | null>(null);
  const tracked = mine.find((i) => i.id === selected) ?? mine.find((i) => i.exceptionType) ?? mine[0];
  const [reply, setReply] = useState("");
  const invRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("Tax Document");
  const [kind, setKind] = useState("Invoice");

  const submit = async (files: File[]) => {
    const res = await processFiles(files, "Vendor Portal");
    for (const r of res) {
      const inv = r.outcome?.invoice;
      if (inv && inv.vendorName !== vendor.name) {
        store.updateInvoice(inv.id, { exceptionType: "Vendor Mismatch", lifecycle: "Review Required", owner: "Vendor master team" }, {
          actor: "Portal Security",
          actorType: "System",
          action: `Submitted by ${vendor.name} but document names ${inv.vendorName} — held for verification`,
        });
        toast.error("Supplier mismatch", { description: `${r.fileName} names ${inv.vendorName}, not ${vendor.name}. Held for verification.` });
      } else if (inv) {
        setSelected(inv.id);
        toast.success(`${kind} ${inv.invoiceNumber} received`, { description: reasonForVendor(inv) });
      } else if (r.status === "blocked") toast.error("Already submitted", { description: r.blockedReason });
    }
  };

  const attach = async (files: File[]) => {
    if (!tracked) {
      toast.error("Select an invoice to attach the document to");
      return;
    }
    for (const f of files) {
      const hash = await sha256(f);
      if (tracked.supportingDocs?.some((d) => d.hash === hash)) {
        toast.error(`${f.name} was already uploaded`);
        continue;
      }
      const doc = { name: f.name, type: docType, hash, ts: new Date().toISOString(), by: vendor.name };
      const resolves =
        (docType === "Customs Document" && tracked.invoiceType === "Import / Customs") ||
        (docType === "Tax Document" && (tracked.exceptionType === "Tax Variance" || tracked.exceptionType === "Compliance Issue")) ||
        (docType === "Delivery / GRN Evidence" && (tracked.exceptionType === "GRN Missing" || tracked.exceptionType === "Quantity Variance"));
      store.updateInvoice(
        tracked.id,
        { supportingDocs: [...(tracked.supportingDocs ?? []), doc], ...(resolves ? { owner: "AP Processor — document review" } : {}) },
        { actor: vendor.name, actorType: "Human", action: `${docType} uploaded via vendor portal (${f.name})`, reason: resolves ? "Supports open exception — routed to AP for review" : undefined },
      );
      store.pushNotification({ severity: "Low", title: "Vendor portal document received", body: `${vendor.name} uploaded ${docType.toLowerCase()} for ${tracked.id}.`, link: "/exceptions" });
      toast.success(`${docType} stored securely`, { description: `SHA-256 ${hash.slice(0, 12)}… · AP team notified` });
    }
  };

  const st = tracked ? stageOf(tracked) : null;
  const updates = tracked ? tracked.audit.filter((a) => a.actorType !== "AI").slice(-6).reverse() : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Lock className="size-4 text-success" />
        <span className="text-xs text-muted-foreground">Secure supplier session — suppliers see only their own invoices and payments</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs">Signed in as</span>
          <Select value={vendorId} onValueChange={(v) => { setVendorId(v); setSelected(null); }}>
            <SelectTrigger className="h-8 w-[260px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {store.vendors.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Panel title="Submit to Nova Global Industries" description="Invoices are read and matched to your purchase order immediately">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Invoice", "Credit Note", "Debit Note"].map((k) => <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="gap-1.5" disabled={busy} onClick={() => invRef.current?.click()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Submit {kind}
              </Button>
              <input ref={invRef} type="file" multiple className="hidden" accept=".pdf,.xml,.json,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => { void submit(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            </div>
            {items.slice(0, 3).map((r) => (
              <div key={r.id} className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                {r.status === "reading" || r.status === "queued" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 text-success" />}
                {r.fileName} — {r.status === "blocked" ? r.blockedReason : r.stage}
              </div>
            ))}

            <div className="mt-4 border-t border-border pt-4">
              <div className="text-[12px] font-semibold">Supporting documents {tracked && <span className="font-normal text-muted-foreground">for {tracked.invoiceNumber}</span>}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="h-9 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Tax Document", "Customs Document", "Compliance Certificate", "Delivery / GRN Evidence", "Other Supporting Document"].map((k) => <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="gap-1.5" onClick={() => docRef.current?.click()} disabled={!tracked}>
                  <Upload className="size-4" /> Upload
                </Button>
                <input ref={docRef} type="file" multiple className="hidden" onChange={(e) => { void attach(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              </div>
              {(tracked?.supportingDocs ?? []).map((d) => (
                <div key={d.hash} className="mt-1.5 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                  <FileText className="size-3.5 text-brand" /> {d.name}
                  <span className="text-muted-foreground">· {d.type}</span>
                  <Pill tone="pass" className="ml-auto"><Lock className="size-3" /> Stored</Pill>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="My invoices" description={`${mine.length} invoices for ${vendor.name}`} dense>
            <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
              {mine.map((i) => (
                <button key={i.id} onClick={() => setSelected(i.id)} className={cn("flex w-full items-center gap-3 px-5 py-2.5 text-left text-xs hover:bg-muted/40", tracked?.id === i.id && "bg-brand-soft/60")}>
                  <span className="font-semibold text-brand">{i.invoiceNumber}</span>
                  <span className="text-muted-foreground">{i.invoiceDate}</span>
                  <span className="tabular ml-auto">{money(i.grossAmount, i.currency)}</span>
                  <Pill tone={i.exceptionType ? "warning" : i.paymentStatus === "Beneficiary Credited" ? "pass" : "info"}>{i.exceptionType ? "Action needed" : i.paymentStatus === "Not Due" ? i.lifecycle : i.paymentStatus}</Pill>
                </button>
              ))}
              {mine.length === 0 && <div className="px-5 py-6 text-center text-xs text-muted-foreground">No invoices submitted yet.</div>}
            </div>
          </Panel>
        </div>

        <Panel title="Status tracker" description={tracked ? `${tracked.invoiceNumber} · ${money(tracked.grossAmount, tracked.currency)}` : "No invoices"}>
          {tracked && st && (
            <>
              <div className="space-y-2">
                {STAGES.map((s, i) => {
                  const done = i < st.idx;
                  const cur = i === st.idx;
                  return (
                    <div key={s} className={cn("flex items-center gap-3 rounded-lg border p-2.5", done ? "border-success/30 bg-success-soft" : cur ? (st.blocked ? "border-danger/40 bg-danger-soft" : "border-flame/40 bg-flame-soft") : "border-border")}>
                      <span className={cn("grid size-6 place-items-center rounded-full text-[10px] font-bold", done ? "bg-success text-primary-foreground" : cur ? "bg-flame text-primary-foreground" : "bg-muted text-muted-foreground")}>{done ? "✓" : i + 1}</span>
                      <span className="text-[13px] font-semibold">{s}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{done ? "Complete" : cur ? (st.blocked ? "On hold" : "Current") : "Pending"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs"><strong>Status:</strong> {reasonForVendor(tracked)}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[10px] uppercase text-muted-foreground">ERP status</div><div className="font-semibold">{tracked.erpStatus}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Payment</div><div className="font-semibold">{tracked.paymentStatus} · bank {tracked.bankStatus}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Due date</div><div className="font-semibold">{tracked.dueDate}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">PO</div><div className="font-semibold">{tracked.poNumber ?? "—"}</div></div>
              </div>
              {tracked.exceptionType && (
                <div className="mt-3 space-y-2">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the AP team about this exception…" className="min-h-[70px] text-xs" />
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={!reply.trim()}
                    onClick={() => {
                      store.updateInvoice(tracked.id, {}, { actor: vendor.name, actorType: "Human", action: "Supplier responded to exception", newValue: reply.trim() });
                      store.pushNotification({ severity: "Medium", title: `Supplier response on ${tracked.id}`, body: reply.trim().slice(0, 120), link: "/exceptions" });
                      setReply("");
                      toast.success("Response sent to the AP team");
                    }}
                  >
                    <Send className="size-3.5" /> Send response
                  </Button>
                </div>
              )}
              <div className="mt-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Updates</div>
                <div className="mt-2 space-y-1.5">
                  {updates.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border p-2 text-[11px]">
                      <div className="font-semibold">{a.action}</div>
                      <div className="text-muted-foreground">{new Date(a.ts).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
