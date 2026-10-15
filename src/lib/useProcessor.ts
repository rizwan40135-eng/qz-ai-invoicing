import { useCallback, useRef, useState } from "react";
import { useStore } from "./store";
import { extractDocument, fieldsToInvoice, previewRegistry, type ExtractionOutput } from "./extract";
import { processInvoice, type PipelineOutcome } from "./pipeline";
import type { Invoice } from "./types";
import { useServerFn } from "@tanstack/react-start";
import { extractInvoiceAI } from "./ai.functions";
import { fileToAiImage, mergeAi } from "./aiMerge";
import { getAdminConfig } from "./adminConfig";
import { saveOriginal } from "./fileVault";

export interface ProcessedItem {
  id: string;
  fileName: string;
  status: "queued" | "reading" | "done" | "blocked" | "error";
  stage: string;
  extraction?: ExtractionOutput;
  outcome?: PipelineOutcome;
  blockedReason?: string;
}

let seq = 0;
const newId = () => `INV-U${(Date.now() % 1_000_000).toString().padStart(6, "0")}${(seq++ % 10).toString()}`;

/** Runs uploaded files through capture → extraction → ERP retrieval → match → duplicate → decision. */
export function useInvoiceProcessor() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  const runExtract = useServerFn(extractInvoiceAI);
  const [items, setItems] = useState<ProcessedItem[]>([]);
  const [busy, setBusy] = useState(false);

  const patch = (key: string, p: Partial<ProcessedItem>) => setItems((list) => list.map((x) => (x.id === key ? { ...x, ...p } : x)));

  const processFiles = useCallback(async (files: File[], source: Invoice["source"]) => {
    if (!files.length) return [] as ProcessedItem[];
    setBusy(true);
    const keys = files.map((f, i) => `${Date.now()}-${i}-${f.name}`);
    setItems((list) => [...files.map((f, i) => ({ id: keys[i]!, fileName: f.name, status: "queued" as const, stage: "Queued" })), ...list]);
    const added: Invoice[] = [];
    const results: ProcessedItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const key = keys[i]!;
      try {
        patch(key, { status: "reading", stage: "Fingerprinting file" });
        let out = await extractDocument(f, (stage) => patch(key, { stage }));
        const admin = getAdminConfig();
        if (admin.ai.extraction) try {
          patch(key, { stage: "Q AI reading the invoice" });
          const image = await fileToAiImage(f, out);
          const ai = await runExtract({ data: { fileName: f.name, text: out.text.slice(0, 38000), image } });
          out = mergeAi(out, ai, ref.current.vendors);
        } catch (e) {
          out = { ...out, parseNote: `${out.parseNote} (AI reading unavailable: ${e instanceof Error ? e.message : "error"})` };
        }
        const s = ref.current;
        const pool = [...added, ...s.invoices];
        const sameFile = pool.find((x) => x.fileHash && x.fileHash === out.fileHash);
        const invNo = out.fields.find((x) => x.key === "invoiceNumber")?.value;
        const vendor = out.fields.find((x) => x.key === "vendorName")?.value;
        const sameNumber = invNo && vendor ? pool.find((x) => x.invoiceNumber === invNo && x.vendorName === vendor && x.approvalStatus !== "Rejected") : undefined;
        if (admin.duplicate.blockExact && (sameFile || sameNumber)) {
          const reason = sameFile
            ? `Exact duplicate — this file was already captured as ${sameFile.id}.`
            : `Exact duplicate — invoice ${invNo} from ${vendor} already exists as ${sameNumber!.id}.`;
          patch(key, { status: "blocked", stage: "Blocked", extraction: out, blockedReason: reason });
          s.pushNotification({ severity: "High", title: "Duplicate upload blocked", body: `${f.name}: ${reason}`, link: "/duplicates" });
          results.push({ id: key, fileName: f.name, status: "blocked", stage: "Blocked", extraction: out, blockedReason: reason });
          continue;
        }
        patch(key, { stage: "Retrieving PO / GRN from ERP and matching" });
        const id = newId();
        const inv = fieldsToInvoice(out, id, source);
        void saveOriginal(id, f).catch(() => undefined);
        previewRegistry.set(id, { url: out.previewUrl, kind: out.previewKind, pages: out.pageInfo });
        const outcome = processInvoice(inv, {
          pos: s.pos,
          grns: s.grns,
          invoices: pool,
          vendors: s.vendors,
          tolerances: s.tolerances,
          learnings: s.learnings,
        });
        s.ingest(outcome);
        s.setActiveInvoiceId(id);
        added.push(outcome.invoice);
        const done: ProcessedItem = { id: key, fileName: f.name, status: "done", stage: outcome.decision, extraction: out, outcome };
        patch(key, done);
        results.push(done);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        patch(key, { status: "error", stage: `Failed: ${msg}` });
        results.push({ id: key, fileName: f.name, status: "error", stage: msg });
      }
    }
    setBusy(false);
    return results;
  }, []);

  /** Re-run matching after a human correction, using the corrected values. */
  const reprocess = useCallback((id: string, actor = "AP Processor") => {
    const s = ref.current;
    const inv = s.invoices.find((x) => x.id === id);
    if (!inv) return null;
    const reset: Invoice = {
      ...inv,
      exceptionType: null,
      lifecycle: "Extracted",
      approvalStatus: "Pending",
      erpStatus: "Not Posted",
      paymentStatus: "Not Due",
      audit: [...inv.audit, { id: `${id}-rr${Date.now()}`, ts: new Date().toISOString(), actor, actorType: "Human", action: "Re-ran validation and matching with corrected values" }],
    };
    const outcome = processInvoice(reset, {
      pos: s.pos,
      grns: s.grns,
      invoices: s.invoices.filter((x) => x.id !== id),
      vendors: s.vendors,
      tolerances: s.tolerances,
      learnings: s.learnings,
    });
    s.ingest(outcome);
    return outcome;
  }, []);

  return { items, busy, processFiles, reprocess, clear: () => setItems([]) };
}

export async function fetchAsFile(url: string, name: string) {
  const r = await fetch(url);
  const b = await r.blob();
  return new File([b], name, { type: b.type });
}
