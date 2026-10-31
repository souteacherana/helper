# HELPER • Imersão Rise

Sistema de apoio ao evento **Imersão Rise 2026** (Espaço Altus, Barueri/SP — 31/10 e 01/11).

- **Dashboard** (`/dashboard`, closers e admin): a lista de participantes do **Rise 360** (a mesma da aba Imersão Rise → Participantes: ingresso, perfil, convite do Mastermind, presença, ICP, estilo, WhatsApp, Instagram e respostas do formulário, com os mesmos filtros) e, em cada pessoa, os botões **Cobrança** (proposta/cobrança no Asaas) e **Contrato** (D4Sign, depois que a entrada é paga). A pessoa é ligada ao cadastro do HELPER pelo WhatsApp (e pelo nome).
- **Closers**: ficha de vendas de cada participante (mentoria, pagamento, oferta, acompanhante), anotações de abordagem e mapa do salão.
- **Recepção** (sem login): busca pelo nome, crachá a entregar e check-in do dia.
- **Admin**: cadastro/edição, importação por planilha, equipe de closers, mapa (mesas e lugares), QR Codes dos crachás e zerar presenças.
- **Crachá digital** (`/badge/<id>`): página pública aberta pelo QR Code impresso no crachá.

## Tecnologia

React + TypeScript + Vite + Tailwind, banco e autenticação no **Supabase**, hospedagem e login (`/api/login`) no **Vercel**, fotos no **Vercel Blob**.

## Variáveis de ambiente

| Variável | Onde é usada | Observação |
|---|---|---|
| `VITE_SUPABASE_URL` | site | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | site | chave pública (anon) do Supabase |
| `VITE_PUBLIC_SITE_URL` | site | endereço oficial do site, **usado nos QR Codes** (ex: `https://helper.vercel.app`, sem barra no fim) |
| `TEAM_PIN` | servidor | PIN único dos closers |
| `ADMIN_PIN` | servidor | PIN do admin |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | chave secreta do Supabase (nunca com prefixo `VITE_`) |
| `BLOB_READ_WRITE_TOKEN` | scripts | só para subir fotos no Vercel Blob; o site não usa |
| `RISE_LINK_TOKEN` | servidor | link de integração do Rise 360 (Rise → Imersão Rise → Participantes → 🔗 Link sem senha → copiar). Pode colar o link inteiro ou só o código depois de `?k=`. Sem ele o Dashboard avisa que a integração não está configurada |

Tudo que começa com `VITE_` vai para o código do site (é público). PINs e chaves secretas ficam **sem** esse prefixo.

## Banco (Supabase)

Rode o arquivo [`supabase_schema.sql`](supabase_schema.sql) inteiro no SQL Editor. Ele pode ser executado mais de uma vez (é idempotente) e cria tabelas, permissões por perfil (RLS), funções da recepção/crachá, mapa, medidas do salão e presença por dia.

## Rodar localmente

```bash
npm install
npm run dev
```

Com o `.env` preenchido, o login funciona localmente (o `npm run dev` atende o `/api/login`).
Para testar sem banco (dados fictícios no navegador): `npx vite --mode demo` com um `.env.demo.local` contendo `VITE_SUPABASE_URL=` e `VITE_SUPABASE_ANON_KEY=` vazios.

## Publicar (Vercel)

1. Importar este repositório no Vercel (framework: Vite).
2. Cadastrar as variáveis de ambiente da tabela acima.
3. Deploy. O `vercel.json` já envia todas as rotas para o app, exceto `/api/*`.
4. Testar: login de closer e admin, recepção sem login, um crachá `/badge/<id>`.

## Operação do evento

- **Participantes**: importar a planilha uma vez (Admin → Importar planilha) e depois editar pelo sistema.
- **QR Codes**: gerar pelo Admin **a partir do site publicado** (ZIP ou folha para imprimir). O QR aponta para o código interno da pessoa: **editar** dados não muda o QR; **excluir e recadastrar** muda (o QR impresso deixa de funcionar).
- **Presença por dia**: o servidor decide o dia pelo horário de Brasília (até 31/10 = Dia 1; a partir de 01/11 = Dia 2).
- **Depois do ensaio**: Admin → Zerar presenças.
- **Trocar PIN**: editar a variável no Vercel e fazer Redeploy.
