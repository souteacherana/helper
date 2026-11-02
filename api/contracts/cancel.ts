/**
 * POST /api/contracts/cancel — cancela na D4Sign o contrato de uma venda (só admin).
 * Body: { saleId, reason? }. A venda e as cobranças no Asaas continuam como estão.
 */
import { D4SignError } from '../_lib/d4sign.js';
import { adminDb, json, teamRoleFromRequest } from '../_lib/server.js';
import { cancelContract } from '../_lib/contracts.js';

type Env = Record<string, string | undefined>;

export async function handleCancelContract(authorization: string | null, input: unknown, env: Env) {
  const db = adminDb(env);
  if ((await teamRoleFromRequest(db, authorization)) !== 'ADMIN') return { status: 403, body: { error: 'Só o admin pode cancelar contratos.' } };
  const body = (input ?? {}) as { saleId?: unknown; reason?: unknown };
  const saleId = typeof body.saleId === 'string' ? body.saleId : '';
  if (!saleId) return { status: 400, body: { error: 'Requisição inválida.' } };
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : 'Contrato cancelado pela equipe da Imersão Rise';
  try {
    const result = await cancelContract(db, env, saleId, reason);
    return result.error ? { status: 409, body: { error: result.error } } : { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('cancel contract failed:', err);
    return { status: 502, body: { error: `Não foi possível cancelar na D4Sign${err instanceof D4SignError ? `: ${err.message}` : '.'}` } };
  }
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  try {
    const result = await handleCancelContract(request.headers.get('authorization'), input, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('cancel contract crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
