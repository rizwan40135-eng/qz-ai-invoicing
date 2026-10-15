import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  FileInput,
  Tags,
  Scissors,
  ScanLine,
  Braces,
  Table2,
  ShieldCheck,
  Gauge,
  Sparkle,
  Check,
  Loader2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, Confidence, money, AiBlock } from "@/components/qap/primitives";
import { LifecycleRibbon } from "@/components/qap/LifecycleRibbon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";
import { previewRegistry, previewFromBlob } from "@/lib/extract";
import { getOriginal } from "@/lib/fileVault";
import { useAiAsk } from "@/lib/useAiAsk";

export const Route = createFileRoute("/document-ai")({
  head: () => ({
    meta: [
      { title: "Document AI — Q-AP AI" },
      { name: "description", content: "Classify, split and extract invoice documents with field-level confidence, source location and human correction." },
      { property: "og:title", content: "Document AI — Q-AP AI" },
      { property: "og:description", content: "Animated classification and extraction pipeline with confidence scoring." },
    ],
  }),
  component: DocumentAI,
});

const PIPELINE = [
  { label: "Document Received", icon: FileInput },
  { label: "Document Classification", icon: Tags },
  { label: "Page Separation", icon: Scissors },
  { label: "OCR / Text Extraction", icon: ScanLine },
  { label: "Field Extraction", icon: Braces },
  { label: "Line Item Extraction", icon: Table2 },
  { label: "Validation", icon: ShieldCheck },
  { label: "Confidence Scoring", icon: Gauge },
];

const CLASSES = [
  "PO Invoice",
  "Non-PO Invoice",
  "Intercompany",
  "Service Invoice",
  "Employee Reimbursement",
  "Import / Customs",
  "Utility",
  "Freight / Logistics",
  "Credit Note",
  "Debit Note",
  "Other",
];

function DocumentAI() {
  const store = useStore();
  const navigate = useNavigate();
  const active = useMemo(() => {
    return (
      store.invoices.find((i) => i.id === store.activeInvoiceId) ??
      store.invoices.find((i) => i.uploaded) ??
      store.invoices.find((i) => i.exceptionType) ??
      store.invoices[0]!
    );
  }, [store.invoices, store.activeInvoiceId]);
  const [restored, setRestored] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!active || previewRegistry.get(active.id)?.url) return;
    let live = true;
    getOriginal(active.id)
      .then((o) => (o ? previewFromBlob(o.blob, o.name) : null))
      .then((url) => { if (live && url) setRestored({ id: active.id, url }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [active?.id]);


  const [highlight, setHighlight] = useState<string | null>(null);
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [q, setQ] = useState("");


  const fields = buildFields(active);

  const ai = useAiAsk();
  const answerDoc = async (question: string) => {
    setQ("");
    const local = localAnswer(question);
    setChat((c) => [...c, { q: question, a: "Q AI is reading the document…" }]);
    const a = await ai.ask(`${question} (about invoice ${active.id})`, "Invoice Analyst", active, () => local);
    setChat((c) => c.map((x, i) => (i === c.length - 1 ? { q: question, a } : x)));
  };
  const localAnswer = (question: string) => {
    const s = question.toLowerCase();
    let a: string;
    if (s.includes("total")) a = `The invoice total is ${money(active.grossAmount, active.currency)} (net ${money(active.netAmount, active.currency)} plus tax ${money(active.taxAmount, active.currency)}).`;
    else if (s.includes("po")) a = active.poNumber ? `This document references purchase order ${active.poNumber}.` : "No purchase order reference was found — this is a Non-PO invoice.";
    else if (s.includes("terms")) a = `Payment terms are ${active.paymentTerms}, giving a due date of ${active.dueDate}.`;
    else if (s.includes("mismatch") || s.includes("line")) {
      const bad = active.lines.find((l) => l.grnQty !== null && l.grnQty !== l.invoiceQty);
      a = bad ? `Line ${bad.line} (${bad.description}) is mismatched: ${bad.grnQty} received of ${bad.invoiceQty} invoiced.` : "No line-level mismatch was detected on this document.";
    } else if (s.includes("tax")) a = `Tax amount is ${money(active.taxAmount, active.currency)} — an effective rate of ${((active.taxAmount / Math.max(1, active.netAmount)) * 100).toFixed(2)}%.`;
    else if (s.includes("missing")) a = active.grnNumber ? "All expected supporting documents are present: invoice, purchase order and goods receipt." : "The goods receipt note is missing for this document.";
    else a = `This ${active.invoiceType.toLowerCase()} from ${active.vendorName} is dated ${active.invoiceDate} for ${money(active.grossAmount, active.currency)}, references ${active.poNumber ?? "no PO"} and currently sits at "${active.lifecycle}".`;
    return a;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="03 · Document AI"
        title="Classify and extract invoices intelligently"
        subtitle={`Active document: ${active.fileName ?? active.invoiceNumber} · ${active.vendorName}`}
        actions={
          <>
            <Select value={active.id} onValueChange={(v) => store.setActiveInvoiceId(v)}>
              <SelectTrigger className="h-9 w-[320px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {[active, ...store.invoices.filter((x) => x.id !== active.id).slice(0, 40)].map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoiceNumber} · {i.vendorName.slice(0, 20)} <span className="text-muted-foreground">({i.id})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => navigate({ to: "/match" })}>Continue to Match Studio</Button>
          </>
        }
      />

      <Panel dense className="px-5 py-3.5">
        <LifecycleRibbon stage={active.lifecycle} />
        <NextStep inv={active} />
      </Panel>

      <Panel title="Extraction pipeline" description="Result of each stage for the active document">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {stageResults(active, fields.length).map((r, i) => {
            const P = PIPELINE[i]!;
            return (
              <div key={P.label} className={cn("rounded-xl border p-3", r.ok ? "border-success/30 bg-success-soft" : "border-warning/40 bg-warning-soft")}>
                <div className="flex items-center justify-between">
                  <P.icon className={cn("size-4", r.ok ? "text-success" : "text-warning")} />
                  {r.ok ? <Check className="size-3.5 text-success" /> : <span className="text-[10px] font-bold text-warning">CHECK</span>}
                </div>
                <div className="mt-2 text-[11px] font-semibold leading-tight">{P.label}</div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground">{r.detail}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <div className="space-y-4">
          <Panel title="Classification" description="Model: Classifier v4.2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold uppercase tracking-tight text-brand">{active.invoiceType}</div>
                <div className="mt-1 text-xs text-muted-foreground">Confidence</div>
              </div>
              <Confidence value={active.classificationConfidence} />
            </div>
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Signals</div>
              <ul className="mt-1.5 space-y-1 text-sm">
                {signalsFor(active).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-flame" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Select
                value={active.invoiceType}
                onValueChange={(v) => {
                  store.updateInvoice(active.id, { invoiceType: v as Invoice["invoiceType"] }, {
                    actor: "AP Processor",
                    actorType: "Human",
                    action: "Classification corrected",
                    oldValue: active.invoiceType,
                    newValue: v,
                    reason: "Manual reclassification",
                  });
                  toast.success("Classification updated", { description: "Captured as a learning event for similar documents." });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Panel>

          <Panel title="Document preview" description={active.fileName ? `${active.fileName} · ${active.fileType}` : "Source document"}>
            {(() => {
              const pv = previewRegistry.get(active.id) ?? (restored?.id === active.id ? { url: restored.url, kind: "image" as const, pages: [] } : undefined);
              const pages = pv?.pages ?? [];
              return (
                <>
                  {!pv?.url && (
                    <Button variant="outline" size="sm" className="mb-3" onClick={async () => {
                      const o = await getOriginal(active.id).catch(() => null);
                      if (!o) return void toast.info("No original file — this invoice arrived as structured data. Use All Invoices to view its copy.");
                      window.open(URL.createObjectURL(o.blob), "_blank", "noopener");
                    }}>Open original file</Button>
                  )}
                  {pv?.url && (pv.kind === "pdf" ? (
                    <iframe title="Original document" src={pv.url} className="mb-3 h-[420px] w-full rounded-xl border border-border bg-background" />
                  ) : pv.kind === "image" ? (
                    <img src={pv.url} alt={active.fileName ?? "Uploaded invoice"} className="mb-3 max-h-[420px] w-full rounded-xl border border-border object-contain" />
                  ) : null)}
                  {pages.length > 0 && (
                    <div className="mb-3 flex gap-2 overflow-x-auto">
                      {pages.map((pg) => (
                        <div key={pg.page} className="w-[110px] shrink-0 rounded-lg border border-border p-1.5 text-[10px]">
                          {pg.image ? <img src={pg.image} alt={`Page ${pg.page}`} className="h-[120px] w-full rounded object-cover object-top" /> : <div className="grid h-[120px] place-items-center rounded bg-surface-2 text-muted-foreground">Page {pg.page}</div>}
                          <div className="mt-1 font-semibold">p{pg.page} · {pg.type}</div>
                          <div className="text-muted-foreground">{pg.confidence.toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Extracted view</div>
            <div className="mt-1 rounded-xl border border-border bg-surface-2 p-4 text-[11px] leading-relaxed">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold">{active.vendorName}</div>
                  <div className="text-muted-foreground">TRN {store.vendors.find((v) => v.id === active.vendorId)?.taxId ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className={cn("font-bold", highlight === "invoiceNumber" && "rounded bg-flame-soft px-1 text-flame")}>
                    {active.invoiceNumber}
                  </div>
                  <div className={cn(highlight === "invoiceDate" && "rounded bg-flame-soft px-1 text-flame")}>{active.invoiceDate}</div>
                </div>
              </div>
              <div className={cn("mt-3", highlight === "poNumber" && "rounded bg-flame-soft px-1 text-flame")}>
                PO Reference: {active.poNumber ?? "—"} · GRN: {active.grnNumber ?? "—"}
              </div>
              <table className="mt-3 w-full">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                    <th className="py-1">Description</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-right">Price</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {active.lines.map((l) => (
                    <tr key={l.line} className="border-b border-border/50">
                      <td className="py-1">{l.description}</td>
                      <td className="tabular py-1 text-right">{l.invoiceQty}</td>
                      <td className="tabular py-1 text-right">{l.invoicePrice.toLocaleString()}</td>
                      <td className="tabular py-1 text-right">{(l.invoiceQty * l.invoicePrice).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-col items-end gap-0.5">
                <span>Net: {money(active.netAmount, active.currency)}</span>
                <span className={cn(highlight === "taxAmount" && "rounded bg-flame-soft px-1 text-flame")}>
                  Tax: {money(active.taxAmount, active.currency)}
                </span>
                <span className="text-sm font-bold">Total: {money(active.grossAmount, active.currency)}</span>
              </div>
              {active.extractedText && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
                    Raw text read from your uploaded file
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                    {active.extractedText.slice(0, 1500)}
                  </pre>
                </details>
              )}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {["Invoice", "Purchase Order", "Delivery Note", "Tax Document"].map((t, i) => (
                <div key={t} className={cn("rounded-lg border p-2 text-center text-[10px]", i === 0 ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border text-muted-foreground")}>
                  <div className="mx-auto mb-1 h-10 w-8 rounded-sm border border-current opacity-40" />
                  {t}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title="Extracted fields"
            description="Click a field to highlight it in the document · edit any value to correct it"
            actions={<Pill tone={active.extractionConfidence >= 90 ? "pass" : "warning"}>Overall {active.extractionConfidence.toFixed(1)}%</Pill>}
            dense
          >
            <div className="divide-y divide-border">
              {fields.map((f) => (
                <div
                  key={f.key}
                  className="flex flex-wrap items-center gap-3 px-5 py-2.5 hover:bg-muted/40"
                  onMouseEnter={() => setHighlight(f.key)}
                  onMouseLeave={() => setHighlight(null)}
                >
                  <div className="w-[150px] shrink-0 text-xs text-muted-foreground">{f.label}</div>
                  <Input
                    defaultValue={f.value}
                    className="h-8 w-[200px] text-[13px]"
                    onBlur={(e) => {
                      if (e.target.value === f.value) return;
                      store.updateInvoice(active.id, patchFor(f.key, e.target.value, active), {
                        actor: "AP Processor",
                        actorType: "Human",
                        action: `Field corrected: ${f.label}`,
                        oldValue: f.value,
                        newValue: e.target.value,
                        reason: "Manual correction in Document AI",
                      });
                      toast.success(`${f.label} updated`, { description: "Corrected value will be used in matching." });
                    }}
                  />
                  <Confidence value={f.confidence} />
                  <span className="text-[11px] text-muted-foreground">{f.source}</span>
                  <Pill tone={f.confidence >= 90 ? "pass" : "warning"} className="ml-auto">
                    {f.confidence >= 90 ? "Accepted" : "Review suggested"}
                  </Pill>
                </div>
              ))}
            </div>
          </Panel>

          {active.customs && (
            <Panel title="Import / customs detail">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <KV label="Declaration Number" value={active.customs.declarationNumber} />
                <KV label="Declaration Date" value={active.customs.declarationDate} />
                <KV label="Authority" value={active.customs.authority} />
                <KV label="Customs Duty" value={money(active.customs.duty, active.currency)} />
                <KV label="Declared Value" value={money(active.customs.declaredValue, active.currency)} />
                <KV label="Invoice Value" value={money(active.grossAmount, active.currency)} />
              </div>
            </Panel>
          )}

          <Panel title="Ask about this document" description="Answers use the extracted content of the active document">
            <div className="flex flex-wrap gap-1.5">
              {["What is the invoice total?", "What PO does this reference?", "What are the payment terms?", "Which line is mismatched?", "What is the tax amount?", "Summarize the invoice.", "What supporting document is missing?"].map((s) => (
                <button key={s} onClick={() => answerDoc(s)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:border-brand/50 hover:bg-brand-soft">
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) answerDoc(q);
              }}
              className="mt-3 flex gap-2"
            >
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this document…" className="h-9" />
              <Button type="submit" size="sm" className="h-9 gap-1.5">
                <Sparkle className="size-4" /> Ask
              </Button>
            </form>
            <div className="mt-3 space-y-2">
              {chat.map((c, i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="text-[11px] font-semibold text-brand">{c.q}</div>
                  <div className="mt-1 whitespace-pre-line text-sm">{c.a}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <AiBlock title="AI invoice summary">
                This {money(active.grossAmount, active.currency)} invoice from {active.vendorName} references{" "}
                {active.poNumber ?? "no purchase order"}. Vendor and unit prices{" "}
                {active.lines.every((l) => l.invoicePrice === l.poPrice) ? "match the purchase order" : "deviate from the purchase order"}.{" "}
                {(() => {
                  const bad = active.lines.find((l) => l.grnQty !== null && l.grnQty < l.invoiceQty);
                  return bad
                    ? `Line ${bad.line} has a ${(((bad.invoiceQty - bad.grnQty!) / bad.invoiceQty) * 100).toFixed(0)}% quantity variance because ${bad.grnQty} of ${bad.invoiceQty} invoiced units have been received. Payment should remain partially blocked pending GRN confirmation.`
                    : "All invoiced quantities are supported by receipts, so the invoice is eligible to proceed.";
                })()}
              </AiBlock>
            </div>
          </Panel>
        </div>
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

function signalsFor(inv: Invoice) {
  switch (inv.invoiceType) {
    case "Freight / Logistics":
      return ["Carrier tax ID present", "Freight reference detected", "Transport service description", "No material line items"];
    case "Import / Customs":
      return ["Customs declaration reference", "Duty line detected", "Import consignment reference"];
    case "Non-PO Invoice":
      return ["No purchase order reference found", "Service-style description", "Business owner routing required"];
    default:
      return ["Purchase order reference present", "Material line items detected", "Vendor tax ID matched to master data"];
  }
}

function buildFields(inv: Invoice) {
  const c = inv.extractionConfidence;
  return [
    { key: "vendorName", label: "Supplier Name", value: inv.vendorName, confidence: Math.min(99.4, c + 1.2), source: "Header block" },
    { key: "taxId", label: "Supplier Tax ID", value: inv.vendorId, confidence: Math.max(70, c - 3.1), source: "Header block" },
    { key: "invoiceNumber", label: "Invoice Number", value: inv.invoiceNumber, confidence: Math.min(99.4, c + 2), source: "Top right" },
    { key: "poNumber", label: "PO Number", value: inv.poNumber ?? "", confidence: inv.poNumber ? Math.min(98.7, c + 1) : 0, source: "Reference line" },
    { key: "grnNumber", label: "GRN Number", value: inv.grnNumber ?? "", confidence: inv.grnNumber ? Math.max(72, c - 6) : 0, source: "Reference line" },
    { key: "invoiceDate", label: "Invoice Date", value: inv.invoiceDate, confidence: Math.min(98, c), source: "Header block" },
    { key: "currency", label: "Currency", value: inv.currency, confidence: 97.8, source: "Amount column" },
    { key: "grossAmount", label: "Invoice Value", value: String(inv.grossAmount), confidence: Math.min(99, c + 0.6), source: "Totals block" },
    { key: "netAmount", label: "Net Value", value: String(inv.netAmount), confidence: Math.min(97, c), source: "Totals block" },
    { key: "taxAmount", label: "Tax Amount", value: String(inv.taxAmount), confidence: Math.max(70, c - 12.5), source: "Totals block" },
    { key: "paymentTerms", label: "Payment Terms", value: inv.paymentTerms, confidence: Math.max(80, c - 5), source: "Footer" },
  ];
}

function patchFor(key: string, value: string, inv: Invoice): Partial<Invoice> {
  const n = Number(value.replace(/[^0-9.\-]/g, ""));
  switch (key) {
    case "vendorName":
      return { vendorName: value };
    case "invoiceNumber":
      return { invoiceNumber: value };
    case "poNumber":
      return { poNumber: value || null };
    case "grnNumber":
      return { grnNumber: value || null };
    case "invoiceDate":
      return { invoiceDate: value };
    case "currency":
      return { currency: value };
    case "grossAmount":
      return { grossAmount: n, netAmount: Math.max(0, n - inv.taxAmount) };
    case "netAmount":
      return { netAmount: n, grossAmount: n + inv.taxAmount };
    case "taxAmount":
      return { taxAmount: n, grossAmount: inv.netAmount + n };
    case "paymentTerms":
      return { paymentTerms: value };
    default:
      return {};
  }
}

function stageResults(i: Invoice, fieldCount: number) {
  const pages = i.pages?.length ?? 1;
  return [
    { ok: true, detail: `${i.source ?? "Captured"}${i.fileName ? ` · ${i.fileName}` : ""}` },
    { ok: i.classificationConfidence >= 85, detail: `${i.invoiceType} · ${i.classificationConfidence.toFixed(1)}%` },
    { ok: true, detail: `${pages} page${pages > 1 ? "s" : ""}` },
    { ok: i.extractionConfidence >= 60, detail: `${i.language} text read` },
    { ok: fieldCount > 0, detail: `${fieldCount} header fields` },
    { ok: i.lines.length > 0 || i.invoiceType !== "PO Invoice", detail: `${i.lines.length} line items` },
    { ok: !i.exceptionType, detail: i.exceptionType ?? "All checks passed" },
    { ok: i.extractionConfidence >= 90, detail: `${i.extractionConfidence.toFixed(1)}% overall` },
  ];
}

/** Tells the user exactly what completes the next lifecycle step, and lets them do it. */
function NextStep({ inv }: { inv: Invoice }) {
  const store = useStore();
  const navigate = useNavigate();
  const go = (to: string) => () => navigate({ to });
  const approve = () => {
    store.approveAndPost(inv.id, store.persona, "Approved from Document AI");
    toast.success(`${inv.id} approved and posted to ${inv.erp}`, { description: "Payment scheduled — release it in Payments." });
  };
  const map: Record<string, [string, string, () => void] | null> = {
    "Review Required": [`Blocked: ${inv.exceptionType ?? "review required"}. Resolve it to continue.`, "Resolve in Exception Center", go("/exceptions")],
    Received: ["Waiting for matching against the PO and goods receipt.", "Open Match Studio", go("/match")],
    Classified: ["Waiting for matching against the PO and goods receipt.", "Open Match Studio", go("/match")],
    Extracted: ["Waiting for matching against the PO and goods receipt.", "Open Match Studio", go("/match")],
    Validated: ["Waiting for matching against the PO and goods receipt.", "Open Match Studio", go("/match")],
    Matched: ["Matched. Needs approval before ERP posting.", "Approve & post to ERP", approve],
    Approved: ["Approved. Post to ERP to schedule payment.", "Post to ERP", approve],
    Posted: ["Posted. Release the payment from the payment run.", "Open Payments", go("/payments")],
    "Payment Scheduled": ["Payment scheduled. A treasury approver releases it to the bank.", "Release in Payments", go("/payments")],
    "Payment Released": ["Released to the bank. Waiting for credit confirmation.", "Track in Payments", go("/payments")],
    "Beneficiary Credited": null,
  };
  const m = map[inv.lifecycle];
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="text-[12px]"><span className="font-semibold">Next step: </span>{m ? m[0] : "Complete — supplier credited. All 10 steps done."}</div>
      {m && <Button size="sm" className="h-7 text-[11px]" onClick={m[2]}>{m[1]}</Button>}
    </div>
  );
}
