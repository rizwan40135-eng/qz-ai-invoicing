import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, ShoppingCart, PackageCheck, Play, Check, Landmark, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money, AiBlock } from "@/components/qap/primitives";
import { LifecycleRibbon } from "@/components/qap/LifecycleRibbon";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { runMatch, touchlessScore, findDuplicates, fmtPct } from "@/lib/engine";
import { cn } from "@/lib/utils";
import type { PaymentRecord } from "@/lib/types";

export const Route = createFileRoute("/match")({
  head: () => ({
    meta: [
      { title: "Match Studio — Q-AP AI" },
      { name: "description", content: "Explainable 3-way and 2-way invoice matching with line-level variance, configurable tolerance and touchless eligibility." },
      { property: "og:title", content: "Match Studio — Q-AP AI" },
      { property: "og:description", content: "Invoice vs purchase order vs goods receipt, with every rule explained." },
    ],
  }),
  component: MatchStudio,
});

function MatchStudio() {
  const store = useStore();
  const [mode, setMode] = useState<"3-Way" | "2-Way">("3-Way");
  const [ran, setRan] = useState(false);
  const [stage, setStage] = useState(0);

  const inv = useMemo(
    () =>
      store.invoices.find((i) => i.id === store.activeInvoiceId) ??
      store.invoices.find((i) => i.exceptionType === "Quantity Variance") ??
      store.invoices[0]!,
    [store.invoices, store.activeInvoiceId],
  );
  const po = store.getPo(inv.poNumber);
  const grn = store.getGrn(inv.grnNumber);
  const vendor = store.vendors.find((v) => v.id === inv.vendorId);

  const result = useMemo(
    () => runMatch(inv, po, grn, store.tolerances, inv.poNumber ? mode : "Non-PO"),
    [inv, po, grn, store.tolerances, mode],
  );
  const dup = useMemo(() => findDuplicates(inv, store.invoices, store.tolerances.duplicateSensitivity)[0], [inv, store.invoices, store.tolerances.duplicateSensitivity]);
  const touch = useMemo(
    () => touchlessScore(inv, result, dup?.score ?? inv.duplicateRisk, vendor?.riskScore ?? 20, store.tolerances),
    [inv, result, dup, vendor, store.tolerances],
  );

  const runFlow = () => {
    setRan(true);
    setStage(1);
    [2, 3, 4, 5].forEach((s, i) => setTimeout(() => setStage(s), 500 * (i + 1)));
    store.updateInvoice(
      inv.id,
      {
        matchStatus: result.status === "Matched" ? "Matched" : "Review Required",
        matchScore: result.score,
        matchMode: result.mode,
        lifecycle: result.status === "Matched" ? "Matched" : "Review Required",
        exceptionType: result.failures ? (result.rules.find((r) => r.status === "FAIL")?.rule.includes("GRN") ? "GRN Missing" : "Quantity Variance") : null,
        touchlessScore: touch.score,
        touchless: touch.eligible,
      },
      {
        actor: "Match Engine v5.0",
        actorType: "AI",
        action: `${result.mode} match executed — ${result.status}`,
        newValue: `${result.score}%`,
        confidence: result.score,
      },
    );
    toast[result.status === "Matched" ? "success" : "warning"](
      `Match ${result.status}`,
      { description: `${result.passed} rules passed · ${result.warnings} warnings · ${result.failures} exceptions` },
    );
  };

  const approve = () => {
    store.updateInvoice(inv.id, { approvalStatus: "Approved", lifecycle: "Approved" }, {
      actor: store.persona,
      actorType: "Human",
      action: "Invoice approved",
      oldValue: inv.approvalStatus,
      newValue: "Approved",
      reason: "Reviewed in Match Studio",
    });
    toast.success("Invoice approved");
  };
  const postErp = () => {
    store.updateInvoice(inv.id, { erpStatus: "Posted", lifecycle: "Posted" }, {
      actor: `${inv.erp} Connector`,
      actorType: "System",
      action: "Posted to ERP",
      newValue: `DOC-${Math.floor(Math.random() * 9000000 + 1000000)}`,
    });
    toast.success(`Posted to ${inv.erp}`);
  };
  const schedule = () => {
    const p: PaymentRecord = {
      id: `PAY-${Math.floor(Math.random() * 9000 + 1000)}`,
      invoiceId: inv.id,
      vendorName: inv.vendorName,
      value: inv.grossAmount,
      currency: inv.currency,
      dueDate: inv.dueDate,
      discountOpportunity: inv.paymentTerms === "2/10 Net 30" ? Math.round(inv.grossAmount * 0.02) : 0,
      priority: inv.grossAmount > 200000 ? "Critical" : "Normal",
      method: "Bank Transfer",
      erpPaymentId: `${inv.erp === "SAP S/4HANA" ? "SAP" : "ORA"}-PMT-${Math.floor(Math.random() * 900000 + 100000)}`,
      bankReference: `BNK-${Math.floor(Math.random() * 900000 + 100000)}`,
      status: "Scheduled",
      bankStatus: "—",
    };
    store.upsertPayment(p);
    store.updateInvoice(inv.id, { paymentStatus: "Scheduled", lifecycle: "Payment Scheduled" }, {
      actor: "Payments Service",
      actorType: "System",
      action: `Payment scheduled (${p.id})`,
    });
    toast.success(`Payment ${p.id} scheduled`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="04 · Match Studio"
        title="Explainable 3-way and 2-way matching"
        subtitle={`${inv.id} · ${inv.vendorName} · ${inv.businessUnit} · ${inv.country}`}
        actions={
          <>
            <Select value={inv.id} onValueChange={(v) => { store.setActiveInvoiceId(v); setRan(false); }}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {[inv, ...store.invoices.filter((x) => x.id !== inv.id).slice(0, 40)].map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.id} · {i.vendorName.slice(0, 20)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "3-Way" | "2-Way")}>
              <TabsList className="h-9">
                <TabsTrigger value="3-Way">3-Way</TabsTrigger>
                <TabsTrigger value="2-Way">2-Way</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={runFlow} className="gap-1.5">
              <Play className="size-4" /> Run Match
            </Button>
          </>
        }
      />

      <Panel dense className="px-5 py-3.5">
        <LifecycleRibbon stage={inv.lifecycle} />
      </Panel>

      {mode === "2-Way" && (
        <div className="rounded-xl border border-brand/25 bg-brand-soft px-4 py-2.5 text-xs">
          <strong>2-way configured:</strong> material group “{inv.lines[0]?.materialGroup ?? "Subscription"}” is a
          non-stockable category, so no goods receipt is expected. Invoice is compared against the purchase order only.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <DocCard
          icon={<FileText className="size-4" />}
          title="Invoice"
          tone="brand"
          rows={[
            ["Vendor", inv.vendorName],
            ["Invoice #", inv.invoiceNumber],
            ["PO #", inv.poNumber ?? "—"],
            ["Date", inv.invoiceDate],
            ["Currency", inv.currency],
            ["Total", money(inv.grossAmount, inv.currency)],
            ["Tax", money(inv.taxAmount, inv.currency)],
            ["Quantity", String(inv.lines.reduce((a, l) => a + l.invoiceQty, 0))],
          ]}
        />
        <DocCard
          icon={<ShoppingCart className="size-4" />}
          title="Purchase Order"
          tone="neutral"
          rows={
            po
              ? [
                  ["Vendor", po.vendorName],
                  ["PO #", po.poNumber],
                  ["Currency", po.currency],
                  ["Ordered Value", money(po.orderedValue, po.currency)],
                  ["Ordered Quantity", String(po.orderedQty)],
                  ["Payment Terms", po.paymentTerms],
                  ["Business Unit", po.businessUnit],
                  ["PO Date", po.date],
                ]
              : [["Status", "No purchase order — Non-PO validation path"]]
          }
        />
        <DocCard
          icon={<PackageCheck className="size-4" />}
          title="Goods Receipt"
          tone={mode === "2-Way" ? "muted" : "neutral"}
          rows={
            mode === "2-Way"
              ? [["Status", "Not required for 2-way match"]]
              : grn
                ? [
                    ["GRN #", grn.grnNumber],
                    ["PO #", grn.poNumber],
                    ["Received Value", money(grn.receivedValue, inv.currency)],
                    ["Received Quantity", String(grn.receivedQty)],
                    ["Receipt Date", grn.receiptDate],
                  ]
                : [["Status", "No goods receipt posted"]]
          }
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.75fr_minmax(310px,1fr)]">
        <Panel className="min-w-0" title="Line-level matching" description={`Tolerance: price ±${store.tolerances.price}% · quantity ±${store.tolerances.quantity}%`} dense>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  {["Line", "Description", "Inv Qty", "PO Qty", "GRN Qty", "Inv Price", "PO Price", "Variance", "Match"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.lines.map((l, i) => (
                  <motion.tr
                    key={l.line}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="tabular px-4 py-2.5">{String(l.line).padStart(2, "0")}</td>
                    <td className="px-4 py-2.5">{l.description}</td>
                    <td className="tabular px-4 py-2.5">{l.invoiceQty}</td>
                    <td className="tabular px-4 py-2.5">{l.poQty}</td>
                    <td className="tabular px-4 py-2.5">{mode === "2-Way" ? "n/a" : (l.grnQty ?? "—")}</td>
                    <td className="tabular px-4 py-2.5">{l.invoicePrice.toLocaleString()}</td>
                    <td className="tabular px-4 py-2.5">{l.poPrice.toLocaleString()}</td>
                    <td className="tabular px-4 py-2.5">{fmtPct(mode === "2-Way" ? l.priceVariance : l.grnVariance || l.priceVariance)}</td>
                    <td className="px-4 py-2.5">
                      <Pill tone={l.status === "MATCH" ? "pass" : l.status === "WARNING" ? "warning" : "fail"}>{l.status}</Pill>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1.5 border-t border-border px-5 py-3">
            {result.rules.map((r) => (
              <div key={r.rule} className="flex flex-wrap items-center gap-2 text-xs">
                <Pill tone={r.status === "PASS" ? "pass" : r.status === "WARNING" ? "warning" : r.status === "FAIL" ? "fail" : "neutral"}>{r.status}</Pill>
                <span className="font-semibold">{r.rule}</span>
                <span className="text-muted-foreground">expected {r.expected} · actual {r.actual}</span>
                <span className="ml-auto hidden text-muted-foreground md:block">{r.detail}</span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title="Match result">
            <div className="flex items-center gap-4">
              <ScoreRing score={result.score} />
              <div className="space-y-1 text-sm">
                <Pill tone={result.status === "Matched" ? "pass" : "warning"}>{result.status === "Matched" ? "TOUCHLESS MATCH" : "REVIEW REQUIRED"}</Pill>
                <div className="tabular text-xs text-muted-foreground">
                  {result.passed} rules passed · {result.warnings} warnings · {result.failures} exceptions
                </div>
                <div className="text-xs text-muted-foreground">Mode: {result.mode}</div>
              </div>
            </div>
            <div className="mt-3">
              <AiBlock>{result.explanation}</AiBlock>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href="/exceptions">View Exception</a>
              </Button>
              <Button size="sm" variant="outline" onClick={() => store.setTolerances({ quantity: Math.min(10, store.tolerances.quantity + 1) })}>
                Change Tolerance
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  store.pushNotification({ severity: "Medium", title: `GRN review requested for ${inv.id}`, body: "Receiving team notified to confirm outstanding quantity.", link: "/exceptions" });
                  toast.success("GRN review requested");
                }}
              >
                Request GRN Review
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  store.updateInvoice(inv.id, { matchStatus: "Matched", exceptionType: null, lifecycle: "Matched", matchScore: 100 }, {
                    actor: store.persona,
                    actorType: "Human",
                    action: "Tolerance override approved",
                    oldValue: `${result.score}%`,
                    newValue: "Override accepted",
                    reason: "Business confirmation received",
                  });
                  toast.success("Override approved", { description: "Recorded in the audit trail with reason." });
                }}
              >
                Approve Override
              </Button>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Tolerance engine</div>
              {[
                ["Price", store.tolerances.price, (v: number) => store.setTolerances({ price: v }), 5],
                ["Quantity", store.tolerances.quantity, (v: number) => store.setTolerances({ quantity: v }), 10],
                ["Tax", store.tolerances.tax, (v: number) => store.setTolerances({ tax: v }), 3],
                ["Freight", store.tolerances.freight, (v: number) => store.setTolerances({ freight: v }), 10],
                ["Service", store.tolerances.service, (v: number) => store.setTolerances({ service: v }), 10],
              ].map(([label, value, setter, max]) => (
                <div key={label as string} className="flex items-center gap-3 py-1">
                  <span className="w-[70px] text-xs text-muted-foreground">{label as string}</span>
                  <Slider
                    value={[value as number]}
                    min={0}
                    max={max as number}
                    step={0.25}
                    onValueChange={([v]) => (setter as (n: number) => void)(v!)}
                    className="flex-1"
                  />
                  <span className="tabular w-[52px] text-right text-xs font-semibold">±{(value as number).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Touchless eligibility" description="Calculated from the live match, duplicate and confidence signals">
            <div className="flex items-center justify-between">
              <div className={cn("tabular text-3xl font-bold", touch.eligible ? "text-success" : "text-warning")}>{touch.score}</div>
              <Pill tone={touch.eligible ? "pass" : "warning"}>{touch.eligible ? "AUTO-PROCESS ELIGIBLE" : "HUMAN REVIEW"}</Pill>
            </div>
            <div className="mt-3 space-y-1">
              {touch.factors.map((f) => (
                <div key={f.factor} className="flex items-center gap-2 text-xs">
                  <span className="w-[160px] text-muted-foreground">{f.factor}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", f.ok ? "bg-success" : "bg-warning")} style={{ width: `${(f.points / f.max) * 100}%` }} />
                  </div>
                  <span className="tabular w-[120px] text-right">{f.value}</span>
                </div>
              ))}
            </div>
            {touch.blockers.length > 0 && (
              <div className="mt-3 rounded-lg bg-warning-soft p-2.5 text-xs text-warning">
                <strong>Preventing straight-through processing:</strong> {touch.blockers.join(" · ")}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <AnimatePresence>
        {ran && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Panel title="Process the invoice" description="Every step writes to the audit trail">
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  { label: "Duplicate check", done: stage >= 1, detail: dup ? `Top similarity ${dup.score}% (${dup.candidateId})` : "No similar invoice found" },
                  { label: "Approve", done: inv.approvalStatus === "Approved" || inv.approvalStatus === "Auto Approved", detail: inv.approvalStatus, action: approve },
                  { label: "Post to ERP", done: inv.erpStatus === "Posted", detail: inv.erp, action: postErp },
                  { label: "Schedule payment", done: inv.paymentStatus === "Scheduled" || inv.paymentStatus === "Beneficiary Credited", detail: inv.paymentStatus, action: schedule },
                  { label: "Bank status", done: inv.bankStatus === "Credited", detail: inv.bankStatus, link: "/payments" },
                ].map((s) => (
                  <div key={s.label} className={cn("rounded-xl border p-3.5", s.done ? "border-success/30 bg-success-soft" : "border-border")}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold">{s.label}</span>
                      {s.done && <Check className="size-4 text-success" />}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{s.detail}</div>
                    {s.action && !s.done && (
                      <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-[11px]" onClick={s.action}>
                        Run <ArrowRight className="size-3" />
                      </Button>
                    )}
                    {s.link && (
                      <Button size="sm" variant="ghost" className="mt-2 h-7 w-full gap-1 text-[11px]" asChild>
                        <a href={s.link}>
                          <Landmark className="size-3" /> Payments
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DocCard({
  icon,
  title,
  rows,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  rows: [string, string][];
  tone: "brand" | "neutral" | "muted";
}) {
  return (
    <div className={cn("panel p-5", tone === "brand" && "border-brand/40", tone === "muted" && "opacity-70")}>
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span className={cn("grid size-7 place-items-center rounded-lg", tone === "brand" ? "bg-brand text-brand-foreground" : "bg-muted text-foreground")}>{icon}</span>
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      <dl className="mt-3 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular truncate text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 98 ? "text-success" : score >= 85 ? "text-brand" : "text-warning";
  return (
    <div className="relative grid size-24 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="42" strokeWidth="9" className="fill-none stroke-muted" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          strokeWidth="9"
          strokeLinecap="round"
          className={cn("fill-none stroke-current", tone)}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: score / 100 }}
          transition={{ duration: 1 }}
          style={{ strokeDasharray: 1, strokeDashoffset: 0, pathLength: score / 100 }}
        />
      </svg>
      <span className={cn("tabular text-2xl font-bold", tone)}>{score}%</span>
    </div>
  );
}
