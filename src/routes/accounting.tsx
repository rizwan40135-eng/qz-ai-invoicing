import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, Confidence, money, AiBlock } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { suggestCodingAI } from "@/lib/ai.functions";
import { invoiceBrief } from "@/lib/aiContext";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting Intelligence — Q-AP AI" },
      { name: "description", content: "AI G/L, cost centre, profit centre and tax code recommendations with correction learning and posting history." },
      { property: "og:title", content: "Accounting Intelligence — Q-AP AI" },
      { property: "og:description", content: "Explainable accounting coding recommendations with human control." },
    ],
  }),
  component: Accounting,
});

const GLS = [
  "500100 — Raw Material Consumption",
  "610300 — Freight & Transport",
  "610500 — Customs & Duty",
  "620100 — Utilities Expense",
  "642100 — IT Hosting Expense",
  "642300 — Software Subscription",
  "651000 — Professional Fees",
];
const PCS = ["PC-100 Corporate", "PC-200 Industrial", "PC-300 Trade"];
const TAX = ["UAE-STD", "KSA-STD15", "IN-GST18", "UK-VAT20", "SG-GST9"];
const CCS = ["CC-2100 Production", "CC-3300 Plant Services", "CC-4100 Logistics Ops", "CC-7200 Digital Platforms", "CC-9100 Corporate"];

function Accounting() {
  const store = useStore();
  const inv = useMemo(
    () => store.invoices.find((i) => i.id === store.activeInvoiceId) ?? store.invoices[0]!,
    [store.invoices, store.activeInvoiceId],
  );
  const [pending, setPending] = useState<{ field: string; from: string; to: string } | null>(null);
  const runCoding = useServerFn(suggestCodingAI);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReasons, setAiReasons] = useState<Record<string, string[]>>({});
  const suggest = async () => {
    setAiBusy(true);
    try {
      const r = await runCoding({
        data: {
          invoice: JSON.stringify({ ...invoiceBrief(inv), text: inv.extractedText?.slice(0, 2000), history: history.map((h) => ({ desc: h.lines[0]?.description, gl: h.coding.glAccount, cc: h.coding.costCenter })) }),
          chart: JSON.stringify({ glAccounts: GLS, costCenters: CCS, profitCenters: PCS, taxCodes: TAX, internalOrders: "IO-<4 digits> or —" }),
          learnings: store.learnings.map((l) => `${l.scope}: ${l.from} → ${l.to}`).join("\n"),
        },
      });
      const coding = { ...inv.coding, glAccount: r.glAccount, costCenter: r.costCenter, profitCenter: r.profitCenter, internalOrder: r.internalOrder, taxCode: r.taxCode, confidence: Math.round(r.confidence * 10) / 10 };
      store.updateInvoice(inv.id, { coding }, { actor: "Q AI", actorType: "AI", action: `Accounting coding recommended: ${r.glAccount} / ${r.costCenter}`, confidence: r.confidence });
      setAiReasons((m) => ({ ...m, [inv.id]: r.reasons }));
      toast.success("Q AI coding recommendation applied", { description: `${r.glAccount} · ${Math.round(r.confidence)}% confidence` });
    } catch (e) {
      toast.error("Q AI unavailable", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setAiBusy(false);
    }
  };

  const history = store.invoices
    .filter((i) => i.vendorId === inv.vendorId && i.id !== inv.id)
    .slice(0, 6);

  const change = (field: "glAccount" | "costCenter" | "profitCenter" | "internalOrder" | "taxCode" | "project", value: string) => {
    const from = inv.coding[field];
    store.updateInvoice(inv.id, { coding: { ...inv.coding, [field]: value } }, {
      actor: store.persona,
      actorType: "Human",
      action: `Accounting coding changed (${field})`,
      oldValue: from,
      newValue: value,
      reason: "Manual coding override",
    });
    setPending({ field, from, to: value });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="06 · Accounting Intelligence"
        title="Intelligent G/L and accounting dimension recommendations"
        subtitle={`${inv.id} · ${inv.vendorName} · ${money(inv.grossAmount, inv.currency)}`}
        actions={
          <Select value={inv.id} onValueChange={(v) => store.setActiveInvoiceId(v)}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              {[inv, ...store.invoices.filter((x) => x.id !== inv.id).slice(0, 40)].map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.id} · {i.vendorName.slice(0, 20)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="AI coding recommendation" actions={<div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={aiBusy} onClick={suggest}>{aiBusy ? "Q AI thinking…" : "Suggest with Q AI"}</Button><Confidence value={inv.coding.confidence} /></div>}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="G/L Account" value={inv.coding.glAccount} options={GLS} onChange={(v) => change("glAccount", v)} />
            <Field label="Cost Center" value={inv.coding.costCenter} options={CCS} onChange={(v) => change("costCenter", v)} />
            <Field label="Profit Center" value={inv.coding.profitCenter} options={PCS} onChange={(v) => change("profitCenter", v)} />
            <Field label="Tax Code" value={inv.coding.taxCode} options={TAX} onChange={(v) => change("taxCode", v)} />
            <div>
              <Label>Internal Order</Label>
              <Input defaultValue={inv.coding.internalOrder} className="h-9" onBlur={(e) => change("internalOrder", e.target.value)} />
            </div>
            <div>
              <Label>Project / WBS</Label>
              <Input defaultValue={inv.coding.project} className="h-9" onBlur={(e) => change("project", e.target.value)} />
            </div>
          </div>

          <div className="mt-4">
            <AiBlock title="Why this recommendation">
              {aiReasons[inv.id]?.length
                ? aiReasons[inv.id]!.join(" · ")
                : `Vendor posting history (${history.length} prior invoices), the invoice description, previous postings for this business unit and the PO category. Press "Suggest with Q AI" for a live recommendation.`}{" "}
              Recommendations are advisory — nothing posts to the ledger without an approval step.
            </AiBlock>
          </div>

          {pending && (
            <div className="mt-3 rounded-xl border border-flame/30 bg-flame-soft p-3.5">
              <div className="text-[13px] font-semibold">
                Coding corrected: <span className="line-through opacity-60">{pending.from}</span> → {pending.to}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toast.success("Applied to this invoice only");
                    setPending(null);
                  }}
                >
                  Apply Once
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    store.addLearning(pending.from, pending.to, `${inv.vendorName} · ${inv.invoiceType}`);
                    toast.success("Learning event created", { description: "Similar invoices from this vendor will be coded accordingly, subject to review." });
                    setPending(null);
                  }}
                >
                  Learn for Similar Invoices
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Accounting history" description="Similar invoices previously posted" dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    {["Vendor", "Description", "Previous G/L", "Cost Center", "Approved By", "Conf."].map((h) => (
                      <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">{h.vendorName.slice(0, 18)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{h.lines[0]?.description.slice(0, 22) ?? "—"}</td>
                      <td className="px-4 py-2">{h.coding.glAccount.slice(0, 22)}</td>
                      <td className="px-4 py-2">{h.coding.costCenter}</td>
                      <td className="px-4 py-2 text-muted-foreground">{h.owner}</td>
                      <td className="tabular px-4 py-2">{h.coding.confidence.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Learning events" description="Corrections captured from users">
            {store.learnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No corrections captured yet. Change a coding value to create a learning event.</p>
            ) : (
              <div className="space-y-2">
                {store.learnings.map((l) => (
                  <div key={l.id} className="rounded-lg border border-border p-3 text-xs">
                    <div className="font-semibold">{l.from} → {l.to}</div>
                    <div className="text-muted-foreground">{l.scope} · {new Date(l.ts).toLocaleString()}</div>
                    <Pill tone="info" className="mt-1.5">Applied with review</Pill>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }: { children: string }) => (
  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
);

function Field({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[...new Set([value, ...options])].map((o) => (
            <SelectItem key={o} value={o} className="text-[13px]">{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
