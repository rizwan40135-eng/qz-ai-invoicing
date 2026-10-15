import { getAdminConfig } from "./adminConfig";
import type { AuditEntry, ComplianceCheck, ExceptionType, GoodsReceipt, Invoice, PaymentRecord, PurchaseOrder, Tolerances, Vendor } from "./types";
import { findDuplicates, runMatch, touchlessScore, type MatchResult } from "./engine";
import { reconcileLines } from "./erp";

export interface PipelineContext {
  pos: PurchaseOrder[];
  grns: GoodsReceipt[];
  invoices: Invoice[];
  vendors: Vendor[];
  tolerances: Tolerances;
  learnings: { from: string; to: string; scope: string }[];
}

export interface PipelineOutcome {
  invoice: Invoice;
  match: MatchResult | null;
  payment: PaymentRecord | null;
  duplicateOf: string | null;
  duplicateScore: number;
  decision: "Touchless — posted & scheduled" | "Routed for approval" | "Exception — review required" | "Blocked — duplicate";
  steps: { label: string; status: "PASS" | "WARNING" | "FAIL" | "SKIPPED"; detail: string }[];
}

const RATE: Record<Invoice["country"], number> = { UAE: 5, "Saudi Arabia": 15, India: 18, UK: 20, Singapore: 9 };

const GL: Record<string, { gl: string; cc: string; pc: string }> = {
  Freight: { gl: "610300 — Freight & Transport", cc: "CC-4100 Logistics Ops", pc: "PC-300 Trade" },
  Logistics: { gl: "610400 — Warehousing & Handling", cc: "CC-4100 Logistics Ops", pc: "PC-300 Trade" },
  Warehousing: { gl: "610400 — Warehousing & Handling", cc: "CC-4100 Logistics Ops", pc: "PC-300 Trade" },
  "IT Services": { gl: "642100 — IT Hosting Expense", cc: "CC-7200 Digital Platforms", pc: "PC-100 Corporate" },
  Subscription: { gl: "642300 — Software Subscription", cc: "CC-7200 Digital Platforms", pc: "PC-100 Corporate" },
  "Professional Services": { gl: "651000 — Professional Fees", cc: "CC-9100 Corporate", pc: "PC-100 Corporate" },
  Utilities: { gl: "620100 — Utilities Expense", cc: "CC-3300 Plant Services", pc: "PC-200 Industrial" },
  Customs: { gl: "610500 — Customs & Duty", cc: "CC-4100 Logistics Ops", pc: "PC-300 Trade" },
  Packaging: { gl: "510200 — Packaging Materials", cc: "CC-5100 Distribution", pc: "PC-300 Trade" },
  Engineering: { gl: "530100 — Electrical Components", cc: "CC-2100 Production", pc: "PC-200 Industrial" },
};
const DEFAULT_GL = { gl: "500100 — Raw Material Consumption", cc: "CC-2100 Production", pc: "PC-200 Industrial" };
const TAX_CODE: Record<Invoice["country"], string> = { UAE: "UAE-STD", "Saudi Arabia": "KSA-STD15", India: "IN-GST18", UK: "UK-VAT20", Singapore: "SG-GST9" };

export function suggestCoding(inv: Invoice, vendor: Vendor | undefined, learnings: PipelineContext["learnings"]): Invoice["coding"] {
  const cat = vendor?.category ?? "";
  const base = GL[cat] ?? (inv.invoiceType === "Freight / Logistics" ? GL["Freight"]! : inv.invoiceType === "Utility" ? GL["Utilities"]! : inv.invoiceType === "Import / Customs" ? GL["Customs"]! : DEFAULT_GL);
  const learned = learnings.find((l) => l.scope.includes(inv.vendorName) || (cat && l.scope.includes(cat)));
  return {
    glAccount: learned?.to ?? base.gl,
    costCenter: base.cc,
    profitCenter: base.pc,
    internalOrder: inv.poNumber ? `IO-${inv.poNumber.slice(-5)}` : "—",
    taxCode: TAX_CODE[inv.country],
    project: "—",
    confidence: learned ? 97.2 : vendor ? 93.6 : 71.0,
  };
}

export function complianceChecks(inv: Invoice): ComplianceCheck[] {
  const out: ComplianceCheck[] = [];
  const rate = inv.netAmount ? (inv.taxAmount / inv.netAmount) * 100 : 0;
  const std = RATE[inv.country];
  out.push({
    check: `${inv.country} tax rate`,
    status: Math.abs(rate - std) <= 0.5 ? "PASS" : Math.abs(rate - std) <= 1.5 ? "WARNING" : "FAIL",
    detail: `Effective ${rate.toFixed(2)}% vs standard ${std}%`,
  });
  const tid = inv.supplierTaxId ?? "";
  const idRule: Record<Invoice["country"], [RegExp, string]> = {
    UAE: [/^100\d{12}$/, "UAE TRN — 15 digits starting 100"],
    "Saudi Arabia": [/^3\d{13}3$/, "KSA VAT number — 15 digits, starts and ends with 3"],
    India: [/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/, "GSTIN — 15 character format"],
    UK: [/^(GB)?\d{9}$/, "UK VAT — GB + 9 digits"],
    Singapore: [/^[A-Z0-9]{9,10}$/, "GST registration number"],
  };
  const [re, label] = idRule[inv.country];
  out.push({
    check: "Supplier tax registration",
    status: !tid ? "FAIL" : re.test(tid) ? "PASS" : "WARNING",
    detail: tid ? `${tid} · ${label}` : `Missing — ${label} required on a tax invoice`,
  });
  const fmt = inv.eInvoiceFormat ?? "";
  if (inv.country === "Saudi Arabia") {
    out.push({ check: "ZATCA e-invoice (Phase 2)", status: /zatca/i.test(fmt) ? "PASS" : "FAIL", detail: fmt || "Structured UBL XML with UUID required for B2B tax invoices" });
  } else if (inv.country === "India") {
    out.push({ check: "GST e-invoice IRN", status: /irn/i.test(fmt) ? "PASS" : "WARNING", detail: fmt || "IRN required above the e-invoicing turnover threshold" });
  } else if (inv.country === "UAE") {
    out.push({ check: "UAE e-invoicing (PINT AE)", status: /pint|ubl/i.test(fmt) ? "PASS" : "WARNING", detail: fmt || "PDF accepted during transition; structured PINT AE preferred" });
  } else {
    out.push({ check: "Electronic invoice format", status: fmt ? "PASS" : "WARNING", detail: fmt || "PEPPOL BIS preferred" });
  }
  out.push({
    check: "Mandatory invoice fields",
    status: inv.invoiceNumber && !inv.invoiceNumber.startsWith("UNREAD") && inv.invoiceDate && inv.grossAmount > 0 ? "PASS" : "FAIL",
    detail: "Invoice number, date, supplier and total present",
  });
  if (inv.invoiceType === "Import / Customs") {
    out.push({
      check: "Customs declaration captured",
      status: inv.customs?.declarationNumber ? "PASS" : "FAIL",
      detail: inv.customs?.declarationNumber ? `${inv.customs.declarationNumber} · ${inv.customs.authority}` : "Declaration number required for import invoices",
    });
  }
  return out;
}

function exceptionFromMatch(m: MatchResult, inv: Invoice): ExceptionType | null {
  const failed = (r: string) => m.rules.find((x) => x.rule === r)?.status === "FAIL";
  if (failed("Vendor Match")) return "Vendor Mismatch";
  if (failed("GRN Match")) return "GRN Missing";
  const badLine = m.lines.find((l) => l.status === "EXCEPTION");
  if (badLine) {
    if (badLine.reason.toLowerCase().includes("goods receipt") || badLine.reason.toLowerCase().includes("received")) return badLine.grnQty === null ? "GRN Missing" : "Quantity Variance";
    if (badLine.reason.toLowerCase().includes("price")) return "Price Variance";
    return "Quantity Variance";
  }
  if (failed("Line Item Match")) return "Quantity Variance";
  if (failed("Tax Match")) return "Tax Variance";
  if (failed("Total Value Match") || failed("Received Value Match")) return inv.lines.some((l) => l.invoicePrice !== l.poPrice) ? "Price Variance" : "Quantity Variance";
  return null;
}

export const OWNER_FOR: Record<ExceptionType, string> = {
  "PO Missing": "Procurement — Buyer desk",
  "GRN Missing": "Receiving — Warehouse",
  "Quantity Variance": "Receiving — Warehouse",
  "Price Variance": "Procurement — Buyer desk",
  "Tax Variance": "Tax desk",
  "Vendor Mismatch": "Vendor master team",
  "Duplicate Risk": "AP Manager",
  "Invalid Coding": "GL accountant",
  "Approval Missing": "Business approver",
  "Bank Detail Change": "Treasury",
  "Compliance Issue": "Tax desk",
};

export function approvalChain(inv: Invoice): string[] {
  const cfg = getAdminConfig();
  const band = cfg.approvalLevels.find((l) => inv.grossAmount <= l.upTo);
  if (band && !/auto/i.test(band.approvers)) {
    const chain = band.approvers.split(/→|->|,/).map((x) => x.trim()).filter(Boolean);
    if (inv.grossAmount > cfg.dualApprovalAbove && !chain.includes("CFO")) chain.push("CFO");
    if (chain.length) return chain;
  }
  if (inv.poNumber) return inv.grossAmount > 250000 ? ["Buyer", "Finance Controller"] : ["Buyer"];
  if (inv.grossAmount > 50000) return ["Business Owner", "Finance Approver", "Finance Controller"];
  if (inv.grossAmount > 10000) return ["Business Owner", "Finance Approver"];
  return ["Business Owner"];
}

const audit = (id: string, actor: string, actorType: AuditEntry["actorType"], action: string, extra: Partial<AuditEntry> = {}): AuditEntry => ({
  id: `${id}-${Math.random().toString(36).slice(2, 8)}`,
  ts: new Date().toISOString(),
  actor,
  actorType,
  action,
  ...extra,
});

export function makePayment(inv: Invoice, seq: number): PaymentRecord {
  return {
    id: `PAY-${(5000 + seq).toString()}`,
    invoiceId: inv.id,
    vendorName: inv.vendorName,
    value: inv.grossAmount,
    currency: inv.currency,
    dueDate: inv.dueDate,
    discountOpportunity: /2\/10/.test(inv.paymentTerms) ? Math.round(inv.grossAmount * 2) / 100 : 0,
    priority: inv.grossAmount > 200000 ? "Critical" : inv.grossAmount > 80000 ? "High" : "Normal",
    method: inv.currency === "AED" || inv.currency === "SAR" ? "Bank Transfer" : "SWIFT",
    erpPaymentId: `${inv.erp === "SAP S/4HANA" ? "SAP" : "ORA"}-PMT-${600000 + seq}`,
    bankReference: "—",
    status: "Scheduled",
    bankStatus: "—",
  };
}

/** Runs the full automated chain on one captured invoice. Pure: returns the new state, never mutates input. */
/** Tolerances for one invoice: workspace defaults, then its business-unit rule, then overrides (category → transaction type → supplier, most specific wins). */
export function tolerancesFor(inv: Invoice, base: Tolerances): { tol: Tolerances; applied: string[] } {
  const cfg = getAdminConfig();
  const tol = { ...base };
  const applied: string[] = [];
  const bu = cfg.buRules.find((r) => r.bu === inv.businessUnit);
  if (bu) { tol.price = bu.price; tol.quantity = bu.quantity; tol.autoApproveBelow = bu.autoApproveBelow; applied.push(`${bu.bu} business-unit rule`); }
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const order: [ToleranceScope, string][] = [["Business unit", inv.businessUnit], ["Category", inv.invoiceType], ["Transaction type", inv.matchMode ?? ""], ["Supplier", inv.vendorName]];
  for (const [scope, val] of order) {
    const o = cfg.overrides.find((x) => x.scope === scope && x.value && eq(x.value, val));
    if (o) { tol.price = o.price; tol.quantity = o.quantity; applied.push(`${scope} override: ${o.value}`); }
  }
  return { tol, applied };
}
type ToleranceScope = "Supplier" | "Category" | "Transaction type" | "Business unit";

export function processInvoice(raw: Invoice, ctx: PipelineContext): PipelineOutcome {
  const steps: PipelineOutcome["steps"] = [];
  let inv: Invoice = { ...raw, audit: [...raw.audit] };

  // 1. PO / GRN retrieval from ERP
  const po = inv.poNumber ? (ctx.pos.find((p) => p.poNumber === inv.poNumber) ?? null) : null;
  if (po) {
    if (inv.vendorName === "Unconfirmed supplier") inv.vendorName = po.vendorName;
    inv.vendorId = po.vendorId;
    inv.businessUnit = po.businessUnit;
    if (po.erp) inv.erp = po.erp;
    if (po.country) inv.country = po.country;
    if (po.companyCode) inv.companyCode = po.companyCode;
  }
  const grn = po
    ? ((inv.grnNumber ? ctx.grns.find((g) => g.grnNumber === inv.grnNumber) : null) ?? ctx.grns.find((g) => g.poNumber === po.poNumber) ?? null)
    : null;
  if (grn && !inv.grnNumber) inv.grnNumber = grn.grnNumber;
  steps.push({
    label: "PO retrieval",
    status: !inv.poNumber ? "SKIPPED" : po ? "PASS" : "FAIL",
    detail: !inv.poNumber ? "No PO referenced — Non-PO path" : po ? `${po.poNumber} retrieved from ${po.erp ?? inv.erp}` : `${inv.poNumber} not found in ERP`,
  });

  // 2. Match mode
  const serviceLike = ["Freight / Logistics", "Service Invoice", "Import / Customs", "Utility"].includes(inv.invoiceType);
  const buRule = getAdminConfig().buRules.find((r) => r.bu === inv.businessUnit);
  inv.matchMode = !po ? "Non-PO"
    : buRule?.matchPolicy === "Always 2-way" ? "2-Way"
    : buRule?.matchPolicy === "Always 3-way" && po.grnRequired !== false ? "3-Way"
    : po.grnRequired === false || (serviceLike && !grn) ? "2-Way" : "3-Way";
  steps.push({
    label: "GRN retrieval",
    status: inv.matchMode !== "3-Way" ? "SKIPPED" : grn ? "PASS" : "FAIL",
    detail: inv.matchMode === "2-Way" ? "2-way match — receipt not required for this category" : inv.matchMode === "Non-PO" ? "Not applicable" : grn ? `${grn.grnNumber} · ${grn.receivedQty} units received` : "No goods receipt posted",
  });

  // 3. Line reconciliation + matching
  inv.lines = reconcileLines(inv, po, inv.matchMode === "3-Way" ? grn : null);
  const vendor = ctx.vendors.find((v) => v.id === inv.vendorId || v.name === inv.vendorName);
  if (vendor) inv.vendorId = vendor.id;
  inv.coding = suggestCoding(inv, vendor, ctx.learnings);
  inv.compliance = complianceChecks(inv);
  const { tol, applied } = tolerancesFor(inv, ctx.tolerances);
  if (applied.length) steps.push({ label: "Tolerance rules", status: "PASS", detail: `Price ±${tol.price}% · quantity ±${tol.quantity}% — ${applied.join(" → ")}` });
  const match = po ? runMatch(inv, po, inv.matchMode === "3-Way" ? grn : null, tol, inv.matchMode) : runMatch(inv, null, null, tol, "Non-PO");
  inv.matchScore = match.score;
  inv.matchStatus = po ? match.status : "Not Applicable";
  steps.push({ label: `${inv.matchMode} match`, status: !po ? "SKIPPED" : match.failures ? "FAIL" : match.warnings ? "WARNING" : "PASS", detail: po ? `${match.score}% · ${match.passed} passed · ${match.warnings} warnings · ${match.failures} failed` : "Validation-only path" });

  // 4. Duplicate check
  const dups = findDuplicates(inv, ctx.invoices.filter((i) => i.approvalStatus !== "Rejected"), ctx.tolerances.duplicateSensitivity);
  const top = dups[0];
  inv.duplicateRisk = top?.score ?? 0;
  inv.duplicateOf = top && top.score >= 75 ? top.candidateId : undefined;
  steps.push({ label: "Duplicate check", status: !top || top.score < 75 ? "PASS" : top.score > 90 ? "FAIL" : "WARNING", detail: top ? `Closest: ${top.candidateId} at ${top.score}%` : "No similar invoices for this supplier" });

  // 5. Compliance
  const compFail = inv.compliance.filter((c) => c.status === "FAIL");
  steps.push({ label: "Country compliance", status: compFail.length ? "FAIL" : inv.compliance.some((c) => c.status === "WARNING") ? "WARNING" : "PASS", detail: compFail.length ? compFail.map((c) => c.check).join(", ") : `${inv.compliance.length} checks evaluated` });

  // 6. Decide
  let exception: ExceptionType | null = null;
  if (top && top.score > 90) exception = "Duplicate Risk";
  else if (inv.poNumber && !po) exception = "PO Missing";
  else if (inv.vendorName === "Unconfirmed supplier" || (!vendor && !po)) exception = "Vendor Mismatch";
  else if (po) exception = exceptionFromMatch(match, inv);
  if (!exception && compFail.length) exception = compFail.some((c) => c.check.includes("tax rate")) ? "Tax Variance" : "Compliance Issue";

  const t = touchlessScore(inv, po ? match : null, inv.duplicateRisk, vendor?.riskScore ?? 50, tol);
  inv.touchlessScore = t.score;
  inv.touchless = !exception && !!po && t.eligible;
  steps.push({ label: "Touchless decision", status: inv.touchless ? "PASS" : "WARNING", detail: inv.touchless ? `Score ${t.score} — auto-process eligible` : `Score ${t.score} — ${t.blockers[0] ?? "human approval required"}` });

  inv.audit.push(
    audit(inv.id, "ERP Connector", "System", po ? `PO ${po.poNumber}${grn ? ` and ${grn.grnNumber}` : ""} retrieved` : "No PO — Non-PO validation path"),
    audit(inv.id, "Match Engine", "AI", `${inv.matchMode} match ${match.score}% · ${match.status}`, { confidence: match.score }),
    audit(inv.id, "Duplicate Engine", "AI", `Duplicate risk ${inv.duplicateRisk}%${inv.duplicateOf ? ` vs ${inv.duplicateOf}` : ""}`),
    audit(inv.id, "Coding Advisor", "AI", `Coding suggested: ${inv.coding.glAccount}`, { confidence: inv.coding.confidence }),
  );

  let payment: PaymentRecord | null = null;
  let decision: PipelineOutcome["decision"];
  if (exception) {
    inv.exceptionType = exception;
    inv.lifecycle = "Review Required";
    inv.owner = OWNER_FOR[exception];
    inv.approvalStatus = "Pending";
    decision = exception === "Duplicate Risk" ? "Blocked — duplicate" : "Exception — review required";
    inv.audit.push(audit(inv.id, "Workflow", "System", `${exception} — routed to ${inv.owner}`, { reason: match.explanation }));
  } else if (inv.touchless) {
    const docNo = `${inv.erp === "SAP S/4HANA" ? "51" : "ORA-"}${Math.floor(10000000 + Math.random() * 89999999)}`;
    inv.exceptionType = null;
    inv.approvalStatus = "Auto Approved";
    inv.erpStatus = "Posted";
    inv.paymentStatus = "Scheduled";
    inv.lifecycle = "Payment Scheduled";
    inv.owner = "Touchless";
    payment = makePayment(inv, Math.floor(Math.random() * 90000));
    inv.audit.push(
      audit(inv.id, "Policy Engine", "System", "Auto-approved under clean PO policy", { newValue: "Auto Approved" }),
      audit(inv.id, "ERP Connector", "System", `Posted to ${inv.erp} · document ${docNo}`, { newValue: "Posted" }),
      audit(inv.id, "Payments", "System", `Scheduled for payment on ${inv.dueDate} (${payment.id})`, { newValue: "Scheduled" }),
    );
    decision = "Touchless — posted & scheduled";
  } else {
    inv.exceptionType = null;
    inv.lifecycle = "Validated";
    const chain = approvalChain(inv);
    inv.owner = chain[0]!;
    inv.approvalStatus = "Pending";
    inv.audit.push(audit(inv.id, "Workflow", "System", `Approval route: ${chain.join(" → ")}`));
    decision = "Routed for approval";
  }
  return { invoice: inv, match: po ? match : null, payment, duplicateOf: inv.duplicateOf ?? null, duplicateScore: inv.duplicateRisk, decision, steps };
}
