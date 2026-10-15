import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { ErpPanel } from "@/components/qap/ErpPanel";
import { PageHeader, Panel, Pill } from "@/components/qap/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Invoice } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { setAdminConfig, useAdminConfig } from "@/lib/adminConfig";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Controls — Q-AP AI" },
      { name: "description", content: "Policies, audit trail, segregation of duties, AI trust metrics, data quality, integration health and compliance configuration." },
      { property: "og:title", content: "Trust & Controls — Q-AP AI" },
      { property: "og:description", content: "Enterprise controls and AI transparency for accounts payable." },
    ],
  }),
  component: Trust,
});

function Trust() {
  const store = useStore();
  const cfg = useAdminConfig();
  const q = (x: number, d = store.invoices.length) => `${((x / Math.max(1, d)) * 100).toFixed(1)}%`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="10 · Trust & Controls" title="Controls, transparency and integration health" subtitle="Policies, audit trail, segregation of duties, AI performance, ERP integration and country rules." />

      <Tabs defaultValue="policies">
        <TabsList className="flex-wrap">
          {["policies", "workflows", "audit", "sod", "ai", "quality", "integration", "compliance"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t === "sod" ? "Segregation of duties" : t === "ai" ? "AI trust" : t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="policies" className="mt-4">
          <Editable
            title="Policy rules" description="Add, edit or remove the AP policy rules"
            rows={cfg.policies} onChange={(policies) => setAdminConfig({ policies })}
            blank={() => ({ id: `PR-${String(cfg.policies.length + 1).padStart(2, "0")}`, name: "New rule", scope: "Global", value: "", active: true })}
            cols={[{ k: "id", label: "Rule", w: "w-24" }, { k: "name", label: "Name" }, { k: "scope", label: "Scope" }, { k: "value", label: "Value", w: "w-36" }, { k: "active", label: "Active", bool: true }]}
          />
        </TabsContent>

        <TabsContent value="workflows" className="mt-4">
          <Editable
            title="Approval workflows" description="Separate steps with →"
            rows={cfg.workflows.map((w) => ({ ...w, stepsText: w.steps.join(" → ") }))}
            onChange={(rows) => setAdminConfig({ workflows: rows.map(({ stepsText, ...w }) => ({ ...w, steps: stepsText.split(/→|->|,/).map((x) => x.trim()).filter(Boolean) })) })}
            blank={() => ({ id: `WF-${String(cfg.workflows.length + 1).padStart(2, "0")}`, name: "New workflow", condition: "", steps: [], stepsText: "AP Manager" })}
            cols={[{ k: "id", label: "ID", w: "w-24" }, { k: "name", label: "Name" }, { k: "condition", label: "Condition (IF)" }, { k: "stepsText", label: "Approval steps" }]}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Panel dense>
            <Table head={["Timestamp", "Actor", "Type", "Action", "Old", "New", "Reason", "Confidence"]}>
              {store.audit.slice(0, 50).map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(a.ts).toLocaleString()}</td>
                  <td className="px-4 py-2">{a.actor}</td>
                  <td className="px-4 py-2"><Pill tone={a.actorType === "AI" ? "info" : a.actorType === "Human" ? "pass" : "neutral"}>{a.actorType}</Pill></td>
                  <td className="px-4 py-2">{a.action}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.oldValue ?? "—"}</td>
                  <td className="px-4 py-2">{a.newValue ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.reason ?? "—"}</td>
                  <td className="tabular px-4 py-2">{a.confidence ? `${a.confidence}%` : "—"}</td>
                </tr>
              ))}
              {store.audit.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No actions recorded in this session yet. Approve, resolve or post an invoice to create audit entries.
                  </td>
                </tr>
              )}
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="sod" className="mt-4">
          <Editable
            title="Segregation of duties" description="Role restrictions enforced across the platform"
            rows={cfg.sod} onChange={(sod) => setAdminConfig({ sod })}
            blank={() => ({ id: `sod${Date.now()}`, role: "New role", restriction: "", enforced: true })}
            cols={[{ k: "role", label: "Role", w: "w-56" }, { k: "restriction", label: "Restriction" }, { k: "enforced", label: "Enforced", bool: true }]}
          />
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <Editable
            title="AI capabilities" description="Confidence and review rate are measured on current invoices"
            rows={cfg.aiCapabilities} onChange={(aiCapabilities) => setAdminConfig({ aiCapabilities })}
            blank={() => ({ id: `ai${Date.now()}`, name: "New capability", version: "v1.0", owner: "AP Operations", status: "Active" })}
            cols={[{ k: "name", label: "Capability" }, { k: "version", label: "Version", w: "w-24" }, { k: "owner", label: "Owner" }, { k: "status", label: "Status", w: "w-36" }]}
            extra={[{ label: "Confidence", render: (r) => aiMetric(r.id, store.invoices)[0] }, { label: "Human review rate", render: (r) => aiMetric(r.id, store.invoices)[1] }]}
          />
        </TabsContent>

        <TabsContent value="quality" className="mt-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Vendor master completeness", q(store.vendors.filter((v) => v.bankAccount && v.name).length, store.vendors.length)],
              ["PO reference present", q(store.invoices.filter((i) => i.poNumber).length)],
              ["Tax code populated", q(store.invoices.filter((i) => i.coding?.taxCode && i.coding.taxCode !== "—").length)],
              ["Bank details verified", q(store.vendors.filter((v) => v.bankAccount).length, store.vendors.length)],
              ["Duplicate invoice numbers", q(store.invoices.length - new Set(store.invoices.map((i) => `${i.vendorName}|${i.invoiceNumber}`)).size)],
              ["Missing GRN", q(store.invoices.filter((i) => i.poNumber && !i.grnNumber && i.matchMode === "3-Way").length)],
              ["Low-confidence extraction", q(store.invoices.filter((i) => i.extractionConfidence < 90).length)],
              ["Unreadable documents", q(store.invoices.filter((i) => i.extractionConfidence < 60).length)],
            ].map(([l, v]) => (
              <div key={l} className="panel p-4">
                <div className="text-[11px] text-muted-foreground">{l}</div>
                <div className="tabular mt-1 text-xl font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="integration" className="mt-4">
          <ErpPanel />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <Editable
            title="Country configuration" description="Rules applied by the country compliance checks on every invoice"
            rows={cfg.compliance} onChange={(compliance) => setAdminConfig({ compliance })}
            blank={() => ({ id: `c${Date.now()}`, country: "New country", currency: "", taxModel: "VAT", rate: "", withholding: "", eInvoice: "", format: "", language: "English", rules: "" })}
            cols={[{ k: "country", label: "Country" }, { k: "currency", label: "Currency", w: "w-20" }, { k: "taxModel", label: "Tax model" }, { k: "rate", label: "Rate", w: "w-20" }, { k: "withholding", label: "Withholding" }, { k: "eInvoice", label: "E-invoice" }, { k: "format", label: "Format" }, { k: "language", label: "Language" }, { k: "rules", label: "Validation rules" }]}
          />
          <div className="mt-4" />
          <Panel title="Multilingual invoice support" className="mt-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["English", "Standard invoice"],
                ["Arabic", "فاتورة ضريبية"],
                ["Hindi", "कर चालान"],
                ["French", "Facture"],
              ].map(([l, sm]) => { const set = store.invoices.filter((i) => i.language === l); return [l, sm, set.length ? `${(set.reduce((x, i) => x + i.extractionConfidence, 0) / set.length).toFixed(1)}% across ${set.length} invoices` : "no invoices yet"]; }).map(([lang, sample, conf]) => (
                <div key={lang} className="rounded-xl border border-border p-4">
                  <div className="text-[13px] font-semibold">{lang}</div>
                  <div className="mt-1 text-lg">{sample}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Translation preview available · extraction confidence {conf}</div>
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
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

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`;

/** Live confidence and human-review rate for built-in AI capabilities, measured on current invoices. */
function aiMetric(id: string, inv: Invoice[]): [string, string] {
  if (!inv.length) return ["—", "—"];
  switch (id) {
    case "classification": return [`${avg(inv.map((i) => i.classificationConfidence)).toFixed(1)}%`, pct(inv.filter((i) => i.classificationConfidence < 90).length, inv.length)];
    case "extraction": return [`${avg(inv.map((i) => i.extractionConfidence)).toFixed(1)}%`, pct(inv.filter((i) => i.extractionConfidence < 90).length, inv.length)];
    case "duplicate": { const f = inv.filter((i) => i.duplicateRisk > 75); return [`${f.length} flagged`, pct(f.length, inv.length)]; }
    case "coding": { const c = inv.map((i) => (i.coding as { confidence?: number } | undefined)?.confidence).filter((x): x is number => typeof x === "number"); return [c.length ? `${avg(c).toFixed(1)}%` : "—", pct(c.filter((x) => x < 90).length, c.length)]; }
    case "matching": { const po = inv.filter((i) => i.poNumber); return [pct(po.filter((i) => i.matchStatus === "Matched").length, po.length), pct(po.filter((i) => i.matchStatus !== "Matched").length, po.length)]; }
    case "copilot": return ["Advisory", "100%"];
    default: return ["—", "—"];
  }
}

type Col<R> = { k: keyof R & string; label: string; w?: string; bool?: boolean };
function Editable<R extends { id: string }>({ title, description, rows, onChange, blank, cols, extra = [] }: {
  title: string; description?: string; rows: R[]; onChange: (rows: R[]) => void; blank: () => R; cols: Col<R>[];
  extra?: { label: string; render: (r: R) => React.ReactNode }[];
}) {
  const set = (idx: number, k: keyof R, v: unknown) => onChange(rows.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  return (
    <Panel title={title} {...(description ? { description } : {})} dense actions={<Button size="sm" className="gap-1.5" onClick={() => onChange([...rows, blank()])}><Plus className="size-4" /> Add</Button>}>
      <Table head={[...cols.map((c) => c.label), ...extra.map((e) => e.label), ""]}>
        {rows.map((r, idx) => (
          <tr key={r.id + idx} className="border-b border-border/60 last:border-0">
            {cols.map((c) => (
              <td key={c.k} className={`px-2 py-1.5 ${c.w ?? ""}`}>
                {c.bool
                  ? <Switch checked={Boolean(r[c.k])} onCheckedChange={(v) => set(idx, c.k, v)} />
                  : <Input className="h-8 text-[13px]" value={String(r[c.k] ?? "")} onChange={(e) => set(idx, c.k, e.target.value)} />}
              </td>
            ))}
            {extra.map((e) => <td key={e.label} className="tabular whitespace-nowrap px-4 py-1.5">{e.render(r)}</td>)}
            <td className="px-2 py-1.5 text-right">
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => onChange(rows.filter((_, i) => i !== idx))}><Trash2 className="size-4" /></Button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={cols.length + extra.length + 1} className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing configured. Use Add to create one.</td></tr>}
      </Table>
    </Panel>
  );
}
