import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { BusinessUnit, Erp, PoLine, PurchaseOrder } from "@/lib/types";

export const Route = createFileRoute("/erp-data")({
  head: () => ({
    meta: [
      { title: "Purchase Orders & Goods Receipts — Q-AP AI" },
      { name: "description", content: "View, add and maintain the purchase orders and goods receipts that uploaded invoices are matched against." },
      { property: "og:title", content: "Purchase Orders & Goods Receipts — Q-AP AI" },
      { property: "og:description", content: "The ERP reference data behind 2-way and 3-way matching." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ErpData,
});

const BUS: BusinessUnit[] = ["Manufacturing", "Trading", "Transportation", "Logistics", "Distribution", "Services"];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function ErpData() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const used = useMemo(() => {
    const m = new Map<string, number>();
    store.invoices.forEach((i) => { if (i.poNumber) m.set(i.poNumber, (m.get(i.poNumber) ?? 0) + 1); if (i.grnNumber) m.set(i.grnNumber, (m.get(i.grnNumber) ?? 0) + 1); });
    return m;
  }, [store.invoices]);
  if (store.persona !== "CFO") return (
    <div className="space-y-5">
      <PageHeader eyebrow="ERP reference data" title="Purchase orders & goods receipts" subtitle="Restricted to the CFO role." />
      <Panel><p className="text-sm text-muted-foreground">Only the CFO can view, add or change purchase orders and goods receipts. Switch to the CFO role in the top bar if you hold it.</p></Panel>
    </div>
  );
  const pos = store.pos.filter((p) => !q || `${p.poNumber} ${p.vendorName}`.toLowerCase().includes(q.toLowerCase()));
  const grns = store.grns.filter((g) => !q || `${g.grnNumber} ${g.poNumber}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ERP reference data"
        title="Purchase orders & goods receipts"
        subtitle={`${store.pos.length} purchase orders and ${store.grns.length} goods receipts, synced from SAP S/4HANA and Oracle Fusion. Uploaded invoices are matched against these records.`}
      />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO, GRN or vendor" className="h-9 w-[280px]" />
      <Tabs defaultValue="po">
        <TabsList>
          <TabsTrigger value="po">Purchase orders ({pos.length})</TabsTrigger>
          <TabsTrigger value="grn">Goods receipts ({grns.length})</TabsTrigger>
          <TabsTrigger value="newpo">+ Add purchase order</TabsTrigger>
          <TabsTrigger value="newgrn">+ Record goods receipt</TabsTrigger>
        </TabsList>

        <TabsContent value="po" className="mt-4">
          <Panel dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  {["PO", "Vendor", "BU", "ERP", "Date", "Ordered qty", "Ordered value", "GRN needed", "Invoices", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {pos.slice(0, 200).map((p) => (
                    <>
                      <tr key={p.poNumber} className="cursor-pointer border-b border-border/60 hover:bg-muted/40" onClick={() => setOpen(open === p.poNumber ? null : p.poNumber)}>
                        <td className="px-4 py-2.5 font-semibold text-brand">{p.poNumber}</td>
                        <td className="px-4 py-2.5">{p.vendorName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.businessUnit}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.erp ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.date?.slice(0, 10)}</td>
                        <td className="tabular px-4 py-2.5">{p.orderedQty}</td>
                        <td className="tabular px-4 py-2.5">{money(p.orderedValue, p.currency)}</td>
                        <td className="px-4 py-2.5"><Pill tone={p.grnRequired === false ? "neutral" : "info"}>{p.grnRequired === false ? "2-way" : "3-way"}</Pill></td>
                        <td className="tabular px-4 py-2.5">{used.get(p.poNumber) ?? 0}</td>
                        <td className="px-4 py-2.5"><Button size="icon" variant="ghost" className="size-7" title="Remove" onClick={(e) => { e.stopPropagation(); store.removePo(p.poNumber); toast.success(`${p.poNumber} removed`); }}><Trash2 className="size-3.5" /></Button></td>
                      </tr>
                      {open === p.poNumber && (
                        <tr key={`${p.poNumber}-l`} className="bg-muted/30"><td colSpan={10} className="px-6 py-3 text-xs">
                          {(p.lines ?? []).length ? (p.lines ?? []).map((l) => <div key={l.line}>Line {l.line}: {l.description} — {l.qty} × {money(l.price, p.currency)}</div>) : "Header-level PO (no line detail)"}
                          <div className="mt-1 text-muted-foreground">Receipts: {store.grns.filter((g) => g.poNumber === p.poNumber).map((g) => `${g.grnNumber} (${g.receivedQty})`).join(", ") || "none yet"}</div>
                        </td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="grn" className="mt-4">
          <Panel dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  {["GRN", "PO", "Receipt date", "Received qty", "Received value", "Lines", "Invoices", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {grns.slice(0, 200).map((g) => (
                    <tr key={g.grnNumber} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-semibold text-brand">{g.grnNumber}</td>
                      <td className="px-4 py-2.5">{g.poNumber}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{g.receiptDate?.slice(0, 10)}</td>
                      <td className="tabular px-4 py-2.5">{g.receivedQty}</td>
                      <td className="tabular px-4 py-2.5">{g.receivedValue.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{(g.lines ?? []).map((l) => `L${l.line}: ${l.qty}`).join(" · ") || "—"}</td>
                      <td className="tabular px-4 py-2.5">{used.get(g.grnNumber) ?? 0}</td>
                      <td className="px-4 py-2.5"><Button size="icon" variant="ghost" className="size-7" title="Remove" onClick={() => { store.removeGrn(g.grnNumber); toast.success(`${g.grnNumber} removed`); }}><Trash2 className="size-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="newpo" className="mt-4"><NewPo /></TabsContent>
        <TabsContent value="newgrn" className="mt-4"><NewGrn /></TabsContent>
      </Tabs>
    </div>
  );
}

function NewPo() {
  const store = useStore();
  const [f, setF] = useState({ poNumber: "", vendorId: store.vendors[0]?.id ?? "", currency: "AED", businessUnit: "Manufacturing" as BusinessUnit, erp: "SAP S/4HANA" as Erp, terms: "Net 30", grnRequired: true });
  const [lines, setLines] = useState<PoLine[]>([{ line: 1, description: "", materialGroup: "General", qty: 1, price: 0 }]);
  const setLine = (i: number, p: Partial<PoLine>) => setLines((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = () => {
    const v = store.vendors.find((x) => x.id === f.vendorId);
    if (!f.poNumber.trim() || !v) return void toast.error("PO number and vendor are required");
    if (store.pos.some((p) => p.poNumber === f.poNumber.trim())) return void toast.error("That PO number already exists");
    const clean = lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!clean.length) return void toast.error("Add at least one line with description and quantity");
    const po: PurchaseOrder = {
      poNumber: f.poNumber.trim(), vendorId: v.id, vendorName: v.name, currency: f.currency, businessUnit: f.businessUnit, erp: f.erp,
      paymentTerms: f.terms, date: new Date().toISOString(), grnRequired: f.grnRequired,
      lines: clean.map((l, k) => ({ ...l, line: k + 1 })),
      orderedQty: clean.reduce((a, l) => a + l.qty, 0), orderedValue: clean.reduce((a, l) => a + l.qty * l.price, 0),
    };
    store.savePo(po);
    store.logErp({ erp: f.erp, direction: "Inbound", object: "Purchase order", count: 1, status: "Success", detail: `${po.poNumber} · ${v.name}` });
    toast.success(`${po.poNumber} saved`, { description: "Invoices quoting this PO will now match against it." });
    setF({ ...f, poNumber: "" });
    setLines([{ line: 1, description: "", materialGroup: "General", qty: 1, price: 0 }]);
  };
  return (
    <Panel title="New purchase order" description="Use the same supplier name, PO number, quantities and prices that will appear on the invoice.">
      <div className="grid gap-3 md:grid-cols-4">
        <Input placeholder="PO number e.g. PO-4501234" value={f.poNumber} onChange={(e) => setF({ ...f, poNumber: e.target.value })} />
        <select className={sel} value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>{store.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        <select className={sel} value={f.businessUnit} onChange={(e) => setF({ ...f, businessUnit: e.target.value as BusinessUnit })}>{BUS.map((b) => <option key={b}>{b}</option>)}</select>
        <select className={sel} value={f.erp} onChange={(e) => setF({ ...f, erp: e.target.value as Erp })}><option>SAP S/4HANA</option><option>Oracle Fusion</option></select>
        <Input placeholder="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
        <Input placeholder="Payment terms" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.grnRequired} onChange={(e) => setF({ ...f, grnRequired: e.target.checked })} /> Goods receipt required (3-way)</label>
      </div>
      <div className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[40px_1fr_120px_140px_40px] items-center gap-2">
            <span className="text-xs text-muted-foreground">L{i + 1}</span>
            <Input placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <Input type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
            <Input type="number" placeholder="Unit price" value={l.price} onChange={(e) => setLine(i, { price: Number(e.target.value) })} />
            <Button size="icon" variant="ghost" onClick={() => setLines((x) => x.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setLines((x) => [...x, { line: x.length + 1, description: "", materialGroup: "General", qty: 1, price: 0 }])}><Plus className="size-3.5" /> Add line</Button>
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={save}>Save purchase order</Button></div>
    </Panel>
  );
}

function NewGrn() {
  const store = useStore();
  const [poNo, setPoNo] = useState("");
  const [grnNo, setGrnNo] = useState("");
  const po = store.pos.find((p) => p.poNumber === poNo);
  const [qty, setQty] = useState<Record<number, number>>({});
  const save = () => {
    if (!po || !grnNo.trim()) return void toast.error("Pick a PO and enter a GRN number");
    if (store.grns.some((g) => g.grnNumber === grnNo.trim())) return void toast.error("That GRN number already exists");
    const lines = (po.lines ?? []).map((l) => ({ line: l.line, qty: qty[l.line] ?? l.qty }));
    const receivedQty = lines.length ? lines.reduce((a, l) => a + l.qty, 0) : (qty[0] ?? po.orderedQty);
    const receivedValue = lines.length ? lines.reduce((a, l) => a + l.qty * (po.lines!.find((x) => x.line === l.line)?.price ?? 0), 0) : (po.orderedValue * receivedQty) / Math.max(1, po.orderedQty);
    store.saveGrn({ grnNumber: grnNo.trim(), poNumber: po.poNumber, receiptDate: new Date().toISOString(), receivedQty, receivedValue, lines });
    store.logErp({ erp: po.erp ?? "SAP S/4HANA", direction: "Inbound", object: "Goods receipt", count: 1, status: "Success", detail: `${grnNo.trim()} against ${po.poNumber}` });
    toast.success(`${grnNo.trim()} recorded`, { description: `Received ${receivedQty} against ${po.poNumber}.` });
    setGrnNo(""); setQty({});
  };
  return (
    <Panel title="Record goods receipt" description="Enter what was physically received. Receiving less than ordered creates a quantity difference at matching.">
      <div className="grid gap-3 md:grid-cols-3">
        <select className={sel} value={poNo} onChange={(e) => { setPoNo(e.target.value); setQty({}); }}>
          <option value="">Select purchase order…</option>
          {store.pos.map((p) => <option key={p.poNumber} value={p.poNumber}>{p.poNumber} · {p.vendorName}</option>)}
        </select>
        <Input placeholder="GRN number e.g. GRN-5009876" value={grnNo} onChange={(e) => setGrnNo(e.target.value)} />
      </div>
      {po && (
        <div className="mt-4 space-y-2">
          {(po.lines ?? []).length ? po.lines!.map((l) => (
            <div key={l.line} className="grid grid-cols-[1fr_120px_140px] items-center gap-2 text-sm">
              <span>L{l.line} {l.description} <span className="text-muted-foreground">(ordered {l.qty})</span></span>
              <Input type="number" value={qty[l.line] ?? l.qty} onChange={(e) => setQty({ ...qty, [l.line]: Number(e.target.value) })} />
              <span className="text-xs text-muted-foreground">received</span>
            </div>
          )) : (
            <div className="grid grid-cols-[1fr_140px] items-center gap-2 text-sm"><span>Total received (ordered {po.orderedQty})</span><Input type="number" value={qty[0] ?? po.orderedQty} onChange={(e) => setQty({ 0: Number(e.target.value) })} /></div>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end"><Button onClick={save}>Save goods receipt</Button></div>
    </Panel>
  );
}
