import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { money } from "@/components/qap/primitives";

type Hit = { group: string; title: string; sub: string; go: () => void };

const PAGES: [string, string, string][] = [
  ["AP Command Center", "/", "dashboard kpi brief attention heatmap business unit country"],
  ["Invoice Intake", "/intake", "upload email mailbox capture samples bulk"],
  ["Document AI", "/document-ai", "extraction ocr classification fields lifecycle ask document"],
  ["Match Studio", "/match", "2-way 3-way po grn tolerance"],
  ["Exception Center", "/exceptions", "sla escalation copilot review"],
  ["Duplicate Intelligence", "/duplicates", "duplicate similar exact block"],
  ["Accounting Intelligence", "/accounting", "gl cost center coding tax code learning"],
  ["Vendor Hub", "/vendors", "supplier portal scorecard documents"],
  ["Payments Command Center", "/payments", "payment run bank release credited rejected"],
  ["AP Twin", "/ap-twin", "simulation what-if scenario policy"],
  ["Trust & Controls", "/trust", "audit trail sod policies erp sync compliance data quality"],
  ["All Invoices", "/invoices", "list table"],
  ["Analytics", "/analytics", "reports productivity aging"],
  ["Approvals", "/approvals", "approve reject levels"],
  ["Settings", "/settings", "connectors sap oracle snowflake databricks mailbox notifications thresholds users security"],
];

/** Searches every record type in the workspace: invoices, vendors, POs, GRNs, payments, notifications and pages. */
export function GlobalSearch() {
  const store = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const has = (...v: (string | null | undefined)[]) => v.some((x) => x && x.toLowerCase().includes(s));
    const out: Hit[] = [];
    PAGES.filter(([t, , k]) => has(t, k)).slice(0, 4).forEach(([t, to]) => out.push({ group: "Pages", title: t, sub: to, go: () => navigate({ to }) }));
    store.invoices.filter((i) => has(i.id, i.invoiceNumber, i.vendorName, i.poNumber, i.grnNumber, i.businessUnit, i.country, i.exceptionType, i.fileName)).slice(0, 8).forEach((i) =>
      out.push({ group: "Invoices", title: `${i.id} · ${i.vendorName}`, sub: `${i.invoiceNumber} · ${money(i.grossAmount, i.currency)} · ${i.lifecycle}`, go: () => { store.setActiveInvoiceId(i.id); navigate({ to: i.exceptionType ? "/exceptions" : "/document-ai" }); } }),
    );
    store.vendors.filter((v) => has(v.name, v.id, v.category, v.country)).slice(0, 5).forEach((v) =>
      out.push({ group: "Vendors", title: v.name, sub: `${v.category} · ${v.country}`, go: () => { store.setFilters({ vendor: v.name }); navigate({ to: "/vendors" }); } }),
    );
    store.pos.filter((p) => has(p.poNumber, p.vendorName)).slice(0, 5).forEach((p) =>
      out.push({ group: "Purchase orders", title: p.poNumber, sub: `${p.vendorName} · ${p.erp}`, go: () => navigate({ to: "/match" }) }),
    );
    store.grns.filter((g) => has(g.grnNumber, g.poNumber)).slice(0, 5).forEach((g) =>
      out.push({ group: "Goods receipts", title: g.grnNumber, sub: `for ${g.poNumber}`, go: () => navigate({ to: "/match" }) }),
    );
    store.payments.filter((p) => has(p.id, p.invoiceId, p.vendorName, p.bankReference, p.erpPaymentId)).slice(0, 5).forEach((p) =>
      out.push({ group: "Payments", title: `${p.id} · ${p.vendorName}`, sub: `${money(p.value, p.currency)} · ${p.status} · bank ${p.bankStatus}`, go: () => navigate({ to: "/payments" }) }),
    );
    store.notifications.filter((n) => has(n.title, n.body)).slice(0, 4).forEach((n) =>
      out.push({ group: "Alerts", title: n.title, sub: n.body, go: () => navigate({ to: n.link ?? "/" }) }),
    );
    return out;
  }, [q, store.invoices, store.vendors, store.pos, store.grns, store.payments, store.notifications]);

  const pick = (h: Hit) => { h.go(); setOpen(false); setQ(""); };

  return (
    <div ref={box} className="relative min-w-[200px] flex-1" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => Math.min(hits.length - 1, x + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
          if (e.key === "Enter" && hits[sel]) pick(hits[sel]!);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search invoices, vendors, payments, alerts, pages…"
        className="h-9 pl-9"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[420px] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          {hits.length === 0 && <div className="px-3 py-4 text-xs text-muted-foreground">No matches for “{q}”.</div>}
          {hits.map((h, i) => (
            <div key={`${h.group}-${h.title}-${i}`}>
              {(i === 0 || hits[i - 1]!.group !== h.group) && <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{h.group}</div>}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(h); }}
                onMouseEnter={() => setSel(i)}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left ${i === sel ? "bg-muted" : ""}`}
              >
                <div className="truncate text-[13px] font-semibold">{h.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">{h.sub}</div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
