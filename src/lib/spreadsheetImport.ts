import type { AccompaniedBy, Attendee, PaymentMethod, TicketLevel } from '../types/index';
import { formatPhoneInput, normalizeText } from './format';

type Cell = string | number | boolean | Date | null | undefined;

export interface ImportRow {
  line: number;
  action: 'create' | 'update';
  attendee: Attendee;
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  errors: ImportIssue[];
}

// Chave interna -> títulos aceitos na planilha (comparados sem acento/maiúsculas/asterisco)
const COLUMNS = {
  name: ['Nome', 'Nome completo'],
  phone: ['Telefone', 'Celular', 'WhatsApp'],
  instagram: ['Instagram'],
  level: ['Ingresso', 'Nível', 'Tipo de ingresso'],
  isSponsor: ['Patrocinador?', 'Patrocinador'],
  isMentee: ['Já é mentorado?', 'Mentorado?', 'Mentorado'],
  nearRenewal: ['Renovação próxima?', 'Renovação próxima'],
  isAccompanied: ['Acompanhado?', 'Acompanhado'],
  accompaniedBy: ['Tipo de acompanhante', 'Acompanhado por'],
  companionName: ['Nome do acompanhante', 'Acompanhante'],
  currentMentorship: ['Mentoria atual', 'Mentoria'],
  cycle: ['Ciclo'],
  cycleEndDate: ['Fim do ciclo', 'Data de fim do ciclo', 'Finaliza em'],
  mentorshipRemaining: ['Quanto falta da mentoria', 'Sobrando da mentoria'],
  isPaying: ['Ainda pagando?', 'Ainda está pagando?'],
  paymentMethod: ['Forma de pagamento', 'Pagamento'],
  installmentValue: ['Valor da parcela', 'Parcela'],
  remainingInstallments: ['Parcelas restantes'],
  mentorshipValue: ['Valor da mentoria'],
  amountPaid: ['Valor pago'],
  creditBalance: ['Valor em haver', 'Em haver'],
  offerToMake: ['Oferta a fazer', 'Oferta'],
  specialCondition: ['Condição especial'],
  photoUrl: ['Foto (link)', 'Foto', 'Foto URL'],
  id: ['ID (não alterar)', 'ID']
} as const;

type ColumnKey = keyof typeof COLUMNS;

const ACCOMPANIED_BY: AccompaniedBy[] = ['Esposo(a)', 'Professor parceiro', 'Colaborador', 'Amigo'];
const PAYMENT_METHODS: PaymentMethod[] = ['Boleto', 'Cartão de Crédito'];

const headerKey = (title: string) => normalizeText(title).replace(/[*?]/g, '').replace(/\s+/g, ' ').trim();

function mapHeaders(header: Cell[]): Partial<Record<ColumnKey, number>> {
  const index: Partial<Record<ColumnKey, number>> = {};
  header.forEach((title, i) => {
    if (typeof title !== 'string') return;
    const key = headerKey(title);
    for (const [col, aliases] of Object.entries(COLUMNS) as [ColumnKey, readonly string[]][]) {
      if (index[col] === undefined && aliases.some(alias => headerKey(alias) === key)) {
        index[col] = i;
        break;
      }
    }
  });
  return index;
}

const asText = (value: Cell): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

function asBool(value: Cell): boolean {
  if (typeof value === 'boolean') return value;
  return ['sim', 's', 'x', 'yes', 'true', '1', 'verdadeiro'].includes(normalizeText(asText(value)));
}

function asMoney(value: Cell): string | null {
  if (value === null || value === undefined || value === '') return '';
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else {
    // "R$ 1.234,56" / "1234,56" / "1234.56"
    let text = asText(value).replace(/[^\d.,-]/g, '');
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    amount = Number(text);
  }
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function asIsoDate(value: Cell): string | null {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Datas de planilha não têm fuso: a biblioteca devolve meia-noite UTC
    return value.toISOString().slice(0, 10);
  }
  const text = asText(value);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

function asOption<T extends string>(value: Cell, options: readonly T[]): T | '' | null {
  const text = normalizeText(asText(value));
  if (!text) return '';
  return options.find(opt => normalizeText(opt) === text) ?? null;
}

const phoneKey = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-11) : '';
};

const newId = () => 'att-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * Converte as linhas da planilha em participantes, decidindo para cada uma se cria ou atualiza.
 * Ordem de correspondência com quem já existe: ID → telefone → nome.
 */
export function buildImportPreview(sheet: Cell[][], existing: Attendee[]): ImportPreview {
  const errors: ImportIssue[] = [];
  const rows: ImportRow[] = [];

  const headerRow = sheet.findIndex(row => row.some(cell => typeof cell === 'string' && headerKey(cell) === 'nome'));
  if (headerRow === -1) {
    return { rows, errors: [{ line: 1, message: 'Não encontrei a coluna "Nome". Use a planilha modelo.' }] };
  }

  const col = mapHeaders(sheet[headerRow]);
  if (col.level === undefined) {
    return { rows, errors: [{ line: headerRow + 1, message: 'Não encontrei a coluna "Ingresso". Use a planilha modelo.' }] };
  }

  const byId = new Map(existing.map(a => [a.id, a]));
  const byPhone = new Map(existing.filter(a => phoneKey(a.phone)).map(a => [phoneKey(a.phone), a]));
  const byName = new Map(existing.map(a => [normalizeText(a.name), a]));
  const seenInSheet = new Map<string, number>();

  for (let r = headerRow + 1; r < sheet.length; r++) {
    const line = r + 1;
    const cells = sheet[r];
    const get = (key: ColumnKey): Cell => (col[key] === undefined ? null : cells[col[key]!]);

    if (cells.every(cell => asText(cell) === '')) continue;

    const name = asText(get('name'));
    if (normalizeText(name).startsWith('exemplo')) continue;

    const lineErrors: string[] = [];
    const fail = (message: string) => lineErrors.push(message);

    if (!name) fail('Nome em branco');

    const level = asOption<TicketLevel>(get('level'), ['VIP', 'SILVER']);
    if (!level) fail('Ingresso deve ser VIP ou SILVER');

    const accompaniedBy = asOption(get('accompaniedBy'), ACCOMPANIED_BY);
    if (accompaniedBy === null) fail(`Tipo de acompanhante inválido: "${asText(get('accompaniedBy'))}"`);

    const paymentMethod = asOption(get('paymentMethod'), PAYMENT_METHODS);
    if (paymentMethod === null) fail(`Forma de pagamento inválida: "${asText(get('paymentMethod'))}"`);

    const cycleEndDate = asIsoDate(get('cycleEndDate'));
    if (cycleEndDate === null) fail(`Data de fim do ciclo inválida: "${asText(get('cycleEndDate'))}" (use DD/MM/AAAA)`);

    const money = {
      installmentValue: asMoney(get('installmentValue')),
      mentorshipValue: asMoney(get('mentorshipValue')),
      amountPaid: asMoney(get('amountPaid')),
      creditBalance: asMoney(get('creditBalance'))
    };
    for (const [key, value] of Object.entries(money)) {
      if (value === null) fail(`Valor inválido em "${COLUMNS[key as ColumnKey][0]}"`);
    }

    const installmentsText = asText(get('remainingInstallments'));
    const remainingInstallments = installmentsText ? Number(installmentsText) : undefined;
    if (remainingInstallments !== undefined && (!Number.isInteger(remainingInstallments) || remainingInstallments < 0)) {
      fail('Parcelas restantes deve ser um número inteiro');
    }

    const phone = formatPhoneInput(asText(get('phone')));
    const sheetId = asText(get('id'));

    // Duplicado dentro da própria planilha: mesmo ID ou mesmo nome.
    // Telefone igual não basta: casais e famílias costumam cadastrar o mesmo número.
    const dupKey = sheetId || normalizeText(name);
    if (dupKey && seenInSheet.has(dupKey)) {
      fail(`Duplicado da linha ${seenInSheet.get(dupKey)} (mesmo ID ou nome)`);
    } else if (dupKey) {
      seenInSheet.set(dupKey, line);
    }

    let match: Attendee | undefined;
    if (sheetId) {
      match = byId.get(sheetId);
      if (!match) fail(`ID "${sheetId}" não existe no sistema (apague o ID para cadastrar como novo)`);
    } else {
      const sameName = byName.get(normalizeText(name));
      // Mesmo nome mas telefones diferentes = homônimo, não é a mesma pessoa
      const nameConflicts = sameName && phoneKey(phone) && phoneKey(sameName.phone) && phoneKey(sameName.phone) !== phoneKey(phone);
      // Mesmo telefone só conta se o primeiro nome também bater (sobrenome digitado diferente,
      // ex: "Ana Silva"/"Ana da Silva"); senão o marido sobrescreveria a esposa com o mesmo número.
      const samePhone = phoneKey(phone) ? byPhone.get(phoneKey(phone)) : undefined;
      const firstName = (n: string) => normalizeText(n).split(' ')[0];
      const samePhoneSamePerson = samePhone && firstName(samePhone.name) === firstName(name) ? samePhone : undefined;
      match = (nameConflicts ? undefined : sameName) ?? samePhoneSamePerson;
    }

    if (lineErrors.length > 0) {
      errors.push({ line, message: lineErrors.join(' • ') });
      continue;
    }

    const isBlank = (key: ColumnKey) => asText(get(key)) === '';
    // Em atualização, Sim/Não em branco mantém o valor atual
    const flag = (key: 'isSponsor' | 'isMentee' | 'nearRenewal' | 'isAccompanied' | 'isPaying') =>
      match && isBlank(key) ? Boolean(match[key]) : asBool(get(key));

    const isAccompanied = flag('isAccompanied');
    const isPaying = flag('isPaying');
    const currentMentorship = asText(get('currentMentorship'));
    const photoUrl = asText(get('photoUrl'));

    const fields = {
      name,
      phone,
      instagram: asText(get('instagram')),
      level: level as TicketLevel,
      isSponsor: flag('isSponsor'),
      // Ter uma mentoria preenchida já indica que é mentorado
      isMentee: flag('isMentee') || Boolean(currentMentorship),
      nearRenewal: flag('nearRenewal'),
      isAccompanied,
      accompaniedBy: isAccompanied ? accompaniedBy || undefined : undefined,
      companionName: isAccompanied ? asText(get('companionName')) : '',
      currentMentorship,
      cycle: asText(get('cycle')),
      cycleEndDate: cycleEndDate as string,
      mentorshipRemaining: asText(get('mentorshipRemaining')),
      isPaying,
      paymentMethod: isPaying ? paymentMethod || undefined : undefined,
      installmentValue: isPaying ? (money.installmentValue as string) : '',
      remainingInstallments: isPaying ? remainingInstallments : undefined,
      mentorshipValue: money.mentorshipValue as string,
      amountPaid: money.amountPaid as string,
      creditBalance: money.creditBalance as string,
      offerToMake: asText(get('offerToMake')),
      specialCondition: asText(get('specialCondition'))
    };

    if (match) {
      // Células em branco mantêm o valor atual (permite atualizar só algumas colunas).
      // Exceção: dados dependentes de "Acompanhado?"/"Ainda pagando?" = Não são limpos.
      const updated: Attendee = { ...match, photoUrl: photoUrl || match.photoUrl };
      // "carolina santos mendes" casou com "Carolina Santos Mendes": mantém a grafia original
      if (normalizeText(name) === normalizeText(match.name)) fields.name = match.name;
      for (const [key, value] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
        const gatedOff =
          (!isAccompanied && (key === 'accompaniedBy' || key === 'companionName')) ||
          (!isPaying && (key === 'paymentMethod' || key === 'installmentValue' || key === 'remainingInstallments'));
        if (gatedOff || !isBlank(key as ColumnKey) || key === 'isMentee') {
          (updated as unknown as Record<string, unknown>)[key] = value;
        }
      }
      rows.push({ line, action: 'update', attendee: updated });
    } else {
      rows.push({
        line,
        action: 'create',
        attendee: {
          id: newId(),
          ...fields,
          photoUrl,
          status: 'CONFIRMED',
          isPresent: false,
          checkInTime: null,
          closerNotes: []
        }
      });
    }
  }

  return { rows, errors };
}

/** Lê a aba "Participantes" (ou a primeira aba, se não existir) de um arquivo .xlsx. */
export async function readSpreadsheet(file: File): Promise<Cell[][]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  const target =
    sheets.find(s => normalizeText(s.sheet) === 'participantes') ??
    sheets.find(s => !['instrucoes', 'listas'].includes(normalizeText(s.sheet))) ??
    sheets[0];
  return (target?.data ?? []) as Cell[][];
}
