import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money, AiBlock } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { duplicateScore, DUP_WEIGHTS } from "@/lib/engine";
import { cn } from "@/lib/utils";

export function DuplicateReview() {
  const store = useStore();
  const [selected, setSelected] = useState<string | null>(null);

  const pairs = useMemo(() => {
    const out: { a: (typeof store.invoices)[number]; b: (typeof store.invoices)[number]; score: number }[] = [];
    const byVendor = new Map<string, typeof store.invoices>();
    store.invoices.forEach((i) => {
      const arr = byVendor.get(i.vendorId) ?? [];
      arr.push(i);
      byVendor.set(i.vendorId, arr);
    });
    byVendor.forEach((list) => {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < Math.min(list.length, i + 6); j++) {
          const r = duplicateScore(list[i]!, list[j]!);
          if (r.score >= store.tolerances.duplicateSensitivity - 5) out.push({ a: list[i]!, b: list[j]!, score: r.score });
        }
      }
    });
    return out.sort((x, y) => y.score - x.score).slice(0, 24);
  }, [store.invoices, store.tolerances.duplicateSensitivity]);

  const current = pairs.find((p) => `${p.a.id}-${p.b.id}` === selected) ?? pairs[0];
  const detail = current ? duplicateScore(current.a, current.b) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="05 · Exception Center · Duplicate review"
        title="Prevent duplicate payments before they are released"
        subtitle="Weighted scoring across vendor, invoice number, amount, date, tax, PO and document similarity."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="Duplicate candidates" description={`${pairs.length} pairs above the configured sensitivity`} dense>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
            {pairs.map((p) => {
              const key = `${p.a.id}-${p.b.id}`;
              const isSel = current && `${current.a.id}-${current.b.id}` === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={cn("flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-muted/50", isSel && "bg-brand-soft")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{p.a.id} ↔ {p.b.id}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{p.a.vendorName} · {money(p.a.grossAmount, p.a.currency)}</div>
                  </div>
                  <Pill tone={p.score > 90 ? "fail" : p.score >= 75 ? "warning" : "neutral"}>{p.score}%</Pill>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3">
              <span className="w-[120px] text-xs text-muted-foreground">Sensitivity</span>
              <Slider value={[store.tolerances.duplicateSensitivity]} min={50} max={98} step={1} onValueChange={([v]) => store.setTolerances({ duplicateSensitivity: v! })} className="flex-1" />
              <span className="tabular w-[36px] text-right text-xs font-semibold">{store.tolerances.duplicateSensitivity}</span>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Bands: &gt;90 high risk · 75–90 review · &lt;75 low risk. Weights: vendor {DUP_WEIGHTS.vendor}% · number {DUP_WEIGHTS.invoiceNumber}% · amount {DUP_WEIGHTS.amount}% · date {DUP_WEIGHTS.date}% · tax {DUP_WEIGHTS.tax}% · PO {DUP_WEIGHTS.po}% · document {DUP_WEIGHTS.document}%.
            </div>
          </div>
        </Panel>

        {current && detail && (
          <div className="space-y-4">
            <Panel title="Duplicate match view" actions={<Pill tone={detail.band === "High Risk" ? "fail" : detail.band === "Review" ? "warning" : "pass"}>{detail.band}</Pill>}>
              <div className="grid grid-cols-2 gap-4">
                {[current.a, current.b].map((x, idx) => (
                  <div key={x.id} className={cn("rounded-xl border p-4", idx === 0 ? "border-brand/40 bg-brand-soft/50" : "border-border")}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{idx === 0 ? "Current invoice" : "Potential match"}</div>
                    <div className="text-sm font-bold">{x.id}</div>
                    <dl className="mt-2 space-y-1 text-xs">
                      <Row k="Invoice #" v={x.invoiceNumber} />
                      <Row k="Vendor" v={x.vendorName} />
                      <Row k="Date" v={x.invoiceDate} />
                      <Row k="Amount" v={money(x.grossAmount, x.currency)} />
                      <Row k="Tax" v={money(x.taxAmount, x.currency)} />
                      <Row k="PO" v={x.poNumber ?? "—"} />
                    </dl>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="tabular text-3xl font-bold text-flame">{detail.score}%</div>
                <div className="text-xs text-muted-foreground">weighted similarity</div>
              </div>

              <div className="mt-3 space-y-1.5">
                {detail.evidence.map((e, i) => (
                  <div key={e.attribute} className="flex items-center gap-3 text-xs">
                    <span className="w-[150px] text-muted-foreground">{e.attribute}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${e.similarity}%` }} transition={{ delay: i * 0.05 }} className={cn("h-full rounded-full", e.similarity > 90 ? "bg-danger" : e.similarity > 70 ? "bg-warning" : "bg-brand")} />
                    </div>
                    <span className="tabular w-[44px] text-right font-semibold">{e.similarity}%</span>
                    <span className="tabular w-[36px] text-right text-muted-foreground">{e.weight}%</span>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <AiBlock>{detail.explanation}</AiBlock>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    store.updateInvoice(current.a.id, { lifecycle: "Review Required", exceptionType: "Duplicate Risk", approvalStatus: "Rejected", paymentStatus: "Not Due" }, { actor: store.persona, actorType: "Human", action: "Invoice blocked as duplicate", newValue: `Matched ${current.b.id}`, reason: `Similarity ${detail.score}%` });
                    toast.success(`${current.a.id} blocked`, { description: `Duplicate of ${current.b.id}` });
                  }}
                >
                  Block Invoice
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    store.updateInvoice(current.a.id, { duplicateRisk: 2, exceptionType: null }, { actor: store.persona, actorType: "Human", action: "Cleared as not duplicate", reason: "Reviewed against supporting documents" });
                    toast.success("Marked as not a duplicate");
                  }}
                >
                  Not Duplicate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    store.pushNotification({ severity: "High", title: `Duplicate investigation opened for ${current.a.id}`, body: `Similarity ${detail.score}% with ${current.b.id}.`, link: "/duplicates" });
                    toast.success("Investigation opened");
                  }}
                >
                  Investigate
                </Button>
              </div>
            </Panel>

            <Panel title="Duplicate network" description="Vendor → invoice cluster">
              <div className="flex items-center gap-8 overflow-x-auto py-4">
                <div className="grid size-24 shrink-0 place-items-center rounded-full border-2 border-brand bg-brand-soft text-center text-[10px] font-bold text-brand">
                  {current.a.vendorName.split(" ").slice(0, 2).join(" ")}
                </div>
                <div className="flex flex-wrap gap-3">
                  {store.invoices
                    .filter((i) => i.vendorId === current.a.vendorId)
                    .slice(0, 8)
                    .map((i) => {
                      const s = duplicateScore(current.a, i).score;
                      const risky = i.id !== current.a.id && s > 75;
                      return (
                        <motion.div
                          key={i.id}
                          whileHover={{ scale: 1.05 }}
                          className={cn("rounded-xl border px-3 py-2 text-[11px]", risky ? "border-danger bg-danger-soft text-danger" : i.id === current.a.id ? "border-brand bg-brand text-brand-foreground" : "border-border")}
                        >
                          <div className="font-semibold">{i.id}</div>
                          <div className="tabular">{money(i.grossAmount, i.currency, true)}</div>
                          {i.id !== current.a.id && <div className="tabular opacity-70">sim {s}%</div>}
                        </motion.div>
                      );
                    })}
                </div>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="tabular truncate font-medium">{v}</dd>
    </div>
  );
}
