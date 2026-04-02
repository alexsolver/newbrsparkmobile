const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── JWT simples (sem dependência externa) ────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'brspark_secret_2025';

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(body, 'base64').toString());
  } catch { return null; }
}
function hashPassword(pw) {
  return crypto.createHmac('sha256', JWT_SECRET).update(pw).digest('hex');
}
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Não autorizado' });
  req.user = payload;
  next();
}


// ─── Banco de Dados ───────────────────────────────────────────────────────────
const dbPath = path.resolve(__dirname, 'brspark_cloud.db');
const db = new sqlite3.Database(dbPath);

// Promisify DB methods for resilience
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});

console.log('[BrSpark Cloud] Inicializando Banco de Dados B2B SaaS...');

db.serialize(() => {
  // ── 2FA ──────────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER DEFAULT 0
    )
  `);
  // Adiciona coluna two_factor_enabled em users (migration safe)
  db.run(`ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0`, () => {});

  // ── Core ─────────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      statusType TEXT,
      details TEXT,
      imageUrl TEXT,
      parentId TEXT DEFAULT NULL,
      owner_email TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Adiciona colunas owner_email para tabelas legadas que podem não tê-las
  db.run('ALTER TABLE cloud_vault ADD COLUMN owner_email TEXT DEFAULT NULL', (err) => {});
  db.run('ALTER TABLE maintenances ADD COLUMN owner_email TEXT DEFAULT NULL', (err) => {});
  db.run('ALTER TABLE chat_rooms ADD COLUMN owner_email TEXT DEFAULT NULL', (err) => {});
  db.run('ALTER TABLE chat_messages ADD COLUMN owner_email TEXT DEFAULT NULL', (err) => {});

  // ── Normalização de Dados Legados ───────────────────────────────────────────
  console.log('[BrSpark Cloud] Normalizando dados para joao.silva@brspark.com...');
  const tables = ['assets', 'cloud_costs_expenses', 'cloud_costs_recurring', 'cloud_costs_budgets', 'cloud_insurance', 'cloud_vault', 'maintenances', 'chat_rooms', 'chat_messages'];
  tables.forEach(t => {
    db.run(`UPDATE ${t} SET owner_email = 'joao.silva@brspark.com' WHERE owner_email = '' OR owner_email IS NULL OR owner_email = 'null' OR owner_email = 'joao@teste.com'`);
  });

  // Garantir usuário oficial do João Silva
  const pw = hashPassword('123456');
  db.run(`INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
    ['user_joao_silva', 'João Silva', 'joao.silva@brspark.com', pw]);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenances (
      id TEXT PRIMARY KEY,
      assetId TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING'
    )
  `);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_email TEXT DEFAULT NULL,
      avatarColor TEXT DEFAULT '#2563EB',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      senderId TEXT NOT NULL,
      senderName TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      content TEXT,
      mediaUrl TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (roomId) REFERENCES chat_rooms(id)
    )
  `);

  // ── Módulos de Sync (Novos) ───────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_costs_expenses (
      id TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_costs_recurring (
      id TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_costs_budgets (
      id TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_insurance (
      id TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_vault (
      id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_media (
      id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rating REAL,
      reviews INTEGER,
      photo TEXT,
      tags TEXT,
      verified INTEGER,
      keywords TEXT,
      phone TEXT,
      city TEXT,
      state TEXT DEFAULT 'SP'
    )
  `);

  // Seed Featured Providers
  const featured = [
    { id: 'p1', name: 'Zezinho Elétrica', category: 'Elétrica', rating: 4.9, reviews: 128, photo: 'https://randomuser.me/api/portraits/men/1.jpg', tags: 'residencial,emergência', verified: 1, phone: '(11) 98888-7777', city: 'São Paulo' },
    { id: 'p2', name: 'Maria Hidráulica', category: 'Hidráulica', rating: 4.8, reviews: 85, photo: 'https://randomuser.me/api/portraits/women/2.jpg', tags: 'vazamentos,reformas', verified: 1, phone: '(11) 97777-6666', city: 'São Paulo' },
    { id: 'p3', name: 'Brspark Solutions', category: 'Tecnologia', rating: 5.0, reviews: 312, photo: 'https://randomuser.me/api/portraits/men/3.jpg', tags: 'automação,segurança', verified: 1, phone: '(11) 95555-4444', city: 'Barueri' },
    { id: 'p4', name: 'Jardins & Arte', category: 'Jardinagem', rating: 4.7, reviews: 42, photo: 'https://randomuser.me/api/portraits/men/4.jpg', tags: 'paisagismo,manutenção', verified: 0, phone: '(11) 94444-3333', city: 'Santana de Parnaíba' },
  ];

  featured.forEach(p => {
    db.run(`INSERT OR IGNORE INTO providers (id, name, category, rating, reviews, photo, tags, verified, phone, city, state) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.name, p.category, p.rating, p.reviews, p.photo, p.tags, p.verified, p.phone, p.city, p.state || 'SP']);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_stock_items (
      id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_stock_movements (
      id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_tasks (
      id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fsm_forms (
      id TEXT PRIMARY KEY,
      title TEXT,
      settings TEXT,
      schemaData TEXT,
      metadata TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`ALTER TABLE fsm_forms ADD COLUMN metadata TEXT`, (err) => {
    // ignore constraint failed (already exists)
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Salas padrão ─────────────────────────────────────────────────────────────
  db.get('SELECT COUNT(*) as count FROM chat_rooms', (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare(`INSERT INTO chat_rooms (id,name,description,avatarColor) VALUES (?,?,?,?)`);
      stmt.run('room-geral', 'Geral',        'Canal corporativo geral',            '#2563EB');
      stmt.run('room-manut', 'Manutenção',   'Equipe de manutenção e operações',   '#D97706');
      stmt.run('room-tec',   'Técnico & TI', 'Suporte técnico e infraestrutura',   '#7C3AED');
      stmt.run('room-logis', 'Logística',    'Frotas e expedição de ativos',       '#059669');
      stmt.finalize();
    }
  });

  // ── Dados demo ───────────────────────────────────────────────────────────────
  db.get('SELECT COUNT(*) as count FROM assets', (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare(`INSERT INTO assets (id, title, type, status, statusType, details, imageUrl, parentId, owner_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      stmt.run('asset-01', 'Barco Brspark Flex',    'AQUATIC',    'OPERAÇÃO NORMAL',   'success', JSON.stringify({ category: 'Lazer', engine: 'Yamaha 300' }),   'https://images.unsplash.com/photo-1544413647-b510492cbec8?w=800&q=80', 'asset-02', 'demo@brspark.com');
      stmt.run('asset-02', 'Casa de Praia | Angra', 'REAL_ESTATE','VISTORIA PENDENTE', 'warning', JSON.stringify({ address: 'Condomínio Porto Real' }),           'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80', null, 'demo@brspark.com');
      stmt.run('asset-03', 'Frota Hilux 4x4',       'TERRESTRIAL','REVISÃO OK',        'success', JSON.stringify({ mileage: 45000, year: 2024 }),                  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80', null, 'demo@brspark.com');
      stmt.run('asset-04', 'Drone Agrícola X-Pro',  'SPECIAL',    'BATERIA BAIXA',     'warning', JSON.stringify({ flightHours: 120 }),                            'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&q=80', null, 'demo@brspark.com');
      stmt.finalize();
    }
  });

  // ── Usuários demo ────────────────────────────────────────────────────────────
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare(`INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`);
      // User from screenshot: joao@teste.com / teste123
      stmt.run('user-demo', 'João Teste', 'joao@teste.com', hashPassword('teste123'));
      // Default demo
      stmt.run('user-01', 'Demo User', 'demo@brspark.com', hashPassword('demo123'));
      stmt.finalize();
    }
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function ownerFromReq(req) {
  // If authenticated via JWT, use the email from payload
  if (req.user && req.user.email) return req.user.email;
  // Fallback to header or query (for legacy/unauthenticated routes)
  const fallback = req.headers['x-owner-email'] || req.query.owner_email || 'demo@brspark.com';
  return (fallback === '' || fallback === 'undefined' || fallback === 'null') ? 'demo@brspark.com' : fallback;
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────
// ── 2FA Helpers ──────────────────────────────────────────────────────────────
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtpEmail(email, code) {
  // DEV: enquanto o SMTP não estiver configurado, apenas loga no console.
  // Para produção, substitua pelo seu transporter nodemailer / Resend / SendGrid.
  console.log(`\n========================================`);
  console.log(`[2FA] CÓDIGO OTP PARA ${email}: ${code}`);
  console.log(`========================================\n`);

  // Exemplo de integração futura com nodemailer (descomentar quando tiver SMTP):
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: process.env.SMTP_PORT || 587,
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // await transporter.sendMail({
  //   from: '"BrSpark" <noreply@brspark.com>',
  //   to: email,
  //   subject: 'Seu código de verificação BrSpark',
  //   text: `Seu código de verificação é: ${code}\n\nVálido por 5 minutos.`,
  // });
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const hash = hashPassword(password);
  db.get('SELECT * FROM users WHERE email = ? AND password_hash = ?', [email.toLowerCase(), hash], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });

    // ─── 2FA: se habilitado, emitir challenge em vez de JWT completo ──────────
    if (user.two_factor_enabled) {
      const code = generateOtp();
      const challengeId = `otp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

      try {
        await dbRun(
          'INSERT INTO otp_challenges (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)',
          [challengeId, user.id, code, expiresAt]
        );
        await sendOtpEmail(user.email, code);

        // challengeToken é um JWT temporário (sem acesso real)
        const challengeToken = signToken({ sub: 'otp_challenge', challengeId, userId: user.id });
        return res.json({ requiresTwoFactor: true, challengeToken });
      } catch (e) {
        return res.status(500).json({ error: 'Falha ao enviar código de verificação.' });
      }
    }

    // ─── Login normal (sem 2FA) ───────────────────────────────────────────────
    const token = signToken({ id: user.id, email: user.email, name: user.name });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone }
    });
  });
});

app.post('/api/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios faltando' });

  const id = `user_${Date.now()}`;
  const hash = hashPassword(password);
  db.run(`INSERT INTO users (id, name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)`,
    [id, name, email.toLowerCase(), hash, phone || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
        return res.status(500).json({ error: err.message });
      }
      const token = signToken({ id, email, name });
      res.json({ token, user: { id, name, email, phone } });
    }
  );
});

app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT id, name, email, phone FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
  });
});

app.delete('/api/me', authMiddleware, (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─── 2FA Routes ──────────────────────────────────────────────────────────────

/** Verifica OTP e emite JWT completo */
app.post('/api/2fa/verify', async (req, res) => {
  const { challengeToken, otp } = req.body;
  if (!challengeToken || !otp) return res.status(400).json({ error: 'challengeToken e otp são obrigatórios' });

  const payload = verifyToken(challengeToken);
  if (!payload || payload.sub !== 'otp_challenge') return res.status(401).json({ error: 'Token inválido' });

  try {
    const challenge = await dbGet('SELECT * FROM otp_challenges WHERE id = ?', [payload.challengeId]);
    if (!challenge) return res.status(401).json({ error: 'Desafio não encontrado' });
    if (challenge.used) return res.status(401).json({ error: 'Código já utilizado' });
    if (Date.now() > challenge.expires_at) return res.status(401).json({ error: 'Código expirado' });
    if (challenge.code !== String(otp).trim()) return res.status(401).json({ error: 'Código incorreto' });

    await dbRun('UPDATE otp_challenges SET used = 1 WHERE id = ?', [challenge.id]);

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [challenge.user_id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const token = signToken({ id: user.id, email: user.email, name: user.name });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Ativa 2FA: envia OTP de confirmação */
app.post('/api/2fa/enable', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const email  = req.user.email;

  const code = generateOtp();
  const challengeId = `otp_enable_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const expiresAt = Date.now() + 5 * 60 * 1000;

  try {
    await dbRun('INSERT INTO otp_challenges (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)', [challengeId, userId, code, expiresAt]);
    await sendOtpEmail(email, code);
    const challengeToken = signToken({ sub: 'otp_enable', challengeId, userId });
    res.json({ success: true, challengeToken, message: 'Código enviado para seu e-mail.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Confirma ativação do 2FA */
app.post('/api/2fa/enable/confirm', authMiddleware, async (req, res) => {
  const { challengeToken, otp } = req.body;
  if (!challengeToken || !otp) return res.status(400).json({ error: 'Dados incompletos' });

  const payload = verifyToken(challengeToken);
  if (!payload || payload.sub !== 'otp_enable' || payload.userId !== req.user.id) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const challenge = await dbGet('SELECT * FROM otp_challenges WHERE id = ?', [payload.challengeId]);
    if (!challenge || challenge.used || Date.now() > challenge.expires_at) return res.status(401).json({ error: 'Código inválido ou expirado' });
    if (challenge.code !== String(otp).trim()) return res.status(401).json({ error: 'Código incorreto' });

    await dbRun('UPDATE otp_challenges SET used = 1 WHERE id = ?', [challenge.id]);
    await dbRun('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: '2FA ativado com sucesso.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Desativa 2FA */
app.post('/api/2fa/disable', authMiddleware, async (req, res) => {
  const { otp } = req.body;
  if (!otp) return res.status(400).json({ error: 'Código OTP obrigatório para desativar o 2FA' });

  try {
    const challenge = await dbGet(
      'SELECT * FROM otp_challenges WHERE user_id = ? AND used = 0 AND expires_at > ? ORDER BY expires_at DESC LIMIT 1',
      [req.user.id, Date.now()]
    );
    if (!challenge || challenge.code !== String(otp).trim()) return res.status(401).json({ error: 'Código incorreto ou expirado' });
    await dbRun('UPDATE otp_challenges SET used = 1 WHERE id = ?', [challenge.id]);
    await dbRun('UPDATE users SET two_factor_enabled = 0 WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: '2FA desativado.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Retorna status do 2FA para o usuário autenticado */
app.get('/api/2fa/status', authMiddleware, async (req, res) => {
  try {
    const user = await dbGet('SELECT two_factor_enabled FROM users WHERE id = ?', [req.user.id]);
    res.json({ enabled: !!(user?.two_factor_enabled) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Password Change ─────────────────────────────────────────────────────────
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = req.user;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Senha antiga e nova são obrigatórias.' });
  }

  db.get('SELECT password_hash FROM users WHERE id = ?', [user.id], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'Erro ao buscar usuário.' });

    const currentHash = hashPassword(oldPassword);
    if (row.password_hash !== currentHash) {
      return res.status(401).json({ error: 'Senha antiga incorreta.' });
    }

    const newHash = hashPassword(newPassword);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id], (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao atualizar senha.' });
      res.json({ success: true, message: 'Senha alterada com sucesso.' });
    });
  });
});

// ─── Assets ───────────────────────────────────────────────────────────────────
app.get('/api/assets', (req, res) => {
  db.all('SELECT * FROM assets ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
  });
});

// ─── Sync Push (Assets + modular actions) ────────────────────────────────────
app.post('/api/sync/push', async (req, res) => {
  const { queue } = req.body;
  const authOwner = ownerFromReq(req);
  if (!queue || queue.length === 0) return res.json({ success: true, processed: 0 });

  console.log(`[SYNC] Recebendo ${queue.length} ações offline de ${authOwner}.`);
  let processed = 0;

  try {
    // Start transaction for atomicity
    await dbRun('BEGIN TRANSACTION');

    for (const item of queue) {
      const action = item.action;
      let payload;
      try { payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload; }
      catch(e) { payload = item.payload; }

      const owner = payload.owner_email || payload.ownerEmail || authOwner;

      // ── Assets ──────────────────────────────────────────────────────────────
      if (action === 'CREATE_ASSET' || action === 'UPDATE_ASSET') {
        const a = payload;
        await dbRun(`INSERT OR REPLACE INTO assets (id, title, type, status, statusType, details, imageUrl, parentId, owner_email)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [a.id, a.title, a.type, a.status, a.statusType, JSON.stringify(a.details || {}), a.imageUrl, a.parentId || null, owner || null]);
      }
      else if (action === 'DELETE_ASSET') {
        await dbRun(`UPDATE assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND (owner_email = ? OR owner_email IS NULL)`, [payload.id, owner]);
      }
      else if (action === 'SCHEDULE_MAINTENANCE' || action === 'UPDATE_MAINTENANCE') {
        await dbRun(`INSERT OR REPLACE INTO maintenances (id, assetId, owner_email, timestamp, status) VALUES (?, ?, ?, ?, ?)`, 
          [payload.id || `maint_${Date.now()}`, payload.assetId, owner, payload.timestamp, payload.status || 'PENDING']);
      }
      // ── Estoque ─────────────────────────────────────────────────────────────
      else if (action === 'stock:CREATE_ITEM' || action === 'stock:UPDATE_ITEM') {
        await dbRun(`INSERT OR REPLACE INTO cloud_stock_items (id, owner_email, data) VALUES (?, ?, ?)`,
          [payload.id, owner, JSON.stringify(payload)]);
      }
      else if (action === 'stock:DELETE_ITEM') {
        await dbRun(`DELETE FROM cloud_stock_items WHERE id = ? AND owner_email = ?`, [payload.id, owner]);
      }
      else if (action === 'stock:RECORD_MOVEMENT') {
        await dbRun(`INSERT INTO cloud_stock_movements (id, owner_email, data) VALUES (?, ?, ?)`,
          [payload.id, owner, JSON.stringify(payload)]);
        // Se for um movimento 'ADJUST' ou 'IN/OUT', idealmente atualizaríamos o 'data' do stock_item aqui também no servidor,
        // mas como o mobile envia o estado final do stock_item no mesmo lote, o INSERT OR REPLACE acima resolve.
      }
      // ── Custos ──────────────────────────────────────────────────────────────
      else if (action === 'costs:CREATE_EXPENSE' || action === 'costs:UPDATE_EXPENSE') {
        await dbRun(`INSERT OR REPLACE INTO cloud_costs_expenses (id, owner_email, data) VALUES (?, ?, ?)`,
          [payload.id, owner, JSON.stringify(payload)]);
      }
      else if (action === 'costs:DELETE_EXPENSE') {
        await dbRun(`DELETE FROM cloud_costs_expenses WHERE id = ? AND owner_email = ?`, [payload.id, owner]);
      }
      else if (action === 'costs:CREATE_RECURRING' || action === 'costs:UPDATE_RECURRING') {
        await dbRun(`INSERT OR REPLACE INTO cloud_costs_recurring (id, owner_email, data) VALUES (?, ?, ?)`,
          [payload.id, owner, JSON.stringify(payload)]);
      }
      else if (action === 'costs:DELETE_RECURRING') {
        await dbRun(`DELETE FROM cloud_costs_recurring WHERE id = ? AND owner_email = ?`, [payload.id, owner]);
      }
      else if (action === 'costs:CREATE_BUDGET' || action === 'costs:UPDATE_BUDGET') {
        const budgetId = `${payload.assetId}_${payload.category}`;
        await dbRun(`INSERT OR REPLACE INTO cloud_costs_budgets (id, owner_email, data) VALUES (?, ?, ?)`,
          [budgetId, owner, JSON.stringify(payload)]);
      }
      // ── Seguros ─────────────────────────────────────────────────────────────
      else if (action === 'insurance:CREATE' || action === 'insurance:UPDATE') {
        await dbRun(`INSERT OR REPLACE INTO cloud_insurance (id, owner_email, data) VALUES (?, ?, ?)`,
          [payload.id, owner, JSON.stringify(payload)]);
      }
      else if (action === 'insurance:DELETE') {
        await dbRun(`DELETE FROM cloud_insurance WHERE id = ? AND owner_email = ?`, [payload.id, owner]);
      }
      // ── Vault ────────────────────────────────────────────────────────────────
      else if (action === 'vault:CREATE' || action === 'vault:UPDATE') {
        const entry = payload.entry || payload;
        await dbRun(`INSERT OR REPLACE INTO cloud_vault (id, asset_id, owner_email, data) VALUES (?, ?, ?, ?)`,
          [entry.id, payload.assetId, owner, JSON.stringify(payload)]);
      }
      else if (action === 'vault:DELETE') {
        await dbRun(`DELETE FROM cloud_vault WHERE id = ? AND owner_email = ?`, [payload.entryId || payload.id, owner]);
      }
      // ── Mídia ────────────────────────────────────────────────────────────────
      else if (action === 'media:UPDATE') {
        const row = await dbGet(`SELECT metadata FROM cloud_media WHERE id = ? AND owner_email = ?`, [payload.id, owner]);
        if (row) {
          const oldMeta = JSON.parse(row.metadata);
          const newMeta = { ...oldMeta, ...payload };
          delete newMeta.id;
          await dbRun(`UPDATE cloud_media SET metadata = ? WHERE id = ? AND owner_email = ?`,
            [JSON.stringify(newMeta), payload.id, owner]);
        }
      }
      else if (action === 'media:DELETE') {
        await dbRun(`DELETE FROM cloud_media WHERE id = ? AND owner_email = ?`, [payload.id, owner]);
      }

      processed++;
    }

    await dbRun('COMMIT');
    res.json({ success: true, processed });
  } catch (err) {
    console.error('[SYNC] Falha no push:', err);
    await dbRun('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync Pull: Custos ────────────────────────────────────────────────────────
app.get('/api/sync/costs/expenses', (req, res) => {
  const owner = ownerFromReq(req);
  console.log(`[SYNC] Pull Expenses for: ${owner}`);
  db.all(`SELECT data FROM cloud_costs_expenses WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

app.get('/api/sync/costs/recurring', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT data FROM cloud_costs_recurring WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

app.get('/api/sync/costs/budgets', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT data FROM cloud_costs_budgets WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

app.get('/api/sync/assets', (req, res) => {
  const owner = ownerFromReq(req);
  console.log(`[SYNC] Pull Assets for: ${owner}`);
  db.all(`SELECT * FROM assets WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '') AND (deleted_at IS NULL)`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
  });
});

app.get('/api/sync/maintenances', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT * FROM maintenances WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/sync/stock/items', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT data FROM cloud_stock_items WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

app.get('/api/sync/stock/movements', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT data FROM cloud_stock_movements WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '') ORDER BY updated_at DESC LIMIT 100`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

// ─── Sync Pull: Seguros ───────────────────────────────────────────────────────
app.get('/api/sync/insurance', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT data FROM cloud_insurance WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

// ─── Sync Pull: Vault ─────────────────────────────────────────────────────────
app.get('/api/sync/vault', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT asset_id, data FROM cloud_vault WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Group entries by assetId
    const grouped = {};
    rows.forEach(r => {
      const d = JSON.parse(r.data);
      const assetId = r.asset_id;
      if (!grouped[assetId]) grouped[assetId] = [];
      if (d.entry) grouped[assetId].push(d.entry);
    });
    res.json(Object.entries(grouped).map(([assetId, entries]) => ({ assetId, entries })));
  });
});

// ─── Sync Pull: Mídia (metadados) ─────────────────────────────────────────────
app.get('/api/sync/media', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT id, remote_url, metadata FROM cloud_media WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '')`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ id: r.id, remoteUrl: r.remote_url, ...JSON.parse(r.metadata) })));
  });
});

// ─── Sync Assets ─────────────────────────────────────────────────────────────
app.get('/api/sync/assets', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT * FROM assets WHERE (owner_email = ? OR owner_email IS NULL OR owner_email = '') ORDER BY created_at DESC`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
  });
});

// ─── Sync Tasks (Agenda Mockups) ──────────────────────────────────────────────
app.get('/api/sync/tasks', (req, res) => {
  const owner = ownerFromReq(req);
  db.all(`SELECT data FROM cloud_tasks WHERE owner_email = ?`, [owner], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => JSON.parse(r.data)));
  });
});

// ─── FSM Forms (Save & Dispatch) ─────────────────────────────────────────────
app.post('/api/checklists/templates', async (req, res) => {
  const { id, title, settings, schemaData, metadata } = req.body;
  try {
    await dbRun(`INSERT OR REPLACE INTO fsm_forms (id, title, settings, schemaData, metadata) VALUES (?, ?, ?, ?, ?)`,
      [id, title, JSON.stringify(settings || {}), JSON.stringify(schemaData || []), JSON.stringify(metadata || {})]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/checklists/templates', async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
       db.all(`SELECT * FROM fsm_forms`, [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
       });
    });
    res.json(rows.map(r => ({
      id: r.id, title: r.title, settings: JSON.parse(r.settings || '{}'), schemaData: JSON.parse(r.schemaData || '[]'), metadata: JSON.parse(r.metadata || '{}'), updatedAt: r.updated_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/checklists/dispatch', async (req, res) => {
  const taskPayload = req.body;
  // taskPayload already has id, title, ownerEmail...
  const owner = taskPayload.ownerEmail || 'demo@brspark.com';
  
  try {
    await dbRun(`INSERT OR REPLACE INTO cloud_tasks (id, owner_email, data) VALUES (?, ?, ?)`,
      [taskPayload.id, owner, JSON.stringify(taskPayload)]);
      
    console.log(`[FSM_DISPATCH] Nova Vistoria Despachada para: ${owner}`);
    res.json({ success: true, task: taskPayload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/checklists/templates/:id', async (req, res) => {
  try {
    const row = await dbGet(`SELECT * FROM fsm_forms WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Formulário não encontrado" });
    res.json({
      id: row.id,
      title: row.title,
      settings: JSON.parse(row.settings || '{}'),
      schemaData: JSON.parse(row.schemaData || '[]'),
      metadata: JSON.parse(row.metadata || '{}')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Storage Upload ───────────────────────────────────────────────────────────// Servir arquivos de interface (Admin Panel Web)
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));

// Setup multer para upload de arquivos
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use('/api/storage/files', express.static(UPLOAD_DIR));

app.post('/api/storage/upload', (req, res) => {
  const { base64, mimeType, path: remotePath } = req.body;

  if (!base64 || !remotePath) {
    // Fallback: try FormData multipart (handled by express.raw or busboy in production)
    return res.status(400).json({ error: 'Missing base64 or path' });
  }

  try {
    const dir = path.resolve(UPLOAD_DIR, path.dirname(remotePath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.resolve(UPLOAD_DIR, remotePath);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const url = `/api/storage/files/${remotePath}`;
    const fullUrl = `http://localhost:${PORT}${url}`;

    // Save metadata in DB
    const owner = req.headers['x-owner-email'] || 'unknown';
    const fileId = remotePath.split('/').pop()?.split('.')[0] || remotePath;
    db.run(`INSERT OR REPLACE INTO cloud_media (id, owner_email, remote_url, metadata) VALUES (?, ?, ?, ?)`,
      [fileId, owner, fullUrl, JSON.stringify({ remotePath, mimeType, uploadedAt: new Date().toISOString() })]);

    console.log(`[STORAGE] Upload: ${remotePath} (${buffer.length} bytes)`);
    res.json({ url: fullUrl, path: remotePath });
  } catch (e) {
    console.error('[STORAGE] Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Serve uploaded files
app.use('/api/storage/files', express.static(UPLOAD_DIR));

// ─── Chat Routes ──────────────────────────────────────────────────────────────
app.get('/api/chat/rooms', (req, res) => {
  db.all(`
    SELECT r.*,
      (SELECT content FROM chat_messages WHERE roomId=r.id ORDER BY timestamp DESC LIMIT 1) as lastMessage,
      (SELECT timestamp FROM chat_messages WHERE roomId=r.id ORDER BY timestamp DESC LIMIT 1) as lastMessageAt,
      (SELECT senderName FROM chat_messages WHERE roomId=r.id ORDER BY timestamp DESC LIMIT 1) as lastSender
    FROM chat_rooms r ORDER BY r.created_at ASC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/chat/rooms/:roomId/messages', (req, res) => {
  const since = req.query.since ? parseInt(req.query.since) : 0;
  db.all(
    `SELECT * FROM chat_messages WHERE roomId=? AND timestamp>? ORDER BY timestamp ASC LIMIT 100`,
    [req.params.roomId, since],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/chat/rooms/:roomId/messages', (req, res) => {
  const { senderId, senderName, type, content, mediaUrl } = req.body;
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const timestamp = Date.now();
  db.run(
    `INSERT INTO chat_messages (id,roomId,senderId,senderName,type,content,mediaUrl,timestamp) VALUES (?,?,?,?,?,?,?,?)`,
    [id, req.params.roomId, senderId, senderName, type || 'text', content || '', mediaUrl || null, timestamp],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, timestamp, success: true });
    }
  );
});

// ─── Providers ────────────────────────────────────────────────────────────────
app.get('/api/providers', (req, res) => {
  const { category, q, city, page = 1, limit = 20 } = req.query;
  const take = Math.min(parseInt(limit) || 20, 50);
  const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

  let sql = 'SELECT * FROM providers WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (city) {
    sql += ' AND city LIKE ?';
    params.push(`%${city}%`);
  }
  if (q) {
    sql += ' AND (name LIKE ? OR keywords LIKE ? OR city LIKE ?)';
    const search = `%${q}%`;
    params.push(search, search, search);
  }

  // Count total
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  db.get(countSql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row.total;

    // Fetch data
    const dataSql = sql + ' ORDER BY rating DESC, name ASC LIMIT ? OFFSET ?';
    db.all(dataSql, [...params, take, skip], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        data: rows,
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take)
      });
    });
  });
});

// ─── Config (público) ─────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ 
    assetTypes: [
      { id: 'IMOVEL', titleKey: 'Imóvel', icon: 'home-outline', color: '#4F46E5' },
      { id: 'VEICULO', titleKey: 'Veículo', icon: 'car-outline', color: '#EF4444' },
      { id: 'EQUIPAMENTO', titleKey: 'Equipamento', icon: 'construct-outline', color: '#10B981' },
      { id: 'OUTRO', titleKey: 'Outros', icon: 'cube-outline', color: '#6366F1' },
    ], 
    categories: [
      { id: 'Elétrica', label: 'Elétrica', icon: 'flash' },
      { id: 'Hidráulica', label: 'Hidráulica', icon: 'water' },
      { id: 'Tecnologia', label: 'Tecnologia', icon: 'laptop-outline' },
      { id: 'Jardinagem', label: 'Jardinagem', icon: 'leaf' },
    ] 
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', modules: ['assets', 'costs', 'insurance', 'vault', 'media', 'chat'] });
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n================================`);
  console.log(`🔥 BrSpark Cloud API v2.0 Online`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`💾 DB: ${dbPath}`);
  console.log(`📁 Uploads: ${UPLOAD_DIR}`);
  console.log(`================================\n`);
});
