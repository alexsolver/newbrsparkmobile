const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Banco de Dados na Nuvem (Simbólico local)
const dbPath = path.resolve(__dirname, 'brspark_cloud.db');
const db = new sqlite3.Database(dbPath);

console.log('[BrSpark Cloud] Inicializando Banco de Dados B2B SaaS...');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      statusType TEXT,
      details TEXT,
      imageUrl TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assetId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING'
    )
  `);

  // ─── Chat ───────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      avatarColor TEXT DEFAULT '#2563EB',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      senderName TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      content TEXT,
      mediaUrl TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (roomId) REFERENCES chat_rooms(id)
    )
  `);

  // Salas padrão
  db.get('SELECT COUNT(*) as count FROM chat_rooms', (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare(`INSERT INTO chat_rooms (id,name,description,avatarColor) VALUES (?,?,?,?)`);
      stmt.run('room-geral', 'Geral',          'Canal corporativo geral',            '#2563EB');
      stmt.run('room-manut', 'Manutenção',     'Equipe de manutenção e operações',   '#D97706');
      stmt.run('room-tec',   'Técnico & TI',   'Suporte técnico e infraestrutura',   '#7C3AED');
      stmt.run('room-logis', 'Logística',      'Frotas e expedição de ativos',       '#059669');
      stmt.finalize();
    }
  });

  // Semeando o Banco Cloud caso seja a primeira vez rodando
  db.get('SELECT COUNT(*) as count FROM assets', (err, row) => {
    if (row && row.count === 0) {
      console.log('[BrSpark Cloud] Criando Portfólio Inicial de Infraestrutura...');
      const stmt = db.prepare(`INSERT INTO assets (id, title, type, status, statusType, details, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      stmt.run('b2b-01', 'Galpão Logístico Guarulhos', 'REAL_ESTATE', 'VISTORIA PENDENTE', 'warning', JSON.stringify({ address: 'Av. Guarulhos, São Paulo', year: 2010 }), 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80');
      stmt.run('b2b-02', 'Mini Escavadeira Bobcat', 'OTHER', 'OPERAÇÃO NORMAL', 'success', JSON.stringify({ mileage: 1200 }), 'https://images.unsplash.com/photo-1621213709670-f5a63c6b2b73?w=800&q=80');
      stmt.run('b2b-03', 'Frota Hilux (Placa XYZ)', 'VEHICLE', 'MAINTENANCE OK', 'success', JSON.stringify({ mileage: 45000, year: 2024 }), 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80');
      stmt.finalize();
    }
  });
});

// GET: Puxar ativos consolidados do SaaS para o app móvel
app.get('/api/assets', (req, res) => {
  db.all('SELECT * FROM assets ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // SQLite retorna 'details' como string JSON, convertendo de volta
    const parsed = rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : {} }));
    res.json(parsed);
  });
});

// POST: Rota mestre de Synchrozination (Sincroniza o que aconteceu Offline no Celular)
app.post('/api/sync/push', (req, res) => {
  const { queue } = req.body;
  let processed = 0;

  if (!queue || queue.length === 0) return res.json({ success: true, processed: 0 });

  console.log(`[BrSpark Cloud] Recebendo Puxada de Sync de Dispositivo Remoto: ${queue.length} ações.`);

  queue.forEach(item => {
    const action = item.action;
    let payload;
    try { payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload; } 
    catch(e) { payload = item.payload; }

    if (action === 'CREATE_ASSET') {
      const asset = payload;
      db.run(`INSERT OR REPLACE INTO assets (id, title, type, status, statusType, details, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [asset.id, asset.title, asset.type, asset.status, asset.statusType, JSON.stringify(asset.details || {}), asset.imageUrl]
      );
    } 
    else if (action === 'SCHEDULE_MAINTENANCE') {
      db.run(`INSERT INTO maintenances (assetId, timestamp) VALUES (?, ?)`, [payload.assetId, payload.timestamp]);
    }
    processed++;
  });

  res.json({ success: true, processed });
});

const PORT = 3000;

// ─── Chat Routes ─────────────────────────────────────────────────────────────
// GET /api/chat/rooms
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

// GET /api/chat/rooms/:roomId/messages?since=timestamp
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

// POST /api/chat/rooms/:roomId/messages
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n================================`);
  console.log(`🔥 BrSpark API - SaaS Backend Online`);
  console.log(`📡 Rodando nativamente na Porta: ${PORT}`);
  console.log(`================================`);
});
