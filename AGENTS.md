<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- All AI features call Lovable AI through server functions in src/lib/ai.functions.ts (helpers in ai.server.ts); browser code never holds keys — keeps credentials server-side.
- Admin settings live in src/lib/adminConfig.ts (localStorage store read via getAdminConfig/useAdminConfig); connector secrets are referenced by vault name only, never stored in the browser.
- Admin settings are one shared workspace record (app_settings, id "workspace") read/written via src/lib/settings.functions.ts; localStorage is only a cache — so every user sees the same configuration.
- Settings writes require a signed-in workspace identity (getSessionUser) — prevents anonymous changes.
- UI never shows the platform vendor name; the assistant is branded "Q AI".
- Original uploaded invoice files are kept in browser IndexedDB (src/lib/fileVault.ts) keyed by invoice id; records without a file render a copy from captured data — avoids bloating localStorage.
- User-added/edited POs and GRNs persist as an overlay (localStorage "qap-erp-records-v1") merged over synced ERP records via store.savePo/saveGrn — matching always reads the merged set.
- Per-invoice tolerances come from pipeline.tolerancesFor(): workspace defaults → business-unit rule (adminConfig.buRules) → overrides (BU → category → transaction type → supplier); keeps every matching path on one rule set.
- Escalation ladders use components/qap/Escalation.tsx (approvalChain + AP Manager → Finance Controller, SLA stages from Settings percentages) — shared by Exception Center and Vendor Hub.
