const express = require('express');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const pool = require('./database');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(publicDir, 'uploads');
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-esta-chave-em-producao';
const configuredOrigins = [
  APP_BASE_URL,
  process.env.CORS_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

function normalizarOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch (error) {
    return null;
  }
}

function obterHostname(origin) {
  try {
    return new URL(origin).hostname;
  } catch (error) {
    return null;
  }
}

const allowedOrigins = new Set(
  configuredOrigins
    .map(normalizarOrigin)
    .filter(Boolean)
);

const allowedHostnames = new Set(
  configuredOrigins
    .map(obterHostname)
    .filter(Boolean)
);

const mailTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || ''
          }
        : undefined
    })
  : nodemailer.createTransport({
      jsonTransport: true
    });

function logInfo(contexto, dados = {}) {
  console.log(`[${contexto}]`, dados);
}

function logWarn(contexto, dados = {}) {
  console.warn(`[${contexto}]`, dados);
}

function logError(contexto, dados = {}) {
  console.error(`[${contexto}]`, dados);
}

logInfo('BOOT', {
  message: 'Iniciando server.js',
  node_env: NODE_ENV,
  port: PORT,
  uploadsDir,
  appBaseUrl: APP_BASE_URL
});

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const extensao = path.extname(file.originalname || '');
    const nomeBase = path
      .basename(file.originalname || 'arquivo', extensao)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toLowerCase();

    cb(null, `${Date.now()}-${randomUUID()}-${nomeBase}${extensao}`);
  }
});

const upload = multer({ storage });
const uploadConteudo = upload.fields([
  { name: 'imagem_post', maxCount: 1 },
  { name: 'imagens_carrossel', maxCount: 10 },
  { name: 'video_reels', maxCount: 1 },
  { name: 'capa_reels', maxCount: 1 }
]);

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const inicio = Date.now();

  res.on('finish', () => {
    logInfo('HTTP', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - inicio,
      ip: req.ip
    });
  });

  next();
});
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originNormalizada = normalizarOrigin(origin);

  if (origin && originNormalizada) {
    res.setHeader('Access-Control-Allow-Origin', originNormalizada);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

logInfo('BOOT', { message: 'Middleware configurado' });
logInfo('BOOT', { message: 'Iniciando teste de conexão com PostgreSQL' });

if (NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  logWarn('BOOT', {
    message: 'SESSION_SECRET não configurado. Defina esse valor em produção.'
  });
}

pool
  .connect()
  .then((client) => {
    client.release();
    logInfo('BOOT', { message: 'Conectado ao PostgreSQL com sucesso' });
  })
  .catch((error) => {
    logError('BOOT', {
      message: 'Erro ao conectar no PostgreSQL',
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
  });

function responderErro(res, error, mensagem) {
  logError('APP', {
    message: error.message,
    code: error.code,
    detail: error.detail,
    hint: error.hint,
    where: error.where,
    table: error.table,
    column: error.column,
    constraint: error.constraint,
    schema: error.schema,
    stack: error.stack
  });
  res.status(500).json({ mensagem });
}

function logErroBanco(contexto, error, dados = {}) {
  logError(contexto, {
    tipo: 'Falha no banco de dados',
    ...dados,
    message: error.message,
    code: error.code,
    detail: error.detail,
    hint: error.hint,
    where: error.where,
    table: error.table,
    column: error.column,
    constraint: error.constraint,
    schema: error.schema,
    stack: error.stack
  });
}

function mensagemErroBancoPadrao(error, fallback) {
  if (error.code === '42703') {
    return 'Estrutura da tabela conteudos desatualizada no banco. Execute a migração SQL.';
  }

  if (error.code === '42501') {
    return 'Usuário do banco sem permissão suficiente para acessar ou alterar a tabela conteudos.';
  }

  return fallback;
}

function normalizarArquivosRemovidos(arquivos = []) {
  arquivos.forEach((arquivo) => {
    if (arquivo?.path && fs.existsSync(arquivo.path)) {
      fs.unlinkSync(arquivo.path);
    }
  });
}

function limparArquivosUpload(files = {}) {
  Object.values(files).forEach((lista) => normalizarArquivosRemovidos(lista));
}

function removerArquivoPorUrl(urlArquivo) {
  if (!urlArquivo) {
    return;
  }

  try {
    const caminhoRelativo = urlArquivo.replace(/^\/+/, '');
    const caminhoCompleto = path.join(publicDir, caminhoRelativo.replace(/^public\//, ''));

    if (fs.existsSync(caminhoCompleto)) {
      fs.unlinkSync(caminhoCompleto);
    }
  } catch (error) {
    logError('UPLOAD', {
      message: 'Erro ao remover arquivo de mídia',
      urlArquivo,
      error_message: error.message,
      stack: error.stack
    });
  }
}

function removerMidiasConteudo(conteudo) {
  if (!conteudo) {
    return;
  }

  removerArquivoPorUrl(conteudo.imagem_post_url);
  removerArquivoPorUrl(conteudo.video_reels_url);
  removerArquivoPorUrl(conteudo.capa_reels_url);
  parseJsonArray(conteudo.imagens_carrossel_urls).forEach(removerArquivoPorUrl);
}

async function rollbackSilencioso(client) {
  try {
    await client.query('ROLLBACK');
  } catch (error) {
    logError('DB', {
      message: 'Erro ao executar rollback',
      message: error.message,
      stack: error.stack
    });
  }
}

function obterUrlArquivo(arquivo) {
  if (!arquivo) {
    return null;
  }

  return `/uploads/${arquivo.filename}`;
}

function obterUrlsArquivos(arquivos = []) {
  return arquivos.map((arquivo) => obterUrlArquivo(arquivo)).filter(Boolean);
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function formatarConteudo(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    cliente_id: row.cliente_id,
    programacao_id: row.programacao_id,
    tipo: row.tipo,
    titulo: row.titulo,
    conteudo: row.conteudo || '',
    legenda: row.legenda,
    status: row.status,
    token_aprovacao: row.token_aprovacao,
    criado_em: row.criado_em,
    data_publicacao: row.data_publicacao || null,
    imagem_post_url: row.imagem_post_url || null,
    imagens_carrossel_urls: parseJsonArray(row.imagens_carrossel_urls),
    video_reels_url: row.video_reels_url || null,
    capa_reels_url: row.capa_reels_url || null
  };
}

function validarMidiasPorTipo(tipo, files) {
  if (tipo === 'post' && !files.imagem_post?.length) {
    return 'Selecione a arte do post.';
  }

  if (tipo === 'carrossel' && !files.imagens_carrossel?.length) {
    return 'Selecione ao menos uma página do carrossel.';
  }

  if (tipo === 'reels') {
    if (!files.video_reels?.length) {
      return 'Selecione o vídeo do reels.';
    }

    if (!files.capa_reels?.length) {
      return 'Selecione a capa do reels.';
    }
  }

  return null;
}

function gerarTituloPorTipo(tipo) {
  const mapaTitulos = {
    post: 'Post',
    carrossel: 'Carrossel',
    reels: 'Reels',
    roteiro: 'Roteiro'
  };

  return mapaTitulos[tipo] || 'Conteudo';
}

function formatarConvite(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    token: row.token,
    status: row.status,
    expirado_em: row.expirado_em,
    criado_em: row.criado_em
  };
}

function conviteExpirado(convite) {
  if (!convite?.expirado_em) {
    return false;
  }

  return new Date(convite.expirado_em).getTime() < Date.now();
}

async function buscarConvitePorToken(token) {
  const resultado = await pool.query(
    `
      SELECT id, nome, email, token, status, expirado_em, criado_em
      FROM convites
      WHERE token = $1
    `,
    [token]
  );

  return resultado.rows[0] || null;
}

async function buscarUsuarioPorEmail(email) {
  const resultado = await pool.query(
    `
      SELECT id, nome, email
      FROM usuarios
      WHERE email = $1
    `,
    [email]
  );

  return resultado.rows[0] || null;
}

async function buscarConvitePendentePorEmail(email) {
  const resultado = await pool.query(
    `
      SELECT id, nome, email, token, status, expirado_em, criado_em
      FROM convites
      WHERE email = $1
        AND status = 'pendente'
      ORDER BY criado_em DESC
      LIMIT 1
    `,
    [email]
  );

  return resultado.rows[0] || null;
}

async function enviarEmailConvite(convite) {
  const linkConvite = `${APP_BASE_URL}/aceitar-convite.html?token=${convite.token}`;
  const remetente = process.env.SMTP_FROM || 'nao-responda@engagepublisher.local';

  const info = await mailTransport.sendMail({
    from: remetente,
    to: convite.email,
    subject: 'Convite para equipe - Engage Publisher',
    text: `Olá, ${convite.nome}.\n\nVocê recebeu um convite para entrar na equipe.\nAcesse o link para definir sua senha:\n${linkConvite}\n\nEste convite expira em ${new Date(convite.expirado_em).toLocaleString('pt-BR')}.`,
    html: `
      <p>Olá, <strong>${convite.nome}</strong>.</p>
      <p>Você recebeu um convite para entrar na equipe.</p>
      <p><a href="${linkConvite}">Clique aqui para definir sua senha</a></p>
      <p>Se preferir, copie este link:</p>
      <p>${linkConvite}</p>
      <p>Este convite expira em ${new Date(convite.expirado_em).toLocaleString('pt-BR')}.</p>
    `
  });

  if (!process.env.SMTP_HOST) {
    logInfo('CONVITE EMAIL MOCK', {
      convite_id: convite.id,
      email: convite.email,
      link: linkConvite,
      preview: info.message
    });
  }

  return { info, linkConvite };
}

async function buscarClientePorId(clienteId) {
  const resultado = await pool.query(
    'SELECT id, nome FROM clientes WHERE id = $1',
    [clienteId]
  );

  return resultado.rows[0] || null;
}

async function buscarProgramacaoPorId(programacaoId) {
  const resultado = await pool.query(
    `
      SELECT
        p.id,
        p.nome,
        p.cliente_id,
        p.data_inicio,
        p.data_fim,
        c.nome AS cliente_nome
      FROM programacoes p
      INNER JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1
    `,
    [programacaoId]
  );

  return resultado.rows[0] || null;
}

async function buscarProgramacaoDoCliente(clienteId, programacaoId) {
  const resultado = await pool.query(
    `
      SELECT
        p.id,
        p.nome,
        p.cliente_id,
        p.data_inicio,
        p.data_fim,
        c.nome AS cliente_nome
      FROM programacoes p
      INNER JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1 AND p.cliente_id = $2
    `,
    [programacaoId, clienteId]
  );

  return resultado.rows[0] || null;
}

async function buscarProgramacaoSimplesPorId(programacaoId) {
  const resultado = await pool.query(
    `
      SELECT id, nome, cliente_id, data_inicio, data_fim
      FROM programacoes
      WHERE id = $1
    `,
    [programacaoId]
  );

  return resultado.rows[0] || null;
}

async function buscarConteudoPorId(conteudoId) {
  const resultado = await pool.query(
    `
      SELECT
        id,
        cliente_id,
        programacao_id,
        tipo,
        titulo,
        conteudo,
        legenda,
        status,
        token_aprovacao,
        criado_em,
        data_publicacao,
        imagem_post_url,
        imagens_carrossel_urls,
        video_reels_url,
        capa_reels_url
      FROM conteudos
      WHERE id = $1
    `,
    [conteudoId]
  );

  return resultado.rows[0] || null;
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'ok'
    });
  } catch (error) {
    logError('HEALTH', {
      message: 'Falha no banco',
      error_message: error.message,
      code: error.code,
      stack: error.stack
    });

    res.status(500).json({
      status: 'error',
      database: 'unavailable'
    });
  }
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const resultado = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1 AND senha = $2',
      [email, senha]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
    }

    res.json({ mensagem: 'Login realizado com sucesso.' });
  } catch (error) {
    responderErro(res, error, 'Erro no login.');
  }
});

app.post('/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ mensagem: 'Nome é obrigatório.' });
  }

  if (!email || !String(email).trim()) {
    return res.status(400).json({ mensagem: 'E-mail é obrigatório.' });
  }

  if (!senha || !String(senha).trim()) {
    return res.status(400).json({ mensagem: 'Senha é obrigatória.' });
  }

  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    const usuarioExistente = await buscarUsuarioPorEmail(emailNormalizado);

    if (usuarioExistente) {
      return res.status(400).json({ mensagem: 'Já existe uma conta com este e-mail.' });
    }

    const resultado = await pool.query(
      `
        INSERT INTO usuarios (nome, email, senha)
        VALUES ($1, $2, $3)
        RETURNING id, nome, email
      `,
      [String(nome).trim(), emailNormalizado, String(senha).trim()]
    );

    res.status(201).json({
      mensagem: 'Conta criada com sucesso.',
      usuario: resultado.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ mensagem: 'Já existe uma conta com este e-mail.' });
    }

    if (error.code === '42501') {
      return res.status(500).json({ mensagem: 'Usuário do banco sem permissão para criar contas.' });
    }

    responderErro(res, error, 'Erro ao criar conta.');
  }
});

app.post('/convites', async (req, res) => {
  const { nome, email } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ mensagem: 'Nome é obrigatório.' });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({ mensagem: 'E-mail é obrigatório.' });
  }

  const emailNormalizado = email.trim().toLowerCase();

  try {
    const usuarioExistente = await buscarUsuarioPorEmail(emailNormalizado);

    if (usuarioExistente) {
      return res.status(400).json({ mensagem: 'Já existe um usuário com este e-mail.' });
    }

    const convitePendente = await buscarConvitePendentePorEmail(emailNormalizado);

    if (convitePendente && !conviteExpirado(convitePendente)) {
      return res.status(400).json({ mensagem: 'Já existe um convite pendente para este e-mail.' });
    }

    const token = randomUUID();
    const expiradoEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const resultado = await pool.query(
      `
        INSERT INTO convites (nome, email, token, status, expirado_em)
        VALUES ($1, $2, $3, 'pendente', $4)
        RETURNING id, nome, email, token, status, expirado_em, criado_em
      `,
      [nome.trim(), emailNormalizado, token, expiradoEm]
    );

    const convite = formatarConvite(resultado.rows[0]);
    const envio = await enviarEmailConvite(convite);

    res.status(201).json({
      mensagem: 'Convite criado e enviado com sucesso.',
      convite,
      link_convite: envio.linkConvite
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao criar convite.');
  }
});

app.get('/convites', async (req, res) => {
  try {
    const resultado = await pool.query(
      `
        SELECT id, nome, email, token, status, expirado_em, criado_em
        FROM convites
        ORDER BY criado_em DESC, id DESC
      `
    );

    res.json(resultado.rows.map(formatarConvite));
  } catch (error) {
    responderErro(res, error, 'Erro ao listar convites.');
  }
});

app.get('/convites/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const convite = await buscarConvitePorToken(token);

    if (!convite) {
      return res.status(404).json({ mensagem: 'Convite não encontrado.' });
    }

    if (convite.status === 'aceito') {
      return res.status(400).json({ mensagem: 'Este convite já foi aceito.' });
    }

    if (conviteExpirado(convite)) {
      return res.status(400).json({ mensagem: 'Este convite está expirado.' });
    }

    res.json({
      mensagem: 'Convite válido.',
      convite: formatarConvite(convite)
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar convite.');
  }
});

app.post('/convites/:token/aceitar', async (req, res) => {
  const { token } = req.params;
  const { senha } = req.body;
  const client = await pool.connect();

  if (!senha || !String(senha).trim()) {
    return res.status(400).json({ mensagem: 'Senha é obrigatória.' });
  }

  try {
    const convite = await buscarConvitePorToken(token);

    if (!convite) {
      return res.status(404).json({ mensagem: 'Convite não encontrado.' });
    }

    if (convite.status === 'aceito') {
      return res.status(400).json({ mensagem: 'Este convite já foi aceito.' });
    }

    if (conviteExpirado(convite)) {
      return res.status(400).json({ mensagem: 'Este convite está expirado.' });
    }

    const usuarioExistente = await buscarUsuarioPorEmail(convite.email);

    if (usuarioExistente) {
      return res.status(400).json({ mensagem: 'Já existe um usuário com este e-mail.' });
    }

    await client.query('BEGIN');
    const usuarioResultado = await client.query(
      `
        INSERT INTO usuarios (nome, email, senha)
        VALUES ($1, $2, $3)
        RETURNING id, nome, email
      `,
      [convite.nome, convite.email, String(senha).trim()]
    );

    const conviteResultado = await client.query(
      `
        UPDATE convites
        SET status = 'aceito'
        WHERE token = $1
        RETURNING id, nome, email, token, status, expirado_em, criado_em
      `,
      [token]
    );
    await client.query('COMMIT');

    res.json({
      mensagem: 'Convite aceito com sucesso.',
      usuario: usuarioResultado.rows[0],
      convite: formatarConvite(conviteResultado.rows[0])
    });
  } catch (error) {
    await rollbackSilencioso(client);
    responderErro(res, error, 'Erro ao aceitar convite.');
  } finally {
    client.release();
  }
});

app.get('/usuarios-equipe', async (req, res) => {
  try {
    const resultado = await pool.query(
      `
        SELECT id, nome, email
        FROM usuarios
        ORDER BY id DESC
      `
    );

    res.json(resultado.rows);
  } catch (error) {
    responderErro(res, error, 'Erro ao listar usuários da equipe.');
  }
});

app.get('/clientes', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, nome FROM clientes ORDER BY id DESC'
    );

    res.json(resultado.rows);
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar clientes.');
  }
});

app.post('/clientes', async (req, res) => {
  const { nome } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ mensagem: 'Nome do cliente é obrigatório.' });
  }

  try {
    const resultado = await pool.query(
      'INSERT INTO clientes (nome) VALUES ($1) RETURNING id, nome',
      [nome.trim()]
    );

    res.status(201).json({
      mensagem: 'Cliente criado com sucesso.',
      cliente: resultado.rows[0]
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao criar cliente.');
  }
});

app.get('/clientes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const cliente = await buscarClientePorId(id);

    if (!cliente) {
      return res.status(404).json({ mensagem: 'Cliente não encontrado.' });
    }

    res.json(cliente);
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar cliente.');
  }
});

app.get('/clientes/:id/programacoes', async (req, res) => {
  const { id } = req.params;

  try {
    const cliente = await buscarClientePorId(id);

    if (!cliente) {
      return res.status(404).json({ mensagem: 'Cliente não encontrado.' });
    }

    const resultado = await pool.query(
      `
        SELECT id, nome, cliente_id, data_inicio, data_fim
        FROM programacoes
        WHERE cliente_id = $1
        ORDER BY data_inicio DESC, id DESC
      `,
      [id]
    );

    res.json(resultado.rows);
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar programações.');
  }
});

app.post('/clientes/:id/programacoes', async (req, res) => {
  const { id } = req.params;
  const { nome, data_inicio, data_fim } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ mensagem: 'Nome da programação é obrigatório.' });
  }

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ mensagem: 'Data inicial e final são obrigatórias.' });
  }

  if (data_inicio > data_fim) {
    return res.status(400).json({ mensagem: 'A data inicial não pode ser maior que a final.' });
  }

  try {
    const cliente = await buscarClientePorId(id);

    if (!cliente) {
      return res.status(404).json({ mensagem: 'Cliente não encontrado.' });
    }

    const resultado = await pool.query(
      `
        INSERT INTO programacoes (cliente_id, nome, data_inicio, data_fim)
        VALUES ($1, $2, $3, $4)
        RETURNING id, nome, cliente_id, data_inicio, data_fim
      `,
      [id, nome.trim(), data_inicio, data_fim]
    );

    res.status(201).json({
      mensagem: 'Programação criada com sucesso.',
      programacao: resultado.rows[0]
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao criar programação.');
  }
});

app.put('/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ mensagem: 'Nome do cliente é obrigatório.' });
  }

  try {
    const cliente = await buscarClientePorId(id);

    if (!cliente) {
      return res.status(404).json({ mensagem: 'Cliente não encontrado.' });
    }

    const resultado = await pool.query(
      `
        UPDATE clientes
        SET nome = $1
        WHERE id = $2
        RETURNING id, nome
      `,
      [nome.trim(), id]
    );

    res.json({
      mensagem: 'Cliente atualizado com sucesso.',
      cliente: resultado.rows[0]
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao atualizar cliente.');
  }
});

app.delete('/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const cliente = await buscarClientePorId(id);

    if (!cliente) {
      return res.status(404).json({ mensagem: 'Cliente não encontrado.' });
    }

    const conteudosRelacionados = await client.query(
      `
        SELECT
          imagem_post_url,
          imagens_carrossel_urls,
          video_reels_url,
          capa_reels_url
        FROM conteudos
        WHERE cliente_id = $1
      `,
      [id]
    );

    await client.query('BEGIN');
    await client.query(
      'DELETE FROM conteudos WHERE cliente_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM programacoes WHERE cliente_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM clientes WHERE id = $1',
      [id]
    );
    await client.query('COMMIT');

    conteudosRelacionados.rows.forEach(removerMidiasConteudo);

    res.json({ mensagem: 'Cliente excluído com sucesso.' });
  } catch (error) {
    await rollbackSilencioso(client);
    responderErro(res, error, 'Erro ao excluir cliente.');
  } finally {
    client.release();
  }
});

app.get('/programacoes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const programacao = await buscarProgramacaoPorId(id);

    if (!programacao) {
      return res.status(404).json({ mensagem: 'Programação não encontrada.' });
    }

    res.json(programacao);
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar programação.');
  }
});

app.put('/programacoes/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, data_inicio, data_fim } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ mensagem: 'Nome da programação é obrigatório.' });
  }

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ mensagem: 'Data inicial e final são obrigatórias.' });
  }

  if (data_inicio > data_fim) {
    return res.status(400).json({ mensagem: 'A data inicial não pode ser maior que a final.' });
  }

  try {
    const programacao = await buscarProgramacaoSimplesPorId(id);

    if (!programacao) {
      return res.status(404).json({ mensagem: 'Programação não encontrada.' });
    }

    const resultado = await pool.query(
      `
        UPDATE programacoes
        SET nome = $1, data_inicio = $2, data_fim = $3
        WHERE id = $4
        RETURNING id, nome, cliente_id, data_inicio, data_fim
      `,
      [nome.trim(), data_inicio, data_fim, id]
    );

    res.json({
      mensagem: 'Programação atualizada com sucesso.',
      programacao: resultado.rows[0]
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao atualizar programação.');
  }
});

app.delete('/programacoes/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const programacao = await buscarProgramacaoSimplesPorId(id);

    if (!programacao) {
      return res.status(404).json({ mensagem: 'Programação não encontrada.' });
    }

    const conteudosRelacionados = await client.query(
      `
        SELECT
          imagem_post_url,
          imagens_carrossel_urls,
          video_reels_url,
          capa_reels_url
        FROM conteudos
        WHERE programacao_id = $1
      `,
      [id]
    );

    await client.query('BEGIN');
    await client.query(
      'DELETE FROM conteudos WHERE programacao_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM programacoes WHERE id = $1',
      [id]
    );
    await client.query('COMMIT');

    conteudosRelacionados.rows.forEach(removerMidiasConteudo);

    res.json({ mensagem: 'Programação excluída com sucesso.' });
  } catch (error) {
    await rollbackSilencioso(client);
    responderErro(res, error, 'Erro ao excluir programação.');
  } finally {
    client.release();
  }
});

app.get('/clientes/:clienteId/programacoes/:programacaoId', async (req, res) => {
  const { clienteId, programacaoId } = req.params;

  try {
    const programacao = await buscarProgramacaoDoCliente(clienteId, programacaoId);

    if (!programacao) {
      return res.status(404).json({ mensagem: 'Programação não encontrada para este cliente.' });
    }

    res.json(programacao);
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar programação.');
  }
});

app.get('/clientes/:clienteId/programacoes/:programacaoId/conteudos', async (req, res) => {
  const { clienteId, programacaoId } = req.params;
  const clienteIdNumero = Number(clienteId);
  const programacaoIdNumero = Number(programacaoId);

  if (!Number.isInteger(clienteIdNumero) || !Number.isInteger(programacaoIdNumero)) {
    return res.status(400).json({ mensagem: 'clienteId e programacaoId devem ser numéricos.' });
  }

  try {
    const programacao = await buscarProgramacaoDoCliente(clienteIdNumero, programacaoIdNumero);

    if (!programacao) {
      return res.status(404).json({ mensagem: 'Programação não encontrada para este cliente.' });
    }

    const query = `
      SELECT
        id,
        cliente_id,
        programacao_id,
        tipo,
        titulo,
        legenda,
        status,
        token_aprovacao,
        criado_em,
        imagem_post_url,
        imagens_carrossel_urls,
        video_reels_url,
        capa_reels_url
      FROM conteudos
      WHERE cliente_id = $1 AND programacao_id = $2
      ORDER BY criado_em DESC, id DESC
    `;
    const valores = [clienteIdNumero, programacaoIdNumero];
    const resultado = await pool.query(query, valores);

    res.json(resultado.rows.map(formatarConteudo));
  } catch (error) {
    logErroBanco('GET /clientes/:clienteId/programacoes/:programacaoId/conteudos', error, {
      clienteId,
      programacaoId
    });
    responderErro(res, error, mensagemErroBancoPadrao(error, 'Erro ao buscar conteúdos.'));
  }
});

app.post('/clientes/:clienteId/programacoes/:programacaoId/conteudos', uploadConteudo, async (req, res) => {
  const { clienteId, programacaoId } = req.params;
  const { tipo, legenda, data_publicacao } = req.body;
  const clienteIdNumero = Number(clienteId);
  const programacaoIdNumero = Number(programacaoId);
  const files = req.files || {};

  if (!Number.isInteger(clienteIdNumero) || !Number.isInteger(programacaoIdNumero)) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: 'clienteId e programacaoId devem ser numéricos.' });
  }

  if (!tipo || !tipo.trim()) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: 'Tipo é obrigatório.' });
  }

  if (!data_publicacao) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: 'Data de publicação é obrigatória.' });
  }

  const erroMidia = validarMidiasPorTipo(tipo.trim(), files);
  if (erroMidia) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: erroMidia });
  }

  try {
    const programacao = await buscarProgramacaoDoCliente(clienteIdNumero, programacaoIdNumero);

    if (!programacao) {
      limparArquivosUpload(files);
      return res.status(404).json({ mensagem: 'Programação não encontrada para este cliente.' });
    }

    const tokenAprovacao = randomUUID();
    const imagemPostUrl = obterUrlArquivo(files.imagem_post?.[0]);
    const imagensCarrosselUrls = JSON.stringify(obterUrlsArquivos(files.imagens_carrossel));
    const videoReelsUrl = obterUrlArquivo(files.video_reels?.[0]);
    const capaReelsUrl = obterUrlArquivo(files.capa_reels?.[0]);
    const tipoNormalizado = tipo.trim();
    const tituloGerado = gerarTituloPorTipo(tipoNormalizado);

    const query = `
      INSERT INTO conteudos (
        cliente_id,
        programacao_id,
        tipo,
        titulo,
        legenda,
        data_publicacao,
        token_aprovacao,
        imagem_post_url,
        imagens_carrossel_urls,
        video_reels_url,
        capa_reels_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        cliente_id,
        programacao_id,
        tipo,
        titulo,
        conteudo,
        legenda,
        status,
        token_aprovacao,
        criado_em,
        data_publicacao,
        imagem_post_url,
        imagens_carrossel_urls,
        video_reels_url,
        capa_reels_url
    `;
    const valores = [
      clienteIdNumero,
      programacaoIdNumero,
      tipoNormalizado,
      tituloGerado,
      legenda || '',
      data_publicacao,
      tokenAprovacao,
      imagemPostUrl,
      imagensCarrosselUrls,
      videoReelsUrl,
      capaReelsUrl
    ];
    const resultado = await pool.query(query, valores);

    res.status(201).json({
      mensagem: 'Conteúdo criado com sucesso.',
      conteudo: formatarConteudo(resultado.rows[0])
    });
  } catch (error) {
    limparArquivosUpload(files);
    logErroBanco('POST /clientes/:clienteId/programacoes/:programacaoId/conteudos', error, {
      clienteId,
      programacaoId,
      body: req.body
    });
    responderErro(res, error, mensagemErroBancoPadrao(error, 'Erro ao criar conteúdo.'));
  }
});

app.put('/conteudos/:id', uploadConteudo, async (req, res) => {
  const { id } = req.params;
  const { tipo, legenda, status, data_publicacao } = req.body;
  const statusValidos = ['rascunho', 'aprovado', 'reprovado', 'publicado'];
  const files = req.files || {};

  if (!tipo || !tipo.trim()) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: 'Tipo é obrigatório.' });
  }

  if (!data_publicacao) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: 'Data de publicação é obrigatória.' });
  }

  if (!status || !statusValidos.includes(status)) {
    limparArquivosUpload(files);
    return res.status(400).json({ mensagem: 'Status inválido.' });
  }

  try {
    const conteudoAtual = await buscarConteudoPorId(id);

    if (!conteudoAtual) {
      limparArquivosUpload(files);
      return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
    }

    const tipoNormalizado = tipo.trim();
    const erroMidia = validarMidiasPorTipo(tipoNormalizado, {
      imagem_post: files.imagem_post?.length ? files.imagem_post : (conteudoAtual.imagem_post_url ? [{ filename: conteudoAtual.imagem_post_url }] : []),
      imagens_carrossel: files.imagens_carrossel?.length ? files.imagens_carrossel : (conteudoAtual.imagens_carrossel_urls?.length ? [{ filename: 'existente' }] : []),
      video_reels: files.video_reels?.length ? files.video_reels : (conteudoAtual.video_reels_url ? [{ filename: conteudoAtual.video_reels_url }] : []),
      capa_reels: files.capa_reels?.length ? files.capa_reels : (conteudoAtual.capa_reels_url ? [{ filename: conteudoAtual.capa_reels_url }] : [])
    });

    if (erroMidia) {
      limparArquivosUpload(files);
      return res.status(400).json({ mensagem: erroMidia });
    }

    const imagemPostUrl = files.imagem_post?.[0]
      ? obterUrlArquivo(files.imagem_post[0])
      : conteudoAtual.imagem_post_url;
    const imagensCarrosselUrlsArray = files.imagens_carrossel?.length
      ? obterUrlsArquivos(files.imagens_carrossel)
      : conteudoAtual.imagens_carrossel_urls;
    const videoReelsUrl = files.video_reels?.[0]
      ? obterUrlArquivo(files.video_reels[0])
      : conteudoAtual.video_reels_url;
    const capaReelsUrl = files.capa_reels?.[0]
      ? obterUrlArquivo(files.capa_reels[0])
      : conteudoAtual.capa_reels_url;

    if (files.imagem_post?.[0] && conteudoAtual.imagem_post_url) {
      removerArquivoPorUrl(conteudoAtual.imagem_post_url);
    }

    if (files.imagens_carrossel?.length && conteudoAtual.imagens_carrossel_urls?.length) {
      conteudoAtual.imagens_carrossel_urls.forEach(removerArquivoPorUrl);
    }

    if (files.video_reels?.[0] && conteudoAtual.video_reels_url) {
      removerArquivoPorUrl(conteudoAtual.video_reels_url);
    }

    if (files.capa_reels?.[0] && conteudoAtual.capa_reels_url) {
      removerArquivoPorUrl(conteudoAtual.capa_reels_url);
    }

    const resultado = await pool.query(
      `
        UPDATE conteudos
        SET
          tipo = $1,
          titulo = $2,
          conteudo = $3,
          legenda = $4,
          status = $5,
          data_publicacao = $6,
          imagem_post_url = $7,
          imagens_carrossel_urls = $8,
          video_reels_url = $9,
          capa_reels_url = $10
        WHERE id = $11
        RETURNING
          id,
          cliente_id,
          programacao_id,
          tipo,
          titulo,
          conteudo,
          legenda,
          status,
          token_aprovacao,
          criado_em,
          data_publicacao,
          imagem_post_url,
          imagens_carrossel_urls,
          video_reels_url,
          capa_reels_url
      `,
      [
        tipoNormalizado,
        gerarTituloPorTipo(tipoNormalizado),
        '',
        legenda || '',
        status,
        data_publicacao,
        tipoNormalizado === 'post' ? imagemPostUrl : null,
        tipoNormalizado === 'carrossel' ? JSON.stringify(imagensCarrosselUrlsArray || []) : JSON.stringify([]),
        tipoNormalizado === 'reels' ? videoReelsUrl : null,
        tipoNormalizado === 'reels' ? capaReelsUrl : null,
        id
      ]
    );

    res.json({
      mensagem: 'Conteúdo atualizado com sucesso.',
      conteudo: formatarConteudo(resultado.rows[0])
    });
  } catch (error) {
    limparArquivosUpload(files);
    responderErro(res, error, 'Erro ao atualizar conteúdo.');
  }
});

app.delete('/conteudos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const conteudo = await buscarConteudoPorId(id);

    if (!conteudo) {
      return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
    }

    await pool.query(
      'DELETE FROM conteudos WHERE id = $1',
      [id]
    );

    removerMidiasConteudo(conteudo);

    res.json({ mensagem: 'Conteúdo excluído com sucesso.' });
  } catch (error) {
    responderErro(res, error, 'Erro ao excluir conteúdo.');
  }
});

app.get('/conteudos/aprovacao/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const resultado = await pool.query(
      `
        SELECT
          ct.id,
          ct.cliente_id,
          ct.programacao_id,
          ct.tipo,
          ct.titulo,
          ct.conteudo,
          ct.legenda,
          ct.status,
          ct.token_aprovacao,
          ct.criado_em,
          ct.data_publicacao,
          ct.imagem_post_url,
          ct.imagens_carrossel_urls,
          ct.video_reels_url,
          ct.capa_reels_url,
          p.data_inicio,
          p.data_fim,
          c.id AS cliente_id,
          c.nome AS cliente_nome
        FROM conteudos ct
        INNER JOIN programacoes p ON p.id = ct.programacao_id
        INNER JOIN clientes c ON c.id = p.cliente_id
        WHERE ct.token_aprovacao = $1
      `,
      [token]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
    }

    res.json(formatarConteudo(resultado.rows[0]));
  } catch (error) {
    responderErro(res, error, 'Erro ao buscar conteúdo.');
  }
});

app.patch('/conteudos/aprovacao/:token/status', async (req, res) => {
  const { token } = req.params;
  const { status } = req.body;

  if (!['aprovado', 'reprovado'].includes(status)) {
    return res.status(400).json({ mensagem: 'Status de aprovação inválido.' });
  }

  try {
    const resultado = await pool.query(
      `
        UPDATE conteudos
        SET status = $1
        WHERE token_aprovacao = $2
        RETURNING
          id,
          cliente_id,
          programacao_id,
          tipo,
          titulo,
          conteudo,
          legenda,
          status,
          token_aprovacao,
          criado_em,
          data_publicacao,
          imagem_post_url,
          imagens_carrossel_urls,
          video_reels_url,
          capa_reels_url
      `,
      [status, token]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
    }

    res.json({
      mensagem: `Conteúdo ${status} com sucesso.`,
      conteudo: formatarConteudo(resultado.rows[0])
    });
  } catch (error) {
    responderErro(res, error, 'Erro ao atualizar status do conteúdo.');
  }
});

app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  logError('Express Error Handler', {
    method: req.method,
    url: req.originalUrl,
    message: error.message,
    code: error.code,
    stack: error.stack
  });

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      mensagem: `Erro no upload de arquivos: ${error.message}`
    });
  }

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    mensagem: 'Erro interno no servidor ao processar a requisição.'
  });
});

logInfo('BOOT', { message: 'Chamando app.listen' });
app.listen(PORT, () => {
  logInfo('BOOT', {
    message: 'Servidor rodando',
    port: PORT,
    appBaseUrl: APP_BASE_URL
  });
});
