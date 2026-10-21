/**
 * POST /api/login — valida o PIN no servidor e devolve uma sessão do Supabase.
 *
 * Os PINs ficam só nas variáveis de ambiente do servidor (Vercel), nunca no código do site:
 *   TEAM_PIN                   PIN único da equipe de closers
 *   ADMIN_PIN                  PIN do admin
 *   SUPABASE_SERVICE_ROLE_KEY  chave secreta do Supabase (Project Settings → API)
 *
 * Cada perfil tem um usuário fixo no Supabase Auth (criado automaticamente no primeiro login)
 * com app_metadata.app_role = 'CLOSER' | 'ADMIN'. As policies do banco usam esse valor.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type Role = 'CLOSER' | 'ADMIN';
type Env = Record<string, string | undefined>;

export interface LoginResult {
  status: number;
  body: { error: string } | { access_token: string; refresh_token: string };
}

const ROLE_EMAIL: Record<Role, string> = {
  CLOSER: 'closer@helper.imersaorise.app',
  ADMIN: 'admin@helper.imersaorise.app'
};

const ROLE_PIN_VAR: Record<Role, string> = {
  CLOSER: 'TEAM_PIN',
  ADMIN: 'ADMIN_PIN'
};

// Comparação em tempo constante (não revela quantos dígitos acertou pelo tempo de resposta)
function samePin(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const fail = (status: number, error: string): LoginResult => ({ status, body: { error } });

export async function handleLogin(input: unknown, env: Env): Promise<LoginResult> {
  const { role, pin } = (input ?? {}) as { role?: unknown; pin?: unknown };

  if ((role !== 'CLOSER' && role !== 'ADMIN') || typeof pin !== 'string' || !pin) {
    return fail(400, 'Requisição inválida.');
  }

  const expectedPin = env[ROLE_PIN_VAR[role]];
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expectedPin || !supabaseUrl || !serviceKey) {
    console.error(`Login indisponível: configure ${ROLE_PIN_VAR[role]}, SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL.`);
    return fail(500, 'Login não configurado no servidor. Avise o administrador.');
  }

  if (!samePin(pin.trim(), expectedPin.trim())) {
    // Atraso em PIN errado deixa tentativas em massa bem mais lentas
    await new Promise(resolve => setTimeout(resolve, 1000));
    return fail(401, role === 'ADMIN' ? 'PIN do Admin incorreto.' : 'PIN incorreto.');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const email = ROLE_EMAIL[role];

  // Garante o usuário do perfil (no primeiro login ele ainda não existe)
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { app_role: role }
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    console.error('createUser failed:', created.error);
    return fail(500, 'Não foi possível entrar agora. Tente novamente.');
  }

  // Gera um link mágico e o troca por uma sessão aqui mesmo (nenhum e-mail é enviado)
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.properties?.hashed_token) {
    console.error('generateLink failed:', link.error);
    return fail(500, 'Não foi possível entrar agora. Tente novamente.');
  }

  const verified = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  const session = verified.data.session;
  if (verified.error || !session) {
    console.error('verifyOtp failed:', verified.error);
    return fail(500, 'Não foi possível entrar agora. Tente novamente.');
  }

  return { status: 200, body: { access_token: session.access_token, refresh_token: session.refresh_token } };
}

// Vercel Function (Node.js runtime, Web API)
export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  const result = await handleLogin(input, process.env);
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
