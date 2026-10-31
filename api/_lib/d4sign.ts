/**
 * Chamadas à API da D4Sign. As chaves ficam só no servidor, em rodízio (até 9):
 *   D4SIGN_TOKEN_API, D4SIGN_CRYPT_KEY        chave 1
 *   D4SIGN_SAFE_UUID                          cofre onde os contratos do evento são criados ("Imersão Rise 2026")
 *   D4SIGN_TOKEN_API_2, D4SIGN_CRYPT_KEY_2    chave 2, e assim por diante (_3, _4...)
 *   D4SIGN_SAFE_UUID_2                        cofre da chave 2; sem ele, usa o da chave 1 (chave da mesma conta)
 * A D4Sign limita cada chave (requisições por hora em cada método) e cada conta (documentos do plano):
 * quando uma chave bate o limite, o contrato sai pela próxima (contracts.ts).
 */
type Env = Record<string, string | undefined>;

const BASE_URL = 'https://secure.d4sign.com.br/api/v1';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Situação do documento na D4Sign (statusId) */
export const D4_STATUS = { PROCESSING: 1, WAITING_SIGNERS: 2, WAITING_SIGNATURES: 3, FINISHED: 4, ARCHIVED: 5, CANCELLED: 6 } as const;

export class D4SignError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface D4SignKey {
  /** Número da chave nas variáveis ("1", "2"...), gravado na venda (sales.contract_key) */
  id: string;
  token: string;
  crypt: string;
  safe: string;
}

const MAX_KEYS = 9;

export function d4signKeys(env: Env): D4SignKey[] {
  const mainSafe = env.D4SIGN_SAFE_UUID?.trim() ?? '';
  const keys: D4SignKey[] = [];
  for (let n = 1; n <= MAX_KEYS; n++) {
    const suffix = n === 1 ? '' : `_${n}`;
    const token = env[`D4SIGN_TOKEN_API${suffix}`]?.trim();
    const crypt = env[`D4SIGN_CRYPT_KEY${suffix}`]?.trim();
    const safe = env[`D4SIGN_SAFE_UUID${suffix}`]?.trim() || mainSafe;
    if (token && crypt && safe) keys.push({ id: String(n), token, crypt, safe });
  }
  if (!keys.length) throw new D4SignError('D4Sign não configurada no servidor (D4SIGN_TOKEN_API, D4SIGN_CRYPT_KEY, D4SIGN_SAFE_UUID).', 500);
  return keys;
}

/** Chave vencida ou no limite (requisições por hora, documentos da conta): vale tentar com outra chave. */
export const isKeyLimitError = (err: unknown): err is D4SignError =>
  err instanceof D4SignError && (err.status === 401 || err.status === 403 || err.status === 429 || /limit|expir|token/i.test(err.message));

/** Ordem do rodízio: começa pela chave `first` (se ainda existir) e segue, voltando ao começo. */
export function keyRotation(keys: D4SignKey[], first?: string | null): D4SignKey[] {
  const start = Math.max(0, keys.findIndex(k => k.id === first));
  return [...keys.slice(start), ...keys.slice(0, start)];
}

/**
 * Operação num documento que já existe: só a conta que criou o documento o enxerga. Usa a chave
 * gravada na venda; sem registro (contratos de antes do rodízio), tenta todas, a 1 primeiro.
 */
export async function onDocument<T>(keys: D4SignKey[], keyId: string | null | undefined, run: (d4: D4SignClient) => Promise<T>): Promise<T> {
  const own = keys.find(k => k.id === keyId);
  let firstError: unknown;
  for (const key of own ? [own] : keys) {
    try {
      return await run(d4signClient(key));
    } catch (err) {
      firstError ??= err;
    }
  }
  throw firstError;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export type D4SignClient = ReturnType<typeof d4signClient>;

export function d4signClient({ token, crypt, safe }: D4SignKey) {
  const auth = `tokenAPI=${encodeURIComponent(token)}&cryptKey=${encodeURIComponent(crypt)}`;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}${path.includes('?') ? '&' : '?'}${auth}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // resposta sem JSON
    }
    if (!res.ok) {
      const message = (data as { message?: string; error?: string })?.message || (data as { error?: string })?.error || `D4Sign respondeu ${res.status}`;
      throw new D4SignError(message, res.status);
    }
    return data as T;
  }

  const status = async (uuid: string): Promise<number> => {
    const r = await request<{ statusId?: string | number }[] | { statusId?: string | number }>('GET', `/documents/${uuid}`);
    const doc = Array.isArray(r) ? r[0] : r;
    return Number(doc?.statusId ?? 0);
  };

  return {
    /** Sobe o .docx no cofre do evento; a D4Sign converte para PDF. Devolve o uuid do documento. */
    async uploadDocx(name: string, file: Uint8Array): Promise<string> {
      const r = await request<{ uuid?: string }>('POST', `/documents/${safe}/uploadbinary`, {
        base64_binary_file: Buffer.from(file).toString('base64'),
        mime_type: DOCX_MIME,
        name
      });
      if (!r.uuid) throw new D4SignError('A D4Sign não devolveu o documento criado.', 502);
      return r.uuid;
    },

    status,

    /**
     * Espera a D4Sign terminar de processar o arquivo (até ~20s), com poucas consultas: a consulta
     * também tem limite por hora. Se ele estourar, só espera mais um pouco e segue.
     */
    async waitProcessed(uuid: string): Promise<void> {
      for (let i = 0; i < 6; i++) {
        await sleep(3000);
        try {
          if ((await status(uuid)) !== D4_STATUS.PROCESSING) return;
        } catch (err) {
          if (!isKeyLimitError(err)) throw err;
          await sleep(8000);
          return;
        }
      }
    },

    /** Cliente como signatário (assinatura eletrônica com aceite; sem certificado nem selfie) */
    addSigner: (uuid: string, email: string) =>
      request('POST', `/documents/${uuid}/createlist`, {
        signers: [
          {
            email,
            act: '1',
            foreign: '0',
            certificadoicpbr: '0',
            assinatura_presencial: '0',
            docauth: '0',
            docauthandselfie: '0',
            embed_methodauth: 'email',
            embed_smsnumber: '',
            upload_allow: '0',
            upload_obs: ''
          }
        ]
      }),

    /** A D4Sign avisa este endereço quando o documento muda (ex: assinado) */
    addWebhook: (uuid: string, url: string) => request('POST', `/documents/${uuid}/webhooks`, { url }),

    send: (uuid: string, message: string) => request('POST', `/documents/${uuid}/sendtosigner`, { message, skip_email: '0', workflow: '0' }),

    cancel: (uuid: string, comment: string) => request('POST', `/documents/${uuid}/cancel`, { comment })
  };
}
