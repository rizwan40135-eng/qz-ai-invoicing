import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import {
  Upload,
  Mail,
  GitCompareArrows,
  Search,
  Building2,
  Copy,
  Sparkle,
  TriangleAlert,
  FlaskConical,
  CheckCheck,
  Moon,
  RotateCcw,
} from "lucide-react";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setAskOpen, toggleTheme, resetDemo } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [paletteOpen, setPaletteOpen]);

  const go = (to: string) => {
    setPaletteOpen(false);
    void navigate({ to });
  };

  const items: { label: string; icon: React.ReactNode; run: () => void; group: string }[] = [
    { group: "Actions", label: "Upload Invoice", icon: <Upload className="size-4" />, run: () => go("/intake") },
    { group: "Actions", label: "Process Email", icon: <Mail className="size-4" />, run: () => go("/intake") },
    { group: "Actions", label: "Run Match", icon: <GitCompareArrows className="size-4" />, run: () => go("/match") },
    { group: "Actions", label: "Run Duplicate Check", icon: <Copy className="size-4" />, run: () => go("/exceptions") },
    { group: "Navigate", label: "Find Invoice", icon: <Search className="size-4" />, run: () => go("/invoices") },
    { group: "Navigate", label: "Search Vendor", icon: <Building2 className="size-4" />, run: () => go("/vendors") },
    { group: "Navigate", label: "Open Exception Center", icon: <TriangleAlert className="size-4" />, run: () => go("/exceptions") },
    { group: "Navigate", label: "Open Approvals", icon: <CheckCheck className="size-4" />, run: () => go("/approvals") },
    { group: "Navigate", label: "Run AP Twin", icon: <FlaskConical className="size-4" />, run: () => go("/ap-twin") },
    {
      group: "Assistant",
      label: "Ask Q",
      icon: <Sparkle className="size-4" />,
      run: () => {
        setPaletteOpen(false);
        setAskOpen(true);
      },
    },
    {
      group: "System",
      label: "Toggle Dark Mode",
      icon: <Moon className="size-4" />,
      run: () => {
        toggleTheme();
        setPaletteOpen(false);
      },
    },
    {
      group: "System",
      label: "Reset Workspace Data",
      icon: <RotateCcw className="size-4" />,
      run: () => {
        resetDemo();
        setPaletteOpen(false);
        toast.success("Workspace data reset", { description: "Invoices, exceptions, payments and scenarios restored." });
      },
    },
  ];

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <CommandItem key={i.label} onSelect={i.run} className="gap-2">
                  {i.icon}
                  {i.label}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
