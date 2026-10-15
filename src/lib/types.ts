export type BusinessUnit =
  | "Manufacturing"
  | "Trading"
  | "Transportation"
  | "Logistics"
  | "Distribution"
  | "Services";

export type Country = "UAE" | "Saudi Arabia" | "India" | "UK" | "Singapore";
export type Erp = "SAP S/4HANA" | "Oracle Fusion";

export type InvoiceType =
  | "PO Invoice"
  | "Non-PO Invoice"
  | "Intercompany"
  | "Service Invoice"
  | "Employee Reimbursement"
  | "Import / Customs"
  | "Utility"
  | "Freight / Logistics"
  | "Credit Note"
  | "Debit Note"
  | "Other";

export type LifecycleStage =
  | "Received"
  | "Classified"
  | "Extracted"
  | "Validated"
  | "Matched"
  | "Approved"
  | "Posted"
  | "Payment Scheduled"
  | "Payment Released"
  | "Beneficiary Credited"
  | "Review Required";

export type MatchStatus = "Matched" | "Review Required" | "Not Matched" | "Not Applicable";
export type ApprovalStatus = "Auto Approved" | "Approved" | "Pending" | "Rejected" | "Not Required";
export type ErpStatus = "Posted" | "Pending" | "Failed" | "Not Posted";
export type PaymentStatus =
  | "Not Due"
  | "Approved for Payment"
  | "Scheduled"
  | "Initiated"
  | "Processed"
  | "Released"
  | "Beneficiary Credited"
  | "Rejected"
  | "Failed"
  | "Returned";
export type BankStatus = "—" | "Processing" | "Released" | "Credited" | "Rejected";

export type Severity = "Critical" | "High" | "Medium" | "Low" | "Opportunity";

export type ExceptionType =
  | "PO Missing"
  | "GRN Missing"
  | "Quantity Variance"
  | "Price Variance"
  | "Tax Variance"
  | "Vendor Mismatch"
  | "Duplicate Risk"
  | "Invalid Coding"
  | "Approval Missing"
  | "Bank Detail Change"
  | "Compliance Issue";

export interface Vendor {
  id: string;
  name: string;
  country: Country;
  taxId: string;
  bankAccount: string;
  category: string;
  riskLevel: "Low" | "Medium" | "High";
  riskScore: number;
  onTimeDocs: number;
  paymentQueries: number;
  critical: boolean;
}

export interface LineItem {
  line: number;
  description: string;
  materialGroup: string;
  invoiceQty: number;
  poQty: number;
  grnQty: number | null;
  invoicePrice: number;
  poPrice: number;
}

export interface Coding {
  glAccount: string;
  costCenter: string;
  profitCenter: string;
  internalOrder: string;
  taxCode: string;
  project: string;
  confidence: number;
}

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  actorType: "AI" | "Human" | "System";
  action: string;
  oldValue?: string | undefined;
  newValue?: string | undefined;
  reason?: string | undefined;
  confidence?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  businessUnit: BusinessUnit;
  country: Country;
  companyCode: string;
  erp: Erp;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  currency: string;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  poNumber: string | null;
  grnNumber: string | null;
  invoiceType: InvoiceType;
  documentType: string;
  language: "English" | "Arabic" | "Hindi" | "French";
  lines: LineItem[];
  coding: Coding;
  classificationConfidence: number;
  extractionConfidence: number;
  duplicateRisk: number;
  duplicateOf?: string | undefined;
  matchStatus: MatchStatus;
  matchScore: number;
  matchMode: "3-Way" | "2-Way" | "Non-PO";
  exceptionType: ExceptionType | null;
  exceptionAgeHours: number;
  slaHours: number;
  owner: string;
  approvalStatus: ApprovalStatus;
  erpStatus: ErpStatus;
  paymentStatus: PaymentStatus;
  bankStatus: BankStatus;
  lifecycle: LifecycleStage;
  touchlessScore: number;
  touchless: boolean;
  source: "Email" | "Vendor Portal" | "Manual Upload" | "E-Invoice" | "API" | "SFTP" | "Bulk Import";
  customs?: {
    declarationNumber: string;
    declarationDate: string;
    authority: string;
    duty: number;
    declaredValue: number;
  } | undefined;
  audit: AuditEntry[];
  uploaded?: boolean | undefined;
  fileName?: string | undefined;
  fileType?: string | undefined;
  extractedText?: string | undefined;
  fileHash?: string | undefined;
  compliance?: ComplianceCheck[] | undefined;
  pages?: { page: number; type: string; confidence: number }[] | undefined;
  supplierTaxId?: string | undefined;
  bankDetails?: string | undefined;
  eInvoiceFormat?: string | undefined;
  supportingDocs?: { name: string; type: string; hash: string; ts: string; by: string }[] | undefined;
}

export interface ComplianceCheck {
  check: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface PoLine {
  line: number;
  description: string;
  materialGroup: string;
  qty: number;
  price: number;
}
export interface GrnLine {
  line: number;
  qty: number;
}

export interface PurchaseOrder {
  poNumber: string;
  vendorId: string;
  vendorName: string;
  currency: string;
  orderedValue: number;
  orderedQty: number;
  paymentTerms: string;
  businessUnit: BusinessUnit;
  date: string;
  lines?: PoLine[] | undefined;
  erp?: Erp | undefined;
  country?: Country | undefined;
  companyCode?: string | undefined;
  grnRequired?: boolean | undefined;
}

export interface GoodsReceipt {
  grnNumber: string;
  poNumber: string;
  receivedValue: number;
  receivedQty: number;
  receiptDate: string;
  lines?: GrnLine[] | undefined;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  vendorName: string;
  value: number;
  currency: string;
  dueDate: string;
  discountOpportunity: number;
  priority: "Critical" | "High" | "Normal";
  method: "Bank Transfer" | "ACH" | "SWIFT" | "Virtual Card";
  erpPaymentId: string;
  bankReference: string;
  status: PaymentStatus;
  bankStatus: BankStatus;
  initiatedAt?: string | undefined;
  processedAt?: string | undefined;
  releasedAt?: string | undefined;
  creditedAt?: string | undefined;
  reason?: string | undefined;
}

export interface Tolerances {
  price: number;
  quantity: number;
  total: number;
  tax: number;
  freight: number;
  service: number;
  autoApproveBelow: number;
  confidenceThreshold: number;
  duplicateSensitivity: number;
}

export interface Scenario {
  id: string;
  name: string;
  tolerances: Tolerances;
  twoWayFreight: boolean;
  createdAt: string;
  result: TwinResult;
  status: "Draft" | "Saved" | "Pending Approval" | "Applied" | "Archived";
}

export interface TwinResult {
  touchlessRate: number;
  manualReviews: number;
  exceptionVolume: number;
  cycleTimeDays: number;
  slaBreaches: number;
  duplicatePrevention: number;
  riskExposure: number;
  workloadHours: number;
  costPerInvoice: number;
  approvalLoad: number;
}

export interface Notification {
  id: string;
  ts: string;
  severity: Severity;
  title: string;
  body: string;
  read: boolean;
  link?: string | undefined;
}

export interface MailItem {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  received: string;
  attachments: { name: string; size: string; type: string; url?: string | undefined }[];
  classification: InvoiceType;
  confidence: number;
  invoiceId?: string | undefined;
  processed: boolean;
  body: string;
}

export type Persona =
  | "CFO"
  | "AP Head"
  | "AP Processor"
  | "AP Manager"
  | "Finance Controller"
  | "Procurement"
  | "Business Approver"
  | "Treasury"
  | "Vendor Manager"
  | "Auditor"
  | "System Administrator";
