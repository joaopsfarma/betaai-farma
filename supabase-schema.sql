-- ─── FarmaIA — Schema Supabase ───────────────────────────────────────────────
-- Rodar no SQL Editor do painel do Supabase: https://supabase.com/dashboard

-- Tabela de estado do app por usuário (substitui localStorage)
CREATE TABLE IF NOT EXISTS app_state (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  value       JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_state_updated_at
  BEFORE UPDATE ON app_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security: cada usuário só vê seus próprios dados
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_state" ON app_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tabela de cache do bot WhatsApp (substitui Vercel KV)
CREATE TABLE IF NOT EXISTS bot_cache (
  key         TEXT        PRIMARY KEY,
  value       JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER bot_cache_updated_at
  BEFORE UPDATE ON bot_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Bot usa service_role key — sem RLS necessário
-- (caso queira restringir, descomente abaixo)
-- ALTER TABLE bot_cache ENABLE ROW LEVEL SECURITY;
