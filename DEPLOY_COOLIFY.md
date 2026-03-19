# Deploy no Coolify

## App

- Tipo: `Node.js`
- Start Command: `npm start`
- Port: `3000`

## Variaveis de ambiente

```env
PORT=3000
DATABASE_URL=postgres://USUARIO:SENHA@HOST:PORTA/BANCO
APP_BASE_URL=https://app.seudominio.com
UPLOADS_DIR=/data/uploads
SMTP_HOST=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario
SMTP_PASS=senha
SMTP_FROM=Equipe <no-reply@seudominio.com>
```

## Storage persistente

Crie um volume persistente montado em `/data/uploads`.

Os uploads serao servidos em `/uploads/...`.

## Dominio

- Defina o dominio da aplicacao, por exemplo `app.seudominio.com`
- Atualize `APP_BASE_URL` para esse mesmo dominio com `https`

## Banco

- Se usar PostgreSQL do Coolify, copie a connection string para `DATABASE_URL`
- Rode as migracoes da pasta `database/` no banco de producao

Ordem recomendada:

1. `database/conteudos.sql`
2. `database/conteudos_midias.sql`
3. `database/programacoes_nome.sql`
4. `database/conteudos_detalhes.sql`
5. `database/convites.sql`
6. `database/crud_permissoes.sql`

## Healthcheck

Use o endpoint:

```text
/health
```
