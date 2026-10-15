import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError, type ModelMessage } from "ai";
import type { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY = "https://ai.gateway.lovable.dev";
export const AI_MODEL = "openai/gpt-6-astra";

/** Streams a structured response through Lovable AI and returns the parsed object. */
export async function aiObject<T>(schema: z.ZodType<T>, system: string, messages: ModelMessage[]): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured (missing key)");
  const runIdFetch = createLovableAiGatewayRunIdFetch(undefined);
  const provider = createOpenAI({
    baseURL: `${GATEWAY}/v1`,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(AI_MODEL),
    system,
    messages,
    output: Output.object({ schema }),
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  try {
    await result.consumeStream();
    return (await result.output) as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e) && e.text) {
      const m = e.text.match(/\{[\s\S]*\}/);
      if (m) return schema.parse(JSON.parse(m[0]));
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/402/.test(msg)) throw new Error("AI credits exhausted — add credits in workspace billing.");
    if (/429/.test(msg)) throw new Error("AI rate limit reached — try again shortly.");
    throw new Error(`AI request failed: ${msg}`);
  }
}
