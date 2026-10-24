/**
 * POST /api/d4sign/webhook — a D4Sign avisa quando um contrato muda (ex: assinado).
 * O aviso não traz token, então nunca confiamos no conteúdo: ele só serve para o HELPER
 * consultar a D4Sign (com as nossas chaves) e gravar a situação real do documento.
 */
import { adminDb, json } from '../_lib/server.js';
import { syncContract } from '../_lib/contracts.js';

type Env = Record<string, string | undefined>;

export async function handleD4SignWebhook(uuid: string, env: Env) {
  if (!/^[0-9a-f-]{20,60}$/i.test(uuid)) return { status: 200, body: { received: true, processed: false } };
  const db = adminDb(env);
  const { data: sale } = await db.from('sales').select('id').eq('contract_uuid', uuid).maybeSingle();
  if (!sale) return { status: 200, body: { received: true, processed: false } };
  try {
    await syncContract(db, env, sale.id);
  } catch (err) {
    console.error(`D4Sign webhook: falha ao conferir ${uuid}:`, err);
  }
  return { status: 200, body: { received: true, processed: true } };
}

// Vercel Function (Node.js runtime, Web API). A D4Sign envia como formulário (uuid, type_post, message).
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text().catch(() => '');
  let uuid = '';
  try {
    uuid = String((JSON.parse(raw) as { uuid?: unknown }).uuid ?? '');
  } catch {
    uuid = new URLSearchParams(raw).get('uuid') ?? '';
  }
  try {
    const result = await handleD4SignWebhook(uuid.trim(), process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('D4Sign webhook crashed:', err);
    return json({ received: true }, 200);
  }
}
