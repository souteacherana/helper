/**
 * Chamadas à API da D4Sign. As chaves ficam só no servidor:
 *   D4SIGN_TOKEN_API, D4SIGN_CRYPT_KEY  credenciais da conta
 *   D4SIGN_SAFE_UUID                    cofre onde os contratos do evento são criados ("Imersão Rise 2026")
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

export function d4signClient(env: Env) {
  const token = env.D4SIGN_TOKEN_API?.trim();
  const crypt = env.D4SIGN_CRYPT_KEY?.trim();
  const safe = env.D4SIGN_SAFE_UUID?.trim();
  if (!token || !crypt || !safe) throw new D4SignError('D4Sign não configurada no servidor (D4SIGN_TOKEN_API, D4SIGN_CRYPT_KEY, D4SIGN_SAFE_UUID).', 500);
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

    /** Espera a D4Sign terminar de processar o arquivo (até ~20s). */
    async waitProcessed(uuid: string): Promise<void> {
      for (let i = 0; i < 10; i++) {
        if ((await status(uuid)) !== D4_STATUS.PROCESSING) return;
        await new Promise(r => setTimeout(r, 2000));
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
