/**
 * POST /api/sales/cancel — cancela uma proposta ainda não paga e remove as cobranças no Asaas.
 * Body: { saleId }
 * Se qualquer parte já tiver pagamento (conferido no Asaas, não só no banco), recusa:
 * estorno é com o financeiro, direto no Asaas.
 */
import { AsaasError, asaasClient } from '../_lib/asaas.js';
import { adminDb, json, teamRoleFromRequest } from '../_lib/server.js';
import { buildReference, partStatusFromPayments } from '../../src/lib/sales.js';

type Env = Record<string, string | undefined>;
const fail = (status: number, error: string) => ({ status, body: { error } as Record<string, unknown> });

export async function handleCancelSale(authorization: string | null, input: unknown, env: Env) {
  const db = adminDb(env);
  if (!(await teamRoleFromRequest(db, authorization))) return fail(401, 'Sessão expirada. Entre novamente no HELPER.');

  const saleId = typeof (input as { saleId?: unknown })?.saleId === 'string' ? (input as { saleId: string }).saleId : '';
  if (!saleId) return fail(400, 'Requisição inválida.');

  const [{ data: sale }, { data: parts }] = await Promise.all([
    db.from('sales').select('id, status').eq('id', saleId).maybeSingle(),
    db.from('sale_parts').select('position, asaas_payment_id, asaas_installment_id').eq('sale_id', saleId)
  ]);
  if (!sale) return fail(404, 'Proposta não encontrada.');
  if (sale.status === 'CANCELLED') return { status: 200, body: { ok: true } as Record<string, unknown> };

  try {
    const asaas = asaasClient(env);
    for (const p of parts ?? []) {
      const payments = await asaas.listPaymentsByReference(buildReference(saleId, p.position));
      if (partStatusFromPayments(payments).paidInstallments > 0) {
        return fail(409, 'Esta proposta já tem pagamento. Cancelamento ou estorno só pelo financeiro, no Asaas.');
      }
    }
    for (const p of parts ?? []) {
      if (p.asaas_installment_id) await asaas.remove('installments', p.asaas_installment_id);
      else if (p.asaas_payment_id) await asaas.remove('payments', p.asaas_payment_id);
    }
  } catch (err) {
    console.error('cancel sale failed:', err);
    return fail(502, `Não foi possível cancelar no Asaas: ${err instanceof AsaasError ? err.message : 'erro inesperado'}`);
  }

  const now = new Date().toISOString();
  await db.from('sale_parts').update({ status: 'CANCELLED', updated_at: now }).eq('sale_id', saleId);
  await db.from('sales').update({ status: 'CANCELLED', cancelled_at: now, updated_at: now }).eq('id', saleId);
  return { status: 200, body: { ok: true } as Record<string, unknown> };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  try {
    const result = await handleCancelSale(request.headers.get('authorization'), input, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('cancel sale crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
