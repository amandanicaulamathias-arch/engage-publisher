ALTER TABLE public.conteudos
  ADD COLUMN IF NOT EXISTS conteudo TEXT,
  ADD COLUMN IF NOT EXISTS data_publicacao DATE;

UPDATE public.conteudos
SET conteudo = COALESCE(conteudo, legenda, titulo, '')
WHERE conteudo IS NULL;

UPDATE public.conteudos
SET data_publicacao = COALESCE(data_publicacao, DATE(criado_em), CURRENT_DATE)
WHERE data_publicacao IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conteudos TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.conteudos_id_seq TO externo_teste;
