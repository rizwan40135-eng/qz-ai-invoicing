import { useSyncExternalStore } from "react";
import { COUNTRY_CONFIG, POLICY_RULES, SOD_RULES, WORKFLOWS } from "./data";

export interface ConnectorConfig {
  id: string;
  name: string;
  kind: "ERP" | "Data Platform" | "Bank";
  enabled: boolean;
  endpoint: string;
  fields: Record<string, string>;
  credentialRef: string;
  mode: "Real-time API" | "Scheduled batch";
  intervalMin: number;
  lastTest?: { ok: boolean; message: string; ts: string; ms: number };
}
export interface Mailbox {
  id: string;
  address: string;
  protocol: "Microsoft Graph" | "IMAP" | "Gmail API";
  host: string;
  folder: string;
  pollMin: number;
  allowedSenders: string;
  autoProcess: boolean;
  enabled: boolean;
  credentialRef: string;
}
export interface NotificationRule {
  event: string;
  inApp: boolean;
  email: boolean;
  teams: boolean;
  recipients: string;
}
export interface ApprovalLevel { upTo: number; approvers: string }
export interface ToleranceOverride { id: string; scope: "Supplier" | "Category" | "Transaction type" | "Business unit"; value: string; price: number; quantity: number }
export interface AdminUser { id: string; name: string; email: string; role: string; bu: string; active: boolean }

export interface BuRule { bu: string; matchPolicy: "By category" | "Always 3-way" | "Always 2-way"; price: number; quantity: number; autoApproveBelow: number; notes: string }
export interface PolicyRule { id: string; name: string; scope: string; value: string; active: boolean }
export interface WorkflowRule { id: string; name: string; condition: string; steps: string[] }
export interface SodRule { id: string; role: string; restriction: string; enforced: boolean }
export interface AiCapability { id: string; name: string; version: string; owner: string; status: string }
export interface ComplianceRow { id: string; country: string; currency: string; taxModel: string; rate: string; withholding: string; eInvoice: string; format: string; language: string; rules: string }

export interface AdminConfig {
  buRules: BuRule[];
  policies: PolicyRule[];
  workflows: WorkflowRule[];
  sod: SodRule[];
  aiCapabilities: AiCapability[];
  compliance: ComplianceRow[];
  connectors: ConnectorConfig[];
  mailboxes: Mailbox[];
  notifications: NotificationRule[];
  digest: "Off" | "Hourly" | "Daily";
  reminderPct: number;
  escalateAfterPct: number;
  slaHours: Record<string, number>;
  approvalLevels: ApprovalLevel[];
  dualApprovalAbove: number;
  overrides: ToleranceOverride[];
  duplicate: { highRisk: number; review: number; blockExact: boolean };
  ai: { extraction: boolean; copilot: boolean; coding: boolean; autoAcceptConfidence: number; touchlessMinScore: number; reasoning: "low" | "medium" | "high" };
  payments: { runDays: string[]; cutoff: string; method: string; format: string; earlyDiscount: boolean };
  countries: Record<string, { vatRate: number; einvoice: string; enforce: boolean; withholding: number }>;
  security: { sessionTimeoutMin: number; mfa: boolean; retentionYears: number; ipAllowlist: string; supplierPortalExpiryDays: number };
  users: AdminUser[];
}

const KEY = "qap-admin-config-v1";

export const DEFAULT_CONFIG: AdminConfig = {
  buRules: [
    { bu: "Manufacturing", matchPolicy: "Always 3-way", price: 1, quantity: 2, autoApproveBelow: 5000, notes: "Strict goods receipt enforcement" },
    { bu: "Trading", matchPolicy: "Always 3-way", price: 1, quantity: 2, autoApproveBelow: 5000, notes: "Freight lines allowed ±3%" },
    { bu: "Transportation", matchPolicy: "By category", price: 3, quantity: 3, autoApproveBelow: 10000, notes: "2-way for line haul" },
    { bu: "Logistics", matchPolicy: "By category", price: 3, quantity: 3, autoApproveBelow: 10000, notes: "Customs document required" },
    { bu: "Distribution", matchPolicy: "Always 3-way", price: 2, quantity: 2, autoApproveBelow: 5000, notes: "Batch receipt matching" },
    { bu: "Services", matchPolicy: "Always 2-way", price: 5, quantity: 5, autoApproveBelow: 2500, notes: "Approval heavy" },
  ],
  policies: POLICY_RULES.map((p) => ({ ...p })),
  workflows: WORKFLOWS.map((w) => ({ ...w, steps: [...w.steps] })),
  sod: SOD_RULES.map((r, i) => ({ id: `sod${i}`, role: r.role, restriction: r.restriction, enforced: r.enforced })),
  aiCapabilities: [
    { id: "classification", name: "Document Classification", version: "v4.2", owner: "AP Operations", status: "Active" },
    { id: "extraction", name: "OCR / Extraction", version: "v6.1", owner: "AP Operations", status: "Active" },
    { id: "duplicate", name: "Duplicate Detection", version: "v3.4", owner: "AP Controls", status: "Active" },
    { id: "coding", name: "Accounting Coding", version: "v2.8", owner: "Financial Accounting", status: "Active" },
    { id: "matching", name: "PO / GRN Matching", version: "v3.0", owner: "AP Operations", status: "Active" },
    { id: "copilot", name: "Q AI Assistant", version: "v1.9", owner: "AP Operations", status: "Advisory only" },
  ],
  compliance: COUNTRY_CONFIG.map((c) => ({ id: c.country, ...c })),
  connectors: [
    { id: "sap", name: "SAP S/4HANA", kind: "ERP", enabled: true, endpoint: "https://sap.novaglobal.example/sap/opu/odata/sap", fields: { "Client": "100", "Company codes": "NG10, NG20, NG30", "PO service": "API_PURCHASEORDER_PROCESS_SRV", "GRN service": "API_MATERIAL_DOCUMENT_SRV", "Invoice service": "API_SUPPLIERINVOICE_PROCESS_SRV" }, credentialRef: "SAP_SERVICE_USER", mode: "Real-time API", intervalMin: 15 },
    { id: "oracle", name: "Oracle Fusion", kind: "ERP", enabled: true, endpoint: "https://oracle.novaglobal.example/fscmRestApi/resources/11.13.18.05", fields: { "Business units": "Trading, Logistics", "Ledger": "NG Primary Ledger", "Payables source": "Q-AP AI" }, credentialRef: "ORACLE_INTEGRATION_USER", mode: "Scheduled batch", intervalMin: 15 },
    { id: "snowflake", name: "Snowflake", kind: "Data Platform", enabled: false, endpoint: "https://novaglobal.snowflakecomputing.com", fields: { "Warehouse": "AP_WH", "Database": "FINANCE", "Schema": "AP", "Role": "AP_ANALYTICS" }, credentialRef: "SNOWFLAKE_KEYPAIR", mode: "Scheduled batch", intervalMin: 60 },
    { id: "databricks", name: "Databricks", kind: "Data Platform", enabled: false, endpoint: "https://novaglobal.cloud.databricks.com", fields: { "SQL warehouse HTTP path": "/sql/1.0/warehouses/ap", "Catalog": "finance", "Schema": "ap_gold" }, credentialRef: "DATABRICKS_TOKEN", mode: "Scheduled batch", intervalMin: 60 },
    { id: "bank", name: "Bank / Treasury (host-to-host)", kind: "Bank", enabled: true, endpoint: "https://h2h.bank.example/api", fields: { "Payment format": "ISO 20022 pain.001", "Status format": "pain.002 / camt.054", "Debit BIC": "NGBKAEAD" }, credentialRef: "BANK_H2H_CERT", mode: "Real-time API", intervalMin: 5 },
  ],
  mailboxes: [
    { id: "mb1", address: "ap-invoices@novaglobal.example", protocol: "Microsoft Graph", host: "graph.microsoft.com", folder: "Inbox/Invoices", pollMin: 2, allowedSenders: "*", autoProcess: true, enabled: true, credentialRef: "GRAPH_APP_REGISTRATION" },
  ],
  notifications: [
    "New exception", "SLA reminder", "SLA escalation", "Duplicate detected", "Approval requested", "Payment rejected by bank", "Low extraction confidence", "Supplier document received", "ERP sync error",
  ].map((event) => ({ event, inApp: true, email: event !== "Supplier document received", teams: /escalation|rejected|Duplicate/.test(event), recipients: /Payment/.test(event) ? "treasury@novaglobal.example" : "ap-team@novaglobal.example" })),
  digest: "Daily",
  reminderPct: 50,
  escalateAfterPct: 100,
  slaHours: { "Quantity Variance": 8, "Price Variance": 8, "GRN Missing": 24, "PO Missing": 24, "Tax Variance": 8, "Duplicate Risk": 4, "Bank Detail Change": 4, "Approval Missing": 24 },
  approvalLevels: [
    { upTo: 5000, approvers: "Auto-approve (policy)" },
    { upTo: 50000, approvers: "Business Owner" },
    { upTo: 250000, approvers: "Business Owner → Finance Manager" },
    { upTo: 99999999, approvers: "Business Owner → Finance Manager → Controller" },
  ],
  dualApprovalAbove: 250000,
  overrides: [
    { id: "o1", scope: "Category", value: "Freight / Logistics", price: 3, quantity: 3 },
    { id: "o2", scope: "Supplier", value: "Nova Industrial Supplies LLC", price: 1, quantity: 2 },
  ],
  duplicate: { highRisk: 90, review: 75, blockExact: true },
  ai: { extraction: true, copilot: true, coding: true, autoAcceptConfidence: 90, touchlessMinScore: 85, reasoning: "low" },
  payments: { runDays: ["Tue", "Thu"], cutoff: "14:00", method: "Bank Transfer", format: "ISO 20022 pain.001", earlyDiscount: true },
  countries: {
    UAE: { vatRate: 5, einvoice: "PINT AE (UBL)", enforce: true, withholding: 0 },
    "Saudi Arabia": { vatRate: 15, einvoice: "ZATCA FATOORA (UBL XML)", enforce: true, withholding: 5 },
    India: { vatRate: 18, einvoice: "GST IRN (JSON)", enforce: true, withholding: 2 },
    UK: { vatRate: 20, einvoice: "Optional (Peppol BIS)", enforce: false, withholding: 0 },
    Singapore: { vatRate: 9, einvoice: "InvoiceNow (Peppol)", enforce: false, withholding: 0 },
  },
  security: { sessionTimeoutMin: 30, mfa: true, retentionYears: 10, ipAllowlist: "", supplierPortalExpiryDays: 90 },
  users: [
    { id: "u1", name: "R. Fernandes", email: "r.fernandes@novaglobal.example", role: "AP Processor", bu: "Manufacturing", active: true },
    { id: "u2", name: "A. Salem", email: "a.salem@novaglobal.example", role: "AP Manager", bu: "All", active: true },
    { id: "u3", name: "K. Mehta", email: "k.mehta@novaglobal.example", role: "Finance Controller", bu: "All", active: true },
    { id: "u4", name: "H. Rahman", email: "h.rahman@novaglobal.example", role: "Treasury", bu: "All", active: true },
    { id: "u5", name: "L. Chen", email: "l.chen@novaglobal.example", role: "Auditor", bu: "All", active: true },
  ],
};

let state: AdminConfig = DEFAULT_CONFIG;
let loaded = false;
const subs = new Set<() => void>();

export const syncInfo: { updatedBy: string | null; updatedAt: string | null; error: string | null } = { updatedBy: null, updatedAt: null, error: null };
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* keep defaults */
  }
  import("./settings.functions").then(({ loadWorkspaceSettings }) =>
    loadWorkspaceSettings().then((r) => {
      if (r) {
        state = { ...DEFAULT_CONFIG, ...(JSON.parse(r.config) as Partial<AdminConfig>) };
        syncInfo.updatedBy = r.updatedBy;
        syncInfo.updatedAt = r.updatedAt;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* cache only */ }
        subs.forEach((f) => f());
      }
    }),
  ).catch((e) => { syncInfo.error = e instanceof Error ? e.message : String(e); });
}

function pushShared() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    import("./settings.functions")
      .then(({ saveWorkspaceSettings }) => saveWorkspaceSettings({ data: { config: state as unknown as Record<string, unknown> } }))
      .then((r) => { syncInfo.updatedAt = r.updatedAt; syncInfo.error = null; subs.forEach((f) => f()); })
      .catch((e) => {
        syncInfo.error = e instanceof Error ? e.message : String(e);
        import("sonner").then(({ toast }) => toast.error("Settings not saved to workspace", { description: syncInfo.error ?? "" }));
      });
  }, 600);
}

export function getAdminConfig() {
  load();
  return state;
}

export function setAdminConfig(patch: Partial<AdminConfig> | ((c: AdminConfig) => Partial<AdminConfig>)) {
  load();
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full */
  }
  subs.forEach((f) => f());
  pushShared();
}

export function resetAdminConfig() {
  state = DEFAULT_CONFIG;
  localStorage.removeItem(KEY);
  subs.forEach((f) => f());
  pushShared();
}

export function useAdminConfig() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getAdminConfig,
    () => DEFAULT_CONFIG,
  );
}
