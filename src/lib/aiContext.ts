import type { Invoice, Vendor, PaymentRecord } from "./types";
import { askCopilot } from "./copilot";

interface Ctx {
  invoices: Invoice[];
  vendors: Vendor[];
  payments: PaymentRecord[];
  tolerances: Record<string, number>;
}

export function invoiceBrief(i: Invoice) {
  return {
    id: i.id, invoiceNumber: i.invoiceNumber, vendor: i.vendorName, bu: i.businessUnit, country: i.country, erp: i.erp,
    date: i.invoiceDate, due: i.dueDate, currency: i.currency, net: i.netAmount, tax: i.taxAmount, gross: i.grossAmount,
    po: i.poNumber, grn: i.grnNumber, type: i.invoiceType, language: i.language, matchMode: i.matchMode, matchStatus: i.matchStatus,
    matchScore: i.matchScore, exception: i.exceptionType, exceptionAgeHours: i.exceptionAgeHours, slaHours: i.slaHours, owner: i.owner,
    approval: i.approvalStatus, erpStatus: i.erpStatus, payment: i.paymentStatus, bank: i.bankStatus, lifecycle: i.lifecycle,
    duplicateRisk: i.duplicateRisk, touchlessScore: i.touchlessScore, extractionConfidence: i.extractionConfidence,
    coding: i.coding, terms: i.paymentTerms,
    lines: i.lines.map((l) => ({ line: l.line, desc: l.description, invQty: l.invoiceQty, poQty: l.poQty, grnQty: l.grnQty, invPrice: l.invoicePrice, poPrice: l.poPrice })),
  };
}

/** Compact, grounded AP context sent to Q AI with every question. */
export function buildAiContext(question: string, ctx: Ctx, focus?: Invoice | null) {
  const { invoices, vendors, payments, tolerances } = ctx;
  const ex = invoices.filter((i) => i.exceptionType);
  const pending = invoices.filter((i) => i.approvalStatus === "Pending");
  const touchless = invoices.filter((i) => i.touchless).length;
  const byType: Record<string, number> = {};
  ex.forEach((i) => (byType[i.exceptionType!] = (byType[i.exceptionType!] ?? 0) + 1));
  const byVendor: Record<string, { n: number; ex: number; value: number }> = {};
  invoices.forEach((i) => {
    const v = (byVendor[i.vendorName] ??= { n: 0, ex: 0, value: 0 });
    v.n++; v.value += i.grossAmount; if (i.exceptionType) v.ex++;
  });
  const byBu: Record<string, { n: number; ex: number; pending: number }> = {};
  invoices.forEach((i) => {
    const b = (byBu[i.businessUnit] ??= { n: 0, ex: 0, pending: 0 });
    b.n++; if (i.exceptionType) b.ex++; if (i.approvalStatus === "Pending") b.pending++;
  });
  const ids = [...new Set((question.match(/INV-[0-9A-Z-]+/gi) ?? []).map((s) => s.toUpperCase()))];
  const referenced = ids
    .map((id) => invoices.find((i) => i.id.toUpperCase() === id || i.invoiceNumber.toUpperCase() === id || i.invoiceNumber.toUpperCase().endsWith(id.replace("INV-", ""))))
    .filter(Boolean) as Invoice[];
  if (focus && !referenced.includes(focus)) referenced.unshift(focus);
  const computed = askCopilot(question, { invoices, vendors, payments, tolerances: tolerances as never });

  return JSON.stringify({
    totals: {
      invoices: invoices.length, exceptions: ex.length, pendingApproval: pending.length,
      pendingValue: Math.round(pending.reduce((a, i) => a + i.grossAmount, 0)),
      touchlessRate: +((touchless / Math.max(1, invoices.length)) * 100).toFixed(1),
      overdueSla: ex.filter((i) => i.exceptionAgeHours > i.slaHours).length,
    },
    tolerances,
    exceptionsByType: byType,
    businessUnits: byBu,
    topVendorsByExceptions: Object.entries(byVendor).sort((a, b) => b[1].ex - a[1].ex).slice(0, 12).map(([k, v]) => ({ vendor: k, ...v, rate: +((v.ex / v.n) * 100).toFixed(1) })),
    referencedInvoices: referenced.slice(0, 4).map((i) => ({ ...invoiceBrief(i), extractedText: i.extractedText?.slice(0, 2500), audit: i.audit.slice(-8).map((a) => `${a.actor}: ${a.action}`) })),
    sampleExceptions: ex.slice(0, 30).map((i) => ({ id: i.id, vendor: i.vendorName, bu: i.businessUnit, value: i.grossAmount, cur: i.currency, exception: i.exceptionType, age: i.exceptionAgeHours, sla: i.slaHours, owner: i.owner, dupRisk: i.duplicateRisk })),
    payments: {
      scheduled: payments.filter((p) => p.status === "Scheduled").length,
      rejected: payments.filter((p) => p.status === "Rejected" || p.status === "Returned").map((p) => ({ id: p.id, inv: p.invoiceId, vendor: p.vendorName, reason: p.reason })).slice(0, 10),
      dueIn7Days: payments.filter((p) => p.status === "Scheduled" && new Date(p.dueDate) < new Date(Date.now() + 7 * 864e5)).length,
      discountAvailable: Math.round(payments.filter((p) => p.status === "Scheduled").reduce((a, p) => a + p.discountOpportunity, 0)),
    },
    analyticsEngineFindings: { answer: computed.answer, evidence: computed.evidence },
  });
}
