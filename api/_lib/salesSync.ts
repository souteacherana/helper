/**
 * Atualiza a situação das vendas a partir do estado real no Asaas (não do conteúdo do aviso):
 * repetir ou receber avisos fora de ordem dá sempre o mesmo resultado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AsaasClient } from './asaas.js';
import {
  buildReference,
  partStatusFromPayments,
  saleStatusFromParts,
  type PartStatus,
  type SaleStatus
} from '../../src/lib/sales.js';

/** Recalcula a situação da venda a partir das partes gravadas no banco. */
export async function refreshSaleStatus(db: SupabaseClient, saleId: string): Promise<SaleStatus | null> {
  const [{ data: sale }, { data: parts }] = await Promise.all([
    db.from('sales').select('status, entry_paid_at, paid_at').eq('id', saleId).maybeSingle(),
    db.from('sale_parts').select('position, status, paid_installments').eq('sale_id', saleId)
  ]);
  if (!sale || !parts) return null;

  const next = saleStatusFromParts(
    sale.status as SaleStatus,
    parts.map(p => ({ position: p.position, status: p.status as PartStatus, paidInstallments: p.paid_installments }))
  );
  if (next === sale.status) return next;

  const now = new Date().toISOString();
  await db
    .from('sales')
    .update({
      status: next,
      entry_paid_at: sale.entry_paid_at ?? (next === 'ENTRY_PAID' || next === 'PAID' ? now : null),
      paid_at: next === 'PAID' ? sale.paid_at ?? now : null,
      updated_at: now
    })
    .eq('id', saleId);
  return next;
}

/** Busca no Asaas as cobranças de uma parte, grava a situação dela e recalcula a venda. */
export async function syncSalePart(db: SupabaseClient, asaas: AsaasClient, saleId: string, position: number): Promise<void> {
  const { data: part } = await db
    .from('sale_parts')
    .select('status, paid_at')
    .eq('sale_id', saleId)
    .eq('position', position)
    .maybeSingle();
  if (!part) return;

  const payments = await asaas.listPaymentsByReference(buildReference(saleId, position));
  const { status, paidInstallments } = partStatusFromPayments(payments);
  const now = new Date().toISOString();
  await db
    .from('sale_parts')
    .update({
      status,
      paid_installments: paidInstallments,
      paid_at: status === 'PAID' ? part.paid_at ?? now : null,
      updated_at: now
    })
    .eq('sale_id', saleId)
    .eq('position', position);

  await refreshSaleStatus(db, saleId);
}

/** Sincroniza todas as partes de uma venda (botão "Atualizar" da tela). */
export async function syncSale(db: SupabaseClient, asaas: AsaasClient, saleId: string): Promise<void> {
  const { data: parts } = await db.from('sale_parts').select('position').eq('sale_id', saleId);
  for (const p of parts ?? []) await syncSalePart(db, asaas, saleId, p.position);
}
