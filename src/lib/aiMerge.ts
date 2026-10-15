import type { AiExtraction } from "./ai.functions";
import type { ExtractionOutput, ExtractedField } from "./extract";
import type { Invoice, Vendor } from "./types";

const CATS: Invoice["invoiceType"][] = ["PO Invoice", "Non-PO Invoice", "Service Invoice", "Freight / Logistics", "Import / Customs", "Utility", "Employee Reimbursement", "Intercompany", "Credit Note", "Debit Note"];
const LANGS: Invoice["language"][] = ["English", "Arabic", "Hindi", "French"];

/** Prepare a compact page image for the AI reader (scans, photos, handwriting). */
export async function fileToAiImage(file: File, out: ExtractionOutput): Promise<string | null> {
  const thumb = out.pageInfo.find((p) => p.image)?.image;
  if (/^image\/(png|jpe?g|webp)$/.test(file.type) && file.size < 4_000_000) {
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => res(thumb ?? null);
      r.readAsDataURL(file);
    });
  }
  return thumb ?? null;
}

/** Combine browser parsing with Q AI reading: AI fills gaps and resolves low-confidence values. */
export function mergeAi(out: ExtractionOutput, ai: AiExtraction, vendors: Vendor[]): ExtractionOutput {
  const conf = Math.max(50, Math.min(99.5, ai.confidence));
  const supplier = ai.supplierName
    ? vendors.find((v) => v.name.toLowerCase() === ai.supplierName!.toLowerCase()) ??
      vendors.find((v) => ai.supplierName!.toLowerCase().includes(v.name.toLowerCase().split(" ").slice(0, 2).join(" ")))
    : undefined;
  const aiVals: Record<string, string | null> = {
    vendorName: supplier?.name ?? ai.supplierName,
    taxId: ai.supplierTaxId,
    invoiceNumber: ai.invoiceNumber,
    poNumber: ai.poNumber,
    grnNumber: ai.grnNumber,
    invoiceDate: ai.invoiceDate,
    currency: ai.currency,
    grossAmount: ai.grossAmount != null ? String(ai.grossAmount) : null,
    taxAmount: ai.taxAmount != null ? String(ai.taxAmount) : null,
    netAmount: ai.netAmount != null ? String(ai.netAmount) : null,
    paymentTerms: ai.paymentTerms,
    bank: ai.bankDetails,
    customsDecl: ai.customsDeclaration,
    customsDuty: ai.customsDuty != null ? String(ai.customsDuty) : null,
  };
  const fields: ExtractedField[] = out.fields.map((f) => {
    const v = aiVals[f.key];
    if (!v) return f;
    const agrees = f.value && f.value.replace(/[\s,]/g, "").toLowerCase() === v.replace(/[\s,]/g, "").toLowerCase();
    if (agrees) {
      const c = Math.min(99.6, Math.max(f.confidence, conf) + 1.5);
      return { ...f, confidence: c, source: `${f.source} · confirmed by Q AI`, status: c >= 90 ? "Accepted" : "Review Suggested" };
    }
    if (!f.value || f.confidence < 90) {
      return { ...f, value: v, confidence: conf, source: "Q AI reading", status: conf >= 90 ? "Accepted" : "Review Suggested" };
    }
    return { ...f, status: "Review Suggested", source: `${f.source} · AI read "${v}"` };
  });
  for (const k of ["bank", "customsDecl", "customsDuty"]) {
    if (aiVals[k] && !fields.some((f) => f.key === k)) {
      fields.push({ key: k, label: k === "bank" ? "Bank Details" : k === "customsDecl" ? "Customs Declaration No" : "Customs Duty", value: aiVals[k]!, confidence: conf, source: "Q AI reading", status: conf >= 90 ? "Accepted" : "Review Suggested" });
    }
  }
  const lines =
    out.lines.length || !ai.lines.length
      ? out.lines
      : ai.lines.slice(0, 40).map((l, i) => ({ line: i + 1, description: l.description, materialGroup: "Unclassified", invoiceQty: l.quantity, poQty: l.quantity, grnQty: null, invoicePrice: l.unitPrice, poPrice: l.unitPrice }));
  const cat = CATS.find((c) => c.toLowerCase() === ai.invoiceCategory.toLowerCase());
  const lang = LANGS.find((l) => l.toLowerCase() === ai.language.toLowerCase());
  return {
    ...out,
    fields,
    lines,
    parsed: out.parsed || fields.some((f) => f.value),
    parseNote: `${out.parseNote} Q AI read the document (${conf.toFixed(1)}% confidence): ${ai.summary}`,
    classification: cat
      ? { type: cat, confidence: Math.max(out.classification.confidence, conf), signals: [...out.classification.signals, `Q AI: ${ai.documentType} · ${ai.invoiceCategory}`] }
      : out.classification,
    language: lang ?? out.language,
  };
}
