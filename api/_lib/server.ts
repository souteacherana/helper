/**
 * Peças comuns das rotas /api: cliente do Supabase com a service key (ignora a RLS, então
 * só roda no servidor) e verificação da sessão de quem chamou.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Env = Record<string, string | undefined>;
export type TeamRole = 'CLOSER' | 'ADMIN';

export function adminDb(env: Env): SupabaseClient {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Perfil da equipe dono do token "Authorization: Bearer ...", ou null se não for closer/admin. */
export async function teamRoleFromRequest(db: SupabaseClient, authorization: string | null): Promise<TeamRole | null> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const role = data.user.app_metadata?.app_role;
  return role === 'CLOSER' || role === 'ADMIN' ? role : null;
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
