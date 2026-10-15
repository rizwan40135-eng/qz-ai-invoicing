import { deleteOriginal } from "./fileVault";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Context,
} from "react";
import {
  DEFAULT_TOLERANCES,
  seedInvoices,
  storyInvoices,
  seedMail,
  buildNotifications,
  seedPayments,
  vendors as seedVendors,
  purchaseOrders,
  goodsReceipts,
  DEMO_PO,
  DEMO_GRN,
} from "./data";
import { runTwin, scoreDuplicateRisk } from "./engine";
import { ERP_POS, ERP_GRNS } from "./erp";
import { makePayment, type PipelineOutcome } from "./pipeline";
import type {
  AuditEntry,
  GoodsReceipt,
  Invoice,
  MailItem,
  Notification,
  PaymentRecord,
  Persona,
  PurchaseOrder,
  Scenario,
  Tolerances,
} from "./types";

const KEY = "qap-ai-state-v4";
const THEME_KEY = "qap-ai-theme";

export interface Filters {
  businessUnit: string;
  country: string;
  companyCode: string;
  erp: string;
  vendor: string;
  invoiceType: string;
  status: string;
  dateRange: string;
  search: string;
}

export const EMPTY_FILTERS: Filters = {
  businessUnit: "All",
  country: "All",
  companyCode: "All",
  erp: "All",
  vendor: "All",
  invoiceType: "All",
  status: "All",
  dateRange: "Last 45 days",
  search: "",
};

interface PersistShape {
  invoices: Invoice[];
  payments: PaymentRecord[];
  notifications: Notification[];
  mail: MailItem[];
  tolerances: Tolerances;
  scenarios: Scenario[];
  persona: Persona;
  learnings: { id: string; ts: string; from: string; to: string; scope: string }[];
  audit: AuditEntry[];
  autoCollect: boolean;
  erp: ErpState;
}

export interface ErpState {
  mode: Record<"SAP S/4HANA" | "Oracle Fusion", "Real-time API" | "Scheduled batch">;
  intervalMin: Record<"SAP S/4HANA" | "Oracle Fusion", number>;
  lastSync: Record<"SAP S/4HANA" | "Oracle Fusion", string>;
  log: { id: string; ts: string; erp: string; direction: "Inbound" | "Outbound"; object: string; count: number; status: "Success" | "Error"; detail: string }[];
}

const initialErp = (): ErpState => ({
  mode: { "SAP S/4HANA": "Real-time API", "Oracle Fusion": "Scheduled batch" },
  intervalMin: { "SAP S/4HANA": 5, "Oracle Fusion": 15 },
  lastSync: { "SAP S/4HANA": new Date().toISOString(), "Oracle Fusion": new Date().toISOString() },
  log: [],
});

function seedScenarios(): Scenario[] {
  const names = [
    "Base AP Policy",
    "High Automation",
    "Low Risk",
    "Freight Optimization",
    "Non-PO Control",
    "Month-End Scale",
    "Strict Duplicate Control",
    "Services 2-Way Pilot",
    "Tight Tax Control",
    "Vendor Tiered Tolerance",
    "Auto-Approve AED 10K",
    "Confidence 95 Gate",
    "Quantity 3% Restricted",
    "Price 1.5% Global",
    "Freight 2-Way",
    "Duplicate Sensitivity 85",
    "Approval Simplification",
    "Peak Season Model",
    "Cost Optimised",
    "Control Maximised",
  ];
  return names.map((name, i) => {
    const t: Tolerances = {
      ...DEFAULT_TOLERANCES,
      quantity: DEFAULT_TOLERANCES.quantity + (i % 4) * 0.5,
      price: DEFAULT_TOLERANCES.price + (i % 3) * 0.25,
      freight: DEFAULT_TOLERANCES.freight + (i % 3) * 0.5,
      autoApproveBelow: DEFAULT_TOLERANCES.autoApproveBelow + (i % 5) * 2500,
      confidenceThreshold: 88 + (i % 5),
      duplicateSensitivity: 70 + (i % 6) * 3,
    };
    const twoWay = i % 3 === 0;
    return {
      id: `SCN-${200 + i}`,
      name,
      tolerances: t,
      twoWayFreight: twoWay,
      createdAt: new Date(Date.now() - (i * 3 + 1) * 86400000).toISOString().slice(0, 10),
      result: runTwin(t, twoWay),
      status: i === 0 ? "Applied" : i < 4 ? "Saved" : i < 7 ? "Pending Approval" : "Saved",
    };
  });
}

const SCORED_INVOICES = scoreDuplicateRisk([...storyInvoices, ...seedInvoices]);

function initialState(): PersistShape {
  return {
    invoices: SCORED_INVOICES,
    payments: seedPayments,
    notifications: buildNotifications(SCORED_INVOICES.filter((i) => !storyInvoices.some((s) => s.id === i.id))),
    mail: seedMail,
    tolerances: DEFAULT_TOLERANCES,
    scenarios: seedScenarios(),
    persona: "AP Head",
    learnings: [],
    audit: [],
    autoCollect: false,
    erp: initialErp(),
  };
}

interface Ctx extends PersistShape {
  vendors: typeof seedVendors;
  pos: PurchaseOrder[];
  grns: GoodsReceipt[];
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  setPersona: (p: Persona) => void;
  setTolerances: (t: Partial<Tolerances>) => void;
  updateInvoice: (id: string, patch: Partial<Invoice>, audit?: Omit<AuditEntry, "id" | "ts">) => void;
  addInvoice: (inv: Invoice) => void;
  getInvoice: (id: string) => Invoice | undefined;
  getPo: (po: string | null) => PurchaseOrder | null;
  getGrn: (grn: string | null) => GoodsReceipt | null;
  savePo: (po: PurchaseOrder) => void;
  saveGrn: (g: GoodsReceipt) => void;
  removePo: (poNumber: string) => void;
  removeGrn: (grnNumber: string) => void;
  upsertPayment: (p: PaymentRecord) => void;
  markMailProcessed: (id: string, invoiceId: string) => void;
  pushNotification: (n: Omit<Notification, "id" | "ts" | "read">) => void;
  readAllNotifications: () => void;
  saveScenario: (s: Scenario) => void;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  addLearning: (from: string, to: string, scope: string) => void;
  filteredInvoices: Invoice[];
  resetDemo: () => void;
  removeInvoices: (ids: string[]) => void;
  activeInvoiceId: string | null;
  setActiveInvoiceId: (id: string | null) => void;
  askOpen: boolean;
  setAskOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  ingest: (o: PipelineOutcome) => void;
  approveAndPost: (id: string, actor: string, note: string) => void;
  setAutoCollect: (v: boolean) => void;
  syncErp: (erp: "SAP S/4HANA" | "Oracle Fusion", manual?: boolean) => void;
  setErp: (patch: Partial<ErpState>) => void;
  logErp: (e: Omit<ErpState["log"][number], "id" | "ts">) => void;
}

// Keep one context instance across hot reloads so provider and consumers never diverge.
const g = globalThis as unknown as { __qapStoreCtx?: Context<Ctx | null> };
const StoreContext: Context<Ctx | null> = (g.__qapStoreCtx ??= createContext<Ctx | null>(null));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistShape>(() => initialState());
  const [hydrated, setHydrated] = useState(false);
  const [filters, setFiltersState] = useState<Filters>(EMPTY_FILTERS);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pos, setPos] = useState<PurchaseOrder[]>(() => [...ERP_POS, DEMO_PO, ...purchaseOrders]);
  const [grns, setGrns] = useState<GoodsReceipt[]>(() => [...ERP_GRNS, DEMO_GRN, ...goodsReceipts]);
  // User-maintained ERP rows (added/edited on the Purchase Orders & Receipts page) persist across reloads.
  const ERP_KEY = "qap-erp-records-v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ERP_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { pos: PurchaseOrder[]; grns: GoodsReceipt[]; removed: string[] };
      const merge = <T,>(base: T[], add: T[], key: (x: T) => string) => {
        const keys = new Set(add.map(key));
        return [...add, ...base.filter((x) => !keys.has(key(x)) && !saved.removed.includes(key(x)))];
      };
      setPos((b) => merge(b, saved.pos, (x) => x.poNumber));
      setGrns((b) => merge(b, saved.grns, (x) => x.grnNumber));
    } catch { /* ignore corrupt cache */ }
  }, []);
  const persistErp = (fn: (d: { pos: PurchaseOrder[]; grns: GoodsReceipt[]; removed: string[] }) => void) => {
    let d = { pos: [] as PurchaseOrder[], grns: [] as GoodsReceipt[], removed: [] as string[] };
    try { d = { ...d, ...JSON.parse(localStorage.getItem(ERP_KEY) ?? "{}") }; } catch { /* reset */ }
    fn(d);
    localStorage.setItem(ERP_KEY, JSON.stringify(d));
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistShape>;
        setState((s) => ({ ...s, ...parsed, erp: { ...s.erp, ...(parsed.erp ?? {}) } }));
      }
      const t = (localStorage.getItem(THEME_KEY) as "light" | "dark") ?? "light";
      setTheme(t);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            invoices: state.invoices.slice(0, 520),
            payments: state.payments,
            notifications: state.notifications.slice(0, 60),
            mail: state.mail,
            tolerances: state.tolerances,
            scenarios: state.scenarios,
            persona: state.persona,
            learnings: state.learnings,
            audit: state.audit.slice(0, 400),
            autoCollect: state.autoCollect,
            erp: { ...state.erp, log: state.erp.log.slice(0, 80) },
          }),
        );
      } catch {
        /* quota */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [state, hydrated]);

  const setFilters = useCallback((f: Partial<Filters>) => setFiltersState((p) => ({ ...p, ...f })), []);

  const updateInvoice = useCallback<Ctx["updateInvoice"]>((id, patch, audit) => {
    setState((s) => {
      const entry: AuditEntry | null = audit
        ? { ...audit, id: `${id}-${Math.random().toString(36).slice(2, 8)}`, ts: new Date().toISOString() }
        : null;
      return {
        ...s,
        invoices: s.invoices.map((i) =>
          i.id === id ? { ...i, ...patch, audit: entry ? [...i.audit, entry] : i.audit } : i,
        ),
        audit: entry ? [{ ...entry, action: `${entry.action} (${id})` }, ...s.audit] : s.audit,
      };
    });
  }, []);

  const value: Ctx = useMemo(() => {
    const filteredInvoices = state.invoices.filter((i) => {
      if (filters.businessUnit !== "All" && i.businessUnit !== filters.businessUnit) return false;
      if (filters.country !== "All" && i.country !== filters.country) return false;
      if (filters.companyCode !== "All" && i.companyCode !== filters.companyCode) return false;
      if (filters.erp !== "All" && i.erp !== filters.erp) return false;
      if (filters.vendor !== "All" && i.vendorName !== filters.vendor) return false;
      if (filters.invoiceType !== "All" && i.invoiceType !== filters.invoiceType) return false;
      if (filters.status !== "All" && i.lifecycle !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !i.id.toLowerCase().includes(q) &&
          !i.invoiceNumber.toLowerCase().includes(q) &&
          !i.vendorName.toLowerCase().includes(q) &&
          !(i.poNumber ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

    return {
      ...state,
      vendors: seedVendors,
      pos,
      grns,
      filters,
      setFilters,
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      setPersona: (p) => setState((s) => ({ ...s, persona: p })),
      setTolerances: (t) => setState((s) => ({ ...s, tolerances: { ...s.tolerances, ...t } })),
      updateInvoice,
      addInvoice: (inv) =>
        setState((s) => ({
          ...s,
          invoices: [inv, ...s.invoices.filter((i) => i.id !== inv.id)],
        })),
      getInvoice: (id) => state.invoices.find((i) => i.id === id),
      getPo: (po) => (po ? (pos.find((p) => p.poNumber === po) ?? null) : null),
      getGrn: (g) => (g ? (grns.find((x) => x.grnNumber === g) ?? null) : null),
      savePo: (po) => {
        setPos((l) => [po, ...l.filter((x) => x.poNumber !== po.poNumber)]);
        persistErp((d) => { d.pos = [po, ...d.pos.filter((x) => x.poNumber !== po.poNumber)]; d.removed = d.removed.filter((k) => k !== po.poNumber); });
      },
      saveGrn: (gr) => {
        setGrns((l) => [gr, ...l.filter((x) => x.grnNumber !== gr.grnNumber)]);
        persistErp((d) => { d.grns = [gr, ...d.grns.filter((x) => x.grnNumber !== gr.grnNumber)]; d.removed = d.removed.filter((k) => k !== gr.grnNumber); });
      },
      removePo: (k) => {
        setPos((l) => l.filter((x) => x.poNumber !== k));
        persistErp((d) => { d.pos = d.pos.filter((x) => x.poNumber !== k); d.removed.push(k); });
      },
      removeGrn: (k) => {
        setGrns((l) => l.filter((x) => x.grnNumber !== k));
        persistErp((d) => { d.grns = d.grns.filter((x) => x.grnNumber !== k); d.removed.push(k); });
      },
      upsertPayment: (p) =>
        setState((s) => ({
          ...s,
          payments: [p, ...s.payments.filter((x) => x.id !== p.id)],
        })),
      markMailProcessed: (id, invoiceId) =>
        setState((s) => ({
          ...s,
          mail: s.mail.map((m) => (m.id === id ? { ...m, processed: true, invoiceId } : m)),
        })),
      pushNotification: (n) =>
        setState((s) => ({
          ...s,
          notifications: [
            { ...n, id: `NTF-${Math.random().toString(36).slice(2, 8)}`, ts: new Date().toISOString(), read: false },
            ...s.notifications,
          ],
        })),
      readAllNotifications: () =>
        setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      saveScenario: (sc) => setState((s) => ({ ...s, scenarios: [sc, ...s.scenarios] })),
      updateScenario: (id, patch) =>
        setState((s) => ({ ...s, scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      addLearning: (from, to, scope) =>
        setState((s) => ({
          ...s,
          learnings: [
            { id: `LRN-${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), from, to, scope },
            ...s.learnings,
          ],
        })),
      filteredInvoices,
      removeInvoices: (ids) => {
        const set = new Set(ids);
        const mentions = (t: string) => ids.some((id) => t.includes(id));
        setState((s) => ({
          ...s,
          invoices: s.invoices.filter((i) => !set.has(i.id)),
          payments: s.payments.filter((p) => !set.has(p.invoiceId)),
          notifications: s.notifications.filter((n) => !mentions(`${n.title} ${n.body}`)),
        }));
        if (activeInvoiceId && set.has(activeInvoiceId)) setActiveInvoiceId(null);
        ids.forEach((id) => void deleteOriginal(id).catch(() => undefined));
      },
      resetDemo: () => {
        localStorage.removeItem(KEY);
        setState(initialState());
        setPos([...ERP_POS, DEMO_PO, ...purchaseOrders]);
        setGrns([...ERP_GRNS, DEMO_GRN, ...goodsReceipts]);
        setFiltersState(EMPTY_FILTERS);
      },
      ingest: (o) =>
        setState((s) => {
          const inv = o.invoice;
          const notes: Notification[] = [];
          const mk = (severity: Notification["severity"], title: string, body: string, link: string): Notification => ({
            id: `NTF-${Math.random().toString(36).slice(2, 8)}`,
            ts: new Date().toISOString(),
            severity,
            title,
            body,
            link,
            read: false,
          });
          if (o.decision === "Blocked — duplicate") notes.push(mk("Critical", `Potential duplicate ${inv.id} blocked`, `${o.duplicateScore}% similar to ${o.duplicateOf} — ${inv.vendorName}.`, "/duplicates"));
          else if (o.decision === "Exception — review required") notes.push(mk("High", `${inv.invoiceNumber} (${inv.id}) requires review`, `${inv.exceptionType} — assigned to ${inv.owner}. SLA ${inv.slaHours}h.`, "/exceptions"));
          else if (o.decision === "Routed for approval") notes.push(mk("Medium", `${inv.id} awaiting approval`, `${inv.vendorName} · ${inv.currency} ${inv.grossAmount.toLocaleString()} — ${inv.owner}.`, "/approvals"));
          else notes.push(mk("Low", `${inv.id} processed touchlessly`, `Posted to ${inv.erp} and scheduled for payment on ${inv.dueDate}.`, "/payments"));
          if (inv.extractionConfidence < s.tolerances.confidenceThreshold)
            notes.push(mk("Medium", "Invoice extraction confidence below threshold", `${inv.id} extracted at ${inv.extractionConfidence}% — review suggested.`, "/document-ai"));
          const erpLog: ErpState["log"] = [];
          const ts = new Date().toISOString();
          erpLog.push({ id: Math.random().toString(36).slice(2, 9), ts, erp: inv.erp, direction: "Inbound", object: "PO / GRN lookup", count: 1, status: inv.exceptionType === "PO Missing" ? "Error" : "Success", detail: inv.poNumber ? `${inv.poNumber}${inv.grnNumber ? ` · ${inv.grnNumber}` : ""}` : "Non-PO" });
          if (inv.erpStatus === "Posted") erpLog.push({ id: Math.random().toString(36).slice(2, 9), ts, erp: inv.erp, direction: "Outbound", object: "Invoice posting", count: 1, status: "Success", detail: `${inv.id} · ${inv.currency} ${inv.grossAmount.toLocaleString()}` });
          return {
            ...s,
            invoices: [inv, ...s.invoices.filter((i) => i.id !== inv.id)],
            payments: o.payment ? [o.payment, ...s.payments] : s.payments,
            notifications: [...notes, ...s.notifications],
            audit: [...inv.audit.slice().reverse().map((a) => ({ ...a, action: `${a.action} (${inv.id})` })), ...s.audit],
            erp: { ...s.erp, log: [...erpLog, ...s.erp.log] },
          };
        }),
      approveAndPost: (id, actor, note) =>
        setState((s) => {
          const inv = s.invoices.find((i) => i.id === id);
          if (!inv) return s;
          const ts = new Date().toISOString();
          const docNo = `${inv.erp === "SAP S/4HANA" ? "51" : "ORA-"}${Math.floor(10000000 + Math.random() * 89999999)}`;
          const pay = makePayment(inv, Math.floor(Math.random() * 90000));
          const entries: AuditEntry[] = [
            { id: `${id}-ap${Math.random().toString(36).slice(2, 6)}`, ts, actor, actorType: "Human", action: `Approved — ${note}`, oldValue: inv.approvalStatus, newValue: "Approved" },
            { id: `${id}-po${Math.random().toString(36).slice(2, 6)}`, ts, actor: "ERP Connector", actorType: "System", action: `Posted to ${inv.erp} · document ${docNo}`, newValue: "Posted" },
            { id: `${id}-pm${Math.random().toString(36).slice(2, 6)}`, ts, actor: "Payments", actorType: "System", action: `Scheduled for payment on ${inv.dueDate} (${pay.id})`, newValue: "Scheduled" },
          ];
          const updated: Invoice = { ...inv, approvalStatus: "Approved", exceptionType: null, erpStatus: "Posted", paymentStatus: "Scheduled", lifecycle: "Payment Scheduled", audit: [...inv.audit, ...entries] };
          return {
            ...s,
            invoices: s.invoices.map((i) => (i.id === id ? updated : i)),
            payments: s.payments.some((p) => p.invoiceId === id) ? s.payments : [pay, ...s.payments],
            audit: [...entries.reverse().map((a) => ({ ...a, action: `${a.action} (${id})` })), ...s.audit],
            erp: { ...s.erp, log: [{ id: Math.random().toString(36).slice(2, 9), ts, erp: inv.erp, direction: "Outbound", object: "Invoice posting", count: 1, status: "Success", detail: `${id} · ${docNo}` }, ...s.erp.log] },
          };
        }),
      setAutoCollect: (v) => setState((s) => ({ ...s, autoCollect: v })),
      syncErp: (erp, manual) =>
        setState((s) => {
          const ts = new Date().toISOString();
          const poCount = pos.filter((p) => (p.erp ?? (p.vendorId ? "SAP S/4HANA" : "")) === erp).length;
          const posted = s.invoices.filter((i) => i.erp === erp && i.erpStatus === "Posted").length;
          const paid = s.payments.filter((p) => p.bankStatus === "Credited").length;
          const mk = (direction: "Inbound" | "Outbound", object: string, count: number, detail: string) => ({ id: Math.random().toString(36).slice(2, 9), ts, erp, direction, object, count, status: "Success" as const, detail });
          return {
            ...s,
            erp: {
              ...s.erp,
              lastSync: { ...s.erp.lastSync, [erp]: ts },
              log: [
                mk("Inbound", "Purchase orders", poCount, manual ? "Manual sync" : s.erp.mode[erp]),
                mk("Inbound", "Goods receipts", grns.length, "Delta since last sync"),
                mk("Inbound", "Payment status", paid, "Payment run results"),
                mk("Outbound", "Posted invoices", posted, "Acknowledged by ERP"),
                ...s.erp.log,
              ],
            },
          };
        }),
      setErp: (patch) => setState((s) => ({ ...s, erp: { ...s.erp, ...patch } })),
      logErp: (e) => setState((s) => ({ ...s, erp: { ...s.erp, log: [{ ...e, id: Math.random().toString(36).slice(2, 9), ts: new Date().toISOString() }, ...s.erp.log] } })),
      activeInvoiceId,
      setActiveInvoiceId,
      askOpen,
      setAskOpen,
      paletteOpen,
      setPaletteOpen,
    };
  }, [state, filters, theme, activeInvoiceId, askOpen, paletteOpen, pos, grns, setFilters, updateInvoice]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
