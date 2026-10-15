import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "motion/react";
import { Sparkle, Send, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { askCopilot, SUGGESTED_QUESTIONS, type CopilotAnswer } from "@/lib/copilot";
import { Link } from "@tanstack/react-router";
import { Pill } from "./primitives";
import { useServerFn } from "@tanstack/react-start";
import { askAI } from "@/lib/ai.functions";
import { buildAiContext } from "@/lib/aiContext";
import { toast } from "sonner";

const MODES = [
  "AP Manager",
  "Invoice Analyst",
  "Exception Copilot",
  "Accounting Advisor",
  "Vendor Analyst",
  "Payments Advisor",
  "Audit Assistant",
] as const;

export function AskQDialog() {
  const { askOpen, setAskOpen, invoices, vendors, payments, tolerances } = useStore();
  const [mode, setMode] = useState<(typeof MODES)[number]>("AP Manager");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [log, setLog] = useState<{ q: string; a: CopilotAnswer }[]>([]);

  const runAI = useServerFn(askAI);
  const ask = async (q: string) => {
    if (!q.trim()) return;
    setInput("");
    setThinking(true);
    const local = askCopilot(q, { invoices, vendors, payments, tolerances });
    try {
      const r = await runAI({ data: { question: q, mode, context: buildAiContext(q, { invoices, vendors, payments, tolerances: tolerances as unknown as Record<string, number> }) } });
      setLog((l) => [...l, { q, a: { ...r, actions: local.actions } }]);
    } catch (e) {
      toast.error("Q AI unavailable", { description: e instanceof Error ? e.message : "Try again" });
      setLog((l) => [...l, { q, a: local }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <Dialog open={askOpen} onOpenChange={setAskOpen}>
      <DialogContent className="max-h-[86vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-brand-foreground">
              <Sparkle className="size-4" />
            </span>
            Ask Q
            <Badge variant="outline" className="ml-1 text-[10px]">
              {mode}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-2.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                mode === m ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <ScrollArea className="max-h-[46vh]">
          <div className="space-y-4 px-5 py-4">
            {log.length === 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Try one of these
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-left text-xs hover:border-brand/50 hover:bg-brand-soft"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {log.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-sm text-brand-foreground">
                    {entry.q}
                  </div>
                  <AnswerCard a={entry.a} />
                </motion.div>
              ))}
            </AnimatePresence>
            {thinking && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin text-brand" />
                <span className="ai-shimmer font-medium">Q is reasoning over live AP data with Q AI…</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex items-center gap-2 border-t border-border px-5 py-3"
        >
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about invoices, exceptions, duplicates, payments or policy…"
            className="h-10"
          />
          <Button type="submit" size="icon" className="size-10 shrink-0">
            <Send className="size-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AnswerCard({ a }: { a: CopilotAnswer }) {
  const { setAskOpen } = useStore();
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <Section label="Answer">{a.answer}</Section>
      <div>
        <Label>Evidence</Label>
        <ul className="mt-1 space-y-1">
          {a.evidence.map((e) => (
            <li key={e} className="flex gap-2 text-sm text-foreground/85">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-flame" />
              {e}
            </li>
          ))}
        </ul>
      </div>
      <Section label="Business Impact">{a.impact}</Section>
      <Section label="Recommended Action">{a.action}</Section>
      <Section label="Risk">{a.risk}</Section>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Pill tone="info">Confidence {a.confidence.toFixed(1)}%</Pill>
        {a.actions.map((act) =>
          act.to ? (
            <Button key={act.label} size="sm" variant="outline" asChild onClick={() => setAskOpen(false)}>
              <Link to={act.to}>{act.label}</Link>
            </Button>
          ) : (
            <Button key={act.label} size="sm" variant="outline">
              {act.label}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

const Label = ({ children }: { children: string }) => (
  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{children}</span>
);
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label>{label}</Label>
    <p className="mt-1 text-sm leading-relaxed text-foreground/90">{children}</p>
  </div>
);
