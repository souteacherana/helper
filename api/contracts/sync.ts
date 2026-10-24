/**
 * POST /api/contracts/sync — confere na D4Sign se o contrato da venda foi assinado (botão "Atualizar").
 * Body: { saleId }
 */
import { D4SignError } from '../_lib/d4sign.js';
import { adminDb, json, teamRoleFromRequest } from '../_lib/server.js';
import { syncContract } from '../_lib/contracts.js';

type Env = Record<string, string | undefined>;

export async function handleSyncContract(authorization: string | null, input: unknown, env: Env) {
  const db = adminDb(env);
  if (!(await teamRoleFromRequest(db, authorization))) return { status: 401, body: { error: 'Sessão expirada. Entre novamente no HELPER.' } };
  const saleId = typeof (input as { saleId?: unknown })?.saleId === 'string' ? (input as { saleId: string }).saleId : '';
  if (!saleId) return { status: 400, body: { error: 'Requisição inválida.' } };
  try {
    await syncContract(db, env, saleId);
  } catch (err) {
    console.error('sync contract failed:', err);
    return { status: 502, body: { error: `Não foi possível consultar a D4Sign${err instanceof D4SignError ? `: ${err.message}` : '.'}` } };
  }
  return { status: 200, body: { ok: true } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  try {
    const result = await handleSyncContract(request.headers.get('authorization'), input, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('sync contract crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
