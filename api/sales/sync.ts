/**
 * POST /api/sales/sync — confere no Asaas a situação de uma proposta (botão "Atualizar").
 * Body: { saleId }
 * Normalmente o webhook já atualiza sozinho; isto cobre um aviso que se perdeu.
 */
import { AsaasError, asaasClient } from '../_lib/asaas.js';
import { adminDb, json, teamRoleFromRequest } from '../_lib/server.js';
import { syncSale } from '../_lib/salesSync.js';

type Env = Record<string, string | undefined>;
const fail = (status: number, error: string) => ({ status, body: { error } as Record<string, unknown> });

export async function handleSyncSale(authorization: string | null, input: unknown, env: Env) {
  const db = adminDb(env);
  if (!(await teamRoleFromRequest(db, authorization))) return fail(401, 'Sessão expirada. Entre novamente no HELPER.');

  const saleId = typeof (input as { saleId?: unknown })?.saleId === 'string' ? (input as { saleId: string }).saleId : '';
  if (!saleId) return fail(400, 'Requisição inválida.');

  try {
    await syncSale(db, asaasClient(env), saleId);
  } catch (err) {
    console.error('sync sale failed:', err);
    return fail(502, `Não foi possível consultar o Asaas: ${err instanceof AsaasError ? err.message : 'erro inesperado'}`);
  }
  return { status: 200, body: { ok: true } as Record<string, unknown> };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  try {
    const result = await handleSyncSale(request.headers.get('authorization'), input, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('sync sale crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
