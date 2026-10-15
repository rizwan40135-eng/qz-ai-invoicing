import type { Invoice, LineItem } from "./types";
import { vendors } from "./data";
/* Polyfills for newer JS APIs the PDF renderer relies on (older Chrome/Edge/Safari lack them). */
{
  const mp = Map.prototype as unknown as Record<string, unknown>;
  if (!mp["getOrInsertComputed"]) mp["getOrInsertComputed"] = function (this: Map<unknown, unknown>, k: unknown, fn: (k: unknown) => unknown) { if (!this.has(k)) this.set(k, fn(k)); return this.get(k); };
  if (!mp["getOrInsert"]) mp["getOrInsert"] = function (this: Map<unknown, unknown>, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k); };
  const wp = WeakMap.prototype as unknown as Record<string, unknown>;
  if (!wp["getOrInsertComputed"]) wp["getOrInsertComputed"] = mp["getOrInsertComputed"];
  const M = Math as unknown as Record<string, unknown>;
  if (!M["sumPrecise"]) M["sumPrecise"] = (xs: Iterable<number>) => { let t = 0; for (const x of xs) t += x; return t; };
}


export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  status: "Accepted" | "Review Suggested" | "Manual Entry";
}

export interface PageInfo {
  page: number;
  type: string;
  confidence: number;
  image?: string | undefined;
}

export interface ExtractionOutput {
  fileName: string;
  fileType: string;
  fileHash: string;
  previewUrl: string | null;
  previewKind: "pdf" | "image" | "text" | "none";
  pages: number;
  pageInfo: PageInfo[];
  text: string;
  parsed: boolean;
  method: "Text layer" | "OCR" | "Structured XML" | "Structured JSON" | "Plain text" | "None";
  ocrConfidence: number | null;
  parseNote: string;
  fields: ExtractedField[];
  lines: LineItem[];
  classification: { type: Invoice["invoiceType"]; confidence: number; signals: string[] };
  language: Invoice["language"];
  eInvoiceFormat: string | null;
  customs: Invoice["customs"];
  bankDetails: string;
  durationMs: number;
}

/* Session-only previews (object URLs / page images are not persisted). */
export const previewRegistry = new Map<string, { url: string | null; kind: ExtractionOutput["previewKind"]; pages: PageInfo[] }>();

const field = (key: string, label: string, value: string, confidence: number, source: string): ExtractedField => ({
  key,
  label,
  value,
  confidence: value ? Math.round(confidence * 10) / 10 : 0,
  source,
  status: value === "" ? "Manual Entry" : confidence >= 90 ? "Accepted" : "Review Suggested",
});

export async function sha256(file: Blob) {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------- PDF ------------------------------- */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    /* main thread */
  }
  return pdfjs;
}

async function readPdf(file: File) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pagesText: string[] = [];
  const max = Math.min(doc.numPages, 20);
  for (let p = 1; p <= max; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild visual lines by grouping text runs that share a baseline.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const row = rows.get(y) ?? [];
      row.push({ x: it.transform[4], s: it.str });
      rows.set(y, row);
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map((c) => c.s).join("  "));
    pagesText.push(lines.join("\n"));
  }
  return { doc, pagesText, pages: doc.numPages };
}

async function renderPdfPage(doc: Awaited<ReturnType<typeof readPdf>>["doc"], p: number) {
  const page = await doc.getPage(p);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  return canvas;
}

/* ------------------------------- OCR ------------------------------- */
type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let workerPromise: Promise<OcrWorker> | null = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then((t) => t.createWorker("eng"));
  }
  return workerPromise;
}
async function ocr(img: HTMLCanvasElement | string | Blob) {
  const w = await getWorker();
  const { data } = await w.recognize(img);
  return { text: data.text, confidence: data.confidence };
}

/* ------------------------------- TIFF ------------------------------ */
async function decodeTiff(file: File): Promise<HTMLCanvasElement[]> {
  const UTIF = (await import("utif2")).default as unknown as {
    decode: (b: ArrayBuffer) => { width: number; height: number }[];
    decodeImage: (b: ArrayBuffer, ifd: unknown) => void;
    toRGBA8: (ifd: unknown) => Uint8Array;
  };
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf).filter((i) => (i as unknown as { t256?: number[] }).t256);
  const out: HTMLCanvasElement[] = [];
  for (const ifd of ifds.slice(0, 10)) {
    UTIF.decodeImage(buf, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const { width, height } = ifd;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    out.push(canvas);
  }
  return out;
}

const thumb = (c: HTMLCanvasElement) => {
  const t = document.createElement("canvas");
  const s = 360 / c.width;
  t.width = 360;
  t.height = Math.round(c.height * s);
  t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.8);
};

/* --------------------------- Structured --------------------------- */
interface Header {
  invoiceNumber: string;
  date: string;
  supplier: string;
  taxId: string;
  po: string;
  grn: string;
  currency: string;
  total: string;
  tax: string;
  net: string;
  terms: string;
}
const EMPTY: Header = { invoiceNumber: "", date: "", supplier: "", taxId: "", po: "", grn: "", currency: "", total: "", tax: "", net: "", terms: "" };

function readUbl(text: string): { h: Header; lines: LineItem[]; format: string } | null {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
  const path = (root: Element, names: string[]): Element | null => {
    let cur: Element | null = root;
    for (const n of names) {
      cur = cur ? (kids(cur, n)[0] ?? null) : null;
    }
    return cur;
  };
  const r = doc.documentElement;
  const t = (names: string[]) => path(r, names)?.textContent?.trim() ?? "";
  const custom = t(["CustomizationID"]);
  const format = /zatca/i.test(custom) || t(["UUID"])
    ? "ZATCA UBL 2.1 (Saudi Arabia)"
    : /peppol|pint/i.test(custom)
      ? "PEPPOL PINT UBL (UAE)"
      : r.localName === "Invoice"
        ? "UBL 2.1"
        : `XML <${r.localName}>`;
  const h: Header = {
    ...EMPTY,
    invoiceNumber: t(["ID"]),
    date: t(["IssueDate"]),
    supplier: t(["AccountingSupplierParty", "Party", "PartyName", "Name"]),
    taxId: t(["AccountingSupplierParty", "Party", "PartyTaxScheme", "CompanyID"]),
    po: t(["OrderReference", "ID"]),
    currency: t(["DocumentCurrencyCode"]),
    total: t(["LegalMonetaryTotal", "PayableAmount"]),
    net: t(["LegalMonetaryTotal", "TaxExclusiveAmount"]) || t(["LegalMonetaryTotal", "LineExtensionAmount"]),
    tax: t(["TaxTotal", "TaxAmount"]),
    terms: t(["PaymentTerms", "Note"]),
    grn: t(["ReceiptDocumentReference", "ID"]),
  };
  const lines: LineItem[] = kids(r, "InvoiceLine").map((el, i) => {
    const qty = Number(path(el, ["InvoicedQuantity"])?.textContent ?? 0);
    const price = Number(path(el, ["Price", "PriceAmount"])?.textContent ?? 0);
    return {
      line: i + 1,
      description: path(el, ["Item", "Name"])?.textContent?.trim() ?? `Line ${i + 1}`,
      materialGroup: "Unclassified",
      invoiceQty: qty,
      poQty: qty,
      grnQty: null,
      invoicePrice: price,
      poPrice: price,
    };
  });
  return { h, lines, format };
}

function readJson(text: string): { h: Header; lines: LineItem[]; format: string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = JSON.parse(text) as any;
    if (j.Irn || j.DocDtls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (j.ItemList ?? []) as any[];
      const v = j.ValDtls ?? {};
      return {
        format: "India GST e-invoice (IRN)",
        h: {
          ...EMPTY,
          invoiceNumber: j.DocDtls?.No ?? "",
          date: j.DocDtls?.Dt ?? "",
          supplier: j.SellerDtls?.LglNm ?? "",
          taxId: j.SellerDtls?.Gstin ?? "",
          po: j.RefDtls?.PrecDocDtls?.[0]?.InvNo ?? "",
          currency: v.Cur ?? "INR",
          total: String(v.TotInvVal ?? ""),
          net: String(v.AssVal ?? ""),
          tax: String((v.IgstVal ?? 0) + (v.CgstVal ?? 0) + (v.SgstVal ?? 0)),
          terms: j.PayDtls?.PayTerm ?? "",
        },
        lines: items.map((it, i) => ({
          line: i + 1,
          description: String(it.PrdDesc ?? `Line ${i + 1}`),
          materialGroup: "Unclassified",
          invoiceQty: Number(it.Qty ?? 0),
          poQty: Number(it.Qty ?? 0),
          grnQty: null,
          invoicePrice: Number(it.UnitPrice ?? 0),
          poPrice: Number(it.UnitPrice ?? 0),
        })),
      };
    }
    const flat = JSON.stringify(j);
    return { format: "JSON", h: { ...headerFromText(flat.replace(/[{}",]/g, "\n")) }, lines: [] };
  } catch {
    return null;
  }
}

/* ---------------------------- Free text ---------------------------- */
const num = (s: string) => Number(String(s).replace(/[^0-9.\-]/g, "")) || 0;
const AMT = "([\\d][\\d,]*\\.\\d{2})";

function labelValue(lines: string[], labels: string[]) {
  for (const raw of lines) {
    const line = raw.trim();
    for (const l of labels) {
      const m = line.match(new RegExp(`^${l}\\s*[:\\-\\.]?\\s*(.+)$`, "i"));
      if (m?.[1]) return m[1].trim();
    }
  }
  return "";
}

function headerFromText(text: string): Header {
  const lines = text.split(/\n/).map((l) => l.replace(/\s{2,}/g, "  ").trim()).filter(Boolean);
  const firstToken = (v: string) => v.split(/\s{2,}|\s(?=[A-Z][a-z]+:)/)[0]!.trim();
  const amountAfter = (re: RegExp) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m?.[1]) return m[1];
    }
    return "";
  };
  const invoiceNumber = firstToken(labelValue(lines, ["invoice\\s*(?:no|number|#)", "facture\\s*(?:no|n°|num[eé]ro)", "bill\\s*no"]));
  const date = (labelValue(lines, ["invoice\\s*date", "date\\s*de\\s*facture", "date"]).match(/\d{4}-\d{2}-\d{2}|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/) ?? [""])[0]!;
  const po = (labelValue(lines, ["po\\s*(?:number|no|#)?", "purchase\\s*order(?:\\s*no)?", "bon\\s*de\\s*commande", "order\\s*ref(?:erence)?"]).match(/[A-Z]{2,4}-?\d{5,}/i) ?? [""])[0]!.toUpperCase();
  const grn = (labelValue(lines, ["grn(?:\\s*reference|\\s*no)?", "goods\\s*receipt(?:\\s*no)?"]).match(/[A-Z]{2,4}-?\d{5,}/i) ?? [""])[0]!.toUpperCase();
  const taxId = (labelValue(lines, ["supplier\\s*trn", "trn", "vat\\s*(?:no|number|reg(?:istration)?)", "num[eé]ro\\s*tva", "gstin", "tax\\s*id"]).match(/[A-Z0-9]{8,}/i) ?? [""])[0]!;
  const terms = (labelValue(lines, ["payment\\s*terms", "conditions\\s*de\\s*paiement", "terms"]).match(/net\s*\d{1,3}|2\/10\s*net\s*30|immediate/i) ?? [""])[0]!.replace(/net\s*/i, "Net ");
  const currency = (labelValue(lines, ["currency", "devise"]).match(/[A-Z]{3}/) ?? text.match(/\b(AED|SAR|INR|GBP|SGD|USD|EUR)\b/) ?? [""])[0]!;
  const net = amountAfter(new RegExp(`^(?:sub\\s*-?\\s*total|sous-total|net\\s*amount|taxable\\s*value)\\s*[:\\-]?\\s*(?:[A-Z]{3}\\s*)?${AMT}`, "i"));
  const tax = amountAfter(new RegExp(`^(?:vat|tva|gst|igst|tax)(?:\\s*\\(?\\d+(?:\\.\\d+)?\\s*%\\)?)?\\s*[:\\-]\\s*(?:[A-Z]{3}\\s*)?${AMT}`, "i"));
  const total = amountAfter(new RegExp(`^(?:total\\s*due|grand\\s*total|total\\s*ttc|total\\s*amount|amount\\s*due|total)\\s*[:\\-]?\\s*(?:[A-Z]{3}\\s*)?${AMT}`, "i"));
  return { invoiceNumber, date, supplier: "", taxId, po, grn, currency, total, tax, net, terms };
}

function linesFromText(text: string): LineItem[] {
  const out: LineItem[] = [];
  const re = new RegExp(`^(?:\\d{1,3}[.)]?\\s+)?(.*?[A-Za-z\\u00C0-\\u024F].*?)\\s+(\\d[\\d,]*(?:\\.\\d+)?)\\s+${AMT}\\s+${AMT}\\s*$`);
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
    const m = line.match(re);
    if (!m) continue;
    const qty = num(m[2]!);
    const price = num(m[3]!);
    const amount = num(m[4]!);
    if (qty <= 0 || price <= 0) continue;
    if (Math.abs(qty * price - amount) > Math.max(1, amount * 0.01)) continue; // arithmetic check rejects misreads
    out.push({
      line: out.length + 1,
      description: m[1]!.trim(),
      materialGroup: "Unclassified",
      invoiceQty: qty,
      poQty: qty,
      grnQty: null,
      invoicePrice: price,
      poPrice: price,
    });
  }
  return out;
}

function customsFromText(text: string): Invoice["customs"] {
  const lines = text.split(/\n/);
  const declarationNumber = (labelValue(lines, ["customs\\s*declaration\\s*(?:no|number)", "declaration\\s*(?:no|number)"]).match(/[A-Z]{1,4}-?\d{4,}/i) ?? [""])[0]!;
  if (!declarationNumber) return undefined;
  return {
    declarationNumber,
    declarationDate: (labelValue(lines, ["declaration\\s*date"]).match(/\d{4}-\d{2}-\d{2}/) ?? [""])[0]!,
    authority: labelValue(lines, ["customs\\s*authority", "authority"]).split(/\s{2,}/)[0] ?? "",
    duty: num(labelValue(lines, ["customs\\s*duty(?:\\s*\\(\\d+%\\))?"]).match(/[\d,]+\.\d{2}/)?.[0] ?? "0"),
    declaredValue: num(labelValue(lines, ["declared\\s*value"]).match(/[\d,]+\.\d{2}/)?.[0] ?? "0"),
  };
}

function detectLanguage(text: string): Invoice["language"] {
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (ar > 6) return "Arabic";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/\b(facture|montant|tva|désignation|designation|devise|sous-total)\b/i.test(text)) return "French";
  return "English";
}

export function classifyPage(text: string): { type: string; confidence: number } {
  const t = text.toLowerCase();
  if (/delivery\s*note|goods\s*received|received\s*by/.test(t)) return { type: "Delivery Note / GRN", confidence: 94.2 };
  if (/customs\s*declaration/.test(t) && !/invoice/.test(t)) return { type: "Customs Document", confidence: 95.8 };
  if (/purchase\s*order/.test(t) && !/invoice/.test(t)) return { type: "Purchase Order", confidence: 93.1 };
  if (/tax\s*certificate|trn\s*certificate/.test(t)) return { type: "Tax Document", confidence: 92.4 };
  if (/invoice|facture|فاتورة|bill/.test(t)) return { type: "Invoice", confidence: 97.6 };
  if (!t.trim()) return { type: "Unreadable page", confidence: 0 };
  return { type: "Supporting Document", confidence: 78 };
}

function classify(text: string, fileName: string, hasPo: boolean): ExtractionOutput["classification"] {
  const t = (text + " " + fileName).toLowerCase();
  const rules: { type: Invoice["invoiceType"]; kws: string[]; signals: string[] }[] = [
    { type: "Credit Note", kws: ["credit note", "credit memo"], signals: ["Credit note wording", "Negative value"] },
    { type: "Debit Note", kws: ["debit note"], signals: ["Debit note wording"] },
    { type: "Import / Customs", kws: ["customs declaration", "customs duty", "declared value", "customs authority"], signals: ["Customs declaration reference", "Duty line present", "Import consignment reference"] },
    { type: "Freight / Logistics", kws: ["freight", "bill of lading", "container", "haulage", "terminal handling", "carrier"], signals: ["Freight reference", "Transport service description", "No material line items"] },
    { type: "Utility", kws: ["electricity", "water supply", "utility account", "meter reading"], signals: ["Meter reference", "Utility account number"] },
    { type: "Employee Reimbursement", kws: ["reimbursement", "expense claim"], signals: ["Employee reference", "Expense claim wording"] },
    { type: "Intercompany", kws: ["intercompany", "inter-company"], signals: ["Group entity counterparty"] },
    { type: "Service Invoice", kws: ["consulting", "advisory", "services rendered", "retainer", "subscription", "abonnement", "hosting", "hebergement", "licence", "managed services", "storage"], signals: ["Service description", "No material quantities", "Recurring term"] },
  ];
  for (const r of rules) {
    const hits = r.kws.filter((k) => t.includes(k));
    if (hits.length) {
      const type = r.type === "Service Invoice" && !hasPo ? "Non-PO Invoice" : r.type;
      return {
        type,
        confidence: Math.min(98.6, 89 + hits.length * 2.6),
        signals: [`Keywords found: ${hits.slice(0, 3).join(", ")}`, ...r.signals.slice(0, 2), hasPo ? "Purchase order reference present" : "No purchase order reference"],
      };
    }
  }
  if (hasPo) return { type: "PO Invoice", confidence: 96.4, signals: ["Purchase order reference present", "Material line items detected"] };
  return {
    type: text ? "Non-PO Invoice" : "Other",
    confidence: text ? 88.2 : 40,
    signals: text ? ["No purchase order reference found"] : ["No readable text — classify manually"],
  };
}

function findVendor(text: string, supplierHint: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hay = norm(supplierHint + " " + text);
  const exact = vendors.find((v) => hay.includes(norm(v.name)));
  if (exact) return { name: exact.name, conf: 97.5 };
  const partial = vendors.find((v) => {
    const w = v.name.split(" ").filter((x) => x.length > 3);
    return w.length >= 2 && hay.includes(norm(w[0]!)) && hay.includes(norm(w[1]!));
  });
  if (partial) return { name: partial.name, conf: 86 };
  return { name: supplierHint, conf: supplierHint ? 80 : 0 };
}

/* ------------------------------ Main ------------------------------ */
export async function extractDocument(file: File, onStage?: (s: string) => void): Promise<ExtractionOutput> {
  const t0 = performance.now();
  const ext = (file.name.split(".").pop() ?? "").toUpperCase();
  const fileHash = await sha256(file);
  let previewUrl: string | null = URL.createObjectURL(file);
  let previewKind: ExtractionOutput["previewKind"] = "none";
  let text = "";
  let pages = 1;
  let pageInfo: PageInfo[] = [];
  let parsed = false;
  let method: ExtractionOutput["method"] = "None";
  let ocrConfidence: number | null = null;
  let parseNote = "";
  let structured: { h: Header; lines: LineItem[]; format: string } | null = null;

  try {
    if (ext === "PDF") {
      previewKind = "pdf";
      onStage?.("Reading PDF text layer");
      const r = await readPdf(file);
      pages = r.pages;
      if (r.pagesText.join("").trim().length > 40) {
        text = r.pagesText.join("\n\f\n");
        parsed = true;
        method = "Text layer";
        pageInfo = r.pagesText.map((t, i) => ({ page: i + 1, ...classifyPage(t) }));
        // Render pages as images: browsers block their built-in PDF viewer inside embedded frames.
        try {
          for (let p = 1; p <= Math.min(r.pages, 3); p++) {
            const c = await renderPdfPage(r.doc, p);
            const img = c.toDataURL("image/jpeg", 0.85);
            if (p === 1) { previewUrl = img; previewKind = "image"; }
            pageInfo[p - 1] = { ...pageInfo[p - 1]!, image: img };
          }
        } catch { /* preview only — never block reading */ }
        parseNote = `Text layer read from ${r.pages} page(s).`;
      } else {
        onStage?.("Scanned PDF — running OCR");
        const texts: string[] = [];
        let confSum = 0;
        for (let p = 1; p <= Math.min(r.pages, 5); p++) {
          const c = await renderPdfPage(r.doc, p);
          const o = await ocr(c);
          texts.push(o.text);
          confSum += o.confidence;
          pageInfo.push({ page: p, ...classifyPage(o.text), image: thumb(c) });
          if (p === 1) { previewUrl = c.toDataURL("image/jpeg", 0.85); previewKind = "image"; }
        }
        text = texts.join("\n\f\n");
        ocrConfidence = confSum / Math.max(1, texts.length);
        parsed = text.trim().length > 20;
        method = "OCR";
        parseNote = `Scanned PDF — OCR on ${texts.length} page(s), average confidence ${ocrConfidence.toFixed(1)}%.`;
      }
    } else if (ext === "XML") {
      previewKind = "text";
      text = await file.text();
      structured = readUbl(text);
      parsed = !!structured;
      method = "Structured XML";
      parseNote = structured ? `${structured.format} — values read directly from tagged elements.` : "XML could not be parsed.";
      pageInfo = [{ page: 1, type: "Invoice", confidence: 99.5 }];
    } else if (ext === "JSON") {
      previewKind = "text";
      text = await file.text();
      structured = readJson(text);
      parsed = !!structured;
      method = "Structured JSON";
      parseNote = structured ? `${structured.format} — values read directly from the document schema.` : "JSON could not be parsed.";
      pageInfo = [{ page: 1, type: "Invoice", confidence: 99.5 }];
    } else if (["TXT", "CSV"].includes(ext)) {
      previewKind = "text";
      text = await file.text();
      parsed = true;
      method = "Plain text";
      parseNote = "Text file read directly.";
    } else if (["TIF", "TIFF"].includes(ext)) {
      previewKind = "image";
      onStage?.("Decoding TIFF pages");
      const canvases = await decodeTiff(file);
      pages = canvases.length;
      const texts: string[] = [];
      let confSum = 0;
      for (let i = 0; i < canvases.length; i++) {
        onStage?.(`OCR page ${i + 1} of ${canvases.length}`);
        const o = await ocr(canvases[i]!);
        texts.push(o.text);
        confSum += o.confidence;
        pageInfo.push({ page: i + 1, ...classifyPage(o.text), image: thumb(canvases[i]!) });
      }
      previewUrl = canvases[0] ? canvases[0].toDataURL("image/jpeg", 0.85) : null;
      text = texts.join("\n\f\n");
      ocrConfidence = confSum / Math.max(1, texts.length);
      parsed = text.trim().length > 20;
      method = "OCR";
      parseNote = `${pages}-page TIFF decoded and read with OCR (average confidence ${ocrConfidence.toFixed(1)}%).`;
    } else if (["PNG", "JPG", "JPEG", "WEBP", "BMP"].includes(ext)) {
      previewKind = "image";
      onStage?.("Running OCR on image");
      const o = await ocr(file);
      text = o.text;
      ocrConfidence = o.confidence;
      parsed = text.trim().length > 20;
      method = "OCR";
      pageInfo = [{ page: 1, ...classifyPage(text), image: previewUrl ?? undefined }];
      parseNote = `Image read with OCR (confidence ${o.confidence.toFixed(1)}%).${o.confidence < 80 ? " Handwriting or low image quality detected — review suggested." : ""}`;
    } else if (["DOC", "DOCX"].includes(ext)) {
      const raw = await file.text();
      const stripped = raw.replace(/<[^>]+>/g, " ").replace(/[^\x20-\x7E\n]+/g, " ");
      if (stripped.replace(/\s+/g, " ").trim().length > 80) {
        text = stripped;
        parsed = true;
        method = "Plain text";
        parseNote = "Partial text recovered from the Word document.";
      } else parseNote = "Word document could not be read — confirm the fields manually.";
    } else {
      parseNote = "Unsupported format — confirm the fields manually.";
    }
  } catch (e) {
    parseNote = `Document could not be read (${e instanceof Error ? e.message : "unknown error"}). Confirm the fields manually.`;
  }

  onStage?.("Extracting fields");
  const h = structured?.h ?? headerFromText(text);
  const lines = structured?.lines.length ? structured.lines : linesFromText(text);
  const vendor = findVendor(text, h.supplier);
  const base = method === "Structured XML" || method === "Structured JSON" ? 99.4 : method === "Text layer" ? 97.8 : method === "OCR" ? Math.min(95, (ocrConfidence ?? 60) + 6) : 70;
  const lineNet = Math.round(lines.reduce((s, l) => s + l.invoiceQty * l.invoicePrice, 0) * 100) / 100;
  let netV = num(h.net);
  let taxV = num(h.tax);
  let totalV = num(h.total);
  // Cross-validate totals arithmetically to raise or lower confidence honestly.
  const totalsConsistent = totalV > 0 && Math.abs(netV + taxV - totalV) < 1;
  if (!netV && totalV && taxV) netV = Math.round((totalV - taxV) * 100) / 100;
  if (!netV && lineNet) netV = lineNet;
  if (!totalV && netV && taxV) totalV = netV + taxV;
  const adj = (c: number) => (totalsConsistent ? Math.min(99.6, c + 1.5) : c - 6);

  const fields: ExtractedField[] = [
    field("vendorName", "Supplier Name", vendor.name, Math.min(base, vendor.conf), "Header block"),
    field("taxId", "Supplier Tax ID", h.taxId, base - 2, "Header block"),
    field("invoiceNumber", "Invoice Number", h.invoiceNumber, base, "Header · Invoice No"),
    field("poNumber", "PO Number", h.po, base - 0.6, "Header · PO reference"),
    field("grnNumber", "GRN Number", h.grn, base - 1.5, "Header · GRN reference"),
    field("invoiceDate", "Invoice Date", h.date, base - 0.8, "Header · Date"),
    field("currency", "Currency", h.currency, base, "Header · Currency"),
    field("grossAmount", "Invoice Value", totalV ? String(totalV) : "", adj(base), "Totals block"),
    field("taxAmount", "Tax Amount", taxV ? String(taxV) : "", adj(base - 3), "Totals block"),
    field("netAmount", "Net Value", netV ? String(netV) : "", adj(base - 1), num(h.net) ? "Totals block" : "Derived"),
    field("paymentTerms", "Payment Terms", h.terms, base - 2.5, "Header · Terms"),
  ];

  const bank = (text.match(/IBAN\s*([A-Z]{2}\d{2}[\sA-Z0-9]{10,30}?)(?=\s{2}|\s·|$)/m)?.[1] ?? "").trim();
  const customs = customsFromText(text);
  if (customs) {
    fields.push(
      field("customsDecl", "Customs Declaration No", customs.declarationNumber, base - 1, "Customs block"),
      field("customsDate", "Declaration Date", customs.declarationDate, base - 2, "Customs block"),
      field("customsAuthority", "Customs Authority", customs.authority, base - 2, "Customs block"),
      field("customsDuty", "Customs Duty", customs.duty ? String(customs.duty) : "", base - 2, "Customs block"),
      field("declaredValue", "Declared Value", customs.declaredValue ? String(customs.declaredValue) : "", base - 2, "Customs block"),
    );
  }
  if (bank) fields.push(field("bank", "Bank Details", `IBAN ${bank}`, base - 3, "Footer"));

  return {
    fileName: file.name,
    fileType: ext || "FILE",
    fileHash,
    previewUrl,
    previewKind,
    pages,
    pageInfo,
    text,
    parsed,
    method,
    ocrConfidence,
    parseNote,
    fields,
    lines,
    classification: classify(text, file.name, !!h.po),
    language: detectLanguage(text),
    eInvoiceFormat: structured?.format ?? null,
    customs,
    bankDetails: bank ? `IBAN ${bank}` : "",
    durationMs: Math.round(performance.now() - t0),
  };
}

const CUR_COUNTRY: Record<string, Invoice["country"]> = { AED: "UAE", SAR: "Saudi Arabia", INR: "India", GBP: "UK", SGD: "Singapore" };

export function fieldsToInvoice(out: ExtractionOutput, id: string, source: Invoice["source"]): Invoice {
  const get = (k: string) => out.fields.find((f) => f.key === k)?.value ?? "";
  const gross = Number(get("grossAmount")) || 0;
  const tax = Number(get("taxAmount")) || 0;
  const filled = out.fields.filter((f) => f.value);
  const core = ["vendorName", "invoiceNumber", "invoiceDate", "grossAmount", "currency"];
  const missingCore = core.filter((k) => !get(k)).length;
  const avgConf = filled.reduce((s, f) => s + f.confidence, 0) / Math.max(1, filled.length);
  const currency = get("currency") || "AED";
  const terms = get("paymentTerms") || "Net 45";
  const days = Number(terms.match(/\d+/)?.[0] ?? 45);
  const invDate = get("invoiceDate") || new Date().toISOString().slice(0, 10);
  const due = new Date(new Date(invDate).getTime() + days * 86400000);
  const now = new Date().toISOString();
  return {
    id,
    invoiceNumber: get("invoiceNumber") || `UNREAD-${id}`,
    vendorId: vendors.find((v) => v.name === get("vendorName"))?.id ?? "VEN-NEW",
    vendorName: get("vendorName") || "Unconfirmed supplier",
    businessUnit: "Manufacturing",
    country: CUR_COUNTRY[currency] ?? "UAE",
    companyCode: "NG10",
    erp: "SAP S/4HANA",
    invoiceDate: invDate,
    dueDate: isNaN(due.getTime()) ? invDate : due.toISOString().slice(0, 10),
    paymentTerms: terms,
    currency,
    netAmount: Number(get("netAmount")) || Math.max(0, gross - tax),
    taxAmount: tax,
    grossAmount: gross,
    poNumber: get("poNumber") || null,
    grnNumber: get("grnNumber") || null,
    invoiceType: out.classification.type,
    documentType: out.eInvoiceFormat ?? `${out.fileType} document`,
    language: out.language,
    lines: out.lines,
    coding: { glAccount: "—", costCenter: "—", profitCenter: "—", internalOrder: "—", taxCode: "—", project: "—", confidence: 0 },
    classificationConfidence: out.classification.confidence,
    extractionConfidence: Math.max(0, Math.round((avgConf - missingCore * 12) * 10) / 10),
    duplicateRisk: 0,
    matchStatus: "Not Matched",
    matchScore: 0,
    matchMode: get("poNumber") ? "3-Way" : "Non-PO",
    exceptionType: null,
    exceptionAgeHours: 0,
    slaHours: 8,
    owner: "AP Processing Queue",
    approvalStatus: "Pending",
    erpStatus: "Not Posted",
    paymentStatus: "Not Due",
    bankStatus: "—",
    lifecycle: "Extracted",
    touchlessScore: 0,
    touchless: false,
    source,
    uploaded: true,
    fileName: out.fileName,
    fileType: out.fileType,
    fileHash: out.fileHash,
    extractedText: out.text.slice(0, 4000),
    customs: out.customs,
    supplierTaxId: get("taxId") || undefined,
    bankDetails: out.bankDetails || undefined,
    eInvoiceFormat: out.eInvoiceFormat ?? undefined,
    pages: out.pageInfo.map(({ page, type, confidence }) => ({ page, type, confidence })),
    audit: [
      { id: `${id}-u1`, ts: now, actor: "Intake Service", actorType: "System", action: `Received via ${source} (${out.fileName})` },
      { id: `${id}-u2`, ts: now, actor: "Classifier v4.2", actorType: "AI", action: `Classified as ${out.classification.type}`, confidence: out.classification.confidence },
      { id: `${id}-u3`, ts: now, actor: "Extraction v3.8", actorType: "AI", action: `Fields extracted by ${out.method}${out.ocrConfidence != null ? ` (OCR ${out.ocrConfidence.toFixed(1)}%)` : ""}`, confidence: Math.round(avgConf * 10) / 10 },
    ],
  };
}

/** Rebuilds a viewable first-page image for a stored original (used after a reload clears in-memory previews). */
export async function previewFromBlob(blob: Blob, name: string): Promise<string | null> {
  if (/\.pdf$/i.test(name) || blob.type === "application/pdf") {
    const r = await readPdf(new File([blob], name, { type: "application/pdf" }));
    const c = await renderPdfPage(r.doc, 1);
    return c.toDataURL("image/jpeg", 0.85);
  }
  if (blob.type.startsWith("image/") && !/tiff?$/i.test(blob.type)) return URL.createObjectURL(blob);
  return null;
}
