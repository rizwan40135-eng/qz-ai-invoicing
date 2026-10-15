export interface SampleDoc {
  file: string;
  title: string;
  format: string;
  expect: string;
}

export const SAMPLE_DOCS: SampleDoc[] = [
  { file: "INV-NIS-50117_perfect-match.pdf", title: "Nova Industrial — PO invoice", format: "PDF (text)", expect: "3-way match against PO-45008210 / GRN-910560 → touchless, posted, scheduled" },
  { file: "INV-NIS-50126_quantity-exception.pdf", title: "Nova Industrial — short receipt", format: "PDF (text)", expect: "GRN-910577 received 72 of 80 pipes → quantity exception routed to Receiving" },
  { file: "INV-NIS-50171_possible-duplicate.pdf", title: "Nova Industrial — near-identical invoice", format: "PDF (text)", expect: "Upload after 50117 → flagged as a likely duplicate and blocked" },
  { file: "MPI-INV-7781_scanned-invoice.png", title: "Metro Packaging — scanned invoice", format: "PNG (OCR)", expect: "Read with OCR, matched to PO-45008255 / GRN-910601" },
  { file: "MPI-INV-7781_phone-photo.jpg", title: "Metro Packaging — phone photo", format: "JPEG (OCR)", expect: "Same invoice as the PNG → exact-duplicate invoice number is blocked" },
  { file: "EEW-INV-4410_multipage.tiff", title: "Eastern Engineering — invoice + delivery note", format: "Multi-page TIFF (OCR)", expect: "2 pages split into Invoice and Delivery Note; unit price above PO → price exception" },
  { file: "BRU-0921_handwritten.jpg", title: "BlueRiver Utilities — handwritten bill", format: "JPEG handwriting (OCR)", expect: "Utility invoice without PO → validation and approval route" },
  { file: "FR-8894_freight-einvoice-UAE.xml", title: "Global Freight — UAE e-invoice", format: "UBL / PINT AE XML", expect: "2-way freight match within freight tolerance" },
  { file: "INV-KSA-3390_zatca-arabic.xml", title: "Prime Logistics — Saudi e-invoice (Arabic)", format: "ZATCA UBL XML", expect: "Arabic detected, SAR 15% VAT checks, 3-way match" },
  { file: "PDN-GST-1187_india-einvoice.json", title: "Polaris Data — India GST e-invoice", format: "GST IRN JSON", expect: "GSTIN and IRN checks, INR 18% GST, 2-way service match" },
  { file: "APEX-INV-3301_non-po-consulting.pdf", title: "Apex Advisory — consulting, no PO", format: "PDF (text)", expect: "Non-PO → coding suggested → 3-level approval (over AED 50K)" },
  { file: "ICC-CUS-2291_customs-import.pdf", title: "International Clearing — customs", format: "2-page PDF", expect: "Customs declaration, duty and declared value captured" },
  { file: "VTS-FR-2207_french-subscription.pdf", title: "Vertex Technology — French invoice", format: "PDF (French)", expect: "French detected, 2-way subscription match" },
];

export const sampleUrl = (file: string) => `/samples/${file}`;
