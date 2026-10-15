import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Mail, Globe, FileCode2, Plug, Server, Boxes, FileText, Loader2, CheckCircle2, Download, Ban, TriangleAlert, Play, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, Confidence, money } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fetchAsFile, useInvoiceProcessor, type ProcessedItem } from "@/lib/useProcessor";
import { useMailProcessing } from "@/components/qap/MailCollector";
import { SAMPLE_DOCS, sampleUrl } from "@/lib/samples";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export const Route = createFileRoute("/intake")({
  head: () => ({
    meta: [
      { title: "Invoice Intake — Q-AP AI" },
      { name: "description", content: "Capture invoices from email, vendor portal, e-invoice and upload. Each invoice is read, matched against SAP and Oracle purchase orders and goods receipts, and routed automatically." },
      { property: "og:title", content: "Invoice Intake — Q-AP AI" },
      { property: "og:description", content: "Upload an invoice and watch it be read, matched and routed in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Intake,
});

const SOURCES: { name: Invoice["source"]; icon: typeof Mail }[] = [
  { name: "Email", icon: Mail },
  { name: "Vendor Portal", icon: Globe },
  { name: "Manual Upload", icon: Upload },
  { name: "E-Invoice", icon: FileCode2 },
  { name: "API", icon: Plug },
  { name: "SFTP", icon: Server },
  { name: "Bulk Import", icon: Boxes },
];

const decisionTone = (d?: string) =>
  !d ? "neutral" : d.startsWith("Touchless") ? "pass" : d.startsWith("Routed") ? "info" : d.startsWith("Blocked") ? "fail" : "warning";

function Intake() {
  const store = useStore();
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { items, busy, processFiles } = useInvoiceProcessor();
  const { processMail, busy: mailBusy } = useMailProcessing();
  const [bulkStats, setBulkStats] = useState<{ files: number; ms: number } | null>(null);

  const run = async (files: File[], source: Invoice["source"]) => {
    const t0 = performance.now();
    const res = await processFiles(files, source);
    const done = res.filter((r) => r.status === "done").length;
    const blocked = res.filter((r) => r.status === "blocked").length;
    if (files.length > 1) setBulkStats({ files: files.length, ms: performance.now() - t0 });
    toast.success(`${done} invoice(s) processed${blocked ? ` · ${blocked} blocked as duplicate` : ""}`);
  };

  const runSamples = async (list: typeof SAMPLE_DOCS) => {
    const files = await Promise.all(list.map((s) => fetchAsFile(sampleUrl(s.file), s.file)));
    await run(files, list.length > 1 ? "Bulk Import" : "Manual Upload");
  };

  const counts = SOURCES.map((s) => ({ ...s, count: store.invoices.filter((i) => i.source === s.name).length }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="02 · Invoice Intake"
        title="Capture invoices from every channel"
        subtitle="Upload invoices only — purchase orders and goods receipts are retrieved from SAP S/4HANA and Oracle Fusion and matched automatically."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {counts.map((s, i) => (
          <motion.div key={s.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="panel p-3.5">
            <s.icon className="size-4 text-brand" />
            <div className="tabular mt-2 text-xl font-semibold">{s.count}</div>
            <div className="text-[11px] text-muted-foreground">{s.name}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <Panel title="Upload invoices" description="PDF, scanned PDF, JPEG, PNG, single/multi-page TIFF, XML and JSON e-invoices · select many files at once">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void run(Array.from(e.dataTransfer.files), "Manual Upload");
              }}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                dragging ? "border-flame bg-flame-soft" : "border-border hover:border-brand/50 hover:bg-brand-soft/40",
              )}
            >
              <motion.div animate={{ y: dragging ? -6 : 0 }} className="grid size-14 place-items-center rounded-2xl bg-brand text-brand-foreground">
                {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
              </motion.div>
              <p className="mt-4 text-sm font-semibold">Drop invoices here or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">Each file is read, checked for duplicates, matched to its PO and goods receipt, and routed.</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.xml,.json,.txt,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                onChange={(e) => {
                  void run(Array.from(e.target.files ?? []), "Manual Upload");
                  e.target.value = "";
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => fileRef.current?.click()} className="gap-1.5" disabled={busy}>
                <Upload className="size-4" /> Upload Invoices
              </Button>
              {bulkStats && (
                <span className="text-[11px] text-muted-foreground">
                  Last batch: {bulkStats.files} files in {(bulkStats.ms / 1000).toFixed(1)}s · {((bulkStats.files / bulkStats.ms) * 60000).toFixed(0)} invoices/min
                </span>
              )}
            </div>

            <AnimatePresence>
              {items.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2">
                  {items.map((r) => (
                    <ResultRow key={r.id} r={r} onOpen={(to, id) => { if (id) store.setActiveInvoiceId(id); void navigate({ to }); }} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>

          <Panel title="Sample invoices" description="Download any file to upload it yourself, or process it directly">
            <div className="divide-y divide-border">
              {SAMPLE_DOCS.map((s) => (
                <div key={s.file} className="flex flex-wrap items-center gap-3 py-2.5">
                  <FileText className="size-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">{s.file} · {s.expect}</div>
                  </div>
                  <Pill tone="info">{s.format}</Pill>
                  <Button asChild size="sm" variant="ghost" className="h-8 gap-1">
                    <a href={sampleUrl(s.file)} download={s.file}>
                      <Download className="size-3.5" /> Download
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1" disabled={busy} onClick={() => void runSamples([s])}>
                    <Play className="size-3.5" /> Process
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          title="AP Mailbox"
          description="ap-invoices@novaglobal.com"
          actions={
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">Auto-collect</span>
              <Switch checked={store.autoCollect} onCheckedChange={(v) => { store.setAutoCollect(v); toast.success(v ? "Automatic email collection on" : "Automatic email collection off"); }} />
            </div>
          }
        >
          <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <span>{store.mail.filter((m) => !m.processed).length} unprocessed · invoices and attachments are collected and read automatically when auto-collect is on</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              disabled={mailBusy}
              onClick={async () => {
                const next = store.mail.filter((m) => !m.processed);
                if (!next.length) {
                  toast.info("Mailbox is up to date");
                  return;
                }
                for (const m of next) await processMail(m);
              }}
            >
              <RefreshCw className={cn("size-3.5", mailBusy && "animate-spin")} /> Collect now
            </Button>
          </div>
          <div className="space-y-2">
            {store.mail.map((m) => (
              <div key={m.id} className="rounded-xl border border-border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{m.subject}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.sender} · {m.senderEmail} · {m.received}
                    </div>
                  </div>
                  {m.processed ? (
                    <Pill tone="pass">
                      <CheckCircle2 className="size-3" /> {m.invoiceId}
                    </Pill>
                  ) : (
                    <Pill tone="warning">New</Pill>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{m.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.attachments.map((a) => (
                    <a key={a.name} href={a.url} download className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted">
                      <FileText className="size-3" /> {a.name} · {a.size}
                    </a>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pill tone="info">{m.classification}</Pill>
                    <Confidence value={m.confidence} />
                  </div>
                  {m.processed ? (
                    <Button size="sm" variant="outline" onClick={() => { store.setActiveInvoiceId(m.invoiceId ?? null); void navigate({ to: "/document-ai" }); }}>
                      Open
                    </Button>
                  ) : (
                    <Button size="sm" disabled={mailBusy} onClick={() => void processMail(m)}>
                      Process Invoice
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ResultRow({ r, onOpen }: { r: ProcessedItem; onOpen: (to: string, id?: string) => void }) {
  const [open, setOpen] = useState(false);
  const inv = r.outcome?.invoice;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        {r.status === "reading" || r.status === "queued" ? (
          <Loader2 className="size-4 animate-spin text-brand" />
        ) : r.status === "blocked" ? (
          <Ban className="size-4 text-danger" />
        ) : r.status === "error" ? (
          <TriangleAlert className="size-4 text-danger" />
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{r.fileName}</div>
          <div className={cn("text-[11px] text-muted-foreground", (r.status === "reading" || r.status === "queued") && "ai-shimmer font-semibold")}>
            {r.status === "blocked" ? r.blockedReason : inv ? `${inv.id} · ${inv.vendorName} · ${money(inv.grossAmount, inv.currency)} · ${r.extraction?.method}` : r.stage}
          </div>
        </div>
        {r.extraction && <Pill tone="info">{r.extraction.classification.type}</Pill>}
        {r.extraction && r.status === "done" && <Confidence value={inv?.extractionConfidence ?? 0} />}
        {r.status === "done" && <Pill tone={decisionTone(r.outcome?.decision) as "pass"}>{r.outcome?.decision}</Pill>}
        {r.status === "blocked" && <Pill tone="fail">Blocked</Pill>}
        {inv && (
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Details"}
          </Button>
        )}
      </div>
      {open && inv && r.outcome && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-1.5 md:grid-cols-2">
            {r.outcome.steps.map((s) => (
              <div key={s.label} className="flex items-start gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px]">
                <Pill tone={s.status === "PASS" ? "pass" : s.status === "FAIL" ? "fail" : s.status === "WARNING" ? "warning" : "neutral"}>{s.status}</Pill>
                <div>
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-muted-foreground">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
          {inv.pages && inv.pages.length > 1 && (
            <div className="text-[11px] text-muted-foreground">Pages: {inv.pages.map((p) => `p${p.page} ${p.type}`).join(" · ")}</div>
          )}
          {r.outcome.match && <p className="text-xs">{r.outcome.match.explanation}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpen("/document-ai", inv.id)}>Document AI</Button>
            {inv.poNumber && <Button size="sm" variant="outline" onClick={() => onOpen("/match", inv.id)}>Match Studio</Button>}
            {inv.exceptionType && inv.exceptionType !== "Duplicate Risk" && <Button size="sm" variant="outline" onClick={() => onOpen("/exceptions", inv.id)}>Exception Center</Button>}
            {inv.exceptionType === "Duplicate Risk" && <Button size="sm" variant="outline" onClick={() => onOpen("/duplicates", inv.id)}>Duplicate review</Button>}
            {inv.lifecycle === "Validated" && <Button size="sm" variant="outline" onClick={() => onOpen("/approvals", inv.id)}>Approvals</Button>}
            {inv.paymentStatus === "Scheduled" && <Button size="sm" variant="outline" onClick={() => onOpen("/payments", inv.id)}>Payments</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
