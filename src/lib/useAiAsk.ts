import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { askAI } from "./ai.functions";
import { buildAiContext } from "./aiContext";
import { useStore } from "./store";
import type { Invoice } from "./types";
import { getAdminConfig } from "./adminConfig";

/** Live Q AI question answering grounded in current AP data (optionally focused on one invoice). */
export function useAiAsk() {
  const store = useStore();
  const run = useServerFn(askAI);
  const [busy, setBusy] = useState(false);
  const ask = async (question: string, mode: string, focus?: Invoice | null, fallback?: () => string) => {
    if (!getAdminConfig().ai.copilot) return fallback?.() ?? "AI assistant is turned off in Settings.";
    setBusy(true);
    try {
      const context = buildAiContext(question, { invoices: store.invoices, vendors: store.vendors, payments: store.payments, tolerances: store.tolerances as unknown as Record<string, number> }, focus);
      const r = await run({ data: { question, mode, context } });
      return `${r.answer}${r.evidence.length ? "\n• " + r.evidence.join("\n• ") : ""}\nRecommended: ${r.action} (confidence ${Math.round(r.confidence)}%)`;
    } catch (e) {
      toast.error("Q AI unavailable", { description: e instanceof Error ? e.message : "Try again" });
      return fallback?.() ?? "AI is unavailable right now — please try again.";
    } finally {
      setBusy(false);
    }
  };
  return { ask, busy };
}
