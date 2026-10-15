import { rebase } from "./data";
import type { BusinessUnit, Country, Erp, GoodsReceipt, Invoice, LineItem, PurchaseOrder } from "./types";
import { vendors } from "./data";

/* Purchase orders and goods receipts held in the connected ERPs.
 * Uploaded invoices are matched against these records — they are never uploaded by the user. */

const vid = (name: string) => vendors.find((v) => v.name === name)?.id ?? "VEN-0000";

function po(
  poNumber: string,
  vendorName: string,
  currency: string,
  taxRate: number,
  terms: string,
  bu: BusinessUnit,
  erp: Erp,
  country: Country,
  date: string,
  lines: [string, string, number, number][],
  grnRequired = true,
): PurchaseOrder {
  const net = lines.reduce((s, [, , q, p]) => s + q * p, 0);
  return {
    poNumber,
    vendorId: vid(vendorName),
    vendorName,
    currency,
    orderedValue: Math.round(net * (1 + taxRate) * 100) / 100,
    orderedQty: lines.reduce((s, [, , q]) => s + q, 0),
    paymentTerms: terms,
    businessUnit: bu,
    date,
    erp,
    country,
    companyCode: country === "UAE" ? "NG10" : country === "Saudi Arabia" ? "NG20" : country === "India" ? "NG30" : country === "UK" ? "NG40" : "NG50",
    grnRequired,
    lines: lines.map(([description, materialGroup, qty, price], i) => ({ line: i + 1, description, materialGroup, qty, price })),
  };
}

function grn(grnNumber: string, p: PurchaseOrder, date: string, received?: number[]): GoodsReceipt {
  const lines = (p.lines ?? []).map((l, i) => ({ line: l.line, qty: received?.[i] ?? l.qty }));
  return {
    grnNumber,
    poNumber: p.poNumber,
    receiptDate: date,
    receivedQty: lines.reduce((s, l) => s + l.qty, 0),
    receivedValue: Math.round(lines.reduce((s, l, i) => s + l.qty * (p.lines?.[i]?.price ?? 0), 0) * 100) / 100,
    lines,
  };
}

const P1 = po("PO-45008210", "Nova Industrial Supplies LLC", "AED", 0.05, "Net 45", "Manufacturing", "SAP S/4HANA", "UAE", rebase("2027-03-18"), [
  ["Industrial Valve DN80 Carbon Steel", "Valves", 40, 1200],
  ["Pressure Gauge 0-16 bar", "Instruments", 60, 480],
  ["Hydraulic Coupling Set", "Piping", 25, 610],
]);
const P2 = po("PO-45008227", "Nova Industrial Supplies LLC", "AED", 0.05, "Net 45", "Manufacturing", "SAP S/4HANA", "UAE", rebase("2027-03-21"), [
  ["Stainless Steel Pipe 6m", "Piping", 80, 950],
  ["Bearing Assembly 6205", "Spare Parts", 200, 42.5],
  ["Safety Relief Valve", "Valves", 30, 1850],
]);
const P3 = po("PO-45008255", "Metro Packaging Industries", "AED", 0.05, "Net 30", "Distribution", "Oracle Fusion", "UAE", rebase("2027-03-25"), [
  ["Corrugated Carton 600x400", "Packaging", 1000, 4.2],
  ["Stretch Film Roll", "Packaging", 120, 38],
  ["Pallet Wrap Labels", "Packaging", 50, 12],
]);
const P4 = po("PO-45008262", "Eastern Engineering Works", "AED", 0.05, "Net 60", "Manufacturing", "SAP S/4HANA", "UAE", rebase("2027-03-27"), [
  ["Control Panel Module", "Electricals", 12, 2350],
  ["Cable Harness 25m", "Electricals", 40, 180],
]);
const P5 = po("PO-45008300", "Global Freight Partners", "AED", 0.05, "Net 30", "Logistics", "Oracle Fusion", "UAE", rebase("2027-03-30"), [
  ["Ocean Freight DXB-JEA container", "Freight", 2, 7700],
  ["Terminal Handling Charge", "Freight", 2, 650],
  ["Documentation Charge", "Freight", 1, 350],
], false);
const P6 = po("PO-45008340", "International Clearing Co.", "AED", 0.05, "Net 30", "Trading", "SAP S/4HANA", "UAE", rebase("2027-04-01"), [
  ["Customs Duty on import consignment", "Customs", 1, 24300],
  ["Customs Clearance Fee", "Customs", 1, 1500],
], false);
const P7 = po("PO-45008351", "Vertex Technology Services", "AED", 0.05, "Net 30", "Services", "Oracle Fusion", "UAE", rebase("2027-03-02"), [
  ["Abonnement annuel licence logicielle", "Subscription", 1, 18000],
  ["Services hebergement cloud mensuel", "Subscription", 12, 950],
], false);
const P8 = po("PO-45008366", "Prime Logistics Solutions", "SAR", 0.15, "Net 30", "Logistics", "Oracle Fusion", "Saudi Arabia", rebase("2027-03-29"), [
  ["Warehouse Storage April", "Warehousing", 30, 85],
  ["Forklift Handling", "Warehousing", 40, 22],
]);
const P9 = po("PO-45008377", "Polaris Data Networks", "INR", 0.18, "Net 30", "Services", "SAP S/4HANA", "India", rebase("2027-03-31"), [
  ["Network Managed Services April", "IT Services", 1, 250000],
], false);

export const ERP_POS: PurchaseOrder[] = [P1, P2, P3, P4, P5, P6, P7, P8, P9];
export const ERP_GRNS: GoodsReceipt[] = [
  grn("GRN-910560", P1, rebase("2027-04-10")),
  grn("GRN-910577", P2, rebase("2027-04-11"), [72, 200, 30]),
  grn("GRN-910601", P3, rebase("2027-04-08")),
  grn("GRN-910615", P4, rebase("2027-04-09")),
  grn("GRN-910640", P8, rebase("2027-04-08")),
];

/* --------------------------- Line reconciliation --------------------------- */
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

export function descSimilarity(a: string, b: string) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((t) => B.has(t) && common++);
  return common / Math.min(A.size, B.size);
}

/** Pulls ordered quantity/price from the PO and received quantity from the GRN onto each invoice line. */
export function reconcileLines(inv: Invoice, p: PurchaseOrder | null, g: GoodsReceipt | null): LineItem[] {
  if (!p?.lines?.length) return inv.lines;
  const used = new Set<number>();
  return inv.lines.map((l, idx) => {
    let best = -1;
    let bestScore = 0;
    p.lines!.forEach((pl, i) => {
      if (used.has(i)) return;
      const s = descSimilarity(l.description, pl.description);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best < 0 || bestScore < 0.34) best = !used.has(idx) && p.lines![idx] ? idx : -1;
    if (best < 0) return { ...l, poQty: 0, poPrice: 0, grnQty: g ? 0 : null };
    used.add(best);
    const pl = p.lines![best]!;
    const gl = g?.lines?.find((x) => x.line === pl.line);
    return {
      ...l,
      materialGroup: pl.materialGroup,
      poQty: pl.qty,
      poPrice: pl.price,
      grnQty: g ? (gl?.qty ?? 0) : null,
    };
  });
}
