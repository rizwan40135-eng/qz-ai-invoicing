import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const answerSchema = z.object({
  answer: z.string(),
  evidence: z.array(z.string()),
  impact: z.string(),
  action: z.string(),
  risk: z.string(),
  confidence: z.number(),
});

/** Ask Q / document chat / exception copilot — answers grounded in the supplied AP context. */
export const askAI = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ question: z.string().min(1).max(2000), mode: z.string().max(60), context: z.string().max(60000) }).parse(d))
  .handler(async ({ data }) => {
    const { aiObject } = await import("./ai.server");
    const system = `You are Q, the ${data.mode} assistant inside Q-AP AI, an accounts payable operating system for Nova Global Industries.
Answer ONLY from the AP CONTEXT provided. Cite concrete invoice IDs, vendors, amounts and percentages from it as evidence (3-6 short bullets).
If the context does not contain the answer, say so plainly. Never invent records. Never recommend releasing payments without human approval.
Keep "answer" to 2-4 sentences. confidence is 0-100 reflecting how well the context supports the answer.`;
    return aiObject(answerSchema, system, [{ role: "user", content: `AP CONTEXT:\n${data.context}\n\nQUESTION: ${data.question}` }]);
  });

const extractSchema = z.object({
  documentType: z.string(),
  invoiceCategory: z.string(),
  language: z.string(),
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  poNumber: z.string().nullable(),
  grnNumber: z.string().nullable(),
  currency: z.string().nullable(),
  netAmount: z.number().nullable(),
  taxAmount: z.number().nullable(),
  grossAmount: z.number().nullable(),
  paymentTerms: z.string().nullable(),
  bankDetails: z.string().nullable(),
  customsDeclaration: z.string().nullable(),
  customsDuty: z.number().nullable(),
  lines: z.array(z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() })),
  confidence: z.number(),
  summary: z.string(),
});
export type AiExtraction = z.infer<typeof extractSchema>;

/** Live AI invoice reading from extracted text and/or the page image (handwriting, scans, any language). */
export const extractInvoiceAI = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ fileName: z.string().max(300), text: z.string().max(40000), image: z.string().max(6_000_000).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { aiObject } = await import("./ai.server");
    const system = `You read supplier invoices for accounts payable. Extract fields exactly as printed; translate nothing except "summary" (English).
documentType: one of Invoice, Credit Note, Debit Note, Purchase Order, Goods Receipt, Other.
invoiceCategory: one of PO Invoice, Non-PO Invoice, Service Invoice, Freight / Logistics, Import / Customs, Utility, Employee Reimbursement, Intercompany, Credit Note, Debit Note.
language: English, Arabic, Hindi, French or the detected language. Dates as YYYY-MM-DD. Amounts as plain numbers. Use null when a field is absent — never guess.
confidence 0-100 for the overall read. summary: one sentence.`;
    const content: ({ type: "text"; text: string } | { type: "image"; image: string })[] = [
      { type: "text", text: `File: ${data.fileName}\n\nExtracted text (may be empty or noisy OCR):\n${data.text || "(none)"}` },
    ];
    if (data.image) content.push({ type: "image", image: data.image });
    return aiObject(extractSchema, system, [{ role: "user", content }]);
  });

const codingSchema = z.object({
  glAccount: z.string(),
  costCenter: z.string(),
  profitCenter: z.string(),
  internalOrder: z.string(),
  taxCode: z.string(),
  confidence: z.number(),
  reasons: z.array(z.string()),
});

/** Live AI accounting recommendation constrained to the chart of accounts and learned corrections. */
export const suggestCodingAI = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ invoice: z.string().max(8000), chart: z.string().max(8000), learnings: z.string().max(8000) }).parse(d))
  .handler(async ({ data }) => {
    const { aiObject } = await import("./ai.server");
    const system = `You recommend accounting codes for AP invoices. Choose values ONLY from the CHART provided. Learned corrections override your own judgement for similar invoices. Give 3-5 short reasons. confidence 0-100.`;
    return aiObject(codingSchema, system, [
      { role: "user", content: `INVOICE:\n${data.invoice}\n\nCHART:\n${data.chart}\n\nLEARNED CORRECTIONS:\n${data.learnings || "(none)"}` },
    ]);
  });

/** Reachability test for configured connectors (ERP, data platforms, mail, bank). */
export const testConnector = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    try {
      const r = await fetch(data.url, { method: "GET", signal: AbortSignal.timeout(8000) });
      return { ok: r.status < 500, status: r.status, ms: Date.now() - started, message: `Endpoint responded HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, status: 0, ms: Date.now() - started, message: e instanceof Error ? e.message : "Unreachable" };
    }
  });
