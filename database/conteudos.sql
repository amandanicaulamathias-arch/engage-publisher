CREATE TABLE IF NOT EXISTS conteudos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  programacao_id INTEGER REFERENCES programacoes(id),
  tipo TEXT,
  titulo TEXT,
  legenda TEXT,
  status TEXT DEFAULT 'rascunho',
  token_aprovacao TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE conteudos
  ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS programacao_id INTEGER REFERENCES programacoes(id),
  ADD COLUMN IF NOT EXISTS tipo TEXT,
  ADD COLUMN IF NOT EXISTS titulo TEXT,
  ADD COLUMN IF NOT EXISTS legenda TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS token_aprovacao TEXT,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE conteudos
  ALTER COLUMN cliente_id SET DATA TYPE INTEGER,
  ALTER COLUMN programacao_id SET DATA TYPE INTEGER,
  ALTER COLUMN tipo SET DATA TYPE TEXT,
  ALTER COLUMN titulo SET DATA TYPE TEXT,
  ALTER COLUMN legenda SET DATA TYPE TEXT,
  ALTER COLUMN status SET DATA TYPE TEXT,
  ALTER COLUMN token_aprovacao SET DATA TYPE TEXT,
  ALTER COLUMN criado_em SET DATA TYPE TIMESTAMP,
  ALTER COLUMN status SET DEFAULT 'rascunho',
  ALTER COLUMN criado_em SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conteudos_token_aprovacao_unique'
  ) THEN
    ALTER TABLE conteudos
      ADD CONSTRAINT conteudos_token_aprovacao_unique UNIQUE (token_aprovacao);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conteudos_cliente_id
  ON conteudos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_conteudos_programacao_id
  ON conteudos (programacao_id);

CREATE INDEX IF NOT EXISTS idx_conteudos_cliente_programacao
  ON conteudos (cliente_id, programacao_id);

GRANT USAGE ON SCHEMA public TO externo_teste;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE conteudos TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE conteudos_id_seq TO externo_teste;
