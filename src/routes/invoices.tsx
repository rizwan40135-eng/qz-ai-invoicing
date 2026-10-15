import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getOriginal, listOriginalIds } from "@/lib/fileVault";
import type { Invoice } from "@/lib/types";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, money, statusTone } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Eye, Trash2 } from "lucide-react";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "All Invoices — Q-AP AI" },
      { name: "description", content: "Browse every invoice with lifecycle stage, match status, approval, ERP and payment state." },
      { property: "og:title", content: "All Invoices — Q-AP AI" },
      { property: "og:description", content: "The complete invoice register for Nova Global Industries." },
    ],
  }),
  component: Invoices,
});

function Invoices() {
  const store = useStore();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(50);
  const rows = store.filteredInvoices;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remove = (ids: string[]) => {
    if (!ids.length) return;
    const paid = store.invoices.filter((i) => ids.includes(i.id) && (i.paymentStatus === "Released" || i.paymentStatus === "Beneficiary Credited")).length;
    if (!window.confirm(`Delete ${ids.length} invoice${ids.length > 1 ? "s" : ""}?${paid ? ` ${paid} already paid.` : ""} Linked payments and alerts are removed and every total recalculates.`)) return;
    store.removeInvoices(ids);
    setPicked(new Set());
    toast.success(`${ids.length} invoice${ids.length > 1 ? "s" : ""} deleted`);
  };
  const [originals, setOriginals] = useState<Set<string>>(new Set());
  useEffect(() => { listOriginalIds().then(setOriginals).catch(() => undefined); }, [store.invoices.length]);

  /** Opens or downloads the original uploaded file; records received as structured ERP/e-invoice data get a rendered copy. */
  const openDoc = async (i: Invoice, download: boolean) => {
    const orig = await getOriginal(i.id).catch(() => null);
    const blob = orig?.blob ?? new Blob([renderInvoiceHtml(i)], { type: "text/html" });
    const name = orig?.name ?? `${i.invoiceNumber}.html`;
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      toast.success(`Downloaded ${name}`);
    } else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const exportCsv = () => {
    const header = ["Invoice", "Number", "Vendor", "BU", "Country", "ERP", "Currency", "Gross", "Type", "Match", "Approval", "ERP Status", "Payment", "Lifecycle"];
    const body = rows.slice(0, 500).map((i) => [i.id, i.invoiceNumber, i.vendorName, i.businessUnit, i.country, i.erp, i.currency, i.grossAmount, i.invoiceType, i.matchStatus, i.approvalStatus, i.erpStatus, i.paymentStatus, i.lifecycle].join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qap-ai-invoices.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Invoice register exported");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Invoice register"
        title="All invoices"
        subtitle={`${rows.length} invoices match the current filters`}
        actions={
          <>
            {picked.size > 0 && (
              <Button variant="destructive" className="gap-1.5" onClick={() => remove([...picked])}>
                <Trash2 className="size-4" /> Delete {picked.size}
              </Button>
            )}
            <Button variant="outline" className="gap-1.5" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </>
        }
      />
      <Panel dense>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-3"><input type="checkbox" aria-label="Select all shown" checked={picked.size > 0 && rows.slice(0, limit).every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.slice(0, limit).map((r) => r.id)) : new Set())} /></th>
                {["Invoice", "Vendor", "BU", "Country", "ERP", "Type", "Value", "Match", "Approval", "ERP Status", "Payment", "Lifecycle", " "].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-3"><input type="checkbox" aria-label={`Select ${i.invoiceNumber}`} checked={picked.has(i.id)} onChange={() => toggle(i.id)} /></td>
                  <td className="px-4 py-2.5"><div className="font-semibold text-brand">{i.invoiceNumber}</div><div className="text-[10px] text-muted-foreground">{i.id}</div></td>
                  <td className="px-4 py-2.5">{i.vendorName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{i.businessUnit}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{i.country}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{i.erp}</td>
                  <td className="px-4 py-2.5">{i.invoiceType}</td>
                  <td className="tabular px-4 py-2.5">{money(i.grossAmount, i.currency)}</td>
                  <td className="px-4 py-2.5"><Pill tone={statusTone(i.matchStatus)}>{i.matchStatus}</Pill></td>
                  <td className="px-4 py-2.5"><Pill tone={statusTone(i.approvalStatus)}>{i.approvalStatus}</Pill></td>
                  <td className="px-4 py-2.5"><Pill tone={statusTone(i.erpStatus)}>{i.erpStatus}</Pill></td>
                  <td className="px-4 py-2.5"><Pill tone={statusTone(i.paymentStatus)}>{i.paymentStatus}</Pill></td>
                  <td className="px-4 py-2.5">{i.lifecycle}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="size-7" title={originals.has(i.id) ? "View original file" : "View invoice copy (received as structured data)"} onClick={() => void openDoc(i, false)}><Eye className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" title={originals.has(i.id) ? "Download original file" : "Download invoice copy"} onClick={() => void openDoc(i, true)}><Download className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" title="Delete invoice" aria-label="Delete invoice" onClick={() => remove([i.id])}><Trash2 className="size-3.5" /></Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        store.setActiveInvoiceId(i.id);
                        void navigate({ to: "/match" });
                      }}
                    >
                      Open
                    </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {limit < rows.length && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 50)}>
              Load more ({rows.length - limit} remaining)
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function renderInvoiceHtml(i: Invoice) {
  const rows = i.lines.map((l) => `<tr><td>${l.line}</td><td>${esc(l.description)}</td><td class=r>${l.invoiceQty}</td><td class=r>${l.invoicePrice.toLocaleString()}</td><td class=r>${(l.invoiceQty * l.invoicePrice).toLocaleString()}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset=utf-8><title>${esc(i.invoiceNumber)}</title><style>body{font-family:system-ui;margin:40px;color:#071A2B}h1{color:#0450A1;margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.r{text-align:right}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:20px;font-size:14px}.note{margin-top:30px;font-size:12px;color:#666}</style></head><body>
<h1>TAX INVOICE</h1><div>${esc(i.vendorName)}</div>
<div class=meta><div>Invoice no: <b>${esc(i.invoiceNumber)}</b></div><div>Invoice date: ${esc(i.invoiceDate)}</div><div>Bill to: Nova Global Industries — ${esc(i.businessUnit)} (${esc(i.companyCode)})</div><div>Due date: ${esc(i.dueDate)}</div><div>PO: ${esc(i.poNumber ?? "—")}</div><div>GRN: ${esc(i.grnNumber ?? "—")}</div><div>Terms: ${esc(i.paymentTerms)}</div><div>Currency: ${esc(i.currency)}</div></div>
<table><tr><th>#</th><th>Description</th><th class=r>Qty</th><th class=r>Unit price</th><th class=r>Amount</th></tr>${rows}
<tr><td colspan=4 class=r>Net</td><td class=r>${i.netAmount.toLocaleString()}</td></tr><tr><td colspan=4 class=r>Tax</td><td class=r>${i.taxAmount.toLocaleString()}</td></tr><tr><td colspan=4 class=r><b>Total</b></td><td class=r><b>${i.currency} ${i.grossAmount.toLocaleString()}</b></td></tr></table>
<p class=note>Received via ${esc(i.source)} as structured data (no scanned image). This copy is rendered from the captured record ${esc(i.id)}.</p></body></html>`;
}
