/**
 * checkInTime é armazenado como ISO 8601 completo (data + hora) para permitir
 * ordenação/auditoria confiável. Esta função extrai só "HH:MM" pra exibição.
 * Mantém fallback pro formato antigo ("HH:MM" puro) para dados já salvos antes da migração.
 */
export function formatCheckInTime(checkInTime: string | null | undefined): string {
  if (!checkInTime) return '';

  const parsed = new Date(checkInTime);
  if (Number.isNaN(parsed.getTime())) {
    return checkInTime;
  }

  return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * cycleEndDate vem do <input type="date"> em formato ISO ("YYYY-MM-DD").
 * Esta função exibe como "DD/MM/AAAA". Mantém fallback para valores antigos
 * que já estejam em outro formato (ex: texto livre digitado antes da migração).
 */
export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  return dateStr;
}

/**
 * Aplica máscara de telefone brasileiro conforme o usuário digita.
 * Suporta fixo (8 dígitos) e celular (9 dígitos): (11) 3333-4444 / (11) 98765-4321
 */
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Aplica máscara de valor monetário (BRL) conforme o usuário digita,
 * tratando os dígitos como centavos (estilo calculadora): "897" -> "R$ 8,97".
 */
export function formatCurrencyInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Minúsculas e sem acentos, para comparar "Joao" com "João". */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca tolerante: ignora acentos e maiúsculas nos textos, e compara telefones só pelos dígitos
 * (assim "1198765" encontra "(11) 98765-4321").
 */
export function matchesQuery(query: string, texts: (string | null | undefined)[], phone?: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;

  if (texts.some(text => normalizeText(text).includes(q))) return true;

  // Só compara por telefone quando a busca é numérica (ex: "11 98765", "(11) 9876")
  if (/[a-z]/i.test(q)) return false;
  const queryDigits = query.replace(/\D/g, '');
  return Boolean(phone && queryDigits.length >= 3 && phone.replace(/\D/g, '').includes(queryDigits));
}

/** Link do WhatsApp com DDI 55, ou null se o telefone não tiver dígitos suficientes. */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const withCountry = digits.length >= 12 && digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
