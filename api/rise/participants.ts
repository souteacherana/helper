/**
 * POST /api/rise/participants — lista de participantes da Imersão vinda do Rise 360 (CRM).
 *
 * O Rise guarda a lista cruzada (recepção + credenciamento + formulário): ingresso, perfil,
 * convite do Mastermind, presença, ICP, estilo, Instagram, WhatsApp e as respostas. Ele expõe
 * tudo por uma RPC só de leitura (participantes_publico), protegida por um token de link que
 * se cria e se desliga no Rise (Imersão Rise → Participantes → "Link sem senha").
 *
 * O token fica só no servidor (RISE_LINK_TOKEN, sem prefixo VITE_) e só a equipe do HELPER
 * (closer ou admin logado) recebe a lista. A RPC já vem sem e-mail e sem prontidão.
 */
import { json, adminDb, teamRoleFromRequest } from '../_lib/server.js';

type Env = Record<string, string | undefined>;

// Endereço e chave PUBLICÁVEL do Supabase do Rise (a mesma que está no site do Rise).
// A chave publicável não lê tabela nenhuma; quem libera os dados é o token do link.
const RISE_URL = 'https://qhbiluiczlxgykgjetnx.supabase.co';
const RISE_PUBLISHABLE_KEY = 'sb_publishable_KJt1d_-vMiUe3KDCJgtHTQ_9_TWBycA';

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleRiseParticipants(authorization: string | null, _input: unknown, env: Env): Promise<ApiResult> {
  const db = adminDb(env);
  if (!(await teamRoleFromRequest(db, authorization))) return { status: 401, body: { error: 'Sessão expirada. Entre novamente no HELPER.' } };

  // Aceita o código sozinho ou o link inteiro copiado do Rise (…/participantes.html?k=<código>)
  const raw = (env.RISE_LINK_TOKEN || '').trim();
  const token = (/[?&]k=([^&#\s]+)/.exec(raw)?.[1] ?? raw).trim();
  if (!token) return { status: 503, body: { error: 'Integração com o Rise não configurada (falta RISE_LINK_TOKEN no Vercel).' } };
  const url = (env.RISE_SUPABASE_URL || RISE_URL).replace(/\/$/, '');
  const key = env.RISE_SUPABASE_KEY || RISE_PUBLISHABLE_KEY;

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/participantes_publico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_token: token })
    });
  } catch (err) {
    console.error('rise fetch failed:', err);
    return { status: 502, body: { error: 'Não consegui falar com o Rise agora. Tente de novo.' } };
  }
  if (!res.ok) return { status: 502, body: { error: `O Rise respondeu ${res.status}.` } };
  const data = (await res.json().catch(() => null)) as { erro?: string; participantes?: unknown[] } | null;
  if (!data) return { status: 502, body: { error: 'Resposta inválida do Rise.' } };
  if (data.erro === 'expirado') return { status: 409, body: { error: 'O link de integração do Rise expirou. Crie outro no Rise e troque o RISE_LINK_TOKEN no Vercel.' } };
  if (data.erro) return { status: 409, body: { error: 'O link de integração do Rise foi desligado ou é inválido. Confira o RISE_LINK_TOKEN no Vercel.' } };
  return { status: 200, body: { participantes: data.participantes ?? [], lidoEm: new Date().toISOString() } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  try {
    const result = await handleRiseParticipants(request.headers.get('authorization'), null, process.env);
    return json(result.body, result.status);
  } catch (err) {
    console.error('rise participants crashed:', err);
    return json({ error: 'Erro inesperado no servidor.' }, 500);
  }
}
