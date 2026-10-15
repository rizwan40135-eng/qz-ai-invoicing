import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Send } from "lucide-react";
import { Panel, money } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { Invoice } from "@/lib/types";

const TEMPLATES = {
  exceptions: { label: "Open exceptions — action required", subject: "Action required: invoices on hold" },
  documents: { label: "Missing supporting documents", subject: "Request for supporting documents" },
  payment: { label: "Payment status update", subject: "Payment status update" },
  rejected: { label: "Invoices returned for correction", subject: "Invoices returned for correction" },
} as const;
type Tpl = keyof typeof TEMPLATES;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const vendorEmail = (name: string) => `accounts@${name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24)}.example`;

function pick(t: Tpl, inv: Invoice[]) {
  if (t === "exceptions") return inv.filter((i) => i.exceptionType);
  if (t === "documents") return inv.filter((i) => i.exceptionType === "GRN Missing" || i.exceptionType === "PO Missing" || i.exceptionType === "Compliance Issue" || i.exceptionType === "Tax Variance");
  if (t === "payment") return inv.filter((i) => i.approvalStatus === "Approved");
  return inv.filter((i) => i.approvalStatus === "Rejected");
}

function intro(t: Tpl) {
  switch (t) {
    case "exceptions": return "The following invoices are currently on hold in our accounts payable process. To avoid delays to your payment, please review each item and respond with the requested information or a corrected document through the supplier portal.";
    case "documents": return "To complete processing of the invoices below, we require supporting documentation (for example a signed delivery note, purchase order reference or tax registration evidence). Please upload the documents through the supplier portal.";
    case "payment": return "Please find below the current payment status of your approved invoices with Nova Global Industries.";
    case "rejected": return "The invoices below have been returned and cannot be processed in their current form. Please issue corrected invoices referencing the original invoice numbers.";
  }
}

function buildHtml(vendor: string, t: Tpl, rows: Invoice[], note: string, sender: string) {
  const total = rows.reduce((a, i) => a + i.grossAmount, 0);
  const cur = rows[0]?.currency ?? "AED";
  const tr = rows.map((i) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #E3E8EF">${esc(i.invoiceNumber)}</td><td style="padding:8px 10px;border-bottom:1px solid #E3E8EF">${esc(i.invoiceDate)}</td><td style="padding:8px 10px;border-bottom:1px solid #E3E8EF;text-align:right">${esc(money(i.grossAmount, i.currency))}</td><td style="padding:8px 10px;border-bottom:1px solid #E3E8EF">${esc(i.poNumber ?? "Non-PO")}</td><td style="padding:8px 10px;border-bottom:1px solid #E3E8EF">${esc(t === "payment" ? `${i.paymentStatus}${i.bankStatus && i.bankStatus !== "—" ? ` · ${i.bankStatus}` : ""}` : i.exceptionType ?? i.approvalStatus)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(TEMPLATES[t].subject)}</title></head>
<body style="margin:0;background:#F7F9FC;font-family:Segoe UI,Arial,sans-serif;color:#071A2B">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;padding:24px 0"><tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E3E8EF;border-radius:10px;overflow:hidden">
<tr><td style="background:#0450A1;padding:18px 28px;color:#ffffff"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Nova Global Industries · Accounts Payable</div><div style="font-size:20px;font-weight:600;margin-top:4px">${esc(TEMPLATES[t].subject)}</div></td></tr>
<tr><td style="padding:24px 28px;font-size:14px;line-height:1.6">
<p style="margin:0 0 12px">Dear ${esc(vendor)} team,</p>
<p style="margin:0 0 16px">${esc(intro(t))}</p>
${note ? `<p style="margin:0 0 16px;padding:12px 14px;background:#FFF4EF;border-left:3px solid #F1481A">${esc(note)}</p>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
<tr style="background:#F1F5FA;text-align:left"><th style="padding:8px 10px">Invoice</th><th style="padding:8px 10px">Date</th><th style="padding:8px 10px;text-align:right">Amount</th><th style="padding:8px 10px">PO</th><th style="padding:8px 10px">Status</th></tr>
${tr}
<tr><td colspan="2" style="padding:10px;font-weight:600">${rows.length} invoice(s)</td><td style="padding:10px;text-align:right;font-weight:600">${esc(money(total, cur))}</td><td colspan="2"></td></tr>
</table>
<p style="margin:20px 0 0">If you have any questions, reply to this email or raise a query in the supplier portal quoting the invoice number.</p>
<p style="margin:16px 0 0">Kind regards,<br><strong>${esc(sender)}</strong><br>Accounts Payable, Nova Global Industries</p>
</td></tr>
<tr><td style="padding:14px 28px;background:#F7F9FC;font-size:11px;color:#5B6B7D">This message was generated by Q-AP AI. Please do not share bank details by email — changes are accepted only through the verified supplier portal.</td></tr>
</table></td></tr></table></body></html>`;
}

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bulk supplier emails / portal alerts built from each supplier's actual invoices. */
export function VendorComms() {
  const store = useStore();
  const [tpl, setTpl] = useState<Tpl>("exceptions");
  const [note, setNote] = useState("");
  const [sel, setSel] = useState<string[]>([]);

  const groups = useMemo(() => {
    const m = new Map<string, Invoice[]>();
    store.filteredInvoices.forEach((i) => m.set(i.vendorName, [...(m.get(i.vendorName) ?? []), i]));
    return [...m.entries()].map(([vendor, inv]) => ({ vendor, rows: pick(tpl, inv) })).filter((g) => g.rows.length).sort((a, b) => b.rows.length - a.rows.length);
  }, [store.filteredInvoices, tpl]);
  const chosen = groups.filter((g) => sel.includes(g.vendor));

  const send = () => {
    chosen.forEach((g) => {
      g.rows.slice(0, 50).forEach((i) => store.updateInvoice(i.id, {}, { actor: store.persona, actorType: "Human", action: `Supplier alert sent: ${TEMPLATES[tpl].label}`, newValue: vendorEmail(g.vendor) }));
    });
    store.pushNotification({ severity: "Low", title: `${chosen.length} supplier alert(s) sent`, body: `${TEMPLATES[tpl].label} · ${chosen.reduce((a, g) => a + g.rows.length, 0)} invoices referenced.`, link: "/vendors" });
    toast.success(`Alert sent to ${chosen.length} supplier(s)`, { description: "Shown in each supplier's portal and recorded on every invoice." });
    setSel([]);
  };
  const download = (kind: "eml" | "doc") => {
    chosen.forEach((g) => {
      const html = buildHtml(g.vendor, tpl, g.rows, note, store.persona);
      const slug = g.vendor.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
      if (kind === "doc") save(`${slug}-${tpl}.doc`, html, "application/msword");
      else save(`${slug}-${tpl}.eml`, `To: ${vendorEmail(g.vendor)}\r\nFrom: ap-invoices@novaglobal.example\r\nSubject: ${TEMPLATES[tpl].subject}\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`, "message/rfc822");
    });
    toast.success(`${chosen.length} email(s) downloaded`);
  };

  return (
    <Panel title="Supplier communications" description="Pick a message, select suppliers and send portal alerts in bulk or download ready-to-send emails"
      actions={<div className="flex gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!chosen.length} onClick={() => download("doc")}><FileText className="size-4" /> Word</Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!chosen.length} onClick={() => download("eml")}><Download className="size-4" /> Email file</Button>
        <Button size="sm" className="gap-1.5" disabled={!chosen.length} onClick={send}><Send className="size-4" /> Send alert ({chosen.length})</Button>
      </div>}>
      <div className="grid gap-3 md:grid-cols-[260px_1fr]">
        <Select value={tpl} onValueChange={(v) => { setTpl(v as Tpl); setSel([]); }}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(TEMPLATES) as Tpl[]).map((k) => <SelectItem key={k} value={k}>{TEMPLATES[k].label}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} aria-label="Additional message to include" />
      </div>
      <div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border border-border">
        <label className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[12px] font-semibold">
          <Checkbox checked={groups.length > 0 && sel.length === groups.length} onCheckedChange={(v) => setSel(v ? groups.map((g) => g.vendor) : [])} />
          {groups.length} supplier(s) with matching invoices
        </label>
        {groups.map((g) => (
          <label key={g.vendor} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[13px] last:border-0">
            <Checkbox checked={sel.includes(g.vendor)} onCheckedChange={(v) => setSel((s) => (v ? [...s, g.vendor] : s.filter((x) => x !== g.vendor)))} />
            <span className="flex-1">{g.vendor}<span className="ml-2 text-[11px] text-muted-foreground">{vendorEmail(g.vendor)}</span></span>
            <span className="tabular text-[12px] text-muted-foreground">{g.rows.length} invoice(s)</span>
          </label>
        ))}
      </div>
    </Panel>
  );
}
