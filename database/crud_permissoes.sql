GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes TO externo_teste;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.programacoes TO externo_teste;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conteudos TO externo_teste;

GRANT USAGE, SELECT ON SEQUENCE public.clientes_id_seq TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.programacoes_id_seq TO externo_teste;
GRANT USAGE, SELECT ON SEQUENCE public.conteudos_id_seq TO externo_teste;
