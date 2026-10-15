import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill } from "@/components/qap/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BUSINESS_UNITS } from "@/lib/data";
import { testConnector } from "@/lib/ai.functions";
import { useAdminConfig, setAdminConfig, resetAdminConfig, syncInfo, type ConnectorConfig, type Mailbox } from "@/lib/adminConfig";
import { Plug, Mail, Bell, SlidersHorizontal, GitBranch, Sparkle, Landmark, Globe2, Users, ShieldCheck, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Q-AP AI" },
      { name: "description", content: "Administer ERP and data connectors, mailboxes, notifications, tolerances, approvals, SLAs, AI, payments, country rules, users and security for Q-AP AI." },
      { property: "og:title", content: "Settings — Q-AP AI" },
      { property: "og:description", content: "Central administration for the AP operating system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const ROLES = ["CFO", "AP Head", "AP Processor", "AP Manager", "Finance Controller", "Procurement", "Business Approver", "Treasury", "Vendor Manager", "Auditor", "System Administrator"];
const saved = (what: string) => toast.success(`${what} saved`);

function Settings() {
  const store = useStore();
  const cfg = useAdminConfig();
  const t = store.tolerances;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Settings" title="Platform administration" subtitle={`Connectors, mailboxes, notifications, matching rules, approvals, AI, payments, country rules, users and security. Changes apply immediately and are shared with everyone in the workspace.${syncInfo.updatedAt ? ` Last saved ${new Date(syncInfo.updatedAt).toLocaleString()}${syncInfo.updatedBy ? ` by ${syncInfo.updatedBy}` : ""}.` : ""}`} />

      <Tabs defaultValue="connectors">
        <TabsList className="h-auto flex-wrap justify-start">
          {[
            ["connectors", "Connectors", Plug], ["mail", "Mailboxes", Mail], ["notify", "Notifications & SLA", Bell], ["matching", "Matching & tolerances", SlidersHorizontal],
            ["approvals", "Approvals", GitBranch], ["ai", "AI", Sparkle], ["payments", "Payments", Landmark], ["countries", "Countries & tax", Globe2], ["users", "Users & roles", Users], ["security", "Security & data", ShieldCheck],
          ].map(([v, l, I]) => {
            const Icon = I as typeof Plug;
            return <TabsTrigger key={v as string} value={v as string} className="gap-1.5 text-xs"><Icon className="size-3.5" />{l as string}</TabsTrigger>;
          })}
        </TabsList>

        <TabsContent value="connectors" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {cfg.connectors.map((c) => <ConnectorCard key={c.id} c={c} />)}
          </div>
          <p className="text-[11px] text-muted-foreground">Passwords, tokens and certificates are never kept in the browser — each connector points to a named credential held in the server vault.</p>
        </TabsContent>

        <TabsContent value="mail" className="mt-4 space-y-4">
          {cfg.mailboxes.map((m) => <MailboxCard key={m.id} m={m} />)}
          <Button variant="outline" className="gap-1.5" onClick={() => setAdminConfig((c) => ({ mailboxes: [...c.mailboxes, { id: `mb${Date.now()}`, address: "", protocol: "Microsoft Graph", host: "graph.microsoft.com", folder: "Inbox", pollMin: 5, allowedSenders: "*", autoProcess: true, enabled: false, credentialRef: "" }] }))}>
            <Plus className="size-4" /> Add mailbox
          </Button>
        </TabsContent>

        <TabsContent value="notify" className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Panel title="Alert routing" description="Who is told about what, and how" dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">{["Event", "In-app", "Email", "Teams", "Recipients"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
                <tbody>
                  {cfg.notifications.map((n, i) => (
                    <tr key={n.event} className="border-b border-border/50">
                      <td className="px-4 py-2 font-semibold">{n.event}</td>
                      {(["inApp", "email", "teams"] as const).map((k) => (
                        <td key={k} className="px-4 py-2"><Switch checked={n[k]} onCheckedChange={(v) => setAdminConfig((c) => ({ notifications: c.notifications.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))} /></td>
                      ))}
                      <td className="px-4 py-2"><Input value={n.recipients} onChange={(e) => setAdminConfig((c) => ({ notifications: c.notifications.map((x, j) => (j === i ? { ...x, recipients: e.target.value } : x)) }))} className="h-7 text-xs" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="Reminders & escalation">
              <Row label={`Reminder at ${cfg.reminderPct}% of SLA`}><Slider value={[cfg.reminderPct]} min={10} max={95} step={5} onValueChange={([v]) => setAdminConfig({ reminderPct: v! })} /></Row>
              <Row label={`Escalate at ${cfg.escalateAfterPct}% of SLA`}><Slider value={[cfg.escalateAfterPct]} min={50} max={200} step={10} onValueChange={([v]) => setAdminConfig({ escalateAfterPct: v! })} /></Row>
              <Row label="Digest email">
                <Select value={cfg.digest} onValueChange={(v) => setAdminConfig({ digest: v as "Daily" })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["Off", "Hourly", "Daily"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
              </Row>
            </Panel>
            <Panel title="Resolution SLA by exception (hours)">
              {Object.entries(cfg.slaHours).map(([k, v]) => (
                <Row key={k} label={k}><Input type="number" value={v} min={1} onChange={(e) => setAdminConfig((c) => ({ slaHours: { ...c.slaHours, [k]: Number(e.target.value) || 1 } }))} className="h-8 w-24 text-xs" /></Row>
              ))}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="matching" className="mt-4 grid gap-4 xl:grid-cols-2">
          <Panel title="Global tolerances">
            {([
              ["Price", "price", 5, "%"], ["Quantity", "quantity", 10, "%"], ["Total", "total", 5, "%"], ["Tax", "tax", 3, "%"], ["Freight", "freight", 10, "%"], ["Service", "service", 10, "%"],
              ["Confidence threshold", "confidenceThreshold", 99, "%"], ["Duplicate sensitivity", "duplicateSensitivity", 98, ""],
            ] as const).map(([label, key, max, unit]) => (
              <div key={key} className="flex items-center gap-3 py-1.5">
                <span className="w-[160px] text-xs text-muted-foreground">{label}</span>
                <Slider value={[t[key]]} min={0} max={max} step={0.25} onValueChange={([v]) => store.setTolerances({ [key]: v! })} className="flex-1" />
                <span className="tabular w-[56px] text-right text-xs font-semibold">{t[key]}{unit}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 py-1.5">
              <span className="w-[160px] text-xs text-muted-foreground">Auto approve below</span>
              <Slider value={[t.autoApproveBelow]} min={0} max={50000} step={500} onValueChange={([v]) => store.setTolerances({ autoApproveBelow: v! })} className="flex-1" />
              <span className="tabular w-[76px] text-right text-xs font-semibold">AED {t.autoApproveBelow.toLocaleString()}</span>
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="Tolerance overrides" description="By business unit, category, transaction type or supplier — most specific rule wins">
              <div className="space-y-2">
                {cfg.overrides.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                    <Select value={o.scope} onValueChange={(v) => setAdminConfig((c) => ({ overrides: c.overrides.map((x) => (x.id === o.id ? { ...x, scope: v as "Supplier" } : x)) }))}>
                      <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Business unit", "Supplier", "Category", "Transaction type"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={o.value} placeholder="Name" onChange={(e) => setAdminConfig((c) => ({ overrides: c.overrides.map((x) => (x.id === o.id ? { ...x, value: e.target.value } : x)) }))} className="h-8 flex-1 text-xs" />
                    <Input type="number" value={o.price} onChange={(e) => setAdminConfig((c) => ({ overrides: c.overrides.map((x) => (x.id === o.id ? { ...x, price: Number(e.target.value) } : x)) }))} className="h-8 w-20 text-xs" title="Price %" />
                    <Input type="number" value={o.quantity} onChange={(e) => setAdminConfig((c) => ({ overrides: c.overrides.map((x) => (x.id === o.id ? { ...x, quantity: Number(e.target.value) } : x)) }))} className="h-8 w-20 text-xs" title="Quantity %" />
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => setAdminConfig((c) => ({ overrides: c.overrides.filter((x) => x.id !== o.id) }))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdminConfig((c) => ({ overrides: [...c.overrides, { id: `o${Date.now()}`, scope: "Supplier", value: "", price: 1, quantity: 2 }] }))}><Plus className="size-4" /> Add override</Button>
                <p className="text-[11px] text-muted-foreground">Columns: scope · name · price % · quantity %</p>
              </div>
            </Panel>
            <Panel title="Duplicate detection">
              <Row label={`High risk ≥ ${cfg.duplicate.highRisk}`}><Slider value={[cfg.duplicate.highRisk]} min={70} max={99} onValueChange={([v]) => setAdminConfig((c) => ({ duplicate: { ...c.duplicate, highRisk: v! } }))} /></Row>
              <Row label={`Review ≥ ${cfg.duplicate.review}`}><Slider value={[cfg.duplicate.review]} min={50} max={95} onValueChange={([v]) => setAdminConfig((c) => ({ duplicate: { ...c.duplicate, review: v! } }))} /></Row>
              <Row label="Block exact duplicate uploads"><Switch checked={cfg.duplicate.blockExact} onCheckedChange={(v) => setAdminConfig((c) => ({ duplicate: { ...c.duplicate, blockExact: v } }))} /></Row>
            </Panel>
            <Panel title="Business unit rules" description="Matching policy and tolerances per business unit — applied to every new invoice; overrides above still win">
              <div className="space-y-2">
                {cfg.buRules.map((r) => {
                  const up = (patch: Partial<typeof r>) => setAdminConfig((c) => ({ buRules: c.buRules.map((x) => (x.bu === r.bu ? { ...x, ...patch } : x)) }));
                  return (
                    <div key={r.bu} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[120px] text-[13px] font-semibold">{r.bu}</div>
                        <Select value={r.matchPolicy} onValueChange={(v) => up({ matchPolicy: v as typeof r.matchPolicy })}>
                          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{["By category", "Always 3-way", "Always 2-way"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                        </Select>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Price ±%<Input type="number" step={0.5} value={r.price} onChange={(e) => up({ price: Number(e.target.value) })} className="h-8 w-16 text-xs" /></label>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Qty ±%<Input type="number" step={0.5} value={r.quantity} onChange={(e) => up({ quantity: Number(e.target.value) })} className="h-8 w-16 text-xs" /></label>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Auto-approve below<Input type="number" step={500} value={r.autoApproveBelow} onChange={(e) => up({ autoApproveBelow: Number(e.target.value) })} className="h-8 w-24 text-xs" /></label>
                      </div>
                      <Input value={r.notes} onChange={(e) => up({ notes: e.target.value })} className="mt-2 h-8 text-xs" aria-label={`${r.bu} notes`} />
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4 grid gap-4 xl:grid-cols-2">
          <Panel title="Approval levels by invoice value">
            {cfg.approvalLevels.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <span className="w-[70px] text-xs text-muted-foreground">Up to</span>
                <Input type="number" value={l.upTo} onChange={(e) => setAdminConfig((c) => ({ approvalLevels: c.approvalLevels.map((x, j) => (j === i ? { ...x, upTo: Number(e.target.value) } : x)) }))} className="h-8 w-32 text-xs" />
                <Input value={l.approvers} onChange={(e) => setAdminConfig((c) => ({ approvalLevels: c.approvalLevels.map((x, j) => (j === i ? { ...x, approvers: e.target.value } : x)) }))} className="h-8 flex-1 text-xs" />
              </div>
            ))}
          </Panel>
          <Panel title="Controls">
            <Row label="Dual approval for payments above (AED)"><Input type="number" value={cfg.dualApprovalAbove} onChange={(e) => setAdminConfig({ dualApprovalAbove: Number(e.target.value) })} className="h-8 w-32 text-xs" /></Row>
            <p className="mt-2 text-[11px] text-muted-foreground">Segregation of duties is always enforced: processors cannot release payments and nobody can approve their own change.</p>
          </Panel>
        </TabsContent>

        <TabsContent value="ai" className="mt-4 grid gap-4 xl:grid-cols-2">
          <Panel title="Q AI features">
            {([["extraction", "AI invoice reading on every upload"], ["copilot", "Ask Q, document chat and exception copilot"], ["coding", "AI accounting recommendations"]] as const).map(([k, l]) => (
              <Row key={k} label={l}><Switch checked={cfg.ai[k]} onCheckedChange={(v) => setAdminConfig((c) => ({ ai: { ...c.ai, [k]: v } }))} /></Row>
            ))}
            <Row label="Reasoning depth">
              <Select value={cfg.ai.reasoning} onValueChange={(v) => setAdminConfig((c) => ({ ai: { ...c.ai, reasoning: v as "low" } }))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
            </Row>
          </Panel>
          <Panel title="Automation thresholds">
            <Row label={`Auto-accept field confidence ≥ ${cfg.ai.autoAcceptConfidence}%`}><Slider value={[cfg.ai.autoAcceptConfidence]} min={70} max={99} onValueChange={([v]) => setAdminConfig((c) => ({ ai: { ...c.ai, autoAcceptConfidence: v! } }))} /></Row>
            <Row label={`Touchless minimum score ${cfg.ai.touchlessMinScore}`}><Slider value={[cfg.ai.touchlessMinScore]} min={60} max={99} onValueChange={([v]) => setAdminConfig((c) => ({ ai: { ...c.ai, touchlessMinScore: v! } }))} /></Row>
            <p className="text-[11px] text-muted-foreground">AI recommends; posting and payment release always follow the approval rules.</p>
          </Panel>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Panel title="Payment runs">
            <Row label="Run days">
              <div className="flex flex-wrap gap-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => {
                  const on = cfg.payments.runDays.includes(d);
                  return <Button key={d} size="sm" variant={on ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => setAdminConfig((c) => ({ payments: { ...c.payments, runDays: on ? c.payments.runDays.filter((x) => x !== d) : [...c.payments.runDays, d] } }))}>{d}</Button>;
                })}
              </div>
            </Row>
            <Row label="Bank cut-off time"><Input type="time" value={cfg.payments.cutoff} onChange={(e) => setAdminConfig((c) => ({ payments: { ...c.payments, cutoff: e.target.value } }))} className="h-8 w-32 text-xs" /></Row>
            <Row label="Default method"><Input value={cfg.payments.method} onChange={(e) => setAdminConfig((c) => ({ payments: { ...c.payments, method: e.target.value } }))} className="h-8 text-xs" /></Row>
            <Row label="File format"><Input value={cfg.payments.format} onChange={(e) => setAdminConfig((c) => ({ payments: { ...c.payments, format: e.target.value } }))} className="h-8 text-xs" /></Row>
            <Row label="Prioritise early-payment discounts"><Switch checked={cfg.payments.earlyDiscount} onCheckedChange={(v) => setAdminConfig((c) => ({ payments: { ...c.payments, earlyDiscount: v } }))} /></Row>
          </Panel>
        </TabsContent>

        <TabsContent value="countries" className="mt-4">
          <Panel title="Country tax & e-invoice rules" dense>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">{["Country", "VAT / GST %", "Withholding %", "E-invoice format", "Enforce"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(cfg.countries).map(([k, v]) => {
                    const up = (p: Partial<typeof v>) => setAdminConfig((c) => ({ countries: { ...c.countries, [k]: { ...c.countries[k]!, ...p } } }));
                    return (
                      <tr key={k} className="border-b border-border/50">
                        <td className="px-4 py-2 font-semibold">{k}</td>
                        <td className="px-4 py-2"><Input type="number" value={v.vatRate} onChange={(e) => up({ vatRate: Number(e.target.value) })} className="h-7 w-20 text-xs" /></td>
                        <td className="px-4 py-2"><Input type="number" value={v.withholding} onChange={(e) => up({ withholding: Number(e.target.value) })} className="h-7 w-20 text-xs" /></td>
                        <td className="px-4 py-2"><Input value={v.einvoice} onChange={(e) => up({ einvoice: e.target.value })} className="h-7 text-xs" /></td>
                        <td className="px-4 py-2"><Switch checked={v.enforce} onCheckedChange={(x) => up({ enforce: x })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Panel title="Users & roles" dense actions={<Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdminConfig((c) => ({ users: [...c.users, { id: `u${Date.now()}`, name: "", email: "", role: "AP Processor", bu: "All", active: true }] }))}><Plus className="size-4" /> Add user</Button>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">{["Name", "Email", "Role", "Business unit", "Active", ""].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
                <tbody>
                  {cfg.users.map((u) => {
                    const up = (p: Partial<typeof u>) => setAdminConfig((c) => ({ users: c.users.map((x) => (x.id === u.id ? { ...x, ...p } : x)) }));
                    return (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="px-4 py-2"><Input value={u.name} onChange={(e) => up({ name: e.target.value })} className="h-7 text-xs" /></td>
                        <td className="px-4 py-2"><Input value={u.email} onChange={(e) => up({ email: e.target.value })} className="h-7 text-xs" /></td>
                        <td className="px-4 py-2"><Select value={u.role} onValueChange={(v) => up({ role: v })}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></td>
                        <td className="px-4 py-2"><Select value={u.bu} onValueChange={(v) => up({ bu: v })}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["All", ...BUSINESS_UNITS].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></td>
                        <td className="px-4 py-2"><Switch checked={u.active} onCheckedChange={(v) => up({ active: v })} /></td>
                        <td className="px-4 py-2"><Button size="icon" variant="ghost" className="size-7" onClick={() => setAdminConfig((c) => ({ users: c.users.filter((x) => x.id !== u.id) }))}><Trash2 className="size-4" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="security" className="mt-4 grid gap-4 xl:grid-cols-2">
          <Panel title="Security">
            <Row label="Session timeout (minutes)"><Input type="number" value={cfg.security.sessionTimeoutMin} onChange={(e) => setAdminConfig((c) => ({ security: { ...c.security, sessionTimeoutMin: Number(e.target.value) } }))} className="h-8 w-24 text-xs" /></Row>
            <Row label="Require multi-factor sign-in"><Switch checked={cfg.security.mfa} onCheckedChange={(v) => setAdminConfig((c) => ({ security: { ...c.security, mfa: v } }))} /></Row>
            <Row label="IP allowlist"><Input value={cfg.security.ipAllowlist} placeholder="e.g. 10.0.0.0/8" onChange={(e) => setAdminConfig((c) => ({ security: { ...c.security, ipAllowlist: e.target.value } }))} className="h-8 text-xs" /></Row>
            <Row label="Supplier portal link expiry (days)"><Input type="number" value={cfg.security.supplierPortalExpiryDays} onChange={(e) => setAdminConfig((c) => ({ security: { ...c.security, supplierPortalExpiryDays: Number(e.target.value) } }))} className="h-8 w-24 text-xs" /></Row>
          </Panel>
          <Panel title="Data & appearance">
            <Row label="Document retention (years)"><Input type="number" value={cfg.security.retentionYears} onChange={(e) => setAdminConfig((c) => ({ security: { ...c.security, retentionYears: Number(e.target.value) } }))} className="h-8 w-24 text-xs" /></Row>
            <Row label="Dark mode"><Switch checked={store.theme === "dark"} onCheckedChange={store.toggleTheme} /></Row>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { if (confirm("Reset all invoices, exceptions, approvals and payments?")) { store.resetDemo(); toast.success("Workspace data reset"); } }}>Reset workspace data</Button>
              <Button variant="outline" size="sm" onClick={() => { if (confirm("Restore default settings?")) { resetAdminConfig(); toast.success("Default settings restored"); } }}>Restore default settings</Button>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectorCard({ c }: { c: ConnectorConfig }) {
  const store = useStore();
  const test = useServerFn(testConnector);
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<ConnectorConfig>) => setAdminConfig((s) => ({ connectors: s.connectors.map((x) => (x.id === c.id ? { ...x, ...p } : x)) }));
  return (
    <Panel
      title={c.name}
      description={c.kind}
      actions={<div className="flex items-center gap-2">{c.lastTest && <Pill tone={c.lastTest.ok ? "pass" : "fail"}>{c.lastTest.ok ? "Reachable" : "Unreachable"}</Pill>}<Switch checked={c.enabled} onCheckedChange={(v) => up({ enabled: v })} /></div>}
    >
      <div className="space-y-2">
        <Row label="Endpoint URL"><Input value={c.endpoint} onChange={(e) => up({ endpoint: e.target.value })} className="h-8 text-xs" /></Row>
        {Object.entries(c.fields).map(([k, v]) => (
          <Row key={k} label={k}><Input value={v} onChange={(e) => up({ fields: { ...c.fields, [k]: e.target.value } })} className="h-8 text-xs" /></Row>
        ))}
        <Row label="Vault credential name"><Input value={c.credentialRef} onChange={(e) => up({ credentialRef: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} className="h-8 font-mono text-xs" /></Row>
        <Row label="Sync mode">
          <div className="flex gap-2">
            <Select value={c.mode} onValueChange={(v) => { up({ mode: v as "Real-time API" }); if (c.kind === "ERP") store.setErp({ mode: { ...store.erp.mode, [c.name]: v } as typeof store.erp.mode }); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Real-time API">Real-time API</SelectItem><SelectItem value="Scheduled batch">Scheduled batch</SelectItem></SelectContent>
            </Select>
            {c.mode === "Scheduled batch" && <Input type="number" min={1} value={c.intervalMin} onChange={(e) => up({ intervalMin: Number(e.target.value) || 1 })} className="h-8 w-20 text-xs" title="Minutes" />}
          </div>
        </Row>
        {c.lastTest && <p className="text-[11px] text-muted-foreground">Last test {new Date(c.lastTest.ts).toLocaleString()} · {c.lastTest.message} · {c.lastTest.ms} ms</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await test({ data: { url: c.endpoint } });
              up({ lastTest: { ...r, ts: new Date().toISOString() } });
              if (r.ok) toast.success(`${c.name} reachable`, { description: r.message });
              else toast.error(`${c.name} not reachable`, { description: r.message });
            } catch (e) {
              toast.error("Test failed", { description: e instanceof Error ? e.message : "Invalid URL" });
            } finally { setBusy(false); }
          }}>{busy ? "Testing…" : "Test connection"}</Button>
          <Button size="sm" onClick={() => saved(c.name)}>Save</Button>
        </div>
      </div>
    </Panel>
  );
}

function MailboxCard({ m }: { m: Mailbox }) {
  const store = useStore();
  const up = (p: Partial<Mailbox>) => setAdminConfig((s) => ({ mailboxes: s.mailboxes.map((x) => (x.id === m.id ? { ...x, ...p } : x)) }));
  return (
    <Panel title={m.address || "New mailbox"} description={m.protocol} actions={<div className="flex items-center gap-2"><Pill tone={m.enabled ? "pass" : "neutral"}>{m.enabled ? "Collecting" : "Paused"}</Pill><Switch checked={m.enabled} onCheckedChange={(v) => { up({ enabled: v }); if (m.autoProcess) store.setAutoCollect(v); }} /></div>}>
      <div className="grid gap-2 md:grid-cols-2">
        <Row label="Address"><Input value={m.address} onChange={(e) => up({ address: e.target.value })} className="h-8 text-xs" /></Row>
        <Row label="Protocol">
          <Select value={m.protocol} onValueChange={(v) => up({ protocol: v as "IMAP", host: v === "IMAP" ? "imap.novaglobal.example" : v === "Gmail API" ? "gmail.googleapis.com" : "graph.microsoft.com" })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{["Microsoft Graph", "IMAP", "Gmail API"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Host"><Input value={m.host} onChange={(e) => up({ host: e.target.value })} className="h-8 text-xs" /></Row>
        <Row label="Folder"><Input value={m.folder} onChange={(e) => up({ folder: e.target.value })} className="h-8 text-xs" /></Row>
        <Row label="Poll every (min)"><Input type="number" value={m.pollMin} onChange={(e) => up({ pollMin: Number(e.target.value) || 1 })} className="h-8 w-24 text-xs" /></Row>
        <Row label="Allowed senders"><Input value={m.allowedSenders} onChange={(e) => up({ allowedSenders: e.target.value })} className="h-8 text-xs" /></Row>
        <Row label="Vault credential name"><Input value={m.credentialRef} onChange={(e) => up({ credentialRef: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} className="h-8 font-mono text-xs" /></Row>
        <Row label="Process attachments automatically"><Switch checked={m.autoProcess} onCheckedChange={(v) => up({ autoProcess: v })} /></Row>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => saved("Mailbox")}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setAdminConfig((s) => ({ mailboxes: s.mailboxes.filter((x) => x.id !== m.id) }))}>Remove</Button>
      </div>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-[200px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
