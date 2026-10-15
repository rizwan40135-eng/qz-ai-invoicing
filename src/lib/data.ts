import type {
  AuditEntry,
  BusinessUnit,
  Coding,
  Country,
  Erp,
  ExceptionType,
  GoodsReceipt,
  Invoice,
  InvoiceType,
  LineItem,
  MailItem,
  Notification,
  PaymentRecord,
  PurchaseOrder,
  Tolerances,
  Vendor,
} from "./types";

/* ------------------------------------------------------------------ */
/* Deterministic PRNG — the demo dataset never changes between reloads */
/* ------------------------------------------------------------------ */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20270418);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!;
const between = (min: number, max: number) => min + rnd() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export const BUSINESS_UNITS: BusinessUnit[] = [
  "Manufacturing",
  "Trading",
  "Transportation",
  "Logistics",
  "Distribution",
  "Services",
];
export const COUNTRIES: Country[] = ["UAE", "Saudi Arabia", "India", "UK", "Singapore"];
export const ERPS: Erp[] = ["SAP S/4HANA", "Oracle Fusion"];

export const CURRENCY_BY_COUNTRY: Record<Country, string> = {
  UAE: "AED",
  "Saudi Arabia": "SAR",
  India: "INR",
  UK: "GBP",
  Singapore: "SGD",
};

/** Reference rates to AED, used to compare and total amounts across currencies. */
export const AED_RATE: Record<string, number> = { AED: 1, SAR: 0.979, INR: 0.0441, GBP: 4.65, SGD: 2.74, USD: 3.6725, EUR: 3.98 };
export const toAed = (amount: number, currency: string) => amount * (AED_RATE[currency] ?? 1);

export const COUNTRY_CONFIG: {
  country: Country;
  currency: string;
  taxModel: string;
  rate: string;
  withholding: string;
  eInvoice: string;
  format: string;
  language: string;
  rules: string;
}[] = [
  {
    country: "UAE",
    currency: "AED",
    taxModel: "VAT",
    rate: "5%",
    withholding: "None",
    eInvoice: "Phased rollout (demo configuration)",
    format: "PDF / XML",
    language: "English, Arabic",
    rules: "TRN validation, reverse charge on imports",
  },
  {
    country: "Saudi Arabia",
    currency: "SAR",
    taxModel: "VAT",
    rate: "15%",
    withholding: "5–20% on non-resident services",
    eInvoice: "Clearance model (demo configuration)",
    format: "XML with QR",
    language: "Arabic, English",
    rules: "QR presence, VAT number format, clearance stamp",
  },
  {
    country: "India",
    currency: "INR",
    taxModel: "GST",
    rate: "5 / 12 / 18%",
    withholding: "TDS 2–10%",
    eInvoice: "IRN + QR (demo configuration)",
    format: "JSON / XML",
    language: "English, Hindi",
    rules: "GSTIN validation, IRN presence, HSN codes",
  },
  {
    country: "UK",
    currency: "GBP",
    taxModel: "VAT",
    rate: "20%",
    withholding: "CIS where applicable",
    eInvoice: "Not mandated (demo configuration)",
    format: "PDF",
    language: "English",
    rules: "VAT number check, MTD digital links",
  },
  {
    country: "Singapore",
    currency: "SGD",
    taxModel: "GST",
    rate: "9%",
    withholding: "10–17% on certain payments",
    eInvoice: "InvoiceNow / Peppol (demo configuration)",
    format: "Peppol BIS",
    language: "English",
    rules: "UEN validation, Peppol schema",
  },
];

const VENDOR_SEEDS: { name: string; category: string }[] = [
  { name: "Nova Industrial Supplies LLC", category: "Industrial Materials" },
  { name: "Global Freight Partners", category: "Freight" },
  { name: "Apex Advisory Services", category: "Professional Services" },
  { name: "Metro Packaging Industries", category: "Packaging" },
  { name: "Eastern Engineering Works", category: "Engineering" },
  { name: "Prime Logistics Solutions", category: "Logistics" },
  { name: "Vertex Technology Services", category: "IT Services" },
  { name: "BlueRiver Utilities", category: "Utilities" },
  { name: "Harbour Line Shipping Co.", category: "Freight" },
  { name: "Crescent Steel Trading", category: "Raw Materials" },
  { name: "Orion Facility Management", category: "Facilities" },
  { name: "International Clearing Co.", category: "Customs" },
  { name: "Delta Chemical Distributors", category: "Chemicals" },
  { name: "Summit Cloud Platforms", category: "Subscription" },
  { name: "Northwind Auto Parts", category: "Spare Parts" },
  { name: "Falcon Security Services", category: "Security" },
  { name: "Silverline Print Works", category: "Print" },
  { name: "Cobalt Instruments Ltd", category: "Instrumentation" },
  { name: "Pioneer Warehousing Group", category: "Warehousing" },
  { name: "Atlas Heavy Equipment", category: "Equipment" },
  { name: "Zenith Marketing Collective", category: "Marketing" },
  { name: "Emerald Catering Services", category: "Catering" },
  { name: "Quantum Calibration Labs", category: "Calibration" },
  { name: "Redstone Construction Supply", category: "Construction" },
  { name: "Lighthouse Legal Partners", category: "Legal" },
  { name: "Aurora Power Systems", category: "Utilities" },
  { name: "Sandbar Marine Services", category: "Marine" },
  { name: "Trident Lubricants FZE", category: "Lubricants" },
  { name: "Kestrel Air Cargo", category: "Freight" },
  { name: "Brightpath Training Institute", category: "Training" },
  { name: "Ironbridge Fabricators", category: "Fabrication" },
  { name: "Cedar Office Interiors", category: "Office" },
  { name: "Polaris Data Networks", category: "IT Services" },
  { name: "Greenfield Waste Management", category: "Environmental" },
  { name: "Monarch Insurance Brokers", category: "Insurance" },
  { name: "Skyline Crane Rentals", category: "Equipment" },
  { name: "Copperfield Electricals", category: "Electricals" },
  { name: "Seabreeze Port Services", category: "Port Services" },
  { name: "Highgate Consulting Group", category: "Professional Services" },
  { name: "Arcadia Software Labs", category: "Subscription" },
];

export const vendors: Vendor[] = VENDOR_SEEDS.map((v, i) => {
  // The hero demo vendor is deliberately a low-risk, strategic supplier.
  const riskScore = v.name === "Nova Industrial Supplies LLC" ? 16.4 : round(between(4, 78), 1);
  return {
    id: `VEN-${(1000 + i * 7).toString()}`,
    name: v.name,
    country: COUNTRIES[i % COUNTRIES.length]!,
    taxId: `${["100", "300", "07A", "GB4", "20S"][i % 5]}${int(100000, 999999)}${int(10, 99)}`,
    bankAccount: `**** ${int(1000, 9999)}`,
    category: v.category,
    riskLevel: riskScore > 55 ? "High" : riskScore > 28 ? "Medium" : "Low",
    riskScore,
    onTimeDocs: round(between(62, 99), 1),
    paymentQueries: int(0, 24),
    critical: i % 9 === 0,
  };
});

const DESCRIPTIONS: Record<string, string[]> = {
  goods: [
    "Industrial Valve DN80",
    "Pressure Gauge 0-16 bar",
    "Stainless Steel Pipe 6m",
    "Hydraulic Coupling Set",
    "Conveyor Belt Segment",
    "Bearing Assembly 6205",
    "Safety Relief Valve",
    "Control Panel Module",
    "Cable Harness 25m",
    "Filter Cartridge Pack",
  ],
  freight: [
    "Ocean Freight DXB-JEA",
    "Inland Haulage Charge",
    "Terminal Handling Charge",
    "Customs Clearance Fee",
    "Documentation Charge",
    "Demurrage — 2 days",
  ],
  service: [
    "Advisory Retainer — Monthly",
    "Implementation Services",
    "Managed Support Hours",
    "Cloud Hosting Services",
    "Annual Subscription Licence",
    "Site Maintenance Visit",
  ],
};

const GL_BY_CATEGORY: Record<string, { gl: string; cc: string }> = {
  Freight: { gl: "610300 — Freight & Transport", cc: "CC-4100 Logistics Ops" },
  "IT Services": { gl: "642100 — IT Hosting Expense", cc: "CC-7200 Digital Platforms" },
  Subscription: { gl: "642300 — Software Subscription", cc: "CC-7200 Digital Platforms" },
  "Professional Services": { gl: "651000 — Professional Fees", cc: "CC-9100 Corporate" },
  Utilities: { gl: "620100 — Utilities Expense", cc: "CC-3300 Plant Services" },
  Customs: { gl: "610500 — Customs & Duty", cc: "CC-4100 Logistics Ops" },
};
const DEFAULT_GL = { gl: "500100 — Raw Material Consumption", cc: "CC-2100 Production" };

function codingFor(category: string, country: Country, confidence: number): Coding {
  const base = GL_BY_CATEGORY[category] ?? DEFAULT_GL;
  const taxCode =
    country === "UAE"
      ? "UAE-STD"
      : country === "Saudi Arabia"
        ? "KSA-STD15"
        : country === "India"
          ? "IN-GST18"
          : country === "UK"
            ? "UK-VAT20"
            : "SG-GST9";
  return {
    glAccount: base.gl,
    costCenter: base.cc,
    profitCenter: pick(["PC-100 Corporate", "PC-200 Industrial", "PC-300 Trade"]),
    internalOrder: `IO-${int(40000, 49999)}`,
    taxCode,
    project: pick(["—", "WBS-NG-2027-01", "WBS-NG-2027-14", "WBS-NG-2026-08"]),
    confidence,
  };
}

const TAX_RATE: Record<Country, number> = {
  UAE: 0.05,
  "Saudi Arabia": 0.15,
  India: 0.18,
  UK: 0.2,
  Singapore: 0.09,
};

const OWNERS = [
  "R. Fernandes",
  "S. Al Marri",
  "P. Iyer",
  "J. Whitfield",
  "L. Tan",
  "M. Haddad",
  "D. Okonkwo",
  "A. Voss",
];

/** Workspace "today" — all history is laid out relative to the current date so nothing sits in the future. */
const _now = new Date();
export const ANCHOR_MS = Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate());
const BASE_MS = Date.UTC(2027, 3, 18);
/** Re-bases a reference date (authored against the original calendar) onto today. */
export function rebase(iso: string) {
  return new Date(ANCHOR_MS - (BASE_MS - Date.parse(iso))).toISOString().slice(0, 10);
}
function dstr(daysAgo: number) {
  const d = new Date(ANCHOR_MS - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}
function tstr(hoursAgo: number) {
  return new Date(Math.min(Date.now(), ANCHOR_MS + 9 * 3600000) - hoursAgo * 3600000).toISOString();
}

const TYPE_PLAN: { type: InvoiceType; count: number }[] = [
  { type: "PO Invoice", count: 350 },
  { type: "Non-PO Invoice", count: 80 },
  { type: "Freight / Logistics", count: 30 },
  { type: "Import / Customs", count: 20 },
  { type: "Service Invoice", count: 8 },
  { type: "Utility", count: 4 },
  { type: "Intercompany", count: 3 },
  { type: "Credit Note", count: 2 },
  { type: "Debit Note", count: 1 },
  { type: "Employee Reimbursement", count: 2 },
];

const EXCEPTION_MIX: ExceptionType[] = [
  "GRN Missing",
  "GRN Missing",
  "GRN Missing",
  "Quantity Variance",
  "Quantity Variance",
  "Price Variance",
  "Price Variance",
  "PO Missing",
  "Tax Variance",
  "Duplicate Risk",
  "Invalid Coding",
  "Approval Missing",
  "Vendor Mismatch",
  "Bank Detail Change",
  "Compliance Issue",
];

export const purchaseOrders: PurchaseOrder[] = [];
export const goodsReceipts: GoodsReceipt[] = [];

function buildLines(type: InvoiceType, bucket: keyof typeof DESCRIPTIONS, count: number) {
  const lines: LineItem[] = [];
  for (let i = 0; i < count; i++) {
    const qty = int(5, 220);
    const price = round(between(35, 2400), 2);
    lines.push({
      line: i + 1,
      description: pick(DESCRIPTIONS[bucket]!),
      materialGroup:
        type === "Freight / Logistics"
          ? "Freight"
          : bucket === "service"
            ? "Subscription"
            : pick(["Valves", "Instruments", "Piping", "Electricals"]),
      invoiceQty: qty,
      poQty: qty,
      grnQty: qty,
      invoicePrice: price,
      poPrice: price,
    });
  }
  return lines;
}

function makeInvoices(): Invoice[] {
  const out: Invoice[] = [];
  let n = 0;
  const exceptionTargets = new Set<number>();
  while (exceptionTargets.size < 60) exceptionTargets.add(int(0, 499));
  const duplicateTargets = new Set<number>();
  while (duplicateTargets.size < 20) duplicateTargets.add(int(0, 499));

  for (const plan of TYPE_PLAN) {
    for (let k = 0; k < plan.count; k++) {
      const idx = n++;
      const vendor =
        plan.type === "Freight / Logistics"
          ? vendors[[1, 8, 28, 5][idx % 4]!]!
          : plan.type === "Import / Customs"
            ? vendors[11]!
            : plan.type === "Non-PO Invoice"
              ? vendors[[2, 13, 24, 38, 39, 20][idx % 6]!]!
              : vendors[idx % vendors.length]!;
      const country = vendor.country;
      const bu = BUSINESS_UNITS[idx % BUSINESS_UNITS.length]!;
      const currency = CURRENCY_BY_COUNTRY[country];
      const bucket: keyof typeof DESCRIPTIONS =
        plan.type === "Freight / Logistics" || plan.type === "Import / Customs"
          ? "freight"
          : plan.type === "PO Invoice"
            ? "goods"
            : "service";
      const lines = buildLines(plan.type, bucket, int(1, 4));
      const hasPo = plan.type !== "Non-PO Invoice" && plan.type !== "Employee Reimbursement";
      const isException = exceptionTargets.has(idx);
      const isDuplicate = duplicateTargets.has(idx);
      const exceptionType = isException ? EXCEPTION_MIX[idx % EXCEPTION_MIX.length]! : null;

      if (exceptionType === "Quantity Variance" && lines[0]) {
        lines[0].grnQty = Math.max(1, Math.round(lines[0].invoiceQty * 0.94));
      }
      if (exceptionType === "Price Variance" && lines[0]) {
        lines[0].poPrice = round(lines[0].invoicePrice * 0.955, 2);
      }
      if (exceptionType === "GRN Missing") lines.forEach((l) => (l.grnQty = null));

      const net = round(
        lines.reduce((s, l) => s + l.invoiceQty * l.invoicePrice, 0),
        2,
      );
      const taxRate = TAX_RATE[country];
      const tax = round(net * taxRate * (exceptionType === "Tax Variance" ? 1.09 : 1), 2);
      const gross = round(net + tax, 2);
      const poNumber = hasPo ? `PO-${45000000 + idx * 37}` : null;
      const grnNumber =
        hasPo && exceptionType !== "GRN Missing" && plan.type !== "Service Invoice"
          ? `GRN-${910000 + idx * 13}`
          : null;

      if (poNumber) {
        purchaseOrders.push({
          poNumber,
          vendorId: vendor.id,
          vendorName: vendor.name,
          currency,
          orderedValue: round(
            lines.reduce((s, l) => s + l.poQty * l.poPrice, 0) * (1 + taxRate),
            2,
          ),
          orderedQty: lines.reduce((s, l) => s + l.poQty, 0),
          paymentTerms: pick(["Net 30", "Net 45", "Net 60", "2/10 Net 30"]),
          businessUnit: bu,
          date: dstr(int(20, 90)),
        });
      }
      if (grnNumber && poNumber) {
        goodsReceipts.push({
          grnNumber,
          poNumber,
          receivedValue: round(
            lines.reduce((s, l) => s + (l.grnQty ?? 0) * l.poPrice, 0),
            2,
          ),
          receivedQty: lines.reduce((s, l) => s + (l.grnQty ?? 0), 0),
          receiptDate: dstr(int(2, 30)),
        });
      }

      const extractionConfidence = round(
        isException ? between(78, 96) : between(91.5, 99.6),
        1,
      );
      const classificationConfidence = round(between(88, 99.4), 1);
      const duplicateRisk = isDuplicate
        ? round(between(76, 96), 1)
        : round(between(2, 38), 1);

      const matchMode: Invoice["matchMode"] = !hasPo
        ? "Non-PO"
        : plan.type === "Service Invoice" || bucket === "service"
          ? "2-Way"
          : "3-Way";

      const paid = !isException && idx % 3 === 0;
      const scheduled = !isException && !paid && idx % 5 === 0;
      const lifecycle: Invoice["lifecycle"] = isException
        ? "Review Required"
        : paid
          ? "Beneficiary Credited"
          : scheduled
            ? "Payment Scheduled"
            : idx % 7 === 0
              ? "Approved"
              : "Posted";

      const ageHours = isException ? round(between(0.5, 46), 1) : 0;
      const terms = pick(["Net 30", "Net 45", "Net 60", "2/10 Net 30"]);
      const invDate = dstr(int(1, 45));
      const inv: Invoice = {
        id: `INV-${10000 + idx * 21}`,
        invoiceNumber: `${["INV", "SI", "FR", "TX"][idx % 4]}-${new Date(ANCHOR_MS).getUTCFullYear()}-${10000 + idx * 7}`,
        vendorId: vendor.id,
        vendorName: vendor.name,
        businessUnit: bu,
        country,
        companyCode: `NG${10 + (idx % 6)}`,
        erp: ERPS[idx % 2]!,
        invoiceDate: invDate,
        dueDate: dstr(int(1, 45) - 30),
        paymentTerms: terms,
        currency,
        netAmount: net,
        taxAmount: tax,
        grossAmount: gross,
        poNumber,
        grnNumber,
        invoiceType: plan.type,
        documentType: "Commercial Invoice",
        language:
          country === "Saudi Arabia" && idx % 4 === 0
            ? "Arabic"
            : country === "India" && idx % 5 === 0
              ? "Hindi"
              : "English",
        lines,
        coding: codingFor(vendor.category, country, round(between(74, 98), 1)),
        classificationConfidence,
        extractionConfidence,
        duplicateRisk,
        matchStatus: !hasPo ? "Not Applicable" : isException ? "Review Required" : "Matched",
        matchScore: isException ? round(between(62, 94), 0) : 100,
        matchMode,
        exceptionType,
        exceptionAgeHours: ageHours,
        slaHours: 8,
        owner: OWNERS[idx % OWNERS.length]!,
        approvalStatus: isException
          ? "Pending"
          : gross < 18000
            ? "Auto Approved"
            : idx % 7 === 0
              ? "Pending"
              : "Approved",
        erpStatus: isException ? "Not Posted" : lifecycle === "Approved" ? "Pending" : "Posted",
        paymentStatus: isException
          ? "Not Due"
          : paid
            ? "Beneficiary Credited"
            : scheduled
              ? "Scheduled"
              : "Approved for Payment",
        bankStatus: paid ? "Credited" : scheduled ? "Processing" : "—",
        lifecycle,
        touchlessScore: 0,
        touchless: false,
        source: (
          ["Email", "Vendor Portal", "E-Invoice", "API", "SFTP", "Manual Upload", "Bulk Import"] as const
        )[idx % 7]!,
        audit: [],
      };

      if (plan.type === "Import / Customs") {
        inv.customs = {
          declarationNumber: `CD-${int(700000, 799999)}`,
          declarationDate: invDate,
          authority: country === "UAE" ? "Dubai Customs" : "National Customs Authority",
          duty: round(net * 0.05, 2),
          declaredValue: round(net * 0.98, 2),
        };
      }

      inv.audit = [
        {
          id: `${inv.id}-a1`,
          ts: tstr(ageHours + 12),
          actor: "Intake Service",
          actorType: "System",
          action: `Invoice received via ${inv.source}`,
        },
        {
          id: `${inv.id}-a2`,
          ts: tstr(ageHours + 11.8),
          actor: "Classifier v4.2",
          actorType: "AI",
          action: `Classified as ${inv.invoiceType}`,
          confidence: classificationConfidence,
        },
        {
          id: `${inv.id}-a3`,
          ts: tstr(ageHours + 11.5),
          actor: "Extractor v6.1",
          actorType: "AI",
          action: "Fields extracted",
          confidence: extractionConfidence,
        },
      ];
      out.push(inv);
    }
  }

  // Deterministic duplicate pairs
  for (const i of duplicateTargets) {
    const a = out[i];
    const b = out[(i + 3) % out.length];
    if (a && b) {
      a.duplicateOf = b.id;
      b.vendorName = a.vendorName;
      b.vendorId = a.vendorId;
      b.grossAmount = a.grossAmount;
      b.netAmount = a.netAmount;
      b.taxAmount = a.taxAmount;
    }
  }
  return out;
}

export const seedInvoices: Invoice[] = makeInvoices();

/* ---------------- Demo hero package: INV-2027-10482 ---------------- */
export const DEMO_LINES: LineItem[] = [
  {
    line: 1,
    description: "Industrial Valve DN80 — Carbon Steel",
    materialGroup: "Valves",
    invoiceQty: 100,
    poQty: 100,
    grnQty: 100,
    invoicePrice: 1200,
    poPrice: 1200,
  },
  {
    line: 2,
    description: "Pressure Gauge 0-16 bar",
    materialGroup: "Instruments",
    invoiceQty: 50,
    poQty: 50,
    grnQty: 47,
    invoicePrice: 480,
    poPrice: 480,
  },
  {
    line: 3,
    description: "Hydraulic Coupling Set",
    materialGroup: "Piping",
    invoiceQty: 120,
    poQty: 120,
    grnQty: 120,
    invoicePrice: 610,
    poPrice: 610,
  },
  {
    line: 4,
    description: "Commissioning & Site Testing",
    materialGroup: "Services",
    invoiceQty: 5,
    poQty: 5,
    grnQty: 5,
    invoicePrice: 3943,
    poPrice: 3943,
  },
];

export const DEMO_PO: PurchaseOrder = {
  poNumber: "PO-45008128",
  vendorId: vendors[0]!.id,
  vendorName: "Nova Industrial Supplies LLC",
  currency: "AED",
  orderedValue: 248000,
  orderedQty: 270,
  paymentTerms: "Net 45",
  businessUnit: "Manufacturing",
  date: rebase("2027-03-02"),
};

export const DEMO_GRN: GoodsReceipt = {
  grnNumber: "GRN-910482",
  poNumber: "PO-45008128",
  receivedValue: 235475,
  receivedQty: 267,
  receiptDate: rebase("2027-04-04"),
};

export function buildDemoInvoice(variant: "match" | "exception" | "duplicate"): Invoice {
  const lines = DEMO_LINES.map((l) => ({ ...l }));
  if (variant !== "exception") lines[1]!.grnQty = 50;
  const net = lines.reduce((s, l) => s + l.invoiceQty * l.invoicePrice, 0);
  const tax = 11845;
  const id =
    variant === "duplicate" ? "INV-20841" : variant === "exception" ? "INV-10482" : "INV-10482-M";
  return {
    id,
    invoiceNumber: variant === "duplicate" ? "INV-2027-20841" : "INV-2027-10482",
    vendorId: vendors[0]!.id,
    vendorName: "Nova Industrial Supplies LLC",
    businessUnit: "Manufacturing",
    country: "UAE",
    companyCode: "NG10",
    erp: "SAP S/4HANA",
    invoiceDate: "2027-04-08",
    dueDate: "2027-05-23",
    paymentTerms: "Net 45",
    currency: "AED",
    netAmount: round(net, 2),
    taxAmount: tax,
    grossAmount: round(net + tax, 2),
    poNumber: "PO-45008128",
    grnNumber: "GRN-910482",
    invoiceType: "PO Invoice",
    documentType: "Commercial Invoice",
    language: "English",
    lines,
    coding: codingFor("Industrial Materials", "UAE", 96.2),
    classificationConfidence: 98.9,
    extractionConfidence: variant === "exception" ? 94.6 : 98.2,
    duplicateRisk: variant === "duplicate" ? 94 : 4.2,
    duplicateOf: variant === "duplicate" ? "INV-20814" : undefined,
    matchStatus: variant === "exception" ? "Review Required" : "Matched",
    matchScore: variant === "exception" ? 91 : 100,
    matchMode: "3-Way",
    exceptionType: variant === "exception" ? "Quantity Variance" : null,
    exceptionAgeHours: variant === "exception" ? 6.7 : 0,
    slaHours: 8,
    owner: "R. Fernandes",
    approvalStatus: "Pending",
    erpStatus: "Not Posted",
    paymentStatus: "Not Due",
    bankStatus: "—",
    lifecycle: "Extracted",
    touchlessScore: 0,
    touchless: false,
    source: "Manual Upload",
    audit: [
      {
        id: `${id}-d1`,
        ts: tstr(1),
        actor: "Intake Service",
        actorType: "System",
        action: "Invoice received",
      },
    ],
  };
}

/* ---- Headline story invoices, always present in the demo dataset ---- */
export const storyInvoices: Invoice[] = (() => {
  const exception = buildDemoInvoice("exception");
  exception.lifecycle = "Review Required";
  exception.source = "Email";
  const duplicate = buildDemoInvoice("duplicate");
  duplicate.lifecycle = "Validated";
  duplicate.source = "Vendor Portal";
  const twin: Invoice = {
    ...duplicate,
    id: "INV-20814",
    invoiceNumber: "INV-2027-20814",
    invoiceDate: "2027-04-06",
    duplicateRisk: 94,
    duplicateOf: "INV-20841",
    matchStatus: "Matched",
    matchScore: 100,
    exceptionType: null,
    approvalStatus: "Approved",
    erpStatus: "Posted",
    paymentStatus: "Beneficiary Credited",
    bankStatus: "Credited",
    lifecycle: "Beneficiary Credited",
    source: "Email",
    lines: duplicate.lines.map((l) => ({ ...l })),
    audit: [
      {
        id: "INV-20814-a1",
        ts: tstr(58),
        actor: "Q-AP AI",
        actorType: "AI",
        action: "Invoice posted and paid",
      },
    ],
  };
  return [exception, duplicate, twin];
})();

/* ------------------------------ Payments ------------------------------ */
export const seedPayments: PaymentRecord[] = seedInvoices
  .filter((i) => i.paymentStatus !== "Not Due")
  .slice(0, 100)
  .map((inv, i) => ({
    id: `PAY-${1000 + i}`,
    invoiceId: inv.id,
    vendorName: inv.vendorName,
    value: inv.grossAmount,
    currency: inv.currency,
    dueDate: inv.dueDate,
    discountOpportunity: inv.paymentTerms === "2/10 Net 30" ? round(inv.grossAmount * 0.02, 2) : 0,
    priority:
      inv.grossAmount > 200000 ? "Critical" : inv.grossAmount > 80000 ? "High" : "Normal",
    method: (["Bank Transfer", "ACH", "SWIFT", "Virtual Card"] as const)[i % 4]!,
    erpPaymentId: `${inv.erp === "SAP S/4HANA" ? "SAP" : "ORA"}-PMT-${500000 + i * 11}`,
    bankReference: `BNK-${700000 + i * 17}`,
    status: inv.paymentStatus,
    bankStatus: inv.bankStatus,
    initiatedAt: inv.bankStatus !== "—" ? tstr(30 - (i % 20)) : undefined,
    creditedAt: inv.bankStatus === "Credited" ? tstr(6 - (i % 5)) : undefined,
    reason: i === 4 ? "Bank validation required — beneficiary IBAN mismatch" : undefined,
  }));
if (seedPayments[4]) {
  seedPayments[4].status = "Rejected";
  seedPayments[4].bankStatus = "Rejected";
}

/* --------------------------- Mailbox --------------------------- */
export const seedMail: MailItem[] = [
  {
    id: "MAIL-1",
    subject: "Invoice INV-NIS-50117 — PO-45008210",
    sender: "Nova Industrial Supplies LLC",
    senderEmail: "billing@novaindustrial.ae",
    received: "Today 08:12",
    attachments: [{ name: "INV-NIS-50117_perfect-match.pdf", size: "4 KB", type: "PDF", url: "/samples/INV-NIS-50117_perfect-match.pdf" }],
    classification: "PO Invoice",
    confidence: 98.9,
    processed: false,
    body: "Dear Accounts Payable, please find attached our invoice against PO-45008210 for materials delivered to the Jebel Ali plant.",
  },
  {
    id: "MAIL-2",
    subject: "Freight Invoice FR-8894 — Container DXB/JEA",
    sender: "Global Freight Partners",
    senderEmail: "ar@globalfreight.ae",
    received: "Today 07:48",
    attachments: [{ name: "FR-8894_freight-einvoice-UAE.xml", size: "3 KB", type: "XML", url: "/samples/FR-8894_freight-einvoice-UAE.xml" }],
    classification: "Freight / Logistics",
    confidence: 97.4,
    processed: false,
    body: "Attached freight e-invoice for the April shipment (bill of lading BL-77412).",
  },
  {
    id: "MAIL-3",
    subject: "Consulting Invoice — March Retainer (No PO)",
    sender: "Apex Advisory Services",
    senderEmail: "accounts@apexadvisory.ae",
    received: "Yesterday 17:20",
    attachments: [{ name: "APEX-INV-3301_non-po-consulting.pdf", size: "3 KB", type: "PDF", url: "/samples/APEX-INV-3301_non-po-consulting.pdf" }],
    classification: "Non-PO Invoice",
    confidence: 95.1,
    processed: false,
    body: "Monthly advisory retainer invoice, sponsored by Group Finance.",
  },
  {
    id: "MAIL-4",
    subject: "Customs Invoice & Declaration CD-742189",
    sender: "International Clearing Co.",
    senderEmail: "docs@intlclearing.ae",
    received: "Yesterday 11:05",
    attachments: [{ name: "ICC-CUS-2291_customs-import.pdf", size: "4 KB", type: "PDF", url: "/samples/ICC-CUS-2291_customs-import.pdf" }],
    classification: "Import / Customs",
    confidence: 96.3,
    processed: false,
    body: "Customs duty invoice with the supporting declaration for the import consignment.",
  },
  {
    id: "MAIL-5",
    subject: "فاتورة ضريبية INV-KSA-3390 — Warehouse services",
    sender: "Prime Logistics Solutions",
    senderEmail: "einvoice@primelogistics.sa",
    received: "Yesterday 09:41",
    attachments: [{ name: "INV-KSA-3390_zatca-arabic.xml", size: "3 KB", type: "XML", url: "/samples/INV-KSA-3390_zatca-arabic.xml" }],
    classification: "Service Invoice",
    confidence: 94.8,
    processed: false,
    body: "ZATCA cleared e-invoice for April warehouse storage and handling.",
  },
];

/* --------------------------- Notifications --------------------------- */
/** Notifications derived from the actual invoice and payment records — no canned messages. */
export function buildNotifications(invoices: Invoice[] = seedInvoices): Notification[] {
  const out: Omit<Notification, "id">[] = [];
  const fmt = (n: number, c: string) => `${c} ${Math.round(n).toLocaleString("en-US")}`;
  for (const i of invoices) {
    if (i.duplicateRisk > 75)
      out.push({ ts: (i.audit[0]?.ts ?? tstr(1)), title: `Potential duplicate ${i.id}`, body: `${i.duplicateRisk.toFixed(0)}% duplicate risk${i.duplicateOf ? ` against ${i.duplicateOf}` : ""} · ${i.vendorName} · ${fmt(i.grossAmount, i.currency)}.`, severity: "Critical", link: "/duplicates", read: false });
    else if (i.exceptionType && i.exceptionAgeHours > i.slaHours)
      out.push({ ts: (i.audit[0]?.ts ?? tstr(2)), title: `${i.id} breached its SLA`, body: `${i.exceptionType} open ${i.exceptionAgeHours.toFixed(1)}h (SLA ${i.slaHours}h) · owner ${i.owner}.`, severity: "High", link: "/exceptions", read: false });
    else if (i.extractionConfidence < 90 && i.exceptionType)
      out.push({ ts: (i.audit[0]?.ts ?? tstr(3)), title: `Low extraction confidence on ${i.id}`, body: `${i.extractionConfidence.toFixed(1)}% overall confidence — fields need confirmation.`, severity: "Medium", link: "/document-ai", read: true });
  }
  for (const p of seedPayments) {
    if (p.bankStatus === "Rejected")
      out.push({ ts: p.processedAt ?? tstr(4), title: `Bank rejected ${p.id}`, body: `${p.vendorName} · ${fmt(p.value, p.currency)}${p.reason ? ` — ${p.reason}` : ""}.`, severity: "Critical", link: "/payments", read: false });
  }
  return out
    .sort((x, y) => y.ts.localeCompare(x.ts))
    .slice(0, 30)
    .map((n, idx) => ({ ...n, id: `NTF-${100 + idx}`, read: idx > 7 ? true : n.read }));
}
export const seedNotifications: Notification[] = buildNotifications();

export const DEFAULT_TOLERANCES: Tolerances = {
  price: 1,
  quantity: 2,
  total: 1,
  tax: 0.5,
  freight: 3,
  service: 5,
  autoApproveBelow: 5000,
  confidenceThreshold: 90,
  duplicateSensitivity: 75,
};

export const POLICY_RULES = [
  { id: "PR-01", name: "3-Way match for stockable materials", scope: "Manufacturing, Trading", value: "Invoice + PO + GRN", active: true },
  { id: "PR-02", name: "2-Way match for subscriptions", scope: "Material Group = Subscription", value: "Invoice + PO", active: true },
  { id: "PR-03", name: "Quantity tolerance", scope: "Global", value: "±2%", active: true },
  { id: "PR-04", name: "Price tolerance", scope: "Global", value: "±1%", active: true },
  { id: "PR-05", name: "Freight tolerance", scope: "Logistics, Transportation", value: "±3%", active: true },
  { id: "PR-06", name: "Service invoice tolerance", scope: "Services", value: "±5%", active: true },
  { id: "PR-07", name: "Auto approval threshold", scope: "Global", value: "< AED 5,000", active: true },
  { id: "PR-08", name: "Duplicate block threshold", scope: "Global", value: "Score > 90", active: true },
  { id: "PR-09", name: "Non-PO business owner approval", scope: "Non-PO Invoices", value: "Mandatory", active: true },
  { id: "PR-10", name: "Bank change dual control", scope: "Vendor Master", value: "Two approvers", active: true },
  { id: "PR-11", name: "Withholding tax check", scope: "India, Saudi Arabia", value: "Demo configuration", active: true },
  { id: "PR-12", name: "Payment release segregation", scope: "Global", value: "Processor ≠ Releaser", active: true },
];

export const WORKFLOWS = [
  {
    id: "WF-01",
    name: "Non-PO invoice above AED 50K",
    condition: "Invoice Type = Non-PO AND Value > AED 50,000",
    steps: ["Business Owner Approval", "Finance Approval", "Controller Approval"],
  },
  { id: "WF-02", name: "Tolerance override", condition: "Variance > configured tolerance", steps: ["AP Manager", "Finance Controller"] },
  { id: "WF-03", name: "Duplicate override", condition: "Duplicate score > 90", steps: ["AP Manager", "Finance Controller", "Audit Log"] },
  { id: "WF-04", name: "Vendor bank change", condition: "Bank detail changed", steps: ["Vendor Manager", "Treasury", "Controller"] },
  { id: "WF-05", name: "Payment release", condition: "Payment run created", steps: ["Treasury Analyst", "Treasury Head"] },
  { id: "WF-06", name: "Freight invoice exception", condition: "Freight variance > 3%", steps: ["Logistics Buyer", "AP Manager"] },
  { id: "WF-07", name: "Customs duty invoice", condition: "Invoice Type = Import / Customs", steps: ["Trade Compliance", "AP Manager"] },
  { id: "WF-08", name: "Credit note application", condition: "Document Type = Credit Note", steps: ["AP Processor", "Controller"] },
  { id: "WF-09", name: "Employee reimbursement", condition: "Type = Reimbursement", steps: ["Line Manager", "AP Processor"] },
  { id: "WF-10", name: "Intercompany invoice", condition: "Vendor = Group Entity", steps: ["Intercompany Desk", "Controller"] },
  { id: "WF-11", name: "Utility invoice", condition: "Type = Utility", steps: ["Facilities", "AP Processor"] },
  { id: "WF-12", name: "High value PO invoice", condition: "Value > AED 500,000", steps: ["AP Manager", "Controller", "CFO"] },
  { id: "WF-13", name: "Policy change", condition: "Tolerance or rule modified", steps: ["AP Head", "Finance Controller"] },
  { id: "WF-14", name: "Accounting override", condition: "Coding changed by user", steps: ["AP Manager"] },
  { id: "WF-15", name: "Compliance hold release", condition: "Compliance flag raised", steps: ["Compliance Officer", "Controller"] },
];

export const AI_MODELS = [
  { name: "Document Classification", version: "v4.2", confidence: 97.1, humanReview: 4.2, lastEval: "2027-04-10", status: "Healthy" },
  { name: "OCR / Extraction", version: "v6.1", confidence: 95.8, humanReview: 8.6, lastEval: "2027-04-12", status: "Healthy" },
  { name: "Duplicate Detection", version: "v3.4", confidence: 93.2, humanReview: 11.4, lastEval: "2027-04-09", status: "Monitor" },
  { name: "Accounting Coding", version: "v2.8", confidence: 91.7, humanReview: 17.3, lastEval: "2027-04-11", status: "Monitor" },
  { name: "Exception Recommendation", version: "v2.1", confidence: 89.4, humanReview: 22.0, lastEval: "2027-04-08", status: "Healthy" },
  { name: "AP Copilot", version: "v1.9", confidence: 92.5, humanReview: 100, lastEval: "2027-04-13", status: "Advisory only" },
];

export const SOD_RULES = [
  { role: "Invoice Processor", restriction: "Cannot release payment", enforced: true },
  { role: "Vendor Manager", restriction: "Cannot approve own bank change", enforced: true },
  { role: "Payment Approver", restriction: "Cannot modify invoice", enforced: true },
  { role: "System Administrator", restriction: "Cannot self-approve policy change", enforced: true },
  { role: "AP Manager", restriction: "Cannot approve own tolerance override", enforced: true },
  { role: "Auditor", restriction: "Read-only across all modules", enforced: true },
];
