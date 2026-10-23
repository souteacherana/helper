-- ========================================================
-- HELPER (Imersão Rise) • Supabase Database Schema
-- Execute este script INTEIRO no SQL Editor do seu projeto Supabase.
-- É seguro rodar mais de uma vez (idempotente) e funciona tanto em um
-- banco novo quanto em um banco que já tenha rodado versões anteriores
-- deste script.
-- ========================================================

-- 0. Migração (ajusta uma tabela attendees já existente para o formato atual,
--    não importa de qual versão antiga ela esteja — cada coluna é adicionada
--    só se ainda não existir)
ALTER TABLE IF EXISTS public.attendees DROP COLUMN IF EXISTS is_special;
ALTER TABLE IF EXISTS public.attendees DROP COLUMN IF EXISTS is_flexge;
ALTER TABLE IF EXISTS public.attendees DROP COLUMN IF EXISTS is_meteoric;

ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS is_sponsor BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'CONFIRMED';
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS is_present BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS check_in_time TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS is_mentee BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS near_renewal BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS is_accompanied BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS accompanied_by TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS companion_name TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS current_mentorship TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS cycle TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS cycle_end_date TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS mentorship_remaining TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS is_paying BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS installment_value TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS remaining_installments INTEGER;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS mentorship_value TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS amount_paid TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS credit_balance TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS offer_to_make TEXT;
ALTER TABLE IF EXISTS public.attendees ADD COLUMN IF NOT EXISTS special_condition TEXT;

-- Normaliza cycle_end_date de "DD/MM/AAAA" (formato antigo) para "AAAA-MM-DD" (ISO, usado pelo seletor de data)
UPDATE public.attendees
SET cycle_end_date = substring(cycle_end_date from 7 for 4) || '-' || substring(cycle_end_date from 4 for 2) || '-' || substring(cycle_end_date from 1 for 2)
WHERE cycle_end_date ~ '^\d{2}/\d{2}/\d{4}$';

-- 1. Tabela de Participantes (Attendees)
CREATE TABLE IF NOT EXISTS public.attendees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  instagram TEXT,
  level TEXT NOT NULL CHECK (level IN ('VIP', 'SILVER')),
  is_sponsor BOOLEAN DEFAULT FALSE, -- Flag "Patrocinador?"
  status TEXT DEFAULT 'CONFIRMED',
  is_present BOOLEAN DEFAULT FALSE,
  check_in_time TEXT,
  is_mentee BOOLEAN DEFAULT FALSE,
  near_renewal BOOLEAN DEFAULT FALSE,
  photo_url TEXT,

  -- Acompanhante
  is_accompanied BOOLEAN DEFAULT FALSE,
  accompanied_by TEXT CHECK (accompanied_by IN ('Esposo(a)', 'Familiar', 'Professor parceiro', 'Colaborador', 'Amigo')),
  companion_name TEXT,

  -- Situação de mentoria
  current_mentorship TEXT,
  cycle TEXT,
  cycle_end_date TEXT, -- formato ISO "AAAA-MM-DD"
  mentorship_remaining TEXT,
  is_paying BOOLEAN DEFAULT FALSE,
  payment_method TEXT CHECK (payment_method IN ('Boleto', 'Cartão de Crédito')),
  installment_value TEXT,
  remaining_installments INTEGER,
  mentorship_value TEXT,   -- Valor total da mentoria
  amount_paid TEXT,        -- Valor já pago
  credit_balance TEXT,     -- Valor em haver (tempo restante convertido em dinheiro)

  -- Oferta
  offer_to_make TEXT,
  special_condition TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Anotações dos Closers (Closer Notes)
CREATE TABLE IF NOT EXISTS public.closer_notes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attendee_id TEXT NOT NULL REFERENCES public.attendees(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  closer_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2b. Tabela da Equipe de Closers (nomes selecionáveis no login)
CREATE TABLE IF NOT EXISTS public.closers (
  name TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.closers (name) VALUES
  ('Carla'), ('Davi'), ('Emmy'), ('Ricardo'), ('Everton')
ON CONFLICT (name) DO NOTHING;

-- 3. Segurança (RLS por perfil)
--    Closer e Admin entram com PIN pelo /api/login, que devolve uma sessão do Supabase
--    com app_metadata.app_role = 'CLOSER' | 'ADMIN'. Visitante sem login (recepção e crachá
--    público) não lê as tabelas: usa só as funções reception_list, set_presence e public_badge.
ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'app_role', '')
$$;

-- Remove as policies antigas (acesso total para qualquer um)
DROP POLICY IF EXISTS "Acesso Leitura e Escrita Attendees" ON public.attendees;
DROP POLICY IF EXISTS "Acesso Leitura e Escrita Closer Notes" ON public.closer_notes;
DROP POLICY IF EXISTS "Acesso Leitura e Escrita Closers" ON public.closers;

-- Participantes: equipe lê tudo; só o admin cria, edita e exclui
DROP POLICY IF EXISTS "attendees_select_team" ON public.attendees;
CREATE POLICY "attendees_select_team" ON public.attendees
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));

DROP POLICY IF EXISTS "attendees_write_admin" ON public.attendees;
CREATE POLICY "attendees_write_admin" ON public.attendees
  FOR ALL TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

-- Anotações: equipe lê e escreve; só o admin exclui
DROP POLICY IF EXISTS "notes_select_team" ON public.closer_notes;
CREATE POLICY "notes_select_team" ON public.closer_notes
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));

DROP POLICY IF EXISTS "notes_insert_team" ON public.closer_notes;
CREATE POLICY "notes_insert_team" ON public.closer_notes
  FOR INSERT TO authenticated WITH CHECK (public.app_role() IN ('CLOSER', 'ADMIN'));

DROP POLICY IF EXISTS "notes_delete_admin" ON public.closer_notes;
CREATE POLICY "notes_delete_admin" ON public.closer_notes
  FOR DELETE TO authenticated USING (public.app_role() = 'ADMIN');

-- Equipe de closers: nomes são públicos (aparecem na tela de login); só o admin altera
DROP POLICY IF EXISTS "closers_select_all" ON public.closers;
CREATE POLICY "closers_select_all" ON public.closers
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "closers_write_admin" ON public.closers;
CREATE POLICY "closers_write_admin" ON public.closers
  FOR ALL TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

-- Recepção (sem login): só nome, foto, tipo de crachá a entregar e presença
DROP FUNCTION IF EXISTS public.reception_list();
CREATE FUNCTION public.reception_list()
RETURNS TABLE (
  id TEXT, name TEXT, photo_url TEXT, level TEXT, is_sponsor BOOLEAN, is_present BOOLEAN, check_in_time TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.photo_url, a.level, a.is_sponsor, a.is_present, a.check_in_time
  FROM public.attendees a
  ORDER BY a.name
$$;

-- Check-in / desfazer check-in: altera só a presença. O horário vem do servidor.
CREATE OR REPLACE FUNCTION public.set_presence(p_id TEXT, p_present BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_time TEXT := CASE WHEN p_present
    THEN to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ELSE NULL END;
BEGIN
  UPDATE public.attendees SET is_present = p_present, check_in_time = v_time WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante não encontrado: %', p_id;
  END IF;
  RETURN v_time;
END
$$;

-- Crachá público (QR Code): só os dados que aparecem no crachá
CREATE OR REPLACE FUNCTION public.public_badge(p_id TEXT)
RETURNS TABLE (id TEXT, name TEXT, photo_url TEXT, level TEXT, is_sponsor BOOLEAN, is_present BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.photo_url, a.level, a.is_sponsor, a.is_present
  FROM public.attendees a
  WHERE a.id = p_id
$$;

REVOKE ALL ON FUNCTION public.reception_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_presence(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_badge(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reception_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_presence(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_badge(TEXT) TO anon, authenticated;

-- Aviso instantâneo para os tablets da recepção: a cada mudança em attendees, manda um
-- "ping" vazio no canal público 'reception' (sem nenhum dado). Ao receber, o tablet busca a
-- lista de novo pela reception_list. Se o envio falhar, a gravação segue normalmente.
CREATE OR REPLACE FUNCTION public.notify_reception()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'changed', 'reception', false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS attendees_notify_reception ON public.attendees;
CREATE TRIGGER attendees_notify_reception
  AFTER INSERT OR UPDATE OR DELETE ON public.attendees
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_reception();

-- 3b. Realtime: check-ins, edições e anotações aparecem na hora em todos os aparelhos
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendees', 'closer_notes', 'closers'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 4. Dados de exemplo
--    Removidos: o script roda no banco de produção e recriaria participantes fictícios a cada execução.
--    Para cadastrar participantes, use a importação de planilha no painel Admin.

-- ========================================================
-- 5. Mapa do evento (mesas e lugares)
--    O admin posiciona as mesas e define quem senta em cada lugar; closers consultam.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.event_tables (
  id TEXT PRIMARY KEY DEFAULT ('mesa-' || substr(gen_random_uuid()::text, 1, 8)),
  label TEXT NOT NULL,
  x REAL NOT NULL,   -- posição do centro da mesa no mapa (coordenadas do desenho)
  y REAL NOT NULL,
  seats INTEGER NOT NULL DEFAULT 7 CHECK (seats BETWEEN 1 AND 16),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS table_id TEXT REFERENCES public.event_tables(id) ON DELETE SET NULL;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS seat_number INTEGER;

-- Um lugar comporta uma pessoa só
CREATE UNIQUE INDEX IF NOT EXISTS attendees_seat_unique
  ON public.attendees (table_id, seat_number) WHERE table_id IS NOT NULL;

ALTER TABLE public.event_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_team" ON public.event_tables;
CREATE POLICY "tables_select_team" ON public.event_tables
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));

DROP POLICY IF EXISTS "tables_write_admin" ON public.event_tables;
CREATE POLICY "tables_write_admin" ON public.event_tables
  FOR ALL TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

-- Coloca alguém em um lugar (ou esvazia o lugar, com p_attendee_id NULL) numa única operação:
-- quem ocupava o lugar fica sem lugar, e a pessoa sai do lugar anterior dela.
CREATE OR REPLACE FUNCTION public.assign_seat(p_attendee_id TEXT, p_table_id TEXT, p_seat INTEGER)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.app_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Apenas o admin organiza o mapa';
  END IF;

  UPDATE public.attendees SET table_id = NULL, seat_number = NULL
  WHERE table_id = p_table_id AND seat_number = p_seat;

  IF p_attendee_id IS NOT NULL THEN
    UPDATE public.attendees SET table_id = p_table_id, seat_number = p_seat WHERE id = p_attendee_id;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.assign_seat(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_seat(TEXT, TEXT, INTEGER) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_tables;
  END IF;
END $$;

-- ========================================================
-- 6. Medidas do salão (mapa em escala real)
--    Uma linha só (id = 1). O admin informa as medidas em metros e o mapa se ajusta.
--    Os valores padrão reproduzem a escala do croqui original.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.event_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hall_width_m REAL NOT NULL DEFAULT 47.1 CHECK (hall_width_m BETWEEN 5 AND 200),
  hall_depth_m REAL NOT NULL DEFAULT 7.4 CHECK (hall_depth_m BETWEEN 3 AND 200),
  vip_width_m REAL NOT NULL DEFAULT 12.7 CHECK (vip_width_m BETWEEN 1 AND 200),
  table_diameter_m REAL NOT NULL DEFAULT 1.6 CHECK (table_diameter_m BETWEEN 0.6 AND 4),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.event_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_team" ON public.event_settings;
CREATE POLICY "settings_select_team" ON public.event_settings
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));

DROP POLICY IF EXISTS "settings_update_admin" ON public.event_settings;
CREATE POLICY "settings_update_admin" ON public.event_settings
  FOR UPDATE TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_settings;
  END IF;
END $$;

-- ========================================================
-- 7. Presença por dia (evento de 2 dias: 31/10 e 01/11/2026)
--    Cada participante tem um check-in por dia. O "dia de hoje" é decidido pelo
--    servidor no horário de Brasília: a partir de 01/11 é o Dia 2; antes, Dia 1.
--    is_present/check_in_time continuam sendo atualizados como espelho do dia atual.
-- ========================================================
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS check_in_day1 TEXT;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS check_in_day2 TEXT;

CREATE OR REPLACE FUNCTION public.event_day()
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::date >= DATE '2026-11-01' THEN 2 ELSE 1 END
$$;

CREATE OR REPLACE FUNCTION public.set_presence(p_id TEXT, p_present BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_time TEXT := CASE WHEN p_present
    THEN to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ELSE NULL END;
BEGIN
  IF public.event_day() = 2 THEN
    UPDATE public.attendees SET check_in_day2 = v_time, is_present = p_present, check_in_time = v_time WHERE id = p_id;
  ELSE
    UPDATE public.attendees SET check_in_day1 = v_time, is_present = p_present, check_in_time = v_time WHERE id = p_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante não encontrado: %', p_id;
  END IF;
  RETURN v_time;
END
$$;

-- Recepção: passa a receber a presença dos dois dias (o app mostra a de hoje)
DROP FUNCTION IF EXISTS public.reception_list();
CREATE FUNCTION public.reception_list()
RETURNS TABLE (
  id TEXT, name TEXT, photo_url TEXT, level TEXT, is_sponsor BOOLEAN, check_in_day1 TEXT, check_in_day2 TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.photo_url, a.level, a.is_sponsor, a.check_in_day1, a.check_in_day2
  FROM public.attendees a
  ORDER BY a.name
$$;

-- Crachá público: "presente" = fez check-in hoje
CREATE OR REPLACE FUNCTION public.public_badge(p_id TEXT)
RETURNS TABLE (id TEXT, name TEXT, photo_url TEXT, level TEXT, is_sponsor BOOLEAN, is_present BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.photo_url, a.level, a.is_sponsor,
         (CASE WHEN public.event_day() = 2 THEN a.check_in_day2 ELSE a.check_in_day1 END) IS NOT NULL
  FROM public.attendees a
  WHERE a.id = p_id
$$;

-- Admin: zera a presença de todos (ex: depois do ensaio, antes do evento)
CREATE OR REPLACE FUNCTION public.reset_presence()
RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF public.app_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Apenas o admin pode zerar as presenças';
  END IF;
  UPDATE public.attendees
  SET check_in_day1 = NULL, check_in_day2 = NULL, is_present = FALSE, check_in_time = NULL
  WHERE check_in_day1 IS NOT NULL OR check_in_day2 IS NOT NULL OR is_present;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.reception_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reception_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_day() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_presence() TO authenticated;

-- ========================================================
-- 8. Tipo de acompanhante "Familiar" (filho, irmã, pais...)
--    Recria a regra da coluna accompanied_by para aceitar o novo tipo.
-- ========================================================
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.attendees'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%accompanied_by%'
  LOOP
    EXECUTE format('ALTER TABLE public.attendees DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.attendees ADD CONSTRAINT attendees_accompanied_by_check
  CHECK (accompanied_by IS NULL OR accompanied_by IN ('Esposo(a)', 'Familiar', 'Professor parceiro', 'Colaborador', 'Amigo'));

-- ========================================================
-- 9. Dados de cobrança e contrato (vendas na Imersão)
--    Ficha separada da ficha comercial, com os campos que o jurídico usa no contrato.
--    CPF, RG e endereço: só o admin lê e edita. Os closers usam billing_status() (seção 10),
--    que diz só se a ficha está completa (e o que falta), sem nenhum dado pessoal.
--    Pode ser rodada de novo sozinha (ex: depois de mudar quais campos são obrigatórios).
--    Na empresa (PJ), os campos de pessoa são do representante que assina.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.billing_profiles (
  attendee_id TEXT PRIMARY KEY REFERENCES public.attendees(id) ON DELETE CASCADE,
  person_type TEXT NOT NULL DEFAULT 'PF' CHECK (person_type IN ('PF', 'PJ')),
  full_name TEXT,
  nationality TEXT,
  marital_status TEXT,
  rg TEXT,
  cpf TEXT,
  email TEXT,
  phone TEXT,
  street TEXT,
  address_number TEXT,
  complement TEXT,
  district TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  cnpj TEXT,
  company_name TEXT,
  trade_name TEXT,
  asaas_customer_id TEXT,
  -- De onde veio cada campo, ex: {"cpf": "asaas", "rg": "d4sign", "email": "manual"}
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_admin" ON public.billing_profiles;
CREATE POLICY "billing_admin" ON public.billing_profiles
  FOR ALL TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

-- Campos obrigatórios que faltam (mesma regra de missingBillingFields em src/lib/billing.ts):
-- o que o termo de adesão da Imersão pede. Nome, CPF (ou CNPJ, se empresa), e-mail e telefone;
-- o resto da ficha é opcional.
CREATE OR REPLACE FUNCTION public.billing_missing(p public.billing_profiles)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p.person_type = 'PJ' AND coalesce(trim(p.cnpj), '') = '' THEN 'CNPJ' END,
    CASE WHEN coalesce(trim(p.full_name), '') = '' THEN 'Nome' END,
    CASE WHEN p.person_type = 'PF' AND coalesce(trim(p.cpf), '') = '' THEN 'CPF' END,
    CASE WHEN coalesce(trim(p.email), '') = '' THEN 'E-mail' END,
    CASE WHEN coalesce(trim(p.phone), '') = '' THEN 'Telefone' END
  ], NULL)
$$;


-- ========================================================
-- 10. Propostas e vendas (Asaas)
--    Cada produto tem valor total fixo. O closer divide o total em partes (a primeira é a
--    entrada; ex: Pix + cartão A + cartão B) e o servidor cria uma cobrança no Asaas por parte.
--    Vendas e partes só são gravadas pelo servidor (/api/sales/* e webhook do Asaas, com a
--    service key); a equipe só lê, em tempo real. A venda conta como fechada quando a entrada é paga.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_value NUMERIC(12, 2) CHECK (total_value IS NULL OR total_value > 0),
  condition TEXT,
  -- Só aparece para quem está em offer_access (ex: Mastermind)
  restricted BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.offers (id, name, restricted, sort_order) VALUES
  ('partiu10k', 'Partiu 10K', FALSE, 1),
  ('elite', 'Professores de Elite', FALSE, 2),
  ('mastermind', 'Mastermind', TRUE, 3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.offer_access (
  offer_id TEXT NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  attendee_id TEXT NOT NULL REFERENCES public.attendees(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, attendee_id)
);

CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY DEFAULT ('venda-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  -- RESTRICT: quem tem venda não pode ser excluído por engano
  attendee_id TEXT NOT NULL REFERENCES public.attendees(id) ON DELETE RESTRICT,
  offer_id TEXT NOT NULL REFERENCES public.offers(id),
  offer_name TEXT NOT NULL,
  total_value NUMERIC(12, 2) NOT NULL,
  closer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'PENDING', 'ENTRY_PAID', 'PAID', 'CANCELLED', 'FAILED')),
  error TEXT,
  asaas_customer_id TEXT,
  entry_paid_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS sales_attendee_idx ON public.sales (attendee_id);

CREATE TABLE IF NOT EXISTS public.sale_parts (
  sale_id TEXT NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  -- 0 = entrada
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 9),
  method TEXT NOT NULL CHECK (method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  installments INTEGER NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 12),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED')),
  paid_installments INTEGER NOT NULL DEFAULT 0,
  asaas_payment_id TEXT,
  asaas_installment_id TEXT,
  invoice_url TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (sale_id, position)
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers_select_team" ON public.offers;
CREATE POLICY "offers_select_team" ON public.offers
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));
DROP POLICY IF EXISTS "offers_write_admin" ON public.offers;
CREATE POLICY "offers_write_admin" ON public.offers
  FOR ALL TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

DROP POLICY IF EXISTS "offer_access_select_team" ON public.offer_access;
CREATE POLICY "offer_access_select_team" ON public.offer_access
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));
DROP POLICY IF EXISTS "offer_access_write_admin" ON public.offer_access;
CREATE POLICY "offer_access_write_admin" ON public.offer_access
  FOR ALL TO authenticated
  USING (public.app_role() = 'ADMIN') WITH CHECK (public.app_role() = 'ADMIN');

-- Vendas: equipe só lê (quem grava é o servidor)
DROP POLICY IF EXISTS "sales_select_team" ON public.sales;
CREATE POLICY "sales_select_team" ON public.sales
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));
DROP POLICY IF EXISTS "sale_parts_select_team" ON public.sale_parts;
CREATE POLICY "sale_parts_select_team" ON public.sale_parts
  FOR SELECT TO authenticated USING (public.app_role() IN ('CLOSER', 'ADMIN'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['offers', 'offer_access', 'sales', 'sale_parts'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Para cobrar no Asaas bastam nome, CPF/CNPJ e e-mail (empresa sem razão social: cobra no
-- nome do representante). Mesma regra de missingForCharge em src/lib/billing.ts.
CREATE OR REPLACE FUNCTION public.billing_missing_charge(p public.billing_profiles)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN coalesce(trim(CASE WHEN p.person_type = 'PJ' THEN coalesce(nullif(trim(p.company_name), ''), p.full_name) ELSE p.full_name END), '') = '' THEN 'Nome' END,
    CASE WHEN p.person_type = 'PJ' AND coalesce(trim(p.cnpj), '') = '' THEN 'CNPJ' END,
    CASE WHEN p.person_type = 'PF' AND coalesce(trim(p.cpf), '') = '' THEN 'CPF' END,
    CASE WHEN coalesce(trim(p.email), '') = '' THEN 'E-mail' END
  ], NULL)
$$;

-- Equipe: situação da ficha de cada participante (o que falta para o contrato e só para
-- cobrar), sem nenhum dado pessoal
DROP FUNCTION IF EXISTS public.billing_status();
CREATE FUNCTION public.billing_status()
RETURNS TABLE (attendee_id TEXT, person_type TEXT, missing TEXT[], missing_for_charge TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         coalesce(b.person_type, 'PF'),
         CASE WHEN b.attendee_id IS NULL THEN ARRAY['Ficha vazia'] ELSE public.billing_missing(b) END,
         CASE WHEN b.attendee_id IS NULL THEN ARRAY['Ficha vazia'] ELSE public.billing_missing_charge(b) END
  FROM public.attendees a
  LEFT JOIN public.billing_profiles b ON b.attendee_id = a.id
  WHERE public.app_role() IN ('CLOSER', 'ADMIN')
$$;

REVOKE ALL ON FUNCTION public.billing_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_status() TO authenticated;
