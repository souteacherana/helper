/**
 * POST /api/contracts/create — gera e envia o contrato de uma venda com entrada paga.
 * Body: { saleId }. Normalmente roda sozinho quando a entrada é paga; isto é o "tentar de novo".
 */
import { adminDb, json, teamRoleFromRequest } from '../_lib/server.js';
import { generateContract } from '../_lib/contracts.js';

type Env = Record<string, string | undefined>;

export async function handleCreateContract(authorization: string | null, input: unknown, env: Env) {
  const db = adminDb(env);
  if (!(await teamRoleFromRequest(db, authorization))) return { status: 401, body: { error: 'Sessão expirada. Entre novamente no HELPER.' } };
  const saleId = typeof (input as { saleId?: unknown })?.saleId === 'string' ? (input as { saleId: string }).saleId : '';
  if (!saleId) return { status: 400, body: { error: 'Requisição inválida.' } };
  const result = await generateContract(db, env, saleId);
  return result.error ? { status: 409, body: { error: result.error } } : { status: 200, body: { ok: true } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  try {
    const result = await handleCreateContract(request.headers.get('authorization'), input, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('create contract crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
