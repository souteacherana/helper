/**
 * Campos que preenchem os modelos de contrato ([[NOME]], [[INVESTIMENTO]], opções de pagamento...).
 * A forma de pagamento entra nas opções que o contrato já tem (combinado com o usuário em 23/10):
 *   Pix à vista                  -> (X) À vista com desconto de 5%
 *   entrada + outras partes      -> (X) Entrada ... saldo em N parcelas (dois cartões: "10 + 12")
 *   só cartão (Elite/Partiu)     -> (X) N parcelas no cartão
 *   parcela única (Mastermind)   -> (X) Em até 14 parcelas de R$ ...
 *   só boleto parcelado          -> (X) Entrada = 1ª parcela, saldo = as demais
 */
import { installmentCents, isPixCash, type PartDraft } from '../../src/lib/sales.js';

const MARKED = ' X ';
const UNMARKED = '    ';
/** Lacuna que fica quando não há valor (como no contrato em branco) */
export const BLANK = '__________';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "12.000,00" (sem o "R$", que já está no texto do contrato) */
export const money = (cents: number) =>
  (Math.round(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0..999 por extenso */
function upTo999(n: number): string {
  if (n === 100) return 'cem';
  const parts: string[] = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest > 0 && rest < 20) parts.push(UNITS[rest]);
  else if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push(UNITS[rest % 10]);
  }
  return parts.join(' e ');
}

/** Número inteiro por extenso (até centenas de milhões) */
export function numberInWords(n: number): string {
  if (n === 0) return 'zero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;
  const groups: [number, string][] = [];
  if (millions) groups.push([millions, millions === 1 ? 'um milhão' : `${upTo999(millions)} milhões`]);
  if (thousands) groups.push([thousands, thousands === 1 ? 'mil' : `${upTo999(thousands)} mil`]);
  if (units) groups.push([units, upTo999(units)]);
  // "mil e quinhentos", "mil e oitenta", mas "quatro mil setecentos e noventa e seis"
  return groups
    .map(([value, text], i) => {
      if (i === 0) return text;
      return (value < 100 || value % 100 === 0) && i === groups.length - 1 ? ` e ${text}` : ` ${text}`;
    })
    .join('');
}

/** "doze mil reais", "quatro mil setecentos e noventa e seis reais e quarenta centavos" */
export function moneyInWords(cents: number): string {
  const reais = Math.floor(Math.round(cents) / 100);
  const centavos = Math.round(cents) % 100;
  const parts: string[] = [];
  if (reais) {
    const words = numberInWords(reais);
    const de = /(milhão|milhões)$/.test(words) ? ' de' : '';
    parts.push(`${words}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos) parts.push(`${numberInWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return parts.join(' e ') || 'zero reais';
}

const dayOf = (isoDate: string) => String(Number(isoDate.slice(8, 10)));

export interface ContractPerson {
  name: string;
  rg: string;
  cpf: string;
  email: string;
  phone: string;
}

/** Todos os campos do modelo. Os que não se aplicam ficam em branco (lacuna) ou sem o X. */
export function contractFields(offerId: string, totalCents: number, parts: PartDraft[], person: ContractPerson, signedAt: Date): Record<string, string> {
  const sp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(signedAt);
  const f: Record<string, string> = {
    NOME: person.name || BLANK,
    RG: person.rg || BLANK,
    CPF: person.cpf || BLANK,
    EMAIL: person.email || BLANK,
    TELEFONE: person.phone || BLANK,
    INVESTIMENTO: money(totalCents),
    INVESTIMENTO_EXTENSO: moneyInWords(totalCents),
    DIA: String(Number(sp.slice(8, 10))),
    MES: MONTHS[Number(sp.slice(5, 7)) - 1],
    X_AVISTA: UNMARKED,
    X_ENTRADA: UNMARKED,
    X_CARTAO: UNMARKED,
    X_14X: UNMARKED
  };

  const sorted = parts; // em ordem: a primeira parte é a entrada
  if (isPixCash(sorted)) {
    f.X_AVISTA = MARKED;
  } else if (sorted.length >= 2) {
    const [entry, ...rest] = sorted;
    f.X_ENTRADA = MARKED;
    f.ENTRADA = money(entry.amountCents);
    f.SALDO = money(rest.reduce((acc, p) => acc + p.amountCents, 0));
    f.SALDO_N = rest.map(p => String(p.installments)).join(' + ');
    f.SALDO_PARCELA = rest.map(p => money(installmentCents(p))).join(' + ');
    f.SALDO_DIA = [...new Set(rest.map(p => dayOf(p.dueDate)))].join(' e ');
  } else if (sorted.length === 1) {
    const p = sorted[0];
    if (offerId === 'mastermind') {
      f.X_14X = MARKED;
      f.P14_PARCELA = money(installmentCents(p));
      f.P14_DIA = dayOf(p.dueDate);
    } else if (p.method === 'CREDIT_CARD') {
      f.X_CARTAO = MARKED;
      f.CARTAO_N = String(p.installments);
    } else {
      // Boleto (ou Pix) em parcelas: a 1ª é a entrada e as demais o saldo, todo mês no mesmo dia
      const each = installmentCents(p);
      f.X_ENTRADA = MARKED;
      f.ENTRADA = money(p.installments > 1 ? each : p.amountCents);
      f.SALDO = money(p.installments > 1 ? p.amountCents - each : 0);
      f.SALDO_N = String(p.installments - 1);
      f.SALDO_PARCELA = money(p.installments > 1 ? each : 0);
      f.SALDO_DIA = dayOf(p.dueDate);
    }
  }
  return f;
}

/**
 * Trechos fixos dos modelos que dependem da venda (trocados pelo texto exato): o desconto do
 * à vista (5%, 10% no Elite, nenhum na Proposta Custom) e o cartão parcelado sem juros.
 * Tudo sai do que foi cobrado (partes) contra o total, então vale também para vendas antigas.
 */
export function contractPhrases(totalCents: number, parts: PartDraft[]): Record<string, string> {
  const charged = parts.reduce((acc, p) => acc + p.amountCents, 0);
  if (isPixCash(parts)) {
    const pct = totalCents > 0 ? Math.round((1 - charged / totalCents) * 100) : 0;
    return { 'À vista com desconto de 5%.': pct > 0 ? `À vista com desconto de ${pct}%.` : 'À vista.' };
  }
  if (parts.length === 1 && parts[0].method === 'CREDIT_CARD' && parts[0].installments > 1 && charged <= totalCents) {
    return { '(com juros da operadora)': '(sem juros)' };
  }
  return {};
}
