/**
 * Contrato da venda: preenche o modelo .docx do produto (offers.contract_template_url), sobe no
 * cofre do evento na D4Sign, cadastra o cliente como signatário e envia. A Ana e as testemunhas
 * já vêm pré-assinadas no modelo (imagens), então só o cliente assina.
 * Dispara sozinho quando a entrada é paga; o botão da tela serve para tentar de novo.
 */
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { D4_STATUS, D4SignError, d4signClient } from './d4sign.js';
import { BLANK, contractFields } from './contractFields.js';
import { toCents, type PartDraft, type PayMethod } from '../../src/lib/sales.js';

type Env = Record<string, string | undefined>;

const escapeXml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Troca os campos [[...]] do modelo; campo sem valor vira lacuna, como no contrato em branco */
export async function fillTemplate(template: ArrayBuffer | Uint8Array, fields: Record<string, string>): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('Modelo de contrato inválido (sem word/document.xml).');
  const xml = (await doc.async('string')).replace(/\[\[([A-Z0-9_]+)\]\]/g, (_, key: string) => escapeXml(fields[key] ?? BLANK));
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array' });
}

const siteUrl = (env: Env) => (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || 'https://helper-tau-six.vercel.app').replace(/\/+$/, '');

async function fail(db: SupabaseClient, saleId: string, message: string) {
  await db.from('sales').update({ contract_status: 'FAILED', contract_error: message, updated_at: new Date().toISOString() }).eq('id', saleId);
  return { error: message };
}

/** Gera e envia o contrato. Só uma execução por venda (a trava é o update condicional). */
export async function generateContract(db: SupabaseClient, env: Env, saleId: string): Promise<{ ok?: true; error?: string }> {
  const { data: claimed } = await db
    .from('sales')
    .update({ contract_status: 'CREATING', contract_error: null, updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .in('status', ['ENTRY_PAID', 'PAID'])
    .in('contract_status', ['NONE', 'FAILED'])
    .select('id, attendee_id, offer_id, offer_name, total_value, contract_uuid');
  const sale = claimed?.[0];
  if (!sale) {
    const { data: current } = await db.from('sales').select('status, contract_status').eq('id', saleId).maybeSingle();
    if (!current) return { error: 'Venda não encontrada.' };
    if (current.contract_status === 'SENT' || current.contract_status === 'SIGNED') return { ok: true };
    if (current.contract_status === 'CREATING') return { error: 'O contrato já está sendo gerado.' };
    return { error: 'O contrato só é gerado depois que a entrada é paga.' };
  }

  try {
    const d4 = d4signClient(env);
    // Tentativa anterior que falhou no meio: cancela o documento incompleto antes de criar outro
    if (sale.contract_uuid) {
      await d4.cancel(sale.contract_uuid, 'Substituído por nova geração do contrato').catch(() => undefined);
    }

    const [{ data: offer }, { data: parts }, { data: attendee }, { data: profile }] = await Promise.all([
      db.from('offers').select('name, contract_template_url').eq('id', sale.offer_id).maybeSingle(),
      db.from('sale_parts').select('position, method, amount, installments, due_date').eq('sale_id', saleId).order('position'),
      db.from('attendees').select('name, phone').eq('id', sale.attendee_id).maybeSingle(),
      db.from('billing_profiles').select('*').eq('attendee_id', sale.attendee_id).maybeSingle()
    ]);
    if (!offer?.contract_template_url) return fail(db, saleId, `${sale.offer_name}: modelo de contrato não configurado.`);
    if (!profile?.email) return fail(db, saleId, 'Ficha de cobrança sem e-mail: a D4Sign envia o contrato por e-mail.');

    const res = await fetch(offer.contract_template_url);
    if (!res.ok) return fail(db, saleId, `Não foi possível baixar o modelo de contrato (${res.status}).`);
    const template = new Uint8Array(await res.arrayBuffer());

    const name = (profile.full_name || attendee?.name || '').trim();
    const drafts: PartDraft[] = (parts ?? []).map(p => ({
      method: p.method as PayMethod,
      amountCents: toCents(p.amount),
      installments: p.installments,
      dueDate: p.due_date
    }));
    const fields = contractFields(
      sale.offer_id,
      toCents(sale.total_value),
      drafts,
      { name, rg: profile.rg || '', cpf: profile.cpf || '', email: profile.email, phone: profile.phone || attendee?.phone || '' },
      new Date()
    );
    const file = await fillTemplate(template, fields);

    const uuid = await d4.uploadDocx(`${sale.offer_name} - ${name}`, file);
    await db.from('sales').update({ contract_uuid: uuid }).eq('id', saleId);
    await d4.waitProcessed(uuid);
    await d4.addSigner(uuid, profile.email.trim());
    await d4.addWebhook(uuid, `${siteUrl(env)}/api/d4sign/webhook`);
    await d4.send(uuid, `Olá, ${name.split(' ')[0]}! Segue o contrato da ${sale.offer_name}, fechado na Imersão Rise 2026, para a sua assinatura.`);

    await db
      .from('sales')
      .update({ contract_status: 'SENT', contract_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', saleId);
    return { ok: true };
  } catch (err) {
    console.error(`contract ${saleId} failed:`, err);
    return fail(db, saleId, err instanceof D4SignError ? `D4Sign: ${err.message}` : 'Erro inesperado ao gerar o contrato.');
  }
}

/** Confere na D4Sign se o contrato foi assinado ou cancelado. */
export async function syncContract(db: SupabaseClient, env: Env, saleId: string): Promise<void> {
  const { data: sale } = await db.from('sales').select('contract_uuid, contract_status').eq('id', saleId).maybeSingle();
  if (!sale?.contract_uuid || sale.contract_status === 'SIGNED') return;
  const status = await d4signClient(env).status(sale.contract_uuid);
  const now = new Date().toISOString();
  if (status === D4_STATUS.FINISHED) {
    await db.from('sales').update({ contract_status: 'SIGNED', contract_signed_at: now, updated_at: now }).eq('id', saleId);
  } else if (status === D4_STATUS.CANCELLED) {
    await db.from('sales').update({ contract_status: 'CANCELLED', updated_at: now }).eq('id', saleId);
  }
}

/** Venda com entrada paga e sem contrato ainda? (para disparar a geração sozinha) */
export async function needsContract(db: SupabaseClient, saleId: string): Promise<boolean> {
  const { data } = await db.from('sales').select('status, contract_status').eq('id', saleId).maybeSingle();
  return Boolean(data && (data.status === 'ENTRY_PAID' || data.status === 'PAID') && data.contract_status === 'NONE');
}
