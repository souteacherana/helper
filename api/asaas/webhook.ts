/**
 * POST /api/asaas/webhook — avisos de cobrança do Asaas (webhook "HELPER" na conta).
 *
 * O Asaas manda para cá TODAS as cobranças da conta, não só as da Imersão. Cada aviso precisa
 * responder 200 rápido: se várias respostas seguidas falharem, o Asaas interrompe a fila.
 *   ASAAS_WEBHOOK_TOKEN  token cadastrado no webhook (o Asaas envia no cabeçalho asaas-access-token)
 *
 * As cobranças do HELPER são reconhecidas pelo externalReference ("helper:<venda>:<parte>");
 * as outras da conta são só confirmadas. Se a atualização falhar (ex: Asaas fora do ar), responde
 * 200 mesmo assim para não travar a fila; o botão "Atualizar" da proposta confere de novo.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { asaasClient } from '../_lib/asaas.js';
import { generateContract, needsContract } from '../_lib/contracts.js';
import { adminDb } from '../_lib/server.js';
import { syncSalePart } from '../_lib/salesSync.js';
import { parseReference } from '../../src/lib/sales.js';

type Env = Record<string, string | undefined>;

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function sameToken(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function handleAsaasWebhook(token: string | null, input: unknown, env: Env): Promise<WebhookResult> {
  const expected = env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) {
    // Sem o token configurado no servidor ainda: confirma sem processar nada, para não interromper a fila
    console.warn('Asaas webhook: ASAAS_WEBHOOK_TOKEN não configurado; aviso ignorado.');
    return { status: 200, body: { received: true, processed: false } };
  }
  if (!token || !sameToken(token.trim(), expected)) {
    return { status: 401, body: { error: 'Não autorizado' } };
  }

  const { event, payment } = (input ?? {}) as { event?: unknown; payment?: { externalReference?: unknown } };
  if (typeof event !== 'string') {
    return { status: 400, body: { error: 'Aviso inválido' } };
  }

  const ref = parseReference(payment?.externalReference);
  if (!ref) return { status: 200, body: { received: true, processed: false } };

  try {
    const db = adminDb(env);
    await syncSalePart(db, asaasClient(env), ref.saleId, ref.position);
    // Entrada paga: o contrato é gerado e enviado em segundo plano (a resposta ao Asaas não espera)
    if (await needsContract(db, ref.saleId)) {
      waitUntil(generateContract(db, env, ref.saleId).catch(e => console.error('contrato automático falhou:', e)));
    }
  } catch (err) {
    console.error(`Asaas webhook: falha ao atualizar ${ref.saleId}/${ref.position} (${event}):`, err);
    return { status: 200, body: { received: true, processed: false } };
  }
  return { status: 200, body: { received: true, processed: true } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  const result = await handleAsaasWebhook(request.headers.get('asaas-access-token'), input, process.env);
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
