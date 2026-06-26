// Cross-app read — đọc READ-ONLY data của 1 mini-app KHÁC trong cùng workspace.
//
// Model (superapp mig 056):
// - KHÔNG có tường app↔app ở RLS: member của workspace vốn đã đọc được mọi
//   schema app_* của ws đó (can_access_app_data nhánh "member trực tiếp",
//   mig 049). Cross-app read chỉ gồm 3 phần:
//     (a) CONSUMER reach sang schema PRODUCER  → appReader('producer-slug')
//     (b) PRODUCER publish read-only VIEW chỉ cột muốn chia sẻ (migration của
//         producer), gated bằng `where public.is_cross_app_open(workspace_id)`
//     (c) WORKSPACE bật toggle cross_app_read  → setCrossAppRead({ enabled:true })
//   Ws chưa bật toggle → view trả 0 row. Tắt toggle → mất quyền đọc tức thì.
//
// - Đây là tầng GOVERNANCE / HỢP ĐỒNG read-only, KHÔNG phải hard-wall (xem
//   threat model trong mig 056). Dùng cho hệ internal trust.
//
// ────────────────────────────────────────────────────────────────────
// CONSUMER (app đọc data app khác):
//
//   import { appReader } from './lib/cross-app.js';
//   import { useActiveScope } from './lib/sharing.js';
//
//   const scope = useActiveScope();
//   const { data, error } = await appReader('inventory')
//     .from('shared_items')                    // VIEW producer publish
//     .select('id, name, qty')
//     .eq('workspace_id', scope.workspaceId);  // LUÔN scope theo active ws
//
// PRODUCER (app cho app khác đọc) — viết trong migration của mình:
//
//   create or replace view app_inventory.shared_items
//   with (security_invoker = true) as
//   select id, workspace_id, name, qty, updated_at
//   from app_inventory.items
//   where public.is_cross_app_open(workspace_id);
//   grant select on app_inventory.shared_items to authenticated;
//
// ADMIN (owner/admin của ws bật/tắt cho cả workspace):
//
//   await setCrossAppRead({ enabled: true });   // bật cho ctx.workspaceId
//   const open = await isCrossAppOpen();         // check trạng thái
// ────────────────────────────────────────────────────────────────────

import { getSupabase, getPublicSupabase, appSchema } from './supabase.js';
import { getContext } from './context.js';
import { useEffect, useState } from 'react';

// ╔════════════════════════════════════════════════════════════════╗
// ║ Consumer — đọc schema của app producer                          ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Trả về query interface scoped vào schema của 1 mini-app KHÁC (env-aware:
 * tự thêm `_dev` ở preview/dev). Dùng token hiện tại → RLS member-branch áp.
 *
 * ⚠️ CHỈ đọc qua VIEW mà producer publish (vd 'shared_items'), KHÔNG query
 * thẳng base table — base table không phải hợp đồng ổn định + không gated
 * bởi toggle. Và LUÔN `.eq('workspace_id', scope.workspaceId)` (cùng quy tắc
 * scoping như query app của mình — RLS không chặn cross-workspace của cùng user).
 *
 * @param {string} producerSlug - slug của mini-app nguồn (vd 'inventory')
 * @returns {import('@supabase/supabase-js').SupabaseClient['schema']}
 *   PostgREST builder: gọi tiếp `.from('view').select(...).eq(...)`.
 *
 * @example
 *   const { data } = await appReader('inventory')
 *     .from('shared_items').select('*').eq('workspace_id', wsId);
 */
export function appReader(producerSlug) {
  if (!producerSlug) throw new Error('appReader: producerSlug required');
  return getSupabase().schema(appSchema(producerSlug));
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Toggle — bật/tắt cross-app read cho cả workspace (owner/admin)   ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Trạng thái cross-app read của 1 ws (mọi member đọc được qua RLS).
 * @param {{ workspaceId?: string }} [opts] - default ctx.workspaceId
 * @returns {Promise<boolean>}
 */
export async function isCrossAppOpen({ workspaceId } = {}) {
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('is_cross_app_open', { p_workspace_id: wsId });
  if (error) throw new Error('isCrossAppOpen: ' + error.message);
  return data === true;
}

/**
 * Bật/tắt cross-app read cho ws (owner/admin only — gate ở RPC).
 * @param {{ workspaceId?: string, enabled: boolean }} args
 *   workspaceId default = ctx.workspaceId.
 * @returns {Promise<boolean>} trạng thái sau khi set
 */
export async function setCrossAppRead({ workspaceId, enabled } = {}) {
  if (typeof enabled !== 'boolean') throw new Error('setCrossAppRead: enabled (boolean) required');
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('set_cross_app_read', {
    p_workspace_id: wsId,
    p_enabled: enabled,
  });
  if (error) throw new Error('setCrossAppRead: ' + error.message);
  return data === true;
}

/**
 * React hook: trạng thái cross-app read của ws + setter. Re-fetch khi refresh().
 *
 * @param {string} [workspaceId] - default ctx.workspaceId
 * @returns {{ open: boolean, loading: boolean, error: Error|null,
 *             setOpen: (v: boolean) => Promise<void>, refresh: () => void }}
 */
export function useCrossAppOpen(workspaceId) {
  const [open, setOpenState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    isCrossAppOpen({ workspaceId })
      .then((v) => { if (!cancelled) { setOpenState(v); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, version]);

  const setOpen = async (v) => {
    const next = await setCrossAppRead({ workspaceId, enabled: v });
    setOpenState(next);
  };

  return { open, loading, error, setOpen, refresh: () => setVersion((x) => x + 1) };
}
