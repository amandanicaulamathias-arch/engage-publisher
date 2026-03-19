ALTER TABLE public.conteudos
  ADD COLUMN IF NOT EXISTS imagem_post_url TEXT,
  ADD COLUMN IF NOT EXISTS imagens_carrossel_urls TEXT,
  ADD COLUMN IF NOT EXISTS video_reels_url TEXT,
  ADD COLUMN IF NOT EXISTS capa_reels_url TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conteudos TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.conteudos_id_seq TO externo_teste;
