/**
 * POST /api/asaas/webhook — avisos de cobrança do Asaas (webhook "HELPER" na conta).
 *
 * O Asaas manda para cá TODAS as cobranças da conta, não só as da Imersão. Cada aviso precisa
 * responder 200 rápido: se várias respostas seguidas falharem, o Asaas interrompe a fila.
 *   ASAAS_WEBHOOK_TOKEN  token cadastrado no webhook (o Asaas envia no cabeçalho asaas-access-token)
 *
 * Por enquanto só confirma o recebimento. As vendas do HELPER (fase 2) vão ser reconhecidas
 * pelo externalReference das cobranças que o próprio HELPER criar.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

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

  const { event } = (input ?? {}) as { event?: unknown };
  if (typeof event !== 'string') {
    return { status: 400, body: { error: 'Aviso inválido' } };
  }

  return { status: 200, body: { received: true, processed: false } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  const result = await handleAsaasWebhook(request.headers.get('asaas-access-token'), input, process.env);
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
