import type {
  GoodsReceipt,
  Invoice,
  PurchaseOrder,
  Tolerances,
  TwinResult,
} from "./types";

export interface RuleResult {
  rule: string;
  status: "PASS" | "WARNING" | "FAIL" | "SKIPPED";
  expected: string;
  actual: string;
  detail: string;
}

export interface LineResult {
  line: number;
  description: string;
  invoiceQty: number;
  poQty: number;
  grnQty: number | null;
  invoicePrice: number;
  poPrice: number;
  priceVariance: number;
  qtyVariance: number;
  grnVariance: number;
  status: "MATCH" | "WARNING" | "EXCEPTION";
  reason: string;
}

export interface MatchResult {
  score: number;
  status: "Matched" | "Review Required" | "Not Matched";
  passed: number;
  warnings: number;
  failures: number;
  rules: RuleResult[];
  lines: LineResult[];
  explanation: string;
  mode: "3-Way" | "2-Way" | "Non-PO";
}

const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100);
export const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

export function toleranceFor(inv: Invoice, t: Tolerances) {
  if (inv.invoiceType === "Freight / Logistics") return { price: t.freight, qty: t.freight };
  if (inv.invoiceType === "Service Invoice" || inv.matchMode === "2-Way")
    return { price: t.service, qty: t.service };
  return { price: t.price, qty: t.quantity };
}

/** Real browser-side 3-way / 2-way matching. */
export function runMatch(
  inv: Invoice,
  po: PurchaseOrder | null,
  grn: GoodsReceipt | null,
  tol: Tolerances,
  mode?: MatchResult["mode"],
): MatchResult {
  const m: MatchResult["mode"] = mode ?? (inv.poNumber ? inv.matchMode : "Non-PO");
  const rules: RuleResult[] = [];
  const lt = toleranceFor(inv, tol);

  const add = (
    rule: string,
    status: RuleResult["status"],
    expected: string,
    actual: string,
    detail: string,
  ) => rules.push({ rule, status, expected, actual, detail });

  if (m === "Non-PO" || !po) {
    add("PO Number Match", "SKIPPED", "n/a", "No PO", "Non-PO invoice — validation path applies.");
  } else {
    add(
      "PO Number Match",
      inv.poNumber === po.poNumber ? "PASS" : "FAIL",
      po.poNumber,
      inv.poNumber ?? "—",
      "Invoice must reference an open purchase order.",
    );
    add(
      "Vendor Match",
      inv.vendorName.trim().toLowerCase() === po.vendorName.trim().toLowerCase() ? "PASS" : "FAIL",
      po.vendorName,
      inv.vendorName,
      "Invoicing party must equal the PO vendor.",
    );
    add(
      "Currency Match",
      inv.currency === po.currency ? "PASS" : "FAIL",
      po.currency,
      inv.currency,
      "Invoice currency must equal PO currency.",
    );
    const termsOk = !po.paymentTerms || po.paymentTerms === inv.paymentTerms;
    add(
      "Payment Terms",
      termsOk ? "PASS" : "WARNING",
      po.paymentTerms,
      inv.paymentTerms,
      "Deviation from PO terms affects the payment schedule.",
    );
    const totalVar = pct(inv.grossAmount, po.orderedValue);
    add(
      "Total Value Match",
      Math.abs(totalVar) <= tol.total ? "PASS" : Math.abs(totalVar) <= tol.total * 2 ? "WARNING" : "FAIL",
      `${po.orderedValue.toLocaleString()} ±${tol.total}%`,
      inv.grossAmount.toLocaleString(),
      `Invoice total vs ordered value (${fmtPct(totalVar)}).`,
    );
  }

  const expectedTaxRate = inv.netAmount ? (inv.taxAmount / inv.netAmount) * 100 : 0;
  const stdRate =
    inv.country === "UAE" ? 5 : inv.country === "Saudi Arabia" ? 15 : inv.country === "India" ? 18 : inv.country === "UK" ? 20 : 9;
  const taxDelta = Math.abs(expectedTaxRate - stdRate);
  add(
    "Tax Match",
    taxDelta <= tol.tax ? "PASS" : taxDelta <= tol.tax * 3 ? "WARNING" : "FAIL",
    `${stdRate}% ±${tol.tax}pt`,
    `${expectedTaxRate.toFixed(2)}%`,
    `Effective tax rate vs expected ${inv.country} treatment.`,
  );

  if (m === "3-Way") {
    add(
      "GRN Match",
      grn ? "PASS" : "FAIL",
      "Goods receipt posted",
      grn ? grn.grnNumber : "No GRN found",
      "Goods or services must be confirmed as received.",
    );
  } else {
    add("GRN Match", "SKIPPED", "n/a", `${m} configured`, "Goods receipt not required for this material group.");
  }

  const lines: LineResult[] = inv.lines.map((l) => {
    const priceVariance = pct(l.invoicePrice, l.poPrice);
    const qtyVariance = pct(l.invoiceQty, l.poQty);
    const grnVariance = m === "3-Way" && l.grnQty !== null ? pct(l.grnQty, l.invoiceQty) : 0;
    let status: LineResult["status"] = "MATCH";
    let reason = "Quantity, price and receipt align with the purchase order.";
    if (Math.abs(priceVariance) > lt.price) {
      status = Math.abs(priceVariance) > lt.price * 2 ? "EXCEPTION" : "WARNING";
      reason = `Unit price differs from PO by ${fmtPct(priceVariance)} (tolerance ±${lt.price}%).`;
    }
    if (Math.abs(qtyVariance) > lt.qty) {
      status = "EXCEPTION";
      reason = `Invoiced quantity differs from PO by ${fmtPct(qtyVariance)} (tolerance ±${lt.qty}%).`;
    }
    if (m === "3-Way") {
      if (l.grnQty === null) {
        status = "EXCEPTION";
        reason = "No goods receipt posted for this line.";
      } else if (Math.abs(grnVariance) > lt.qty) {
        status = "EXCEPTION";
        reason = `Received ${l.grnQty} of ${l.invoiceQty} invoiced units (${fmtPct(grnVariance)}), exceeding the ±${lt.qty}% quantity tolerance.`;
      }
    }
    return {
      line: l.line,
      description: l.description,
      invoiceQty: l.invoiceQty,
      poQty: l.poQty,
      grnQty: l.grnQty,
      invoicePrice: l.invoicePrice,
      poPrice: l.poPrice,
      priceVariance,
      qtyVariance,
      grnVariance,
      status,
      reason,
    };
  });

  const lineFails = lines.filter((l) => l.status === "EXCEPTION").length;
  const lineWarns = lines.filter((l) => l.status === "WARNING").length;
  if (lines.length === 0 && m !== "Non-PO") {
    add("Line Item Match", "FAIL", "Invoice lines", "No lines read", "No line items could be read from the invoice — confirm them before matching.");
  } else {
    add(
      "Line Item Match",
      lineFails ? "FAIL" : lineWarns ? "WARNING" : "PASS",
      `${lines.length} lines within tolerance`,
      `${lines.length - lineFails - lineWarns} clean · ${lineWarns} warning · ${lineFails} exception`,
      "Line-level quantity, price and receipt comparison.",
    );
  }
  if (m === "3-Way" && grn) {
    const invValue = inv.netAmount;
    const recValue = grn.receivedValue;
    const v = pct(invValue, recValue);
    add(
      "Received Value Match",
      Math.abs(v) <= tol.total ? "PASS" : Math.abs(v) <= tol.total * 2 ? "WARNING" : "FAIL",
      `${recValue.toLocaleString()} received ±${tol.total}%`,
      invValue.toLocaleString(),
      `Invoice net value vs value of goods received (${fmtPct(v)}).`,
    );
  }

  const evaluated = rules.filter((r) => r.status !== "SKIPPED");
  const passed = evaluated.filter((r) => r.status === "PASS").length;
  const warnings = evaluated.filter((r) => r.status === "WARNING").length;
  const failures = evaluated.filter((r) => r.status === "FAIL").length;
  const score = Math.max(
    0,
    Math.round(((passed + warnings * 0.6) / Math.max(1, evaluated.length)) * 100),
  );
  const status: MatchResult["status"] = failures ? (score >= 60 ? "Review Required" : "Not Matched") : warnings ? "Review Required" : "Matched";

  const firstProblem = lines.find((l) => l.status === "EXCEPTION") ?? lines.find((l) => l.status === "WARNING");
  const explanation = failures
    ? `${po ? "PO and invoice header values are evaluated against the configured policy." : "Non-PO validation path applied."} ${
        firstProblem ? `Line ${firstProblem.line} — ${firstProblem.reason}` : rules.find((r) => r.status === "FAIL")?.detail ?? ""
      }`
    : warnings
      ? `All hard rules passed with ${warnings} warning(s) within secondary thresholds. ${firstProblem?.reason ?? ""}`
      : "All configured match rules passed within tolerance. The invoice is eligible for straight-through processing.";

  return { score, status, passed, warnings, failures, rules, lines, explanation, mode: m };
}

/* ------------------------- Duplicate scoring ------------------------- */
export interface DuplicateEvidence {
  attribute: string;
  similarity: number;
  weight: number;
}
export interface DuplicateResult {
  candidateId: string;
  score: number;
  band: "High Risk" | "Review" | "Low Risk";
  evidence: DuplicateEvidence[];
  explanation: string;
}

function strSim(a: string, b: string) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 100;
  const len = Math.max(a.length, b.length);
  let same = 0;
  for (let i = 0; i < len; i++) if (a[i] && a[i] === b[i]) same++;
  const sorted = (s: string) => s.split("").sort().join("");
  const anagram = sorted(a) === sorted(b) ? 12 : 0;
  return Math.min(100, Math.round((same / len) * 100) + anagram);
}
const numSim = (a: number, b: number) =>
  Math.max(0, Math.round(100 - (Math.abs(a - b) / Math.max(1, Math.abs(b))) * 100));

export const DUP_WEIGHTS = {
  vendor: 20,
  invoiceNumber: 20,
  amount: 20,
  date: 10,
  tax: 10,
  po: 10,
  document: 10,
};

export function duplicateScore(a: Invoice, b: Invoice): DuplicateResult {
  const dateSim = (() => {
    const d = Math.abs(new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()) / 86400000;
    return Math.max(0, Math.round(100 - d * 8));
  })();
  const docSim = strSim(
    a.lines.map((l) => l.description).join("|"),
    b.lines.map((l) => l.description).join("|"),
  );
  const evidence: DuplicateEvidence[] = [
    { attribute: "Vendor", similarity: a.vendorId === b.vendorId ? 100 : strSim(a.vendorName, b.vendorName), weight: DUP_WEIGHTS.vendor },
    { attribute: "Invoice Number", similarity: strSim(a.invoiceNumber, b.invoiceNumber), weight: DUP_WEIGHTS.invoiceNumber },
    { attribute: "Amount", similarity: numSim(a.grossAmount, b.grossAmount), weight: DUP_WEIGHTS.amount },
    { attribute: "Invoice Date", similarity: dateSim, weight: DUP_WEIGHTS.date },
    { attribute: "Tax", similarity: numSim(a.taxAmount, b.taxAmount), weight: DUP_WEIGHTS.tax },
    { attribute: "PO", similarity: a.poNumber && a.poNumber === b.poNumber ? 100 : 0, weight: DUP_WEIGHTS.po },
    { attribute: "Document Similarity", similarity: docSim, weight: DUP_WEIGHTS.document },
  ];
  const score = Math.round(evidence.reduce((s, e) => s + (e.similarity * e.weight) / 100, 0));
  const band = score > 90 ? "High Risk" : score >= 75 ? "Review" : "Low Risk";
  const numberEv = evidence[1]!.similarity;
  const explanation =
    score >= 75
      ? `${numberEv < 100 ? "Invoice numbers differ slightly while" : "Invoice numbers are identical and"} the major financial attributes (vendor, amount, tax${a.poNumber === b.poNumber ? ", PO" : ""}) and the document layout are near identical.`
      : "Financial attributes diverge sufficiently for these invoices to be treated as distinct.";
  return { candidateId: b.id, score, band, evidence, explanation };
}

export function findDuplicates(inv: Invoice, pool: Invoice[], sensitivity: number): DuplicateResult[] {
  return pool
    .filter((o) => o.id !== inv.id && (o.vendorId === inv.vendorId || o.vendorName === inv.vendorName))
    .map((o) => duplicateScore(inv, o))
    .filter((r) => r.score >= sensitivity - 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Sets each invoice's duplicate risk to its real best similarity score against other invoices from the same supplier. */
export function scoreDuplicateRisk(invoices: Invoice[]): Invoice[] {
  const byVendor = new Map<string, Invoice[]>();
  for (const i of invoices) byVendor.set(i.vendorId, [...(byVendor.get(i.vendorId) ?? []), i]);
  return invoices.map((inv) => {
    let best: DuplicateResult | null = null;
    for (const o of byVendor.get(inv.vendorId) ?? []) {
      if (o.id === inv.id) continue;
      const r = duplicateScore(inv, o);
      if (!best || r.score > best.score) best = r;
    }
    const risk = best?.score ?? 0;
    return { ...inv, duplicateRisk: risk, duplicateOf: risk > 75 ? best!.candidateId : undefined };
  });
}

/* ------------------------- Touchless scoring ------------------------- */
export interface TouchlessFactor {
  factor: string;
  value: string;
  points: number;
  max: number;
  ok: boolean;
}
export interface TouchlessResult {
  score: number;
  eligible: boolean;
  factors: TouchlessFactor[];
  blockers: string[];
}

export function touchlessScore(
  inv: Invoice,
  match: MatchResult | null,
  dupScore: number,
  vendorRisk: number,
  tol: Tolerances,
): TouchlessResult {
  const f: TouchlessFactor[] = [];
  const push = (factor: string, value: string, points: number, max: number) =>
    f.push({ factor, value, points, max, ok: points >= max * 0.8 });

  push("Extraction Confidence", `${inv.extractionConfidence}%`, Math.round((Math.min(100, inv.extractionConfidence) / 100) * 18), 18);
  push("Classification Confidence", `${inv.classificationConfidence}%`, Math.round((inv.classificationConfidence / 100) * 10), 10);
  const dupLow = dupScore < 75;
  push(
    "Duplicate Risk",
    `${dupScore.toFixed(1)} · ${dupLow ? "low risk" : "review"}`,
    dupLow ? 14 : Math.round(((100 - dupScore) / 100) * 14),
    14,
  );
  const mScore = match ? match.score : inv.matchScore;
  push("Match Result", match ? `${match.status} · ${mScore}%` : `${mScore}%`, Math.round((mScore / 100) * 22), 22);
  push("Accounting Confidence", `${inv.coding.confidence}%`, Math.round((inv.coding.confidence / 100) * 10), 10);
  push("Vendor Risk", `${vendorRisk.toFixed(0)} risk score`, Math.round(((100 - vendorRisk) / 100) * 10), 10);
  const cleanPoInvoice =
    !!inv.poNumber && !!match && match.status === "Matched" && match.failures === 0 && dupLow && vendorRisk < 45;
  const approvalOk =
    inv.grossAmount <= tol.autoApproveBelow ||
    inv.approvalStatus === "Approved" ||
    inv.approvalStatus === "Auto Approved" ||
    cleanPoInvoice;
  push(
    "Approval Policy",
    approvalOk
      ? cleanPoInvoice && inv.grossAmount > tol.autoApproveBelow
        ? "Clean PO auto-approval policy"
        : "Within auto-approval policy"
      : "Manual approval required",
    approvalOk ? 8 : 2,
    8,
  );
  const valueOk = inv.grossAmount < 500000;
  push("Invoice Value", inv.currency + " " + inv.grossAmount.toLocaleString(), valueOk ? 4 : 1, 4);
  const complianceOk = inv.exceptionType !== "Compliance Issue" && inv.exceptionType !== "Bank Detail Change";
  push("Compliance", complianceOk ? "No flags" : String(inv.exceptionType), complianceOk ? 4 : 0, 4);

  const score = f.reduce((s, x) => s + x.points, 0);
  const blockers = f.filter((x) => !x.ok).map((x) => `${x.factor}: ${x.value}`);
  if (match && match.failures > 0) blockers.unshift(`Match failures: ${match.failures}`);
  if (inv.extractionConfidence < tol.confidenceThreshold)
    blockers.unshift(`Extraction confidence below ${tol.confidenceThreshold}% threshold`);
  return { score, eligible: score >= 90 && (!match || match.failures === 0), factors: f, blockers };
}

/* ---------------------------- AP Digital Twin ---------------------------- */
/** Re-evaluates every actual invoice against the proposed policy — no fixed coefficients. */
export function runTwin(t: Tolerances, twoWayFreight: boolean, volumeUplift = 0, invoices: Invoice[] = seedInvoices): TwinResult {
  const vol = 1 + volumeUplift / 100;
  let touchless = 0, manual = 0, ex = 0, sla = 0, dup = 0, approvals = 0, risk = 0, cycle = 0;
  for (const i of invoices) {
    const qtyVar = Math.max(0, ...i.lines.filter((l) => l.grnQty !== null).map((l) => (Math.abs(l.invoiceQty - (l.grnQty ?? 0)) / Math.max(1, l.invoiceQty)) * 100));
    const priceVar = Math.max(0, ...i.lines.filter((l) => l.poPrice > 0).map((l) => (Math.abs(l.invoicePrice - l.poPrice) / l.poPrice) * 100));
    let exc = i.exceptionType;
    if (exc === "Quantity Variance" && qtyVar <= t.quantity) { exc = null; risk += i.lines.reduce((x, l) => x + Math.abs(l.invoiceQty - (l.grnQty ?? l.invoiceQty)) * l.invoicePrice, 0); }
    else if (exc === "Price Variance" && priceVar <= t.price) { exc = null; risk += i.lines.reduce((x, l) => x + Math.abs(l.invoicePrice - l.poPrice) * l.invoiceQty, 0); }
    else if (exc === "GRN Missing" && twoWayFreight && (i.invoiceType === "Freight / Logistics" || i.invoiceType === "Service Invoice")) { exc = null; risk += i.grossAmount * 0.02; }
    else if (!exc && i.poNumber && (qtyVar > t.quantity || priceVar > t.price)) exc = qtyVar > t.quantity ? "Quantity Variance" : "Price Variance";
    if (i.duplicateRisk >= t.duplicateSensitivity) { dup++; if (!exc) exc = "Duplicate Risk"; }
    const lowConf = i.extractionConfidence < t.confidenceThreshold;
    const needsApproval = !exc && !i.poNumber && i.grossAmount > t.autoApproveBelow; // same policy as touchlessScore: clean PO invoices auto-approve
    if (exc) { ex++; if (i.exceptionAgeHours > i.slaHours) sla++; }
    if (needsApproval) approvals++;
    if (!exc && !lowConf && !needsApproval) touchless++; else manual++;
    cycle += 1 + (exc ? Math.max(1, i.exceptionAgeHours / 24) : 0) + (needsApproval ? 1 : 0) + (lowConf ? 0.3 : 0);
  }
  const n = Math.max(1, invoices.length);
  const workload = (manual * 0.45 + ex * 0.75) * vol;
  return {
    touchlessRate: round1((touchless / n) * 100),
    manualReviews: Math.round(manual * vol),
    exceptionVolume: Math.round(ex * vol),
    cycleTimeDays: round1((cycle / n) * (1 + volumeUplift / 300)),
    slaBreaches: Math.round(sla * vol),
    duplicatePrevention: dup,
    riskExposure: round2(risk / 1e6),
    workloadHours: Math.round(workload),
    costPerInvoice: round2((workload * 85) / (n * vol)),
    approvalLoad: Math.round(approvals * vol),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

import { seedInvoices } from "./data";
