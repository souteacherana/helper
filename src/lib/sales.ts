/**
 * Propostas e vendas: regras usadas pela tela (closer) e pelo servidor (/api/sales/*).
 * O valor total de cada produto é fixo; o closer só escolhe como dividir: a primeira parte é
 * a entrada e as outras completam o total (ex: Pix + cartão A + cartão B). Cada parte vira
 * uma cobrança no Asaas. Valores em centavos para a soma fechar sempre exata.
 * Na Proposta Custom o closer define também o nome, o total e os juros (CUSTOM_PRICING).
 */
export type PayMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';
export type SaleStatus = 'CREATING' | 'PENDING' | 'ENTRY_PAID' | 'PAID' | 'CANCELLED' | 'FAILED';
export type PartStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
export type ContractStatus = 'NONE' | 'CREATING' | 'SENT' | 'SIGNED' | 'CANCELLED' | 'FAILED';

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  NONE: 'Contrato não gerado',
  CREATING: 'Gerando contrato…',
  SENT: 'Contrato enviado para assinatura',
  SIGNED: 'Contrato assinado',
  CANCELLED: 'Contrato cancelado',
  FAILED: 'Erro ao gerar o contrato'
};

export const PAY_METHODS: PayMethod[] = ['PIX', 'CREDIT_CARD', 'BOLETO'];
export const METHOD_LABELS: Record<PayMethod, string> = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão' };

/**
 * Proposta Custom: o closer escolhe o produto (que define o contrato) e define o nome, o total,
 * as parcelas e os juros por parcela. As regras abaixo usam este id no lugar do produto.
 */
export const CUSTOM_PRICING = 'custom';

/** Cartão até 12x, boleto até 6x, Pix à vista */
export const MAX_INSTALLMENTS: Record<PayMethod, number> = { PIX: 1, BOLETO: 6, CREDIT_CARD: 12 };
/** Mastermind (até 14x sem juros em qualquer forma, pelo contrato) e Proposta Custom */
const OFFER_MAX_INSTALLMENTS: Record<string, Record<PayMethod, number>> = {
  mastermind: { PIX: 14, BOLETO: 14, CREDIT_CARD: 14 },
  [CUSTOM_PRICING]: { PIX: 14, BOLETO: 14, CREDIT_CARD: 14 }
};
export const maxInstallments = (offerId: string, method: PayMethod) =>
  (OFFER_MAX_INSTALLMENTS[offerId] ?? MAX_INSTALLMENTS)[method];

/**
 * Juros do cartão parcelado, mesma conta do checkout (calculateTotalValue): Tabela Price a
 * 2,49% ao mês. Pix e boleto não têm juros; o RISERS (mastermind) é sem juros pelo contrato.
 * O Elite e a Proposta Custom usam juros fixos por parcela (FLAT_INTEREST) no lugar da Tabela Price.
 */
export const CARD_MONTHLY_RATE = 0.0249;
const INTEREST_FREE_OFFERS = new Set(['mastermind']);
/** Juros fixos por parcela: no Elite o closer escolhe com (R$ 49,90) ou sem; na Custom, qualquer valor */
const FLAT_INTEREST: Record<string, number | 'ANY'> = { elite: 4990, [CUSTOM_PRICING]: 'ANY' };
export const flatInterestOption = (offerId: string): number | 'ANY' | undefined => FLAT_INTEREST[offerId];
/** Maior juro por parcela aceito na Proposta Custom */
export const MAX_FLAT_INTEREST_CENTS = 100000;
/** Esta parte pode ter juros fixos por parcela? (Elite: só cartão parcelado; Custom: qualquer parcelado) */
export const allowsFlatInterest = (offerId: string, part: Pick<PartDraft, 'method' | 'installments'>) => {
  const option = FLAT_INTEREST[offerId];
  return option !== undefined && part.installments > 1 && (option === 'ANY' || part.method === 'CREDIT_CARD');
};
export const hasCardInterest = (offerId: string, part: Pick<PartDraft, 'method' | 'installments'>) =>
  part.method === 'CREDIT_CARD' && part.installments > 1 && !INTEREST_FREE_OFFERS.has(offerId) && !(offerId in FLAT_INTEREST);
/** Quanto a parte cobra de fato: o valor dela, ou o total com juros no parcelado */
export function withInterestCents(offerId: string, part: Pick<PartDraft, 'method' | 'amountCents' | 'installments' | 'interestCents'>): number {
  if (allowsFlatInterest(offerId, part)) return part.amountCents + (part.interestCents ?? 0) * part.installments;
  if (!hasCardInterest(offerId, part)) return part.amountCents;
  const i = CARD_MONTHLY_RATE;
  const n = part.installments;
  const pmt = part.amountCents * ((i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1));
  return Math.round(pmt * n);
}

/**
 * Pix à vista (pagamento único no Pix) tem desconto sobre o total: 5%, e 10% no Elite
 * (R$ 13.500 sobre R$ 15.000). Na Proposta Custom não há desconto: o closer já define o total.
 */
const PIX_CASH_DISCOUNT = 0.05;
const OFFER_PIX_CASH_DISCOUNT: Record<string, number> = { elite: 0.1, [CUSTOM_PRICING]: 0 };
export const pixCashDiscount = (offerId = '') => OFFER_PIX_CASH_DISCOUNT[offerId] ?? PIX_CASH_DISCOUNT;
export const isPixCash = (parts: Pick<PartDraft, 'method' | 'installments'>[]) =>
  parts.length === 1 && parts[0].method === 'PIX' && parts[0].installments === 1;
export const pixCashCents = (totalCents: number, offerId = '') => Math.round(totalCents * (1 - pixCashDiscount(offerId)));
/** Quanto as partes precisam somar: o total, ou o total com desconto no Pix à vista */
export const expectedCents = (totalCents: number, parts: Pick<PartDraft, 'method' | 'installments'>[], offerId = '') =>
  isPixCash(parts) ? pixCashCents(totalCents, offerId) : totalCents;
export const MAX_PARTS = 4;
/** Maior total aceito na Proposta Custom */
export const MAX_CUSTOM_TOTAL_CENTS = 20000000;
/** Multa fixa (R$) do boleto pago depois do vencimento */
export const BOLETO_FINE = 40;
/** Menor valor de parcela que o Asaas aceita */
export const MIN_INSTALLMENT_CENTS = 500;
export const MAX_DUE_DAYS = 60;

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  CREATING: 'Gerando cobranças…',
  PENDING: 'Aguardando entrada',
  ENTRY_PAID: 'Entrada paga',
  PAID: 'Quitada',
  CANCELLED: 'Cancelada',
  FAILED: 'Erro ao gerar'
};

export const PART_STATUS_LABELS: Record<PartStatus, string> = {
  PENDING: 'Aguardando',
  PARTIAL: 'Pagando',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Estornado'
};

/** Venda "aberta": ainda vale (não foi cancelada nem falhou) */
export const isOpenSale = (status: SaleStatus) => status === 'CREATING' || status === 'PENDING' || status === 'ENTRY_PAID' || status === 'PAID';
/** Venda fechada = entrada paga */
export const isClosedSale = (status: SaleStatus) => status === 'ENTRY_PAID' || status === 'PAID';

export interface PartDraft {
  method: PayMethod;
  amountCents: number;
  installments: number;
  /** AAAA-MM-DD: vencimento da cobrança (no parcelado, da 1ª parcela) */
  dueDate: string;
  /** Juros fixos por parcela escolhidos pelo closer (Elite e Proposta Custom; 0 = sem juros) */
  interestCents?: number;
}

export interface Offer {
  id: string;
  name: string;
  totalCents: number | null;
  condition: string;
  restricted: boolean;
  active: boolean;
  sortOrder: number;
  /** Modelo .docx do contrato (com campos [[...]]) */
  contractTemplateUrl: string;
}

export interface SalePart extends PartDraft {
  position: number;
  status: PartStatus;
  paidInstallments: number;
  invoiceUrl: string;
  asaasPaymentId: string;
  asaasInstallmentId: string;
}

export interface Sale {
  id: string;
  attendeeId: string;
  offerId: string;
  offerName: string;
  totalCents: number;
  closerName: string;
  status: SaleStatus;
  error: string;
  createdAt: string;
  entryPaidAt: string | null;
  parts: SalePart[];
  contractStatus: ContractStatus;
  contractError: string;
  contractSentAt: string | null;
  contractSignedAt: string | null;
}

// ---------- Dinheiro e datas ----------

export const toCents = (reais: number | string | null | undefined) => Math.round(Number(reais ?? 0) * 100);
export const fromCents = (cents: number) => Math.round(cents) / 100;

export function formatBRL(cents: number): string {
  return fromCents(cents).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "R$ 1.234,56" / "1234,56" / "1234.5" → centavos (NaN se não der para ler) */
export function parseBRL(text: string): number {
  const clean = text.replace(/[^\d,.-]/g, '');
  if (!clean) return NaN;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** Valor de cada parcela (o Asaas acerta os centavos que sobram na divisão) */
export const installmentCents = (part: Pick<PartDraft, 'amountCents' | 'installments'>) =>
  Math.round(part.amountCents / Math.max(1, part.installments));

export function installmentText(part: Pick<PartDraft, 'amountCents' | 'installments'>): string {
  return part.installments > 1 ? `${part.installments}x de ${formatBRL(installmentCents(part))}` : `à vista ${formatBRL(part.amountCents)}`;
}

/** Hoje no horário de Brasília, AAAA-MM-DD */
export function todaySaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- Validação ----------

/** Lista de problemas da divisão (vazia = pode gerar as cobranças). offerId: o produto, ou CUSTOM_PRICING. */
export function validateParts(totalCents: number, parts: PartDraft[], today: string, offerId = ''): string[] {
  const errors: string[] = [];
  if (parts.length === 0) return ['Adicione pelo menos uma forma de pagamento.'];
  if (parts.length > MAX_PARTS) errors.push(`No máximo ${MAX_PARTS} partes.`);
  const lastDue = addDays(today, MAX_DUE_DAYS);

  parts.forEach((part, i) => {
    const label = parts.length === 1 ? 'Pagamento' : i === 0 ? 'Entrada' : `Parte ${i + 1}`;
    const max = MAX_INSTALLMENTS[part.method] && maxInstallments(offerId, part.method);
    if (!max) {
      errors.push(`${label}: forma de pagamento inválida.`);
      return;
    }
    if (!Number.isInteger(part.amountCents) || part.amountCents <= 0) errors.push(`${label}: informe o valor.`);
    if (!Number.isInteger(part.installments) || part.installments < 1 || part.installments > max) {
      errors.push(`${label}: ${METHOD_LABELS[part.method]} vai até ${max}x.`);
    } else if (part.amountCents > 0 && part.amountCents / part.installments < MIN_INSTALLMENT_CENTS) {
      errors.push(`${label}: cada parcela precisa ser de pelo menos ${formatBRL(MIN_INSTALLMENT_CENTS)}.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(part.dueDate) || part.dueDate < today) errors.push(`${label}: vencimento a partir de hoje.`);
    else if (part.dueDate > lastDue) errors.push(`${label}: vencimento em até ${MAX_DUE_DAYS} dias.`);

    const interest = part.interestCents ?? 0;
    const option = flatInterestOption(offerId);
    if (!Number.isInteger(interest) || interest < 0) errors.push(`${label}: juros inválidos.`);
    else if (interest > 0 && !allowsFlatInterest(offerId, part)) {
      errors.push(option === undefined ? `${label}: esta proposta não tem juros por parcela.` : `${label}: juros por parcela só no ${option === 'ANY' ? 'parcelado' : 'cartão parcelado'}.`);
    } else if (interest > 0 && option !== 'ANY' && interest !== option) {
      errors.push(`${label}: os juros são de ${formatBRL(option ?? 0)} por parcela.`);
    } else if (interest > MAX_FLAT_INTEREST_CENTS) {
      errors.push(`${label}: juros de no máximo ${formatBRL(MAX_FLAT_INTEREST_CENTS)} por parcela.`);
    }
  });

  const target = expectedCents(totalCents, parts, offerId);
  const sum = parts.reduce((acc, p) => acc + (Number.isInteger(p.amountCents) ? p.amountCents : 0), 0);
  if (sum !== target) {
    errors.push(sum < target ? `Faltam ${formatBRL(target - sum)} para fechar o total.` : `Passou ${formatBRL(sum - target)} do total.`);
  }
  return errors;
}

// ---------- Situação vinda do Asaas ----------

const ASAAS_PAID = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const ASAAS_REFUNDED = ['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'];

/** Situação de uma parte a partir das cobranças dela no Asaas (no parcelado, uma por parcela). */
export function partStatusFromPayments(payments: { status: string; deleted?: boolean }[]): { status: PartStatus; paidInstallments: number } {
  const live = payments.filter(p => !p.deleted);
  if (live.length === 0) return { status: 'CANCELLED', paidInstallments: 0 };
  const paid = live.filter(p => ASAAS_PAID.includes(p.status)).length;
  if (live.every(p => ASAAS_REFUNDED.includes(p.status))) return { status: 'REFUNDED', paidInstallments: 0 };
  if (paid === live.length) return { status: 'PAID', paidInstallments: paid };
  if (live.some(p => p.status === 'OVERDUE')) return { status: 'OVERDUE', paidInstallments: paid };
  return { status: paid > 0 ? 'PARTIAL' : 'PENDING', paidInstallments: paid };
}

/** Situação da venda a partir das partes: entrada paga = venda fechada. */
export function saleStatusFromParts(current: SaleStatus, parts: { position: number; status: PartStatus; paidInstallments: number }[]): SaleStatus {
  if (current === 'CANCELLED' || current === 'FAILED' || current === 'CREATING') return current;
  if (parts.length > 0 && parts.every(p => p.status === 'PAID')) return 'PAID';
  const entry = parts.find(p => p.position === 0);
  if (entry && entry.paidInstallments > 0) return 'ENTRY_PAID';
  return 'PENDING';
}

/** externalReference das cobranças do HELPER no Asaas: "helper:<venda>:<parte>" */
export const buildReference = (saleId: string, position: number) => `helper:${saleId}:${position}`;

export function parseReference(ref: unknown): { saleId: string; position: number } | null {
  const m = typeof ref === 'string' ? /^helper:([a-z0-9-]+):(\d)$/.exec(ref) : null;
  return m ? { saleId: m[1], position: Number(m[2]) } : null;
}

// ---------- Banco ----------

export interface OfferRow {
  id: string;
  name: string;
  total_value: number | string | null;
  condition: string | null;
  restricted: boolean;
  active: boolean;
  sort_order: number;
  contract_template_url?: string | null;
}

export interface SaleRow {
  id: string;
  attendee_id: string;
  offer_id: string;
  offer_name: string;
  total_value: number | string;
  closer_name: string;
  status: SaleStatus;
  error: string | null;
  created_at: string;
  entry_paid_at: string | null;
  contract_status?: ContractStatus;
  contract_error?: string | null;
  contract_sent_at?: string | null;
  contract_signed_at?: string | null;
}

export interface SalePartRow {
  sale_id: string;
  position: number;
  method: PayMethod;
  amount: number | string;
  installments: number;
  due_date: string;
  status: PartStatus;
  paid_installments: number;
  invoice_url: string | null;
  asaas_payment_id: string | null;
  asaas_installment_id: string | null;
}

export const offerFromRow = (r: OfferRow): Offer => ({
  id: r.id,
  name: r.name,
  totalCents: r.total_value === null ? null : toCents(r.total_value),
  condition: r.condition ?? '',
  restricted: r.restricted,
  active: r.active,
  sortOrder: r.sort_order,
  contractTemplateUrl: r.contract_template_url ?? ''
});

export const partFromRow = (r: SalePartRow): SalePart => ({
  position: r.position,
  method: r.method,
  amountCents: toCents(r.amount),
  installments: r.installments,
  dueDate: r.due_date,
  status: r.status,
  paidInstallments: r.paid_installments,
  invoiceUrl: r.invoice_url ?? '',
  asaasPaymentId: r.asaas_payment_id ?? '',
  asaasInstallmentId: r.asaas_installment_id ?? ''
});

/** Quanto a venda cobra de fato (no Pix à vista, o total com desconto) */
export const chargedCents = (sale: Pick<Sale, 'parts'>) => sale.parts.reduce((acc, p) => acc + p.amountCents, 0);

export const saleFromRow = (r: SaleRow, parts: SalePart[]): Sale => ({
  id: r.id,
  attendeeId: r.attendee_id,
  offerId: r.offer_id,
  offerName: r.offer_name,
  totalCents: toCents(r.total_value),
  closerName: r.closer_name,
  status: r.status,
  error: r.error ?? '',
  createdAt: r.created_at,
  entryPaidAt: r.entry_paid_at,
  parts: [...parts].sort((a, b) => a.position - b.position),
  contractStatus: r.contract_status ?? 'NONE',
  contractError: r.contract_error ?? '',
  contractSentAt: r.contract_sent_at ?? null,
  contractSignedAt: r.contract_signed_at ?? null
});
