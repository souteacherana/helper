/**
 * Chamadas à API do Asaas (produção). A chave fica só no servidor: ASAAS_API_KEY.
 * Erros do Asaas viram AsaasError com a mensagem que o próprio Asaas devolve.
 */
type Env = Record<string, string | undefined>;

const BASE_URL = 'https://api.asaas.com/v3';

export class AsaasError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string | null;
  deleted?: boolean;
}

export interface AsaasPayment {
  id: string;
  status: string;
  deleted?: boolean;
  installment?: string | null;
  invoiceUrl?: string;
  externalReference?: string | null;
}

export function asaasClient(env: Env) {
  const apiKey = env.ASAAS_API_KEY?.trim();
  if (!apiKey) throw new AsaasError('Asaas não configurado no servidor (ASAAS_API_KEY).', 500);

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: { access_token: apiKey!, 'Content-Type': 'application/json', 'User-Agent': 'HELPER-ImersaoRise' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = (await res.json().catch(() => ({}))) as { errors?: { description?: string }[] };
    if (!res.ok) {
      const message = data.errors?.map(e => e.description).filter(Boolean).join(' ') || `Asaas respondeu ${res.status}`;
      throw new AsaasError(message, res.status);
    }
    return data as T;
  }

  return {
    getCustomer: (id: string) => request<AsaasCustomer>('GET', `/customers/${encodeURIComponent(id)}`),

    async findCustomerByDocument(doc: string): Promise<AsaasCustomer | null> {
      const page = await request<{ data: AsaasCustomer[] }>('GET', `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=10`);
      return page.data.find(c => !c.deleted) ?? null;
    },

    createCustomer: (data: Record<string, unknown>) => request<AsaasCustomer>('POST', '/customers', data),

    createPayment: (data: Record<string, unknown>) => request<AsaasPayment>('POST', '/payments', data),

    /** Todas as cobranças de uma parte (no parcelado, uma por parcela) */
    async listPaymentsByReference(externalReference: string): Promise<AsaasPayment[]> {
      const page = await request<{ data: AsaasPayment[] }>(
        'GET',
        `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=100`
      );
      return page.data;
    },

    /** Remove a cobrança (ou o parcelamento inteiro). Já removida = ok. */
    async remove(kind: 'payments' | 'installments', id: string): Promise<void> {
      try {
        await request('DELETE', `/${kind}/${encodeURIComponent(id)}`);
      } catch (err) {
        if (!(err instanceof AsaasError && err.status === 404)) throw err;
      }
    }
  };
}

export type AsaasClient = ReturnType<typeof asaasClient>;
