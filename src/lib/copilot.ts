import type { Invoice, PaymentRecord, Tolerances, Vendor } from "./types";
import { runTwin } from "./engine";

export interface CopilotAnswer {
  answer: string;
  evidence: string[];
  impact: string;
  action: string;
  risk: string;
  confidence: number;
  actions: { label: string; to?: string }[];
}

interface Ctx {
  invoices: Invoice[];
  vendors: Vendor[];
  payments: PaymentRecord[];
  tolerances: Tolerances;
}

const money = (n: number, c = "AED") =>
  `${c} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const SUGGESTED_QUESTIONS = [
  "Why is INV-10482 blocked?",
  "Show invoices failing GRN matching.",
  "Which vendors create the most exceptions?",
  "Find possible duplicate invoices.",
  "Which invoices are overdue for approval?",
  "What is our touchless rate?",
  "Why did touchless processing decline this week?",
  "Which invoices are at risk of late payment?",
  "How much value is pending approval?",
  "Suggest accounting code for this invoice.",
  "What will happen if tolerance increases to 3%?",
];

export function askCopilot(q: string, ctx: Ctx): CopilotAnswer {
  const s = q.toLowerCase();
  const { invoices, vendors, payments, tolerances } = ctx;
  const exceptions = invoices.filter((i) => i.exceptionType);
  const pendingApproval = invoices.filter((i) => i.approvalStatus === "Pending");
  const pendingValue = pendingApproval.reduce((a, i) => a + i.grossAmount, 0);
  const touchless = invoices.filter((i) => !i.exceptionType && i.approvalStatus !== "Pending").length;
  const touchlessRate = (touchless / Math.max(1, invoices.length)) * 100;

  const idMatch = q.match(/INV-[0-9A-Z-]+/i)?.[0]?.toUpperCase();
  if (idMatch && (s.includes("block") || s.includes("why") || s.includes("status"))) {
    const inv =
      invoices.find((i) => i.id.toUpperCase() === idMatch) ??
      invoices.find((i) => i.invoiceNumber.toUpperCase().includes(idMatch)) ??
      exceptions[0]!;
    const line = inv.lines.find((l) => l.grnQty !== null && l.grnQty < l.invoiceQty);
    return {
      answer: inv.exceptionType
        ? `${inv.id} is blocked by a ${inv.exceptionType.toLowerCase()} raised during ${inv.matchMode} matching. It is currently at "${inv.lifecycle}" with ${inv.owner} as owner.`
        : `${inv.id} is not blocked. It sits at "${inv.lifecycle}" with payment status ${inv.paymentStatus}.`,
      evidence: [
        `Vendor ${inv.vendorName} · ${inv.businessUnit} · ${inv.country}`,
        `Invoice ${money(inv.grossAmount, inv.currency)} against PO ${inv.poNumber ?? "—"} / GRN ${inv.grnNumber ?? "—"}`,
        line
          ? `Line ${line.line}: ${line.grnQty} of ${line.invoiceQty} units received (${(((line.grnQty! - line.invoiceQty) / line.invoiceQty) * 100).toFixed(1)}%) vs ±${tolerances.quantity}% tolerance`
          : `Match score ${inv.matchScore}% · extraction confidence ${inv.extractionConfidence}%`,
        `Exception open for ${inv.exceptionAgeHours.toFixed(1)}h against an ${inv.slaHours}h SLA`,
      ],
      impact: `${money(inv.grossAmount, inv.currency)} of payable value is held and the vendor's on-time payment metric is at risk.`,
      action: inv.exceptionType === "GRN Missing" || line ? "Request a goods receipt update from the receiving team, or short-pay only the received quantity." : "Route to the exception owner for resolution.",
      risk: "Approving unmatched quantity without business confirmation creates an overpayment exposure.",
      confidence: 93.4,
      actions: [
        { label: "Open Exception Center", to: "/exceptions" },
        { label: "Open Match Studio", to: "/match" },
      ],
    };
  }

  if (s.includes("grn") && (s.includes("fail") || s.includes("match"))) {
    const list = exceptions.filter((e) => e.exceptionType === "GRN Missing" || e.exceptionType === "Quantity Variance");
    return {
      answer: `${list.length} invoices are currently failing goods-receipt validation across the group.`,
      evidence: [
        `GRN Missing: ${exceptions.filter((e) => e.exceptionType === "GRN Missing").length} invoices`,
        `Quantity Variance: ${exceptions.filter((e) => e.exceptionType === "Quantity Variance").length} invoices`,
        `Combined value ${money(list.reduce((a, i) => a + i.grossAmount, 0))}`,
        `Top business unit: ${topBy(list, (i) => i.businessUnit)}`,
      ],
      impact: "Goods receipt gaps are the largest single driver of manual AP effort in the current period.",
      action: "Run a receipt-posting sweep with the plant teams before the payment run closes.",
      risk: "Medium — releasing payment without receipt confirmation breaches the 3-way match control.",
      confidence: 95.1,
      actions: [{ label: "Open Exception Center", to: "/exceptions" }],
    };
  }

  if (s.includes("vendor") && (s.includes("exception") || s.includes("most"))) {
    const counts = new Map<string, number>();
    exceptions.forEach((e) => counts.set(e.vendorName, (counts.get(e.vendorName) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      answer: `${top[0]?.[0] ?? "—"} generates the highest exception volume, followed by ${top[1]?.[0] ?? "—"}.`,
      evidence: top.map(([n, c]) => `${n}: ${c} exceptions`),
      impact: "The top five vendors account for a disproportionate share of AP handling time.",
      action: "Open a documentation-quality review with the top two vendors and tighten PO referencing at order entry.",
      risk: "Low — vendor engagement is a process improvement, not a control change.",
      confidence: 91.8,
      actions: [{ label: "Open Vendor Hub", to: "/vendors" }],
    };
  }

  if (s.includes("duplicate")) {
    const dups = invoices.filter((i) => i.duplicateRisk > tolerances.duplicateSensitivity);
    return {
      answer: `${dups.length} invoices currently score above the ${tolerances.duplicateSensitivity} duplicate-risk threshold.`,
      evidence: dups.slice(0, 4).map((d) => `${d.id} · ${d.vendorName} · ${money(d.grossAmount, d.currency)} · score ${d.duplicateRisk}`),
      impact: `Blocking these prevents an estimated ${money(dups.reduce((a, d) => a + d.grossAmount, 0))} of duplicate payment exposure.`,
      action: "Review the highest-scoring pairs in Duplicate Intelligence and block or clear each one.",
      risk: "High if released — duplicate payments are difficult to recover once credited.",
      confidence: 94.6,
      actions: [{ label: "Open Duplicate Intelligence", to: "/duplicates" }],
    };
  }

  if (s.includes("approval") && (s.includes("overdue") || s.includes("sla"))) {
    const overdue = pendingApproval.filter((i) => i.exceptionAgeHours > i.slaHours);
    return {
      answer: `${overdue.length} invoices have been pending approval beyond the configured ${tolerances ? 8 : 8}-hour SLA.`,
      evidence: [
        `Total pending approvals: ${pendingApproval.length}`,
        `Value pending: ${money(pendingValue)}`,
        `Worst business unit: ${topBy(overdue, (i) => i.businessUnit)}`,
      ],
      impact: "SLA breaches delay posting and push invoices past their discount window.",
      action: "Escalate to the business approvers and enable reminder cadence for the affected BU.",
      risk: "Medium — late approvals translate into late payments and vendor escalation.",
      confidence: 92.2,
      actions: [{ label: "Open Approvals", to: "/approvals" }],
    };
  }

  if (s.includes("pending approval") || (s.includes("value") && s.includes("approval"))) {
    return {
      answer: `${money(pendingValue)} across ${pendingApproval.length} invoices is awaiting approval.`,
      evidence: [
        `Largest single invoice: ${money(Math.max(...pendingApproval.map((i) => i.grossAmount), 0))}`,
        `Business unit concentration: ${topBy(pendingApproval, (i) => i.businessUnit)}`,
      ],
      impact: "Approval backlog is the main constraint on cycle time this period.",
      action: "Prioritise the top decile by value and apply the auto-approval policy to low-value invoices.",
      risk: "Low.",
      confidence: 96.0,
      actions: [{ label: "Open Approvals", to: "/approvals" }],
    };
  }

  if (s.includes("touchless") && (s.includes("decline") || s.includes("why"))) {
    const cats = [...new Set(invoices.map((i) => i.invoiceType))].map((c) => {
      const set = invoices.filter((i) => i.invoiceType === c);
      const t = set.filter((i) => !i.exceptionType && i.approvalStatus !== "Pending").length;
      return { c, n: set.length, rate: (t / Math.max(1, set.length)) * 100, lost: set.length - t };
    }).filter((x) => x.n >= 2).sort((a, b) => a.rate - b.rate);
    const worst = cats[0];
    const recoverable = worst ? (worst.lost * 0.5 / Math.max(1, invoices.length)) * 100 : 0;
    return {
      answer: worst
        ? `Touchless loss is concentrated in ${worst.c} invoices (${worst.rate.toFixed(1)}% touchless vs ${touchlessRate.toFixed(1)}% overall).`
        : `Current touchless rate is ${touchlessRate.toFixed(1)}%.`,
      evidence: [
        ...cats.slice(0, 3).map((x) => `${x.c}: ${x.rate.toFixed(1)}% touchless across ${x.n} invoices`),
        `Extraction confidence below ${tolerances.confidenceThreshold}% on ${invoices.filter((i) => i.extractionConfidence < tolerances.confidenceThreshold).length} invoices`,
      ],
      impact: `Resolving half of the ${worst?.lost ?? 0} non-touchless ${worst?.c ?? ""} invoices would add about ${recoverable.toFixed(1)} percentage points.`,
      action: "Simulate a restricted tolerance change for this category in AP Twin before changing policy.",
      risk: "Tolerance relaxation increases value exposure — restrict it to low-risk vendors.",
      confidence: 88,
      actions: [{ label: "Run AP Twin", to: "/ap-twin" }],
    };
  }

  if (s.includes("touchless")) {
    return {
      answer: `Current touchless processing is ${touchlessRate.toFixed(1)}% of invoices in the selected period.`,
      evidence: [
        `${touchless} of ${invoices.length} invoices processed without manual intervention`,
        `${exceptions.length} invoices required human review`,
        `First-pass match rate ${(100 - (exceptions.length / invoices.length) * 100).toFixed(1)}%`,
      ],
      impact: "Each percentage point of touchless processing removes roughly 190 manual touches per month.",
      action: "Target the freight category, which has the lowest touchless rate.",
      risk: "Low.",
      confidence: 97.3,
      actions: [{ label: "Open Analytics", to: "/analytics" }],
    };
  }

  if (s.includes("late payment") || s.includes("payment") && s.includes("risk")) {
    const risky = payments.filter((p) => p.status !== "Beneficiary Credited").slice(0, 5);
    return {
      answer: `${risky.length} payments are at risk of missing their due date or bank confirmation.`,
      evidence: risky.map((p) => `${p.id} · ${p.vendorName} · ${money(p.value, p.currency)} · ${p.status} / bank ${p.bankStatus}`),
      impact: "Late settlement affects vendor terms and forfeits early-payment discounts.",
      action: "Prioritise discount-eligible and critical-vendor invoices in the next payment run.",
      risk: "Medium — one payment was rejected by the bank and needs revalidation.",
      confidence: 90.4,
      actions: [{ label: "Open Payments", to: "/payments" }],
    };
  }

  if (s.includes("accounting") || s.includes("coding") || s.includes("g/l") || s.includes("gl ")) {
    return {
      answer: "For cloud hosting spend the recommended coding is G/L 642100 — IT Hosting Expense, cost centre CC-7200 Digital Platforms.",
      evidence: [
        "Vendor posting history: 18 of the last 20 invoices coded to 642100",
        "Invoice description references hosting and platform capacity",
        "PO category maps to IT Services",
      ],
      impact: "Consistent coding reduces month-end reclassification effort.",
      action: "Accept the recommendation or correct it — corrections are captured as learning events.",
      risk: "Recommendations are advisory. Posting always requires human or policy approval.",
      confidence: 94.0,
      actions: [{ label: "Open Accounting Intelligence", to: "/accounting" }],
    };
  }

  if (s.includes("tolerance") || s.includes("what if") || s.includes("simulate")) {
    const target = Number(q.match(/([0-9.]+)\s*%/)?.[1] ?? 3);
    const sim = runTwin({ ...tolerances, quantity: target }, false, 0, invoices);
    const base = runTwin(tolerances, false, 0, invoices);
    return {
      answer: `Moving quantity tolerance to ${target}% changes modelled touchless processing from ${base.touchlessRate}% to ${sim.touchlessRate}%.`,
      evidence: [
        `Manual reviews: ${base.manualReviews.toLocaleString()} → ${sim.manualReviews.toLocaleString()}`,
        `Exception volume: ${base.exceptionVolume.toLocaleString()} → ${sim.exceptionVolume.toLocaleString()}`,
        `Cycle time: ${base.cycleTimeDays}d → ${sim.cycleTimeDays}d`,
        `Risk exposure index: ${base.riskExposure} → ${sim.riskExposure}`,
      ],
      impact: `Estimated additional value exposure of ${money(Math.round((sim.riskExposure - base.riskExposure) * 210000))} per month.`,
      action: "Apply the change only to approved low-risk vendor and material groups, then review after one cycle.",
      risk: "Tolerance relaxation is a control change and requires policy approval.",
      confidence: 88.9,
      actions: [{ label: "Open AP Twin", to: "/ap-twin" }],
    };
  }

  const highRiskVendors = vendors.filter((v) => v.riskLevel === "High").length;
  return {
    answer: `Across ${invoices.length} invoices, ${exceptions.length} require human intervention and touchless processing is ${touchlessRate.toFixed(1)}%.`,
    evidence: [
      `${money(pendingValue)} awaiting approval across ${pendingApproval.length} invoices`,
      `${invoices.filter((i) => i.duplicateRisk > 75).length} potential duplicates flagged`,
      `${highRiskVendors} vendors currently classified as high risk`,
      `Largest exception category: ${topBy(exceptions, (i) => i.exceptionType ?? "—")}`,
    ],
    impact: "Resolving the top exception category would recover the majority of manual AP effort.",
    action: "Open the Exception Center and work the queue by SLA risk.",
    risk: "Low.",
    confidence: 90.0,
    actions: [
      { label: "Open Exception Center", to: "/exceptions" },
      { label: "Open Command Center", to: "/" },
    ],
  };
}

function topBy<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  arr.forEach((a) => m.set(key(a), (m.get(key(a)) ?? 0) + 1));
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} (${top[1]})` : "—";
}
