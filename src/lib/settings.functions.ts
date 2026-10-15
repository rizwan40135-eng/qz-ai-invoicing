import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Shared workspace configuration — one record for every user. */
export const loadWorkspaceSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_settings").select("config, updated_by, updated_at").eq("id", "workspace").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { config: JSON.stringify(data.config), updatedBy: data.updated_by, updatedAt: data.updated_at } : null;
});

export const saveWorkspaceSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ config: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("@/lib/auth.server");
    const user = await getSessionUser();
    if (!user) throw new Error("Sign in to change workspace settings.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from("app_settings").upsert({ id: "workspace", config: data.config as never, updated_by: user.displayName ?? user.email ?? user.userId, updated_at: updatedAt });
    if (error) throw new Error(error.message);
    return { updatedAt };
  });
