import { toAed } from "@/lib/data";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  FileStack,
  Zap,
  Target,
  Wallet,
  Clock4,
  TriangleAlert,
  ShieldCheck,
  CopyCheck,
  ArrowRight,
  Sparkle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Kpi, PageHeader, Panel, Pill, money, AiBlock } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { BUSINESS_UNITS, COUNTRIES } from "@/lib/data";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AP Command Center — Q-AP AI" },
      { name: "description", content: "Executive control tower for accounts payable: touchless rate, exceptions, approvals and payment risk across Nova Global Industries." },
      { property: "og:title", content: "AP Command Center — Q-AP AI" },
      { property: "og:description", content: "Executive AP control tower with AI brief, enterprise heatmap and attention feed." },
    ],
  }),
  component: CommandCenter,
});

const PERSONA_FOCUS: Record<string, string[]> = {
  CFO: ["Invoice Value Processed", "Pending Approval", "Touchless Processing", "SLA Compliance"],
  "AP Head": ["Touchless Processing", "Active Exceptions", "First-Pass Match Rate", "SLA Compliance"],
  "AP Processor": ["Active Exceptions", "Invoices This Month", "First-Pass Match Rate", "Duplicates Prevented"],
  "AP Manager": ["Active Exceptions", "SLA Compliance", "Touchless Processing", "Pending Approval"],
  "Finance Controller": ["Pending Approval", "Invoice Value Processed", "Duplicates Prevented", "SLA Compliance"],
  Procurement: ["First-Pass Match Rate", "Active Exceptions", "Invoices This Month", "Touchless Processing"],
  "Business Approver": ["Pending Approval", "SLA Compliance", "Active Exceptions", "Invoices This Month"],
  Treasury: ["Pending Approval", "Invoice Value Processed", "SLA Compliance", "Duplicates Prevented"],
  "Vendor Manager": ["Active Exceptions", "First-Pass Match Rate", "Invoices This Month", "Touchless Processing"],
  Auditor: ["Duplicates Prevented", "SLA Compliance", "Active Exceptions", "Invoice Value Processed"],
  "System Administrator": ["Touchless Processing", "Invoices This Month", "Active Exceptions", "SLA Compliance"],
};

function CommandCenter() {
  const store = useStore();
  const navigate = useNavigate();
  const inv = store.filteredInvoices;

  const stats = useMemo(() => {
    const exceptions = inv.filter((i) => i.exceptionType);
    const value = inv.reduce((a, i) => a + toAed(i.grossAmount, i.currency), 0);
    const pending = inv.filter((i) => i.approvalStatus === "Pending");
    const matched = inv.filter((i) => i.matchStatus === "Matched").length;
    const touchless = inv.filter((i) => !i.exceptionType && i.approvalStatus !== "Pending").length;
    return {
      count: inv.length,
      touchless: (touchless / Math.max(1, inv.length)) * 100,
      firstPass: (matched / Math.max(1, inv.filter((i) => i.poNumber).length)) * 100,
      value,
      pendingValue: pending.reduce((a, i) => a + toAed(i.grossAmount, i.currency), 0),
      exceptions: exceptions.length,
      sla: 100 - (exceptions.filter((e) => e.exceptionAgeHours > e.slaHours).length / Math.max(1, inv.length)) * 100,
      duplicates: inv.filter((i) => i.duplicateRisk > 75).length,
    };
  }, [inv]);

  const live = useMemo(() => {
    const cats = [...new Set(inv.map((i) => i.invoiceType))].map((c) => {
      const set = inv.filter((i) => i.invoiceType === c);
      const ex = set.filter((i) => i.exceptionType).length;
      return { c, n: set.length, ex, rate: ((set.length - ex) / Math.max(1, set.length)) * 100 };
    }).filter((x) => x.n >= 2).sort((x, y) => x.rate - y.rate);
    const dup = [...inv].filter((i) => i.duplicateRisk > 75).sort((x, y) => y.duplicateRisk - x.duplicateRisk)[0];
    const breached = inv.filter((i) => i.approvalStatus === "Pending" && i.exceptionAgeHours > i.slaHours);
    const buBreach = [...new Set(breached.map((i) => i.businessUnit))].map((b) => ({ b, n: breached.filter((i) => i.businessUnit === b).length })).sort((x, y) => y.n - x.n)[0];
    const ids = new Set(inv.map((i) => i.id));
    const pays = store.payments.filter((p) => ids.has(p.invoiceId));
    const awaitingBank = pays.filter((p) => p.bankStatus === "Processing" || p.bankStatus === "Released").length;
    const rejected = pays.find((p) => p.bankStatus === "Rejected" || p.status === "Rejected");
    const matchFail = inv.filter((i) => i.exceptionType && i.matchStatus !== "Matched").sort((x, y) => toAed(y.grossAmount, y.currency) - toAed(x.grossAmount, x.currency))[0];
    const exceptionsSorted = inv.filter((i) => i.exceptionType).sort((x, y) => toAed(y.grossAmount, y.currency) - toAed(x.grossAmount, x.currency));
    const funnel = (() => {
      const n = inv.length || 1;
      const classified = inv.filter((i) => i.extractionConfidence >= 60).length;
      const extracted = inv.filter((i) => i.extractionConfidence >= 90).length;
      const matched = inv.filter((i) => i.matchStatus === "Matched" || !i.poNumber).length;
      const posted = inv.filter((i) => i.erpStatus === "Posted").length;
      const paid = inv.filter((i) => i.paymentStatus === "Beneficiary Credited" || i.bankStatus === "Credited").length;
      return [
        { label: `${inv.length} invoices received`, v: inv.length, drop: "" },
        { label: `${classified} classified automatically`, v: classified, drop: `${inv.length - classified} routed to manual capture` },
        { label: `${extracted} extracted at ≥90% confidence`, v: extracted, drop: `${inv.length - extracted} below 90% confidence` },
        { label: `${matched} matched or non-PO cleared`, v: matched, drop: `${inv.length - matched} blocked by match variance` },
        { label: `${posted} posted to ERP`, v: posted, drop: `${inv.length - posted} not yet posted` },
        { label: `${paid} paid and credited`, v: paid, drop: `${inv.length - paid} awaiting payment or bank` },
      ].map((x) => ({ ...x, n: (x.v / n) * 100 }));
    })();
    return { worstCat: cats[0], dup, breached, buBreach, awaitingBank, rejected, matchFail, exceptionsSorted, funnel };
  }, [inv, store.payments]);

  const decisions = stats.exceptions + inv.filter((i) => i.approvalStatus === "Pending").length + stats.duplicates;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const attention = [
    live.dup && { severity: "CRITICAL", tone: "fail" as const, title: `Potential duplicate — ${live.dup.id}`, detail: `${live.dup.duplicateRisk.toFixed(0)}% duplicate risk · ${live.dup.vendorName}.`, amount: money(live.dup.grossAmount, live.dup.currency), to: "/duplicates" },
    live.matchFail && { severity: "HIGH", tone: "high" as const, title: `${live.matchFail.exceptionType} — ${live.matchFail.id}`, detail: `${live.matchFail.vendorName} · ${live.matchFail.businessUnit} · ${live.matchFail.matchMode} match.`, amount: money(live.matchFail.grossAmount, live.matchFail.currency), to: "/match" },
    live.breached.length > 0 && { severity: "HIGH", tone: "high" as const, title: "Approval SLA breach", detail: `${live.breached.length} pending invoices beyond their SLA.`, amount: money(live.breached.reduce((x, i) => x + toAed(i.grossAmount, i.currency), 0), "AED", true), to: "/approvals" },
    live.rejected && { severity: "MEDIUM", tone: "medium" as const, title: "Payment rejected by bank", detail: `${live.rejected.id} · ${live.rejected.vendorName}${live.rejected.reason ? ` — ${live.rejected.reason}` : ""}.`, amount: money(live.rejected.value, live.rejected.currency), to: "/payments" },
    live.worstCat && { severity: "OPPORTUNITY", tone: "opportunity" as const, title: `${live.worstCat.c} touchless rate ${live.worstCat.rate.toFixed(0)}%`, detail: `${live.worstCat.ex} of ${live.worstCat.n} invoices raised exceptions — simulate a policy change.`, amount: "", to: "/ap-twin" },
  ].filter(Boolean) as { severity: string; tone: "fail" | "high" | "medium" | "opportunity"; title: string; detail: string; amount: string; to: string }[];

  const focus = PERSONA_FOCUS[store.persona] ?? PERSONA_FOCUS["AP Head"]!;

  const kpis = [
    { label: "Invoices This Month", value: stats.count.toLocaleString(), sub: "in current filter", icon: <FileStack className="size-4" />, accent: "brand" as const, to: "/invoices" },
    { label: "Touchless Processing", value: `${stats.touchless.toFixed(1)}%`, sub: `target ${85}%`, icon: <Zap className="size-4" />, accent: "success" as const, to: "/analytics" },
    { label: "First-Pass Match Rate", value: `${stats.firstPass.toFixed(1)}%`, sub: "PO invoices", icon: <Target className="size-4" />, accent: "brand" as const, to: "/match" },
    { label: "Invoice Value Processed", value: money(stats.value, "AED", true), sub: "rolling period", icon: <Wallet className="size-4" />, accent: "brand" as const, to: "/analytics" },
    { label: "Pending Approval", value: money(stats.pendingValue, "AED", true), sub: `${inv.filter((i) => i.approvalStatus === "Pending").length} invoices`, icon: <Clock4 className="size-4" />, accent: "warning" as const, to: "/approvals" },
    { label: "Active Exceptions", value: String(stats.exceptions), sub: "awaiting resolution", icon: <TriangleAlert className="size-4" />, accent: "flame" as const, to: "/exceptions" },
    { label: "SLA Compliance", value: `${stats.sla.toFixed(1)}%`, sub: "8h resolution SLA", icon: <ShieldCheck className="size-4" />, accent: "success" as const, to: "/exceptions" },
    { label: "Duplicates Prevented", value: String(stats.duplicates), sub: "potential duplicate payments", icon: <CopyCheck className="size-4" />, accent: "danger" as const, to: "/duplicates" },
  ];

  const ordered = [...kpis].sort((a, b) => {
    const ai = focus.indexOf(a.label);
    const bi = focus.indexOf(b.label);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="01 · AP Command Center"
        title={`${greeting}. Q-AP AI identified ${decisions} AP decisions requiring attention.`}
        subtitle={`Viewing as ${store.persona} · Nova Global Industries · 6 business units · 5 markets · SAP S/4HANA + Oracle Fusion`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate({ to: "/exceptions" })}>
              Review Exceptions
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/duplicates" })}>
              Review Duplicate Risks
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/ap-twin" })}>
              Run AP Twin
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        {ordered.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Kpi {...k} onClick={() => navigate({ to: k.to })} />
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel title="AI AP Executive Brief" description={`Generated for ${store.persona}`}>
          <AiBlock title="Executive Brief">
            <p>
              <strong>{stats.count.toLocaleString()} invoices</strong> are in scope and <strong>{stats.touchless.toFixed(1)}%</strong> completed without manual intervention.
              {live.worstCat && <> {live.worstCat.c} is the weakest category at a {live.worstCat.rate.toFixed(0)}% touchless rate.</>}
              {live.dup && <> Invoice <strong>{live.dup.id}</strong> carries a {live.dup.duplicateRisk.toFixed(0)}% duplicate risk.</>}
              {live.buBreach && <> {live.buBreach.b} has {live.buBreach.n} invoices awaiting approval beyond SLA.</>}
              {" "}{live.awaitingBank} payments are awaiting bank confirmation.
            </p>
            {live.exceptionsSorted[0] && (
              <p className="mt-2">
                Largest open exception: <strong>{live.exceptionsSorted[0].id}</strong> ({live.exceptionsSorted[0].exceptionType}, {money(live.exceptionsSorted[0].grossAmount, live.exceptionsSorted[0].currency)}). {stats.exceptions} exceptions are open in total.
              </p>
            )}
          </AiBlock>
          <div className="mt-4">
            <StraightThrough steps={live.funnel} />
          </div>
        </Panel>

        <Panel title="Attention Feed" description="Prioritised by value at risk and SLA">
          <div className="space-y-2.5">
            {attention.length === 0 && <div className="text-xs text-muted-foreground">Nothing requires attention right now.</div>}
            {attention.map((a) => (
              <motion.div
                key={a.title}
                whileHover={{ x: 3 }}
                className="rounded-xl border border-border p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Pill tone={a.tone}>{a.severity}</Pill>
                  {a.amount && <span className="tabular text-xs font-semibold">{a.amount}</span>}
                </div>
                <div className="mt-2 text-[13px] font-semibold">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.detail}</div>
                <div className="mt-2.5 flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" asChild>
                    <Link to={a.to}>Investigate</Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => store.setAskOpen(true)}>
                    Ask AI
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" asChild>
                    <Link to={a.to}>Resolve</Link>
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </Panel>
      </div>

      <Heatmap />
    </div>
  );
}

function StraightThrough({ steps }: { steps: { label: string; n: number; drop: string }[] }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Straight-through processing
      </div>
      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${s.n}%` }}
                transition={{ delay: i * 0.08, duration: 0.7 }}
                className="flex h-full items-center rounded-lg bg-brand/85 px-2.5 text-[11px] font-semibold text-brand-foreground"
              >
                {s.label}
              </motion.div>
            </div>
            <span className="hidden w-[280px] shrink-0 text-[11px] text-muted-foreground md:block">{s.drop}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap() {
  const store = useStore();
  const country = store.filters.country;
  const rows = BUSINESS_UNITS.map((bu) => {
    const set = store.invoices.filter((i) => i.businessUnit === bu && (country === "All" || i.country === country));
    const ex = set.filter((i) => i.exceptionType).length;
    const matched = set.filter((i) => i.matchStatus === "Matched").length;
    const value = set.reduce((a, i) => a + i.grossAmount, 0);
    return {
      bu,
      volume: set.length,
      value,
      touchless: (set.filter((i) => !i.exceptionType).length / Math.max(1, set.length)) * 100,
      match: (matched / Math.max(1, set.filter((i) => i.poNumber).length)) * 100,
      exceptions: ex,
      cycle: 2.4 + (ex / Math.max(1, set.length)) * 9,
      sla: 100 - (ex / Math.max(1, set.length)) * 42,
      dup: set.filter((i) => i.duplicateRisk > 75).length,
      pendingPay: set.filter((i) => i.paymentStatus === "Approved for Payment" || i.paymentStatus === "Scheduled").length,
    };
  });

  const heat = (v: number, invert = false) => {
    const x = invert ? 100 - v : v;
    if (x >= 80) return "bg-success-soft text-success";
    if (x >= 60) return "bg-brand-soft text-brand";
    if (x >= 40) return "bg-warning-soft text-warning";
    return "bg-danger-soft text-danger";
  };

  return (
    <Panel
      title="Enterprise AP Heatmap"
      description="Click a business unit to drill into its invoices"
      actions={
        <Select value={country} onValueChange={(v) => store.setFilters({ country: v })}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["All", ...COUNTRIES].map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      dense
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Business Unit", "Volume", "Value", "Touchless %", "Match %", "Exceptions", "Cycle Time", "SLA", "Duplicate Risk", "Pending Payment"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bu} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link
                    to="/invoices"
                    onClick={() => store.setFilters({ businessUnit: r.bu })}
                    className="flex items-center gap-1.5 font-semibold text-brand hover:underline"
                  >
                    {r.bu}
                    <ArrowRight className="size-3" />
                  </Link>
                </td>
                <td className="tabular px-4 py-2.5">{r.volume}</td>
                <td className="tabular px-4 py-2.5">{money(r.value, "AED", true)}</td>
                <Cell className={heat(r.touchless)}>{r.touchless.toFixed(1)}%</Cell>
                <Cell className={heat(r.match)}>{r.match.toFixed(1)}%</Cell>
                <Cell className={heat(r.exceptions * 4, true)}>{r.exceptions}</Cell>
                <Cell className={heat(100 - r.cycle * 8)}>{r.cycle.toFixed(1)}d</Cell>
                <Cell className={heat(r.sla)}>{r.sla.toFixed(1)}%</Cell>
                <Cell className={heat(r.dup * 12, true)}>{r.dup}</Cell>
                <td className="tabular px-4 py-2.5">{r.pendingPay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className="px-2 py-2">
      <span className={cn("tabular inline-flex min-w-[64px] justify-center rounded-md px-2 py-1 text-xs font-semibold", className)}>
        {children}
      </span>
    </td>
  );
}
