import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleLogin } from './api/login.ts'

// Em produção o /api/login roda como Vercel Function. No `npm run dev` este plugin
// atende a mesma rota, lendo os PINs e a service key do .env local.
function apiDevServer(env: Record<string, string>): Plugin {
  return {
    name: 'helper-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let raw = ''
        for await (const chunk of req) raw += chunk
        let input: unknown = null
        try {
          input = JSON.parse(raw)
        } catch {
          // corpo inválido: handleLogin responde 400
        }
        const result = await handleLogin(input, env)
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), apiDevServer(loadEnv(mode, process.cwd(), ''))],
}))
