import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, AiBlock, money } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { runTwin } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { Scenario, Tolerances } from "@/lib/types";

export const Route = createFileRoute("/ap-twin")({
  head: () => ({
    meta: [
      { title: "AP Digital Twin — Q-AP AI" },
      { name: "description", content: "Simulate AP policy changes before changing operations: tolerance, approval thresholds, duplicate sensitivity and volume." },
      { property: "og:title", content: "AP Digital Twin — Q-AP AI" },
      { property: "og:description", content: "Model touchless rate, workload, cycle time and risk before you change policy." },
    ],
  }),
  component: ApTwin,
});

const QUESTIONS = [
  "What happens if quantity tolerance moves from 2% to 3%?",
  "What if freight invoices use 2-way matching?",
  "What if we auto-approve invoices below AED 5,000?",
  "What if the AP team receives 40% more invoices at month end?",
  "What if we tighten duplicate detection?",
  "What if all PO invoices below risk threshold become touchless?",
];

function ApTwin() {
  const store = useStore();
  const [t, setT] = useState<Tolerances>(store.tolerances);
  const [twoWayFreight, setTwoWayFreight] = useState(false);
  const [volume, setVolume] = useState(0);
  const [compare, setCompare] = useState<Scenario | null>(null);
  const [name, setName] = useState("Quantity 3% Restricted");

  const base = useMemo(() => runTwin(store.tolerances, false, 0, store.invoices), [store.tolerances, store.invoices]);
  const sim = useMemo(() => runTwin(t, twoWayFreight, volume, store.invoices), [t, twoWayFreight, volume, store.invoices]);

  const applyQuestion = (q: string) => {
    if (q.includes("quantity tolerance")) setT((x) => ({ ...x, quantity: 3 }));
    else if (q.includes("freight")) setTwoWayFreight(true);
    else if (q.includes("auto-approve")) setT((x) => ({ ...x, autoApproveBelow: 5000 }));
    else if (q.includes("40%")) setVolume(40);
    else if (q.includes("duplicate")) setT((x) => ({ ...x, duplicateSensitivity: 88 }));
    else setT((x) => ({ ...x, confidenceThreshold: 88, quantity: 2.5 }));
    toast.info("Scenario inputs updated", { description: q });
  };

  const metrics: [string, number, number, string][] = [
    ["Touchless Rate", base.touchlessRate, sim.touchlessRate, "%"],
    ["Manual Review Volume", base.manualReviews, sim.manualReviews, ""],
    ["Exception Volume", base.exceptionVolume, sim.exceptionVolume, ""],
    ["Cycle Time", base.cycleTimeDays, sim.cycleTimeDays, "d"],
    ["SLA Breaches", base.slaBreaches, sim.slaBreaches, ""],
    ["Duplicate Prevention", base.duplicatePrevention, sim.duplicatePrevention, ""],
    ["Risk Exposure Index", base.riskExposure, sim.riskExposure, ""],
    ["AP Workload", base.workloadHours, sim.workloadHours, "h"],
    ["Cost / Invoice", base.costPerInvoice, sim.costPerInvoice, ""],
    ["Approval Workload", base.approvalLoad, sim.approvalLoad, ""],
  ];

  const frontier = store.scenarios.slice(0, 14).map((s) => ({
    x: s.result.touchlessRate,
    y: s.result.riskExposure,
    z: s.result.exceptionVolume / 100,
    name: s.name,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="09 · AP Digital Twin"
        title="AP DIGITAL TWIN"
        subtitle="Simulate policy changes before changing AP operations. Modelled on current invoice history."
        actions={
          <>
            <Button variant="outline" onClick={() => { setT(store.tolerances); setTwoWayFreight(false); setVolume(0); }}>Reset inputs</Button>
            <Button
              onClick={() => {
                const sc: Scenario = {
                  id: `SCN-${Math.floor(Math.random() * 900 + 100)}`,
                  name,
                  tolerances: t,
                  twoWayFreight,
                  createdAt: new Date().toISOString().slice(0, 10),
                  result: sim,
                  status: "Saved",
                };
                store.saveScenario(sc);
                toast.success(`Scenario “${name}” saved`);
              }}
            >
              Save Scenario
            </Button>
          </>
        }
      />

      <Panel title="Ask the twin" description="Each question sets the corresponding policy inputs">
        <div className="flex flex-wrap gap-1.5">
          {QUESTIONS.map((q) => (
            <button key={q} onClick={() => applyQuestion(q)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:border-brand/50 hover:bg-brand-soft">
              {q}
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Policy inputs">
          {([
            ["Price Tolerance", "price", 0, 5, 0.25, "%"],
            ["Quantity Tolerance", "quantity", 0, 10, 0.25, "%"],
            ["Tax Tolerance", "tax", 0, 3, 0.1, "%"],
            ["Freight Tolerance", "freight", 0, 10, 0.25, "%"],
            ["Service Tolerance", "service", 0, 10, 0.25, "%"],
            ["Confidence Threshold", "confidenceThreshold", 80, 99, 1, "%"],
            ["Duplicate Sensitivity", "duplicateSensitivity", 50, 98, 1, ""],
          ] as const).map(([label, key, min, max, step, unit]) => (
            <div key={key} className="flex items-center gap-3 py-1.5">
              <span className="w-[150px] text-xs text-muted-foreground">{label}</span>
              <Slider value={[t[key]]} min={min} max={max} step={step} onValueChange={([v]) => setT((x) => ({ ...x, [key]: v! }))} className="flex-1" />
              <span className="tabular w-[56px] text-right text-xs font-semibold">{t[key]}{unit}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 py-1.5">
            <span className="w-[150px] text-xs text-muted-foreground">Auto Approval Below</span>
            <Slider value={[t.autoApproveBelow]} min={0} max={50000} step={500} onValueChange={([v]) => setT((x) => ({ ...x, autoApproveBelow: v! }))} className="flex-1" />
            <span className="tabular w-[76px] text-right text-xs font-semibold">{money(t.autoApproveBelow, "AED", true)}</span>
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <span className="w-[150px] text-xs text-muted-foreground">Volume uplift</span>
            <Slider value={[volume]} min={0} max={60} step={5} onValueChange={([v]) => setVolume(v!)} className="flex-1" />
            <span className="tabular w-[56px] text-right text-xs font-semibold">+{volume}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-xs">Freight invoices use 2-way matching</span>
            <Switch checked={twoWayFreight} onCheckedChange={setTwoWayFreight} />
          </div>
          <div className="mt-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" className="h-9" />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Simulated outcome" description="Baseline policy vs simulated policy" dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Metric</th>
                    <th className="px-4 py-2.5">Baseline</th>
                    <th className="px-4 py-2.5">Simulated</th>
                    <th className="px-4 py-2.5">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(([label, b, s, unit]) => {
                    const delta = s - b;
                    const better = ["Touchless Rate", "Duplicate Prevention"].includes(label) ? delta > 0 : delta < 0;
                    return (
                      <tr key={label} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2">{label}</td>
                        <td className="tabular px-4 py-2 text-muted-foreground">{b.toLocaleString()}{unit}</td>
                        <td className="tabular px-4 py-2 font-semibold">{s.toLocaleString()}{unit}</td>
                        <td className={cn("tabular px-4 py-2 font-semibold", delta === 0 ? "text-muted-foreground" : better ? "text-success" : "text-danger")}>
                          {delta > 0 ? "+" : ""}{Math.round(delta * 100) / 100}{unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-5">
              <AiBlock title="AI recommendation">
                {sim.touchlessRate > base.touchlessRate
                  ? `A ${t.quantity}% quantity tolerance materially improves touchless processing (${base.touchlessRate}% → ${sim.touchlessRate}%) but creates additional value exposure of roughly ${money(Math.round((sim.riskExposure - base.riskExposure) * 210000))} per month. Consider applying it only to approved low-risk vendor and material groups, then reviewing after one cycle.`
                  : "This configuration tightens control at the cost of touchless processing. Use it for high-risk vendor groups rather than as a global policy."}
              </AiBlock>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    store.setTolerances({ ...t, quantity: t.quantity });
                    toast.success("Restricted policy applied", { description: "Applied to approved low-risk vendor groups only." });
                  }}
                >
                  Apply Restricted Policy
                </Button>
                <Button variant="outline" onClick={() => setCompare(store.scenarios[0] ?? null)}>Compare Scenario</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    store.saveScenario({ id: `SCN-${Math.floor(Math.random() * 900 + 100)}`, name, tolerances: t, twoWayFreight, createdAt: new Date().toISOString().slice(0, 10), result: sim, status: "Pending Approval" });
                    store.pushNotification({ severity: "Medium", title: "Policy change sent for approval", body: `${name} awaiting AP Head and Finance Controller sign-off.`, link: "/approvals" });
                    toast.success("Sent for approval");
                  }}
                >
                  Send for Approval
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="AP policy frontier" description="Touchless processing vs risk exposure across saved scenarios">
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis type="number" dataKey="x" name="Touchless %" domain={[60, 95]} tick={{ fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Risk exposure" tick={{ fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[60, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) =>
                    payload?.[0] ? (
                      <div className="rounded-lg border border-border bg-popover p-2 text-xs shadow-md">
                        <div className="font-semibold">{(payload[0].payload as { name: string }).name}</div>
                        <div>Touchless {(payload[0].payload as { x: number }).x}%</div>
                        <div>Risk {(payload[0].payload as { y: number }).y}</div>
                      </div>
                    ) : null
                  }
                />
                <Scatter data={frontier} fill="var(--brand)" />
                <Scatter data={[{ x: sim.touchlessRate, y: sim.riskExposure, z: 3, name: "Current simulation" }]} fill="var(--flame)" />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      <Panel title="Saved policy scenarios" dense>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                {["Scenario", "Created", "Touchless", "Exceptions", "Cycle Time", "Risk", "Cost / Invoice", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {store.scenarios.map((s) => (
                <tr key={s.id} className={cn("border-b border-border/60 last:border-0", compare?.id === s.id && "bg-brand-soft")}>
                  <td className="px-4 py-2.5 font-semibold">{s.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.createdAt}</td>
                  <td className="tabular px-4 py-2.5">{s.result.touchlessRate}%</td>
                  <td className="tabular px-4 py-2.5">{s.result.exceptionVolume.toLocaleString()}</td>
                  <td className="tabular px-4 py-2.5">{s.result.cycleTimeDays}d</td>
                  <td className="tabular px-4 py-2.5">{s.result.riskExposure}</td>
                  <td className="tabular px-4 py-2.5">{s.result.costPerInvoice}</td>
                  <td className="px-4 py-2.5"><Pill tone={s.status === "Applied" ? "pass" : s.status === "Pending Approval" ? "warning" : "neutral"}>{s.status}</Pill></td>
                  <td className="flex gap-1 px-4 py-2.5">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setT(s.tolerances); setTwoWayFreight(s.twoWayFreight); setName(s.name); toast.info(`Opened ${s.name}`); }}>Open</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { store.saveScenario({ ...s, id: `SCN-${Math.floor(Math.random() * 900 + 100)}`, name: `${s.name} (copy)`, status: "Draft" }); toast.success("Scenario duplicated"); }}>Duplicate</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setCompare(s)}>Compare</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { store.updateScenario(s.id, { status: "Archived" }); toast.success("Archived"); }}>Archive</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {compare && (
        <Panel title={`Scenario comparison — ${compare.name} vs current simulation`}>
          <div className="grid gap-2 md:grid-cols-4">
            {([
              ["Touchless Rate", compare.result.touchlessRate, sim.touchlessRate],
              ["Exception Volume", compare.result.exceptionVolume, sim.exceptionVolume],
              ["Cycle Time", compare.result.cycleTimeDays, sim.cycleTimeDays],
              ["Risk Exposure", compare.result.riskExposure, sim.riskExposure],
              ["Manual Hours", compare.result.workloadHours, sim.workloadHours],
              ["Approval Load", compare.result.approvalLoad, sim.approvalLoad],
              ["Duplicate Prevention", compare.result.duplicatePrevention, sim.duplicatePrevention],
              ["Processing Cost", compare.result.costPerInvoice, sim.costPerInvoice],
            ] as [string, number, number][]).map(([label, a, b]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="tabular mt-1 text-sm font-semibold">{a.toLocaleString()} → {b.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each scenario trades automation against control. No single configuration is universally optimal — select by
            vendor risk, business unit and season.
          </p>
        </Panel>
      )}

      <div className="text-[11px] text-muted-foreground">
        Baseline: touchless {base.touchlessRate}% · every one of the {store.invoices.length} invoices is re-checked against the proposed policy.
      </div>
    </div>
  );
}
