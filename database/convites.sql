CREATE TABLE IF NOT EXISTS public.convites (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pendente',
  expirado_em TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_convites_email
  ON public.convites (email);

CREATE INDEX IF NOT EXISTS idx_convites_status
  ON public.convites (status);

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS nome TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_email_unique'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_email_unique UNIQUE (email);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.convites TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.convites_id_seq TO externo_teste;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usuarios TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.usuarios_id_seq TO externo_teste;
