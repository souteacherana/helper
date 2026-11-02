/**
 * Contrato da venda: preenche o modelo .docx do produto (offers.contract_template_url), sobe no
 * cofre do evento na D4Sign, cadastra o cliente como signatário e envia. A Ana e as testemunhas
 * já vêm pré-assinadas no modelo (imagens), então só o cliente assina.
 * Dispara sozinho quando a entrada é paga; o botão da tela serve para tentar de novo.
 * Rodízio de chaves: começa pela chave do último contrato enviado e, se ela bater o limite da
 * D4Sign, cancela o documento pela metade e envia tudo de novo pela próxima.
 */
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { D4_STATUS, D4SignError, d4signClient, d4signKeys, isKeyLimitError, keyRotation, onDocument } from './d4sign.js';
import { BLANK, contractFields, contractPhrases } from './contractFields.js';
import { toCents, type PartDraft, type PayMethod } from '../../src/lib/sales.js';

type Env = Record<string, string | undefined>;

const escapeXml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Troca os campos [[...]] do modelo; campo sem valor vira lacuna, como no contrato em branco.
 * phrases: trechos fixos do modelo trocados pelo texto exato (contractPhrases).
 */
export async function fillTemplate(template: ArrayBuffer | Uint8Array, fields: Record<string, string>, phrases: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('Modelo de contrato inválido (sem word/document.xml).');
  let xml = (await doc.async('string')).replace(/\[\[([A-Z0-9_]+)\]\]/g, (_, key: string) => escapeXml(fields[key] ?? BLANK));
  for (const [from, to] of Object.entries(phrases)) xml = xml.split(escapeXml(from)).join(escapeXml(to));
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array' });
}

const siteUrl = (env: Env) => (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || 'https://helper-tau-six.vercel.app').replace(/\/+$/, '');

/** Chave do último contrato enviado: o rodízio continua dela. */
async function lastKey(db: SupabaseClient): Promise<string | undefined> {
  const { data } = await db
    .from('sales')
    .select('*')
    .in('contract_status', ['SENT', 'SIGNED'])
    .order('contract_sent_at', { ascending: false, nullsFirst: false })
    .limit(1);
  return data?.[0]?.contract_key ?? undefined;
}

async function fail(db: SupabaseClient, saleId: string, message: string) {
  await db.from('sales').update({ contract_status: 'FAILED', contract_error: message, updated_at: new Date().toISOString() }).eq('id', saleId);
  return { error: message };
}

/** Gera e envia o contrato. Só uma execução por venda (a trava é o update condicional). */
/**
 * fileUrl: .docx pronto (revisado pela equipe) enviado como está, no lugar do modelo preenchido.
 */
export async function generateContract(db: SupabaseClient, env: Env, saleId: string, fileUrl?: string): Promise<{ ok?: true; error?: string }> {
  const { data: claimed } = await db
    .from('sales')
    .update({ contract_status: 'CREATING', contract_error: null, updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .in('status', ['ENTRY_PAID', 'PAID'])
    .in('contract_status', ['NONE', 'FAILED'])
    // '*': contract_key só existe depois da seção 11 atualizada do SQL
    .select('*');
  const sale = claimed?.[0];
  if (!sale) {
    const { data: current } = await db.from('sales').select('status, contract_status').eq('id', saleId).maybeSingle();
    if (!current) return { error: 'Venda não encontrada.' };
    if (current.contract_status === 'SENT' || current.contract_status === 'SIGNED') return { ok: true };
    if (current.contract_status === 'CREATING') return { error: 'O contrato já está sendo gerado.' };
    return { error: 'O contrato só é gerado depois que a entrada é paga.' };
  }

  try {
    const keys = d4signKeys(env);
    // Tentativa anterior que falhou no meio: cancela o documento incompleto antes de criar outro
    if (sale.contract_uuid) {
      await onDocument(keys, sale.contract_key, d4 => d4.cancel(sale.contract_uuid, 'Substituído por nova geração do contrato')).catch(() => undefined);
    }

    const [{ data: offer }, { data: parts }, { data: attendee }, { data: profile }] = await Promise.all([
      db.from('offers').select('name, contract_template_url').eq('id', sale.offer_id).maybeSingle(),
      db.from('sale_parts').select('position, method, amount, installments, due_date').eq('sale_id', saleId).order('position'),
      db.from('attendees').select('name, phone').eq('id', sale.attendee_id).maybeSingle(),
      db.from('billing_profiles').select('*').eq('attendee_id', sale.attendee_id).maybeSingle()
    ]);
    if (!fileUrl && !offer?.contract_template_url) return fail(db, saleId, `${sale.offer_name}: modelo de contrato não configurado.`);
    if (!profile?.email) return fail(db, saleId, 'Ficha de cobrança sem e-mail: a D4Sign envia o contrato por e-mail.');

    const res = await fetch(fileUrl ?? offer!.contract_template_url);
    if (!res.ok) return fail(db, saleId, `Não foi possível baixar o ${fileUrl ? 'arquivo do contrato' : 'modelo de contrato'} (${res.status}).`);
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
    const file = fileUrl ? template : await fillTemplate(template, fields, contractPhrases(toCents(sale.total_value), drafts));

    let limitError: D4SignError | undefined;
    for (const key of keyRotation(keys, await lastKey(db))) {
      const d4 = d4signClient(key);
      let uuid = '';
      try {
        uuid = await d4.uploadDocx(`${sale.offer_name} - ${name}`, file);
        await db.from('sales').update({ contract_uuid: uuid }).eq('id', saleId);
        // Separado: se a coluna ainda não existir no banco, o uuid fica salvo do mesmo jeito
        await db.from('sales').update({ contract_key: key.id }).eq('id', saleId);
        await d4.waitProcessed(uuid);
        await d4.addSigner(uuid, profile.email.trim());
        await d4.addWebhook(uuid, `${siteUrl(env)}/api/d4sign/webhook`);
        await d4.send(uuid, `Olá, ${name.split(' ')[0]}! Segue o contrato da ${sale.offer_name}, fechado na Imersão Rise 2026, para a sua assinatura.`);
      } catch (err) {
        if (!isKeyLimitError(err)) throw err;
        console.warn(`contract ${saleId}: chave D4Sign ${key.id} no limite (${err.message}), tentando a próxima`);
        limitError = err;
        if (uuid) await d4.cancel(uuid, 'Limite da chave da API: contrato enviado de novo por outra chave').catch(() => undefined);
        continue;
      }

      await db
        .from('sales')
        .update({ contract_status: 'SENT', contract_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', saleId);
      return { ok: true };
    }
    return fail(db, saleId, `D4Sign: ${keys.length > 1 ? `as ${keys.length} chaves atingiram o limite` : 'a chave atingiu o limite'} (${limitError?.message}).`);
  } catch (err) {
    console.error(`contract ${saleId} failed:`, err);
    return fail(db, saleId, err instanceof D4SignError ? `D4Sign: ${err.message}` : 'Erro inesperado ao gerar o contrato.');
  }
}

/** Confere na D4Sign se o contrato foi assinado ou cancelado. */
export async function syncContract(db: SupabaseClient, env: Env, saleId: string): Promise<void> {
  const { data: sale } = await db.from('sales').select('*').eq('id', saleId).maybeSingle();
  if (!sale?.contract_uuid || sale.contract_status === 'SIGNED') return;
  const status = await onDocument(d4signKeys(env), sale.contract_key, d4 => d4.status(sale.contract_uuid));
  const now = new Date().toISOString();
  if (status === D4_STATUS.FINISHED) {
    await db.from('sales').update({ contract_status: 'SIGNED', contract_signed_at: now, updated_at: now }).eq('id', saleId);
  } else if (status === D4_STATUS.CANCELLED) {
    await db.from('sales').update({ contract_status: 'CANCELLED', updated_at: now }).eq('id', saleId);
  }
}

/** Cancela na D4Sign o contrato enviado e ainda não assinado (a venda e as cobranças não mudam). */
export async function cancelContract(db: SupabaseClient, env: Env, saleId: string, reason: string): Promise<{ ok?: true; error?: string }> {
  const { data: sale } = await db.from('sales').select('*').eq('id', saleId).maybeSingle();
  if (!sale?.contract_uuid) return { error: 'Esta venda não tem contrato na D4Sign.' };
  if (sale.contract_status === 'SIGNED') return { error: 'O contrato já foi assinado; não dá para cancelar pela D4Sign.' };
  if (sale.contract_status === 'CANCELLED') return { ok: true };
  await onDocument(d4signKeys(env), sale.contract_key, d4 => d4.cancel(sale.contract_uuid, reason));
  const now = new Date().toISOString();
  await db.from('sales').update({ contract_status: 'CANCELLED', updated_at: now }).eq('id', saleId);
  return { ok: true };
}

/**
 * Venda com entrada paga e sem contrato ainda? (para disparar a geração sozinha)
 * Envio automático desligado em 02/11 para revisão dos contratos: só volta com CONTRACTS_AUTO=on no servidor.
 * Com ele desligado, o contrato sai pelo botão "Gerar contrato".
 */
export async function needsContract(db: SupabaseClient, env: Env, saleId: string): Promise<boolean> {
  if (env.CONTRACTS_AUTO?.trim().toLowerCase() !== 'on') return false;
  const { data } = await db.from('sales').select('status, contract_status').eq('id', saleId).maybeSingle();
  return Boolean(data && (data.status === 'ENTRY_PAID' || data.status === 'PAID') && data.contract_status === 'NONE');
}
