ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS nome TEXT;

UPDATE public.programacoes
SET nome = COALESCE(nome, CONCAT('Programação ', id))
WHERE nome IS NULL OR TRIM(nome) = '';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.programacoes TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.programacoes_id_seq TO externo_teste;
