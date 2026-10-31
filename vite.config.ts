import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleLogin } from './api/login.ts'

// O loadEnv do Vite expande "$NOME" dentro dos valores, e as chaves do Asaas começam com "$aact_".
// Para as rotas /api, os valores do .env são lidos como estão no arquivo.
function readRawEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

type Handler = (authorization: string | null, input: unknown, env: Record<string, string>) => Promise<{ status: number; body: unknown }>

// Rotas que recebem o cabeçalho Authorization (módulo e função exportada)
const AUTH_ROUTES: Record<string, [string, string]> = {
  '/api/sales/create': ['/api/sales/create.ts', 'handleCreateSale'],
  '/api/sales/cancel': ['/api/sales/cancel.ts', 'handleCancelSale'],
  '/api/sales/sync': ['/api/sales/sync.ts', 'handleSyncSale'],
  '/api/contracts/create': ['/api/contracts/create.ts', 'handleCreateContract'],
  '/api/contracts/sync': ['/api/contracts/sync.ts', 'handleSyncContract'],
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return JSON.parse(raw)
  } catch {
    return null // corpo inválido: cada rota responde 400
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Em produção as rotas /api rodam como Vercel Functions. No `npm run dev` este plugin
// atende as mesmas rotas com o .env local.
function apiDevServer(env: Record<string, string>): Plugin {
  return {
    name: 'helper-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/login', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, {})
        const result = await handleLogin(await readJson(req), env)
        send(res, result.status, result.body)
      })

      for (const [route, [file, exportName]] of Object.entries(AUTH_ROUTES)) {
        server.middlewares.use(route, async (req, res) => {
          if (req.method !== 'POST') return send(res, 405, {})
          try {
            const mod = await server.ssrLoadModule(file)
            const result = await (mod[exportName] as Handler)(req.headers.authorization ?? null, await readJson(req), env)
            send(res, result.status, result.body)
          } catch (err) {
            console.error(route, err)
            send(res, 500, { error: 'Erro inesperado no servidor.' })
          }
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...readRawEnv(path.join(process.cwd(), '.env')) }
  return {
    plugins: [react(), tailwindcss(), apiDevServer(env)],
  }
})
