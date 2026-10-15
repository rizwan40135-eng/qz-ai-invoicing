import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VendorPortal } from "@/components/qap/VendorPortal";
import { VendorComms } from "@/components/qap/VendorComms";
import { EscalationPanel } from "@/components/qap/Escalation";

export const Route = createFileRoute("/vendors")({
  head: () => ({
    meta: [
      { title: "Vendor Hub — Q-AP AI" },
      { name: "description", content: "Vendor self-service portal and scorecards: submit invoices, upload documents, track status and respond to exceptions." },
      { property: "og:title", content: "Vendor Hub — Q-AP AI" },
      { property: "og:description", content: "Vendor transparency from submission to payment." },
    ],
  }),
  component: VendorHub,
});

function VendorHub() {
  const store = useStore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(store.vendors[0]!.id);

  const scorecards = useMemo(
    () =>
      store.vendors.map((v) => {
        const set = store.invoices.filter((i) => i.vendorId === v.id);
        const ex = set.filter((i) => i.exceptionType).length;
        return {
          v,
          volume: set.length,
          firstPass: (set.filter((i) => i.matchStatus === "Matched").length / Math.max(1, set.length)) * 100,
          exceptionRate: (ex / Math.max(1, set.length)) * 100,
          dupRisk: set.filter((i) => i.duplicateRisk > 75).length,
          resolution: set.filter((i) => i.exceptionType).reduce((a, i) => a + i.exceptionAgeHours, 0) / Math.max(1, ex),
        };
      }),
    [store.vendors, store.invoices],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="07 · Vendor Hub"
        title="Vendor self-service and transparency"
        subtitle="External-style portal experience plus internal vendor performance scorecards."
      />

      <Tabs defaultValue="portal">
        <TabsList>
          <TabsTrigger value="portal">Vendor Portal</TabsTrigger>
          <TabsTrigger value="scorecards">Vendor Scorecards</TabsTrigger>
          <TabsTrigger value="escalation">Approvals & escalation</TabsTrigger>
          <TabsTrigger value="comms">Supplier alerts & emails</TabsTrigger>
        </TabsList>

        <TabsContent value="portal" className="mt-4 space-y-4">
          <VendorPortal />
        </TabsContent>

        <TabsContent value="escalation" className="mt-4">
          <EscalationPanel title="Supplier-facing approvals & escalation" scopeLabel="supplier items" items={store.filteredInvoices.filter((i) => i.exceptionType && (i.owner === "Supplier" || ["Bank Detail Change", "Vendor Mismatch", "Duplicate Risk", "PO Missing", "Price Variance"].includes(i.exceptionType)))} />
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <VendorComms />
        </TabsContent>

        <TabsContent value="scorecards" className="mt-4 space-y-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor" className="h-9 w-[260px]" />
          <Panel dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    {["Vendor", "Category", "Country", "Volume", "First-Pass Match", "Exception Rate", "Duplicate Risk", "Avg Resolution", "On-Time Docs", "Queries", "Risk", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scorecards
                    .filter((s) => !search || s.v.name.toLowerCase().includes(search.toLowerCase()))
                    .map((s) => (
                      <tr key={s.v.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-semibold">{s.v.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.v.category}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.v.country}</td>
                        <td className="tabular px-4 py-2.5">{s.volume}</td>
                        <td className="tabular px-4 py-2.5">{s.firstPass.toFixed(1)}%</td>
                        <td className="tabular px-4 py-2.5">{s.exceptionRate.toFixed(1)}%</td>
                        <td className="tabular px-4 py-2.5">{s.dupRisk}</td>
                        <td className="tabular px-4 py-2.5">{s.resolution.toFixed(1)}h</td>
                        <td className="tabular px-4 py-2.5">{s.v.onTimeDocs}%</td>
                        <td className="tabular px-4 py-2.5">{s.v.paymentQueries}</td>
                        <td className="px-4 py-2.5">
                          <Pill tone={s.v.riskLevel === "High" ? "fail" : s.v.riskLevel === "Medium" ? "warning" : "pass"}>{s.v.riskLevel}</Pill>
                        </td>
                        <td className="px-4 py-2.5">
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected(s.v.id)}>Open portal</Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
