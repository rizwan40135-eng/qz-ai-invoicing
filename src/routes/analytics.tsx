import { getAdminConfig } from "@/lib/adminConfig";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Kpi, money } from "@/components/qap/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BUSINESS_UNITS, COUNTRIES } from "@/lib/data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Management Analytics — Q-AP AI" },
      { name: "description", content: "Touchless processing, cycle time, exceptions, aging, vendor performance, SLA, productivity and payment analytics." },
      { property: "og:title", content: "Management Analytics — Q-AP AI" },
      { property: "og:description", content: "AP performance analytics across business units and countries." },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const store = useStore();
  const inv = store.filteredInvoices;

  /** Last 8 weeks by invoice date, computed from current invoices. */
  const trend = useMemo(() => {
    const now = Date.now(), wk = 7 * 864e5;
    return Array.from({ length: 8 }, (_, k) => {
      const end = now - (7 - k) * wk, start = end - wk;
      const set = inv.filter((i) => { const t = new Date(i.invoiceDate).getTime(); return t > start && t <= end; });
      const n = Math.max(1, set.length);
      const d = new Date(end);
      return set.length === 0 ? null : {
        week: `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`,
        touchless: Math.round((set.filter((i) => !i.exceptionType && i.approvalStatus !== "Pending").length / n) * 1000) / 10,
        cycle: Math.round((set.reduce((x, i) => x + 1 + i.exceptionAgeHours / 24 + (i.approvalStatus === "Pending" ? 1 : 0), 0) / n) * 10) / 10,
        exceptions: set.filter((i) => i.exceptionType).length,
        onTime: Math.round((set.filter((i) => !(i.exceptionType && i.exceptionAgeHours > i.slaHours)).length / n) * 1000) / 10,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [inv]);

  const byBu = useMemo(
    () =>
      BUSINESS_UNITS.map((bu) => {
        const set = inv.filter((i) => i.businessUnit === bu);
        return {
          bu,
          touchless: (set.filter((i) => !i.exceptionType).length / Math.max(1, set.length)) * 100,
          exceptions: set.filter((i) => i.exceptionType).length,
          value: set.reduce((a, i) => a + i.grossAmount, 0) / 1000,
        };
      }),
    [inv],
  );

  const byCountry = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const set = inv.filter((i) => i.country === c);
        return { country: c, invoices: set.length, exceptions: set.filter((i) => i.exceptionType).length };
      }),
    [inv],
  );

  const now = Date.now();
  const ageDays = (i: (typeof inv)[number]) => Math.max(0, (now - new Date(i.invoiceDate).getTime()) / 864e5);
  const open = inv.filter((i) => i.exceptionType || i.approvalStatus === "Pending");
  const aging = [
    { bucket: "0–2 days", invoices: open.filter((i) => ageDays(i) <= 2).length },
    { bucket: "3–5 days", invoices: open.filter((i) => ageDays(i) > 2 && ageDays(i) <= 5).length },
    { bucket: "6–10 days", invoices: open.filter((i) => ageDays(i) > 5 && ageDays(i) <= 10).length },
    { bucket: "11–20 days", invoices: open.filter((i) => ageDays(i) > 10 && ageDays(i) <= 20).length },
    { bucket: "20+ days", invoices: open.filter((i) => ageDays(i) > 20).length },
  ];
  const n = Math.max(1, inv.length);
  const pct = (x: number, d = n) => `${((x / Math.max(1, d)) * 100).toFixed(1)}%`;
  const touchlessN = inv.filter((i) => !i.exceptionType && i.approvalStatus !== "Pending").length;
  const poInv = inv.filter((i) => i.poNumber);
  const exN = inv.filter((i) => i.exceptionType).length;
  const pendingA = inv.filter((i) => i.approvalStatus === "Pending");
  const paidOk = inv.filter((i) => i.paymentStatus === "Beneficiary Credited" || i.paymentStatus === "Released").length;
  const payIssues = inv.filter((i) => ["Rejected", "Failed", "Returned"].includes(i.paymentStatus)).length;
  const avgCycle = inv.reduce((x, i) => x + 1 + i.exceptionAgeHours / 24 + (i.approvalStatus === "Pending" ? 1 : 0), 0) / n;
  const team = Math.max(1, getAdminConfig().users.filter((u) => u.active && u.role.startsWith("AP")).length);
  const kpis: [string, string][] = [
    ["Touchless Processing %", pct(touchlessN)],
    ["First Pass Match %", pct(poInv.filter((i) => i.matchStatus === "Matched").length, poInv.length)],
    ["Average Cycle Time", `${avgCycle.toFixed(1)} days`],
    ["Exception Rate", pct(exN)],
    ["Duplicate Prevention Value", money(inv.filter((i) => i.duplicateRisk > 75).reduce((x, i) => x + i.grossAmount, 0), "AED", true)],
    ["Invoices / AP user", Math.round(inv.length / team).toLocaleString()],
    ["Approval Aging", `${(pendingA.reduce((x, i) => x + ageDays(i), 0) / Math.max(1, pendingA.length)).toFixed(1)} days`],
    ["Payment success %", pct(paidOk, paidOk + payIssues)],
    ["SLA Compliance", pct(n - inv.filter((i) => i.exceptionType && i.exceptionAgeHours > i.slaHours).length)],
    ["Avg extraction confidence", `${(inv.reduce((x, i) => x + i.extractionConfidence, 0) / n).toFixed(1)}%`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Management analytics" title="AP performance" subtitle="Touchless rate, cycle time, exceptions, suppliers, productivity and payments by business unit and country." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map(([l, v]) => (
          <Kpi key={l} label={l} value={v} />
        ))}
      </div>

      <Tabs defaultValue="touchless">
        <TabsList className="flex-wrap">
          {["touchless", "cycle time", "exceptions", "aging", "vendors", "sla", "productivity", "payments", "business unit", "country"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="touchless" className="mt-4">
          <Panel title="Touchless processing trend">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[60, 90]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area dataKey="touchless" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.15} name="Touchless %" />
              </AreaChart>
            </ResponsiveContainer>
            {trend.length > 1 && (() => { const lo = trend.reduce((a, b) => (b.touchless < a.touchless ? b : a)); return <p className="mt-2 text-xs text-muted-foreground">Lowest week: {lo.week} at {lo.touchless}% touchless with {lo.exceptions} exceptions raised.</p>; })()}
          </Panel>
        </TabsContent>

        <TabsContent value="cycle time" className="mt-4">
          <Chart title="Invoice cycle time (days)" data={trend} dataKey="cycle" color="var(--flame)" />
        </TabsContent>
        <TabsContent value="exceptions" className="mt-4">
          <Chart title="Exception volume" data={trend} dataKey="exceptions" color="var(--flame)" bar />
        </TabsContent>
        <TabsContent value="aging" className="mt-4">
          <Panel title="Invoice aging">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="invoices" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </TabsContent>
        <TabsContent value="vendors" className="mt-4">
          <Panel title="Vendor exception concentration">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={store.vendors.slice(0, 12).map((v) => ({ name: v.name.split(" ")[0], risk: v.riskScore, docs: v.onTimeDocs }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="risk" name="Risk score" fill="var(--flame)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="docs" name="On-time docs %" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </TabsContent>
        <TabsContent value="sla" className="mt-4">
          <Chart title="SLA compliance / on-time payment %" data={trend} dataKey="onTime" color="var(--chart-3)" />
        </TabsContent>
        <TabsContent value="productivity" className="mt-4">
          <Panel title="AP productivity" dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    {["Team (country)", "Invoices", "Owners", "Invoices / owner", "Touchless %", "Manual touches / invoice", "Open exceptions", "Avg cycle"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(inv.map((i) => i.country))].map((c) => {
                    const set = inv.filter((i) => i.country === c);
                    const n = Math.max(1, set.length);
                    const owners = new Set(set.map((i) => i.owner)).size;
                    const touches = set.reduce((x, i) => x + i.audit.filter((a) => a.actorType === "Human").length, 0);
                    const cycle = set.reduce((x, i) => x + 1 + i.exceptionAgeHours / 24 + (i.approvalStatus === "Pending" ? 1 : 0), 0) / n;
                    return [`AP Team ${c}`, set.length, owners, Math.round(set.length / Math.max(1, owners)), `${((set.filter((i) => !i.exceptionType && i.approvalStatus !== "Pending").length / n) * 100).toFixed(1)}%`, (touches / n).toFixed(2), set.filter((i) => i.exceptionType).length, `${cycle.toFixed(1)}d`];
                  }).map((r) => (
                    <tr key={r[0] as string} className="border-b border-border/60 last:border-0">
                      {r.map((c, i) => (
                        <td key={i} className="tabular px-4 py-2.5">{typeof c === "number" ? c.toLocaleString() : c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <Panel title="Payment execution">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line dataKey="onTime" stroke="var(--chart-3)" strokeWidth={2} name="On-time payment %" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </TabsContent>
        <TabsContent value="business unit" className="mt-4">
          <Panel title="Business unit performance">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={byBu}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="bu" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="touchless" name="Touchless %" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="exceptions" name="Exceptions" fill="var(--flame)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </TabsContent>
        <TabsContent value="country" className="mt-4">
          <Panel title="Country performance">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={byCountry}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="country" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="invoices" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="exceptions" fill="var(--flame)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </TabsContent>
      </Tabs>

      <Panel title="Value levers" description="Where Q-AP AI improves AP performance">
        <div className="grid gap-2 md:grid-cols-4">
          {[
            ["Higher", "Touchless processing"],
            ["Lower", "Invoice cycle time"],
            ["Lower", "Manual AP effort"],
            ["Fewer", "Duplicate payments"],
            ["Faster", "Exception resolution"],
            ["Improved", "SLA compliance"],
            ["Improved", "Vendor transparency"],
            ["Improved", "Auditability"],
          ].map(([a, b]) => (
            <div key={b} className="rounded-xl border border-border p-3.5">
              <div className="text-sm font-bold text-flame">{a}</div>
              <div className="text-xs text-muted-foreground">{b}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Chart({ title, data, dataKey, color, bar }: { title: string; data: Record<string, unknown>[]; dataKey: string; color: string; bar?: boolean }) {
  return (
    <Panel title={title}>
      <ResponsiveContainer width="100%" height={300}>
        {bar ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line dataKey={dataKey} stroke={color} strokeWidth={2} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </Panel>
  );
}
