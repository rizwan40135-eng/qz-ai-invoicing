import { GlobalSearch } from "./GlobalSearch";
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Inbox,
  ScanText,
  GitCompareArrows,
  TriangleAlert,
  Copy,
  Calculator,
  Building2,
  Banknote,
  FlaskConical,
  ShieldCheck,
  Sparkle,
  CheckCheck,
  Bell,
  Settings,
  Search,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  RotateCcw,
  BarChart3,
  Presentation,
  FileStack, PackageCheck,
} from "lucide-react";
import { Pill } from "./primitives";
import { BackgroundJobs, MailCollector } from "./MailCollector";
import { AskQDialog } from "./AskQ";
import { CommandPalette } from "./CommandPalette";
import { BUSINESS_UNITS, COUNTRIES, ERPS, vendors } from "@/lib/data";
import type { Persona } from "@/lib/types";

const MAIN_NAV = [
  { no: "01", to: "/", label: "AP Command Center", icon: LayoutDashboard },
  { no: "02", to: "/intake", label: "Invoice Intake", icon: Inbox },
  { no: "03", to: "/document-ai", label: "Document AI", icon: ScanText },
  { no: "04", to: "/match", label: "Match Studio", icon: GitCompareArrows },
  { no: "05", to: "/exceptions", label: "Exception Center", icon: TriangleAlert },
  { no: "06", to: "/accounting", label: "Accounting Intelligence", icon: Calculator },
  { no: "07", to: "/vendors", label: "Vendor Hub", icon: Building2 },
  { no: "08", to: "/payments", label: "Payments Command Center", icon: Banknote },
  { no: "09", to: "/ap-twin", label: "AP Twin", icon: FlaskConical },
  { no: "10", to: "/trust", label: "Trust & Controls", icon: ShieldCheck },
];

const SECONDARY_NAV = [
  { to: "/invoices", label: "All Invoices", icon: FileStack },
  { to: "/erp-data", label: "POs & Goods Receipts", icon: PackageCheck },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/approvals", label: "Approvals", icon: CheckCheck },
  { to: "/settings", label: "Settings", icon: Settings },
];

const PERSONAS: Persona[] = [
  "CFO",
  "AP Head",
  "AP Processor",
  "AP Manager",
  "Finance Controller",
  "Procurement",
  "Business Approver",
  "Treasury",
  "Vendor Manager",
  "Auditor",
  "System Administrator",
];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const store = useStore();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const unread = store.notifications.filter((n) => !n.read).length;

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-[262px]",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
            <span className="text-[13px] font-black tracking-tight">Q</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight">Q-AP AI</div>
              <div className="truncate text-[10.5px] text-muted-foreground">Intelligent AP Operations OS</div>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <nav className="space-y-0.5 p-2.5">
            {MAIN_NAV.map((item) => (
              <NavLink key={item.to} {...item} collapsed={collapsed} active={path === item.to} />
            ))}
            <div className={cn("px-2.5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground", collapsed && "text-center")}>
              {collapsed ? "···" : "Workspace"}
            </div>
            {SECONDARY_NAV.filter((item) => item.to !== "/erp-data" || store.persona === "CFO").map((item) => (
              <NavLink key={item.to} {...item} collapsed={collapsed} active={path === item.to} />
            ))}
          </nav>
        </ScrollArea>

        <div className="border-t border-sidebar-border p-2.5">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse"}
          </Button>
          {!collapsed && (
            <div className="px-2.5 pt-2 text-[10px] text-muted-foreground">
              Powered by <span className="font-semibold text-brand">Quantzig</span>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar unread={unread} />
        <main className="min-w-0 flex-1 space-y-5 p-4 md:p-6">{children}</main>
        <footer className="border-t border-border px-6 py-4 text-[11px] text-muted-foreground">
          Q-AP AI · Nova Global Industries · Connected to SAP S/4HANA and Oracle Fusion
        </footer>
        <MailCollector />
        <BackgroundJobs />
      </div>

      <button
        onClick={() => store.setAskOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-flame px-4 py-3 text-sm font-semibold text-flame-foreground shadow-[0_12px_40px_-12px_rgba(241,72,26,0.7)] transition-transform hover:scale-105"
      >
        <Sparkle className="size-4" />
        Ask Q
      </button>

      <AskQDialog />
      <CommandPalette />
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  no,
  collapsed,
  active,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  no?: string;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      title={label}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
        active ? "bg-brand text-brand-foreground shadow-sm" : "text-foreground/75 hover:bg-sidebar-accent hover:text-foreground",
        collapsed && "justify-center",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {no && <span className={cn("tabular text-[10px] font-bold", active ? "opacity-70" : "text-muted-foreground")}>{no}</span>}
          <span className="truncate">{label}</span>
        </span>
      )}
    </Link>
  );
}

function TopBar({ unread }: { unread: number }) {
  const store = useStore();
  const f = store.filters;
  const companyCodes = ["All", ...new Set(store.invoices.map((i) => i.companyCode))].slice(0, 8);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 md:px-6">
        <GlobalSearch />
        <button
          onClick={() => store.setPaletteOpen(true)}
          className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted md:flex"
        >
          <Command className="size-3" />K
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              Filters
              <Pill tone="info">{activeFilterCount(store.filters)}</Pill>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] space-y-2.5" align="end">
            <FilterSelect label="Business Unit" value={f.businessUnit} options={["All", ...BUSINESS_UNITS]} onChange={(v) => store.setFilters({ businessUnit: v })} />
            <FilterSelect label="Country" value={f.country} options={["All", ...COUNTRIES]} onChange={(v) => store.setFilters({ country: v })} />
            <FilterSelect label="Company Code" value={f.companyCode} options={companyCodes} onChange={(v) => store.setFilters({ companyCode: v })} />
            <FilterSelect label="ERP" value={f.erp} options={["All", ...ERPS]} onChange={(v) => store.setFilters({ erp: v })} />
            <FilterSelect label="Vendor" value={f.vendor} options={["All", ...vendors.slice(0, 20).map((v) => v.name)]} onChange={(v) => store.setFilters({ vendor: v })} />
            <FilterSelect
              label="Invoice Type"
              value={f.invoiceType}
              options={["All", "PO Invoice", "Non-PO Invoice", "Freight / Logistics", "Import / Customs", "Service Invoice", "Utility", "Intercompany", "Credit Note", "Debit Note"]}
              onChange={(v) => store.setFilters({ invoiceType: v })}
            />
            <FilterSelect
              label="Status"
              value={f.status}
              options={["All", "Review Required", "Posted", "Approved", "Payment Scheduled", "Beneficiary Credited"]}
              onChange={(v) => store.setFilters({ status: v })}
            />
            <FilterSelect label="Date Range" value={f.dateRange} options={["Last 7 days", "Last 30 days", "Last 45 days", "Quarter to date"]} onChange={(v) => store.setFilters({ dateRange: v })} />
            <Button variant="ghost" size="sm" className="w-full" onClick={() => store.setFilters({ businessUnit: "All", country: "All", companyCode: "All", erp: "All", vendor: "All", invoiceType: "All", status: "All" })}>
              Clear filters
            </Button>
          </PopoverContent>
        </Popover>

        <Select value={store.persona} onValueChange={(v) => store.setPersona(v as Persona)}>
          <SelectTrigger className="h-9 w-[168px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERSONAS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>


        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-9">
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-flame text-[9px] font-bold text-flame-foreground">
                  {unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[380px]">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <button className="text-[11px] font-normal text-brand" onClick={() => store.readAllNotifications()}>
                Mark all read
              </button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-[320px]">
              {store.notifications.slice(0, 20).map((n) => (
                <DropdownMenuItem key={n.id} asChild>
                  <Link to={n.link ?? "/"} className="flex flex-col items-start gap-0.5 py-2">
                    <div className="flex w-full items-center gap-2">
                      <Pill tone={n.severity.toLowerCase() as never}>{n.severity}</Pill>
                      {!n.read && <span className="size-1.5 rounded-full bg-flame" />}
                      <span className="ml-auto text-[10px] text-muted-foreground">{new Date(n.ts).toLocaleDateString()}</span>
                    </div>
                    <span className="text-[13px] font-medium">{n.title}</span>
                    <span className="text-[11px] text-muted-foreground">{n.body}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="size-9" onClick={store.toggleTheme}>
          {store.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>


        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
              AS
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="text-sm font-semibold">Amina Salem</div>
              <div className="text-[11px] font-normal text-muted-foreground">{store.persona} · Nova Global Industries</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/trust">Trust & Controls</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function activeFilterCount(f: ReturnType<typeof useStore>["filters"]) {
  return [f.businessUnit, f.country, f.companyCode, f.erp, f.vendor, f.invoiceType, f.status].filter((v) => v !== "All").length;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[190px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[260px]">
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
