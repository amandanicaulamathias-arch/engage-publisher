const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://engage_user:NovaSenha123@127.0.0.1:5432/postgres';

const NODE_ENV = process.env.NODE_ENV || 'development';

const pool = new Pool({
  connectionString,
  ssl: process.env.PG_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000)
});

pool.on('error', (error) => {
  console.error('[DB]', {
    message: 'Erro inesperado no pool PostgreSQL',
    node_env: NODE_ENV,
    code: error.code,
    detail: error.detail,
    stack: error.stack
  });
});

module.exports = pool;
