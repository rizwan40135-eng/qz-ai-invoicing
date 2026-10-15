import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Panel, Pill } from "./primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ERPS = ["SAP S/4HANA", "Oracle Fusion"] as const;

function ago(ts: string) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

export function ErpPanel() {
  const store = useStore();
  const { erp } = store;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {ERPS.map((name) => {
          const pos = store.pos.filter((p) => (p.erp ?? (p.businessUnit ? "SAP S/4HANA" : "")) === name).length;
          const inv = store.invoices.filter((i) => i.erp === name);
          const errors = erp.log.filter((l) => l.erp === name && l.status === "Error").length;
          return (
            <Panel key={name} title={name} actions={<Pill tone="pass">Connected</Pill>}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <KV label="Last sync" value={ago(erp.lastSync[name])} />
                <KV label="Posted invoices" value={String(inv.filter((i) => i.erpStatus === "Posted").length)} />
                <KV label="Purchase orders" value={String(pos)} />
                <KV label="Goods receipts" value={String(store.grns.length)} />
                <KV label="Invoices" value={String(inv.length)} />
                <KV label="Errors" value={String(errors)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select value={erp.mode[name]} onValueChange={(v) => { store.setErp({ mode: { ...erp.mode, [name]: v as "Real-time API" } }); toast.success(`${name}: ${v}`); }}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Real-time API" className="text-xs">Real-time API</SelectItem>
                    <SelectItem value="Scheduled batch" className="text-xs">Scheduled batch</SelectItem>
                  </SelectContent>
                </Select>
                {erp.mode[name] === "Scheduled batch" && (
                  <Select value={String(erp.intervalMin[name])} onValueChange={(v) => store.setErp({ intervalMin: { ...erp.intervalMin, [name]: Number(v) } })}>
                    <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 5, 15, 30, 60].map((m) => <SelectItem key={m} value={String(m)} className="text-xs">Every {m} min</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { store.syncErp(name, true); toast.success(`${name} synchronised`, { description: "POs, GRNs and payment status pulled · posted invoices pushed" }); }}>
                  <RefreshCw className="size-3.5" /> Sync now
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Bidirectional: purchase orders, goods receipts and payment status flow in; posted invoices and approvals flow out.
              </p>
            </Panel>
          );
        })}
      </div>
      <Panel title="Integration log" description={`${erp.log.length} exchanges recorded`} dense>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                {["Time", "ERP", "Direction", "Object", "Records", "Status", "Detail"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {erp.log.slice(0, 60).map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="px-4 py-1.5 text-muted-foreground">{new Date(l.ts).toLocaleTimeString()}</td>
                  <td className="px-4 py-1.5">{l.erp}</td>
                  <td className="px-4 py-1.5"><Pill tone={l.direction === "Inbound" ? "info" : "opportunity"}>{l.direction}</Pill></td>
                  <td className="px-4 py-1.5">{l.object}</td>
                  <td className="tabular px-4 py-1.5">{l.count}</td>
                  <td className="px-4 py-1.5"><Pill tone={l.status === "Success" ? "pass" : "fail"}>{l.status}</Pill></td>
                  <td className="px-4 py-1.5 text-muted-foreground">{l.detail}</td>
                </tr>
              ))}
              {erp.log.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No exchanges yet — process an invoice or press Sync now.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
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
