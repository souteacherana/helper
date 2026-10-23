import type { Attendee } from '../types/index';
import { formatPhoneInput } from './format';

/**
 * Ficha de cobrança e contrato (tabela billing_profiles): os dados que o Asaas e o
 * contrato da D4Sign pedem. Pessoa física (PF) ou empresa (PJ); na empresa, os campos
 * de pessoa são do representante que assina.
 */
export type PersonType = 'PF' | 'PJ';

/**
 * De onde veio o valor: HELPER (ficha do evento), Asaas, contrato antigo na D4Sign, grupo da
 * equipe no WhatsApp ou digitado no admin
 */
export type BillingSource = 'helper' | 'asaas' | 'd4sign' | 'whatsapp' | 'manual';

export type BillingField =
  | 'companyName'
  | 'tradeName'
  | 'cnpj'
  | 'fullName'
  | 'cpf'
  | 'rg'
  | 'nationality'
  | 'maritalStatus'
  | 'email'
  | 'phone'
  | 'zipCode'
  | 'street'
  | 'addressNumber'
  | 'complement'
  | 'district'
  | 'city'
  | 'state';

export type BillingProfile = {
  attendeeId: string;
  personType: PersonType;
  asaasCustomerId: string;
  sources: Partial<Record<BillingField, BillingSource>>;
  updatedAt?: string;
} & Record<BillingField, string>;

interface FieldDef {
  label: string;
  column: string;
  /** Obrigatório sempre, só para empresa, ou opcional */
  required: 'always' | 'PJ' | false;
}

/**
 * Ordem = ordem dos avisos de "falta". Os obrigatórios precisam bater com
 * public.billing_missing() no supabase_schema.sql (seção 9).
 */
export const BILLING_FIELDS: Record<BillingField, FieldDef> = {
  companyName: { label: 'Razão social', column: 'company_name', required: 'PJ' },
  tradeName: { label: 'Nome fantasia', column: 'trade_name', required: false },
  cnpj: { label: 'CNPJ', column: 'cnpj', required: 'PJ' },
  fullName: { label: 'Nome', column: 'full_name', required: 'always' },
  cpf: { label: 'CPF', column: 'cpf', required: 'always' },
  rg: { label: 'RG', column: 'rg', required: false },
  nationality: { label: 'Nacionalidade', column: 'nationality', required: 'always' },
  maritalStatus: { label: 'Estado civil', column: 'marital_status', required: 'always' },
  email: { label: 'E-mail', column: 'email', required: 'always' },
  phone: { label: 'Telefone', column: 'phone', required: 'always' },
  zipCode: { label: 'CEP', column: 'zip_code', required: 'always' },
  street: { label: 'Rua', column: 'street', required: 'always' },
  addressNumber: { label: 'Número', column: 'address_number', required: 'always' },
  complement: { label: 'Complemento', column: 'complement', required: false },
  district: { label: 'Bairro', column: 'district', required: 'always' },
  city: { label: 'Cidade', column: 'city', required: 'always' },
  state: { label: 'Estado', column: 'state', required: 'always' }
};

const FIELD_KEYS = Object.keys(BILLING_FIELDS) as BillingField[];

export const BILLING_SOURCE_LABELS: Record<BillingSource, string> = {
  helper: 'HELPER',
  asaas: 'Asaas',
  d4sign: 'D4Sign',
  whatsapp: 'WhatsApp',
  manual: 'Manual'
};

export const NATIONALITY_SUGGESTIONS = ['Brasileira', 'Brasileiro'];
export const MARITAL_STATUS_SUGGESTIONS = [
  'Solteira', 'Solteiro', 'Casada', 'Casado', 'Divorciada', 'Divorciado', 'Viúva', 'Viúvo', 'União estável'
];
export const BR_STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
];

/** Ficha nova já com o que o HELPER sabe da pessoa (nome e telefone). */
export function newBillingProfile(attendee: Attendee): BillingProfile {
  const empty = Object.fromEntries(FIELD_KEYS.map(k => [k, ''])) as Record<BillingField, string>;
  return {
    ...empty,
    attendeeId: attendee.id,
    personType: 'PF',
    asaasCustomerId: '',
    fullName: attendee.name,
    phone: attendee.phone,
    sources: { fullName: 'helper', ...(attendee.phone ? { phone: 'helper' as const } : {}) }
  };
}

const isRequired = (key: BillingField, personType: PersonType) => {
  const rule = BILLING_FIELDS[key].required;
  return rule === 'always' || (rule === 'PJ' && personType === 'PJ');
};

/** Nomes dos campos obrigatórios em branco. Lista vazia = ficha completa. */
export function missingBillingFields(profile: BillingProfile): string[] {
  return FIELD_KEYS.filter(k => isRequired(k, profile.personType) && !profile[k].trim()).map(k => BILLING_FIELDS[k].label);
}

/**
 * O que falta só para cobrar no Asaas (o cliente é a empresa, no caso de PJ). O resto da ficha
 * é para o contrato. Mesma regra de public.billing_missing_charge() no supabase_schema.sql (seção 10).
 */
export function missingForCharge(profile: BillingProfile): string[] {
  const keys: BillingField[] = profile.personType === 'PJ' ? ['companyName', 'cnpj', 'email'] : ['fullName', 'cpf', 'email'];
  return keys.filter(k => !profile[k].trim()).map(k => BILLING_FIELDS[k].label);
}

// ---------- Validação ----------

const onlyDigits = (v: string) => v.replace(/\D/g, '');

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/**
 * CNPJ numérico ou alfanumérico (Receita, a partir de julho/2026): 12 caracteres [0-9A-Z]
 * e 2 dígitos verificadores. Cada caractere vale (código ASCII − 48), então dígitos valem eles mesmos.
 */
export function isValidCnpj(value: string): boolean {
  const c = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (c.charCodeAt(i) - 48) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(c[12]) && check(13) === Number(c[13]);
}

/** Mensagem de erro do valor preenchido, ou null se estiver ok (campo vazio não é erro aqui). */
export function validateBillingField(key: BillingField, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  switch (key) {
    case 'cpf':
      return isValidCpf(v) ? null : 'CPF inválido';
    case 'cnpj':
      return isValidCnpj(v) ? null : 'CNPJ inválido';
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'E-mail inválido';
    case 'phone': {
      const n = onlyDigits(v).length;
      return n === 10 || n === 11 ? null : 'Telefone precisa de DDD + número';
    }
    case 'zipCode':
      return onlyDigits(v).length === 8 ? null : 'CEP precisa de 8 dígitos';
    case 'state':
      return BR_STATES.includes(v.toUpperCase()) ? null : 'Use a sigla do estado (ex: SP)';
    default:
      return null;
  }
}

/** Erros de formato da ficha inteira (campo → mensagem). Só valida campos visíveis para o tipo. */
export function billingErrors(profile: BillingProfile): Partial<Record<BillingField, string>> {
  const errors: Partial<Record<BillingField, string>> = {};
  for (const key of FIELD_KEYS) {
    if (BILLING_FIELDS[key].required === 'PJ' && profile.personType !== 'PJ') continue;
    const message = validateBillingField(key, profile[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

// ---------- Máscaras ----------

export function formatCpfInput(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function formatCnpjInput(value: string): string {
  const c = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
  return c
    .replace(/^(\w{2})(\w)/, '$1.$2')
    .replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/\.(\w{3})(\w)/, '.$1/$2')
    .replace(/(\w{4})(\w)/, '$1-$2');
}

export function formatCepInput(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Aplica a máscara do campo enquanto o admin digita. */
export function formatBillingInput(key: BillingField, value: string): string {
  switch (key) {
    case 'cpf':
      return formatCpfInput(value);
    case 'cnpj':
      return formatCnpjInput(value);
    case 'zipCode':
      return formatCepInput(value);
    case 'phone':
      return formatPhoneInput(value);
    case 'state':
      return value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
    default:
      return value;
  }
}

// ---------- Banco ----------

export type BillingRow = Record<string, unknown> & {
  attendee_id: string;
  person_type: PersonType;
  asaas_customer_id: string | null;
  sources: Partial<Record<BillingField, BillingSource>> | null;
  updated_at?: string;
};

export function billingFromRow(row: BillingRow): BillingProfile {
  const fields = Object.fromEntries(
    FIELD_KEYS.map(k => [k, String(row[BILLING_FIELDS[k].column] ?? '')])
  ) as Record<BillingField, string>;
  return {
    ...fields,
    attendeeId: row.attendee_id,
    personType: row.person_type === 'PJ' ? 'PJ' : 'PF',
    asaasCustomerId: row.asaas_customer_id ?? '',
    sources: row.sources ?? {},
    updatedAt: row.updated_at
  };
}

/** Campos vazios viram null. Na pessoa física, os dados de empresa são apagados. */
export function billingToRow(profile: BillingProfile): BillingRow {
  const row: BillingRow = {
    attendee_id: profile.attendeeId,
    person_type: profile.personType,
    asaas_customer_id: profile.asaasCustomerId.trim() || null,
    sources: profile.sources
  };
  for (const key of FIELD_KEYS) {
    const companyOnly = key === 'companyName' || key === 'tradeName' || key === 'cnpj';
    const value = companyOnly && profile.personType === 'PF' ? '' : profile[key].trim();
    row[BILLING_FIELDS[key].column] = value || null;
  }
  return row;
}
