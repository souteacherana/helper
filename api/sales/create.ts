/**
 * POST /api/sales/create — gera a venda e uma cobrança no Asaas por parte do pagamento.
 * Body: { attendeeId, offerId, closerName, parts: [{ method, amountCents, installments, dueDate }] }
 *
 * Tudo que vale dinheiro é conferido aqui, nunca confiado à tela: o total vem do produto no
 * banco, a divisão passa pelas mesmas regras da tela (src/lib/sales.ts) e a ficha de cobrança
 * precisa ter nome, CPF/CNPJ e e-mail. Se o Asaas recusar uma parte, as cobranças já criadas
 * são removidas e a venda fica como "Erro ao gerar".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AsaasError, asaasClient, type AsaasClient } from '../_lib/asaas.js';
import { adminDb, json, teamRoleFromRequest } from '../_lib/server.js';
import { refreshSaleStatus } from '../_lib/salesSync.js';
import {
  BOLETO_FINE,
  buildReference,
  fromCents,
  isOpenSale,
  todaySaoPaulo,
  toCents,
  validateParts,
  type PartDraft,
  type PayMethod,
  type SaleStatus
} from '../../src/lib/sales.js';

type Env = Record<string, string | undefined>;

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });
const docChars = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

interface BillingRow {
  attendee_id: string;
  person_type: 'PF' | 'PJ';
  full_name: string | null;
  cpf: string | null;
  cnpj: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  district: string | null;
  asaas_customer_id: string | null;
}

/** Nome do cliente no Asaas: na empresa, a razão social (ou o representante, se não houver) */
const customerName = (p: BillingRow) => (p.person_type === 'PJ' ? p.company_name?.trim() || p.full_name?.trim() : p.full_name?.trim()) || '';

/** O que falta para cobrar (mesma regra de missingForCharge em src/lib/billing.ts) */
function missingForCharge(p: BillingRow): string[] {
  const need: [string | null, string][] =
    p.person_type === 'PJ'
      ? [[customerName(p), 'Nome'], [p.cnpj, 'CNPJ'], [p.email, 'E-mail']]
      : [[customerName(p), 'Nome'], [p.cpf, 'CPF'], [p.email, 'E-mail']];
  return need.filter(([v]) => !v?.trim()).map(([, label]) => label);
}

/** Cliente no Asaas: o já ligado à ficha, senão um com o mesmo CPF/CNPJ, senão um novo. */
async function ensureCustomer(asaas: AsaasClient, db: SupabaseClient, profile: BillingRow, attendeePhone: string): Promise<string> {
  const isPJ = profile.person_type === 'PJ';
  const doc = docChars(isPJ ? profile.cnpj : profile.cpf);
  let id: string | null = null;

  if (profile.asaas_customer_id) {
    try {
      const current = await asaas.getCustomer(profile.asaas_customer_id);
      if (!current.deleted && docChars(current.cpfCnpj) === doc) id = current.id;
    } catch (err) {
      if (!(err instanceof AsaasError && err.status === 404)) throw err;
    }
  }
  if (!id) id = (await asaas.findCustomerByDocument(doc))?.id ?? null;
  if (!id) {
    const mobile = digits(profile.phone || attendeePhone);
    const created = await asaas.createCustomer({
      name: customerName(profile),
      cpfCnpj: doc,
      email: profile.email?.trim(),
      mobilePhone: mobile.length === 11 ? mobile : undefined,
      postalCode: digits(profile.zip_code) || undefined,
      address: profile.street || undefined,
      addressNumber: profile.address_number || undefined,
      complement: profile.complement || undefined,
      province: profile.district || undefined,
      externalReference: profile.attendee_id
    });
    id = created.id;
  }
  if (id !== profile.asaas_customer_id) {
    await db.from('billing_profiles').update({ asaas_customer_id: id }).eq('attendee_id', profile.attendee_id);
  }
  return id;
}

function readParts(raw: unknown): PartDraft[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map(p => {
    const part = (p ?? {}) as Record<string, unknown>;
    return {
      method: String(part.method) as PayMethod,
      amountCents: Number(part.amountCents),
      installments: Number(part.installments),
      dueDate: String(part.dueDate ?? '')
    };
  });
}

export async function handleCreateSale(authorization: string | null, input: unknown, env: Env): Promise<ApiResult> {
  const db = adminDb(env);
  if (!(await teamRoleFromRequest(db, authorization))) return fail(401, 'Sessão expirada. Entre novamente no HELPER.');

  const body = (input ?? {}) as Record<string, unknown>;
  const attendeeId = typeof body.attendeeId === 'string' ? body.attendeeId : '';
  const offerId = typeof body.offerId === 'string' ? body.offerId : '';
  const closerName = typeof body.closerName === 'string' ? body.closerName.trim().slice(0, 60) : '';
  const parts = readParts(body.parts);
  if (!attendeeId || !offerId || !parts) return fail(400, 'Requisição inválida.');
  if (!closerName) return fail(400, 'Informe o nome do closer.');

  const { data: offer } = await db.from('offers').select('*').eq('id', offerId).maybeSingle();
  if (!offer || !offer.active || offer.total_value === null) return fail(409, 'Esta proposta não está disponível.');
  if (offer.restricted) {
    const { data: access } = await db.from('offer_access').select('attendee_id').eq('offer_id', offerId).eq('attendee_id', attendeeId).maybeSingle();
    if (!access) return fail(403, `${offer.name} não está liberado para esta pessoa.`);
  }

  const totalCents = toCents(offer.total_value);
  const problems = validateParts(totalCents, parts, todaySaoPaulo());
  if (problems.length) return fail(400, problems.join(' '));

  const [{ data: attendee }, { data: profile }, { data: openSales }] = await Promise.all([
    db.from('attendees').select('id, name, phone').eq('id', attendeeId).maybeSingle(),
    db.from('billing_profiles').select('*').eq('attendee_id', attendeeId).maybeSingle<BillingRow>(),
    db.from('sales').select('id, status').eq('attendee_id', attendeeId).eq('offer_id', offerId)
  ]);
  if (!attendee) return fail(404, 'Participante não encontrado.');
  if (!profile) return fail(409, 'Ficha de cobrança vazia. Peça ao admin para preencher na tela Cobrança.');
  const missing = missingForCharge(profile);
  if (missing.length) return fail(409, `Ficha de cobrança incompleta: falta ${missing.join(', ')}. Peça ao admin para completar.`);
  if ((openSales ?? []).some(s => isOpenSale(s.status as SaleStatus))) {
    return fail(409, `Já existe uma proposta de ${offer.name} para esta pessoa. Cancele a anterior para gerar outra.`);
  }

  let asaas: AsaasClient;
  let customerId: string;
  try {
    asaas = asaasClient(env);
    customerId = await ensureCustomer(asaas, db, profile, attendee.phone ?? '');
  } catch (err) {
    console.error('Asaas customer failed:', err);
    return fail(502, `Não foi possível cadastrar o cliente no Asaas: ${err instanceof AsaasError ? err.message : 'erro inesperado'}`);
  }

  const { data: sale, error: saleError } = await db
    .from('sales')
    .insert({
      attendee_id: attendeeId,
      offer_id: offerId,
      offer_name: offer.name,
      total_value: fromCents(totalCents),
      closer_name: closerName,
      status: 'CREATING',
      asaas_customer_id: customerId
    })
    .select('id')
    .single();
  if (saleError || !sale) {
    console.error('sale insert failed:', saleError);
    return fail(500, 'Não foi possível registrar a venda. Tente novamente.');
  }
  const saleId: string = sale.id;

  await db.from('sale_parts').insert(
    parts.map((p, position) => ({
      sale_id: saleId,
      position,
      method: p.method,
      amount: fromCents(p.amountCents),
      installments: p.installments,
      due_date: p.dueDate
    }))
  );

  const created: { kind: 'payments' | 'installments'; id: string }[] = [];
  try {
    for (const [position, p] of parts.entries()) {
      const label = parts.length === 1 ? '' : position === 0 ? ' (entrada)' : ` (parte ${position + 1} de ${parts.length})`;
      const payment = await asaas.createPayment({
        customer: customerId,
        billingType: p.method,
        dueDate: p.dueDate,
        description: `${offer.name} • Imersão Rise 2026${label}`,
        externalReference: buildReference(saleId, position),
        // Parcelado: o Asaas divide o total e acerta os centavos na última parcela
        ...(p.installments > 1 ? { installmentCount: p.installments, totalValue: fromCents(p.amountCents) } : { value: fromCents(p.amountCents) }),
        ...(p.method === 'BOLETO' ? { fine: { value: BOLETO_FINE, type: 'FIXED' } } : {})
      });
      created.push(payment.installment ? { kind: 'installments', id: payment.installment } : { kind: 'payments', id: payment.id });
      await db
        .from('sale_parts')
        .update({ asaas_payment_id: payment.id, asaas_installment_id: payment.installment ?? null, invoice_url: payment.invoiceUrl ?? null })
        .eq('sale_id', saleId)
        .eq('position', position);
    }
  } catch (err) {
    console.error('Asaas payment failed:', err);
    for (const c of created) await asaas.remove(c.kind, c.id).catch(e => console.error('rollback failed:', c, e));
    const message = err instanceof AsaasError ? err.message : 'erro inesperado';
    await db.from('sales').update({ status: 'FAILED', error: message, updated_at: new Date().toISOString() }).eq('id', saleId);
    await db.from('sale_parts').update({ status: 'CANCELLED' }).eq('sale_id', saleId);
    return fail(502, `O Asaas recusou a cobrança: ${message}`);
  }

  await db.from('sales').update({ status: 'PENDING', updated_at: new Date().toISOString() }).eq('id', saleId);
  await refreshSaleStatus(db, saleId);
  return { status: 200, body: { saleId } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  try {
    const result = await handleCreateSale(request.headers.get('authorization'), input, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('create sale crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
