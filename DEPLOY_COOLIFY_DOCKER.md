# Deploy no Coolify com Docker

## Arquivos usados

- `Dockerfile`
- `docker-compose.yml`

## Variaveis de ambiente

Configure no Coolify:

```env
PORT=3000
DATABASE_URL=postgres://USUARIO:SENHA@HOST:5432/BANCO
SESSION_SECRET=troque-por-uma-chave-segura
APP_BASE_URL=https://engagemktmedico.com.br
PG_SSL=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
CORS_ORIGIN=
```

## Subindo com Dockerfile

1. Envie o projeto para um repositório Git.
2. No Coolify, crie um novo recurso de aplicacao.
3. Escolha o repositório.
4. Selecione a opcao de deploy por `Dockerfile`.
5. Confirme a porta `3000`.
6. Adicione as variaveis de ambiente.
7. Crie um storage persistente montado em `/data/uploads`.
8. Adicione o dominio publico.
9. Faça o deploy.

## Subindo com Docker Compose

1. No Coolify, crie um novo recurso usando `Docker Compose`.
2. Aponte para o arquivo `docker-compose.yml`.
3. Preencha as variaveis de ambiente exigidas.
4. Faça o deploy.

## Validacao

Depois do deploy, teste:

- `/health`
- `/login.html`
- `/dashboard.html`

Resposta esperada do healthcheck:

```json
{
  "status": "ok",
  "database": "ok"
}
```

## Observacoes

- O banco PostgreSQL continua externo.
- Os uploads ficam persistidos no volume montado em `/data/uploads`.
- O app escuta internamente na porta `3000`.
