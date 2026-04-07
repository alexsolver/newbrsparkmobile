import * as SQLite from 'expo-sqlite';
import { Asset, AssetLocation } from '../types/asset';
import { isMobileWarehouseAsset } from '../utils/mobileWarehouseAsset';

/** Por omissão inclui armazém móvel (necessário para stock). Use false em listagens de bens. */
export type LocalAssetReadOptions = {
  includeMobileWarehouse?: boolean;
};

function filterAssetsForList<T extends Asset>(assets: T[], opts?: LocalAssetReadOptions): T[] {
  if (opts?.includeMobileWarehouse === false) {
    return assets.filter((a) => !isMobileWarehouseAsset(a));
  }
  return assets;
}

const db = SQLite.openDatabaseSync('brspark.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      imageUrl TEXT,
      status TEXT,
      statusType TEXT,
      details TEXT,
      parent_id TEXT DEFAULT NULL,
      display_order INTEGER DEFAULT 0,
      deleted_at TEXT DEFAULT NULL,
      owner_email TEXT DEFAULT NULL,
      sub_location TEXT DEFAULT NULL
    );
    
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Migration for existing sync_queue
    PRAGMA table_info(sync_queue);

    CREATE TABLE IF NOT EXISTS assets_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      owner_email TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY NOT NULL,
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
    );

    CREATE TABLE IF NOT EXISTS service_categories (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS system_configs (
      id TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL, -- e.g. 'expense_categories', 'revenue_categories'
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      avatarColor TEXT,
      lastMessage TEXT,
      lastSender TEXT,
      lastMessageAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS asset_types (
      id TEXT PRIMARY KEY NOT NULL,
      titleKey TEXT NOT NULL,
      subtitleKey TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS global_contacts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      currentStock REAL DEFAULT 0,
      minStock REAL DEFAULT 0,
      locationId TEXT,
      subLocation TEXT,
      costPrice REAL DEFAULT 0,
      owner_email TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY NOT NULL,
      itemId TEXT NOT NULL,
      type TEXT NOT NULL, -- 'IN', 'OUT', 'ADJUST', 'TRANSFER'
      quantity REAL NOT NULL,
      unitPrice REAL,
      destinationAssetId TEXT,
      subLocation TEXT,
      timestamp TEXT NOT NULL,
      notes TEXT,
      owner_email TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS tech_stock_items (
      id TEXT PRIMARY KEY NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      currentStock REAL DEFAULT 0,
      minStock REAL DEFAULT 0,
      subLocation TEXT,
      costPrice REAL DEFAULT 0,
      owner_email TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS tech_stock_movements (
      id TEXT PRIMARY KEY NOT NULL,
      itemId TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL,
      destinationAssetId TEXT,
      subLocation TEXT,
      timestamp TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS tech_finance_entries (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'BRL',
      description TEXT,
      taskId TEXT,
      templateId TEXT,
      fieldId TEXT,
      scopeSuffix TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      createdAt TEXT NOT NULL,
      owner_email TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY NOT NULL,
      uri TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      tag TEXT,
      latitude REAL,
      longitude REAL,
      address TEXT,
      stamped_geo INTEGER DEFAULT 0,
      stamped_datetime INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      owner_email TEXT
    );

    CREATE TABLE IF NOT EXISTS asset_locations (
      id TEXT PRIMARY KEY NOT NULL,
      asset_id TEXT NOT NULL,
      floor TEXT NOT NULL,
      room TEXT NOT NULL,
      icon TEXT DEFAULT 'location-outline',
      is_stock INTEGER DEFAULT 0,
      owner_email TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS asset_notes (
      id TEXT PRIMARY KEY NOT NULL,
      assetId TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      synced INTEGER DEFAULT 0,
      owner_email TEXT DEFAULT NULL
    );
  `);

  // Adiciona coluna parent_id caso a tabela já exista sem ela (migração)
  try {
    db.execSync(`ALTER TABLE assets ADD COLUMN parent_id TEXT DEFAULT NULL;`);
  } catch (_) { /* coluna já existe */ }

  // Adiciona coluna display_order
  try {
    db.execSync(`ALTER TABLE assets ADD COLUMN display_order INTEGER DEFAULT 0;`);
  } catch (_) { /* já existe */ }

  // Adiciona coluna owner_email (isolamento por usuário)
  try {
    db.execSync(`ALTER TABLE assets ADD COLUMN owner_email TEXT DEFAULT NULL;`);
  } catch (_) { /* coluna já existe */ }

  // Adiciona coluna sub_location (localização dentro do bem pai)
  try {
    db.execSync(`ALTER TABLE assets ADD COLUMN sub_location TEXT DEFAULT NULL;`);
  } catch (_) { /* coluna já existe */ }

  // Adiciona coluna sub_location_id em stock_items (referência ao asset_location)
  try {
    db.execSync(`ALTER TABLE stock_items ADD COLUMN asset_location_id TEXT DEFAULT NULL;`);
  } catch (_) { /* coluna já existe */ }

  // Adiciona coluna is_stock em asset_locations (indica que é ponto de estoque)
  try {
    db.execSync(`ALTER TABLE asset_locations ADD COLUMN is_stock INTEGER DEFAULT 0;`);
  } catch (_) { /* já existe */ }

  // Adiciona coluna remote_url em media_items (URL do arquivo no cloud storage)
  try {
    db.execSync(`ALTER TABLE media_items ADD COLUMN remote_url TEXT DEFAULT NULL;`);
  } catch (_) { /* já existe */ }

  // Migra tabela providers: adiciona phone, city, state se não existirem
  try { db.execSync(`ALTER TABLE providers ADD COLUMN phone TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE providers ADD COLUMN city TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE providers ADD COLUMN state TEXT DEFAULT 'SP'`); } catch (_) {}

  // Adiciona coluna owner_email em sync_queue caso não exista (migração)
  try {
    db.execSync(`ALTER TABLE sync_queue ADD COLUMN owner_email TEXT DEFAULT NULL;`);
  } catch (_) { /* já existe */ }

  // Migrações massivas para owner_email em outros módulos
  const tablesToMigrate = ['stock_items', 'stock_movements', 'asset_locations', 'providers', 'assets_history'];
  tablesToMigrate.forEach(table => {
    try {
      db.execSync(`ALTER TABLE ${table} ADD COLUMN owner_email TEXT DEFAULT NULL;`);
    } catch (_) {}
  });

  try {
    db.execSync(`ALTER TABLE tech_stock_movements ADD COLUMN reason TEXT DEFAULT NULL;`);
  } catch (_) {}
  try {
    db.execSync(`ALTER TABLE tech_stock_movements ADD COLUMN responsibleId TEXT DEFAULT NULL;`);
  } catch (_) {}
}


// ── Helpers ──────────────────────────────────────────────────────────────────
function parseRow(row: any): Asset {
  let parsedDetails = {};
  if (row.details) {
    try { parsedDetails = JSON.parse(row.details); } catch (_) {}
  }
  let parsedSubLocation = null;
  if (row.sub_location) {
    try { parsedSubLocation = JSON.parse(row.sub_location); } catch (_) {}
  }
  return {
    id: row.id,
    title: row.title,
    type: row.type as any,
    imageUrl: row.imageUrl,
    status: row.status,
    statusType: row.statusType,
    parentId: row.parent_id || null,
    childrenCount: row.childrenCount ?? 0,
    displayOrder: row.display_order ?? 0,
    deletedAt: row.deleted_at || null,
    subLocation: parsedSubLocation,
    details: parsedDetails,
  };

}

/** Salva a sub-localização de um bem filho dentro do bem pai */
export function saveSubLocation(assetId: string, subLocation: { floor: string; room: string; icon?: string; notes?: string } | null, ownerEmail?: string) {
  if (ownerEmail) {
    db.runSync(
      'UPDATE assets SET sub_location = ? WHERE id = ? AND owner_email = ?',
      [subLocation ? JSON.stringify(subLocation) : null, assetId, ownerEmail]
    );
  } else {
    db.runSync(
      'UPDATE assets SET sub_location = ? WHERE id = ?',
      [subLocation ? JSON.stringify(subLocation) : null, assetId]
    );
  }
}

// ── Asset Locations (shared between Vínculos + Estoque) ──────────────────────

/** Save or update a location for a given asset (upsert by asset_id+floor+room) */
export function saveAssetLocation(loc: Omit<AssetLocation, 'createdAt'>, ownerEmail: string): AssetLocation {
  const existing = db.getFirstSync<any>(
    'SELECT id FROM asset_locations WHERE asset_id = ? AND floor = ? AND room = ? AND owner_email = ?',
    [loc.assetId, loc.floor, loc.room, ownerEmail]
  );
  if (existing) {
    db.runSync(
      'UPDATE asset_locations SET icon = ?, is_stock = ? WHERE id = ? AND owner_email = ?',
      [loc.icon, loc.isStock ? 1 : 0, existing.id, ownerEmail]
    );
    return { ...loc, id: existing.id };
  }
  const id = loc.id || Math.random().toString(36).substring(2, 10);
  db.runSync(
    'INSERT INTO asset_locations (id, asset_id, floor, room, icon, is_stock, owner_email) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, loc.assetId, loc.floor, loc.room, loc.icon, loc.isStock ? 1 : 0, ownerEmail]
  );
  return { ...loc, id };
}

// ── Asset Notes ───────────────────────────────────────────────────────────────
import { AssetNote } from '../types/note';

export function getAssetNotes(assetId: string, ownerEmail?: string): AssetNote[] {
  let query = 'SELECT * FROM asset_notes WHERE assetId = ?';
  const params: any[] = [assetId];
  if (ownerEmail) {
    query += ' AND owner_email = ?';
    params.push(ownerEmail);
  }
  query += ' ORDER BY createdAt DESC';
  
  const rows = db.getAllSync<any>(query, params);
  return rows.map(r => ({
    id: r.id,
    assetId: r.assetId,
    title: r.title,
    content: r.content,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    synced: r.synced as 0 | 1
  }));
}

export function saveAssetNote(note: AssetNote, ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT INTO asset_notes (id, assetId, title, content, createdBy, createdAt, updatedAt, synced, owner_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      updatedAt = excluded.updatedAt,
      synced = excluded.synced,
      owner_email = COALESCE(excluded.owner_email, asset_notes.owner_email)
  `);
  stmt.executeSync([
    note.id, note.assetId, note.title, note.content, note.createdBy, 
    note.createdAt, note.updatedAt, note.synced, ownerEmail || null
  ]);

  // Enfileira ação offline caso necessário
  if (note.synced === 0) {
    queueOfflineAction('CREATE_NOTE', note, ownerEmail);
  }
}

export function deleteAssetNoteLocal(noteId: string, ownerEmail?: string) {
  if (ownerEmail) {
    db.runSync('DELETE FROM asset_notes WHERE id = ? AND owner_email = ?', [noteId, ownerEmail]);
  } else {
    db.runSync('DELETE FROM asset_notes WHERE id = ?', [noteId]);
  }
  // Enfileira exclusão offline
  queueOfflineAction('DELETE_NOTE', { id: noteId }, ownerEmail);
}

/** Get all locations for a given asset, ordered by floor then room */
export function getAssetLocations(assetId: string, ownerEmail?: string): AssetLocation[] {
  let query = 'SELECT * FROM asset_locations WHERE asset_id = ?';
  const params: any[] = [assetId];
  if (ownerEmail) {
    query += ' AND owner_email = ?';
    params.push(ownerEmail);
  }
  query += ' ORDER BY floor, room';
  const rows = db.getAllSync<any>(query, params);
  return rows.map(r => ({
    id: r.id,
    assetId: r.asset_id,
    floor: r.floor,
    room: r.room,
    icon: r.icon || 'location-outline',
    isStock: r.is_stock === 1,
    createdAt: r.created_at,
  }));
}

/** Get only locations marked as stock points */
export function getStockLocations(assetId: string): AssetLocation[] {
  return getAssetLocations(assetId).filter(l => l.isStock);
}

/** Delete a location */
export function deleteAssetLocation(locationId: string, ownerEmail?: string) {
  if (ownerEmail) {
    db.runSync('DELETE FROM asset_locations WHERE id = ? AND owner_email = ?', [locationId, ownerEmail]);
  } else {
    db.runSync('DELETE FROM asset_locations WHERE id = ?', [locationId]);
  }
}

// ── Leitura ───────────────────────────────────────────────────────────────────
/** Todos os ativos raiz (sem pai) com contagem de filhos */
export function getRootAssets(ownerEmail?: string, opts?: LocalAssetReadOptions): Asset[] {
  let query = `
    SELECT a.*, 
      (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id AND c.deleted_at IS NULL) as childrenCount
    FROM assets a
    WHERE a.deleted_at IS NULL AND (a.parent_id IS NULL OR a.parent_id = '')
  `;
  const params: any[] = [];
  if (ownerEmail !== undefined) {
    query += ` AND a.owner_email = ?`;
    params.push(ownerEmail);
  }
  query += ` ORDER BY a.display_order ASC, a.title ASC`;
  const result = db.getAllSync(query, params);
  return filterAssetsForList(result.map(parseRow), opts);
}

/** Filhos diretos de um ativo pai */
export function getChildAssets(parentId: string, ownerEmail?: string, opts?: LocalAssetReadOptions): Asset[] {
  let query = `
    SELECT a.*,
      (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id AND c.deleted_at IS NULL) as childrenCount
    FROM assets a
    WHERE a.deleted_at IS NULL AND a.parent_id = ?
  `;
  const params: any[] = [parentId];
  if (ownerEmail) {
    query += ' AND a.owner_email = ?';
    params.push(ownerEmail);
  }
  query += ' ORDER BY a.display_order ASC, a.title ASC';
  const result = db.getAllSync(query, params);
  return filterAssetsForList(result.map(parseRow), opts);
}

/** Todos os ativos (para seletores de pai) */
export function getLocalAssets(ownerEmail?: string, opts?: LocalAssetReadOptions): Asset[] {
  let query = `
    SELECT a.*,
      p.title as parentTitle,
      (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id AND c.deleted_at IS NULL) as childrenCount
    FROM assets a
    LEFT JOIN assets p ON a.parent_id = p.id
    WHERE a.deleted_at IS NULL
  `;
  const params: any[] = [];
  if (ownerEmail !== undefined) {
    query += ` AND a.owner_email = ?`;
    params.push(ownerEmail);
  }
  query += ` ORDER BY a.display_order ASC, a.title ASC`;
  const result = db.getAllSync(query, params);
  const mapped = (result as any[]).map((row) => ({
    ...parseRow(row),
    parentTitle: row.parentTitle || null,
  }));
  return filterAssetsForList(mapped, opts);
}

/** Breadcrumb: caminho do ativo até a raiz */
export function getAssetAncestors(assetId: string, ownerEmail?: string): Asset[] {
  const ancestors: Asset[] = [];
  let currentId: string | null = assetId;
  const all = getLocalAssets(ownerEmail);
  const map = new Map(all.map(a => [a.id, a]));

  while (currentId) {
    const asset = map.get(currentId);
    if (!asset) break;
    ancestors.unshift(asset);
    currentId = asset.parentId || null;
    if (currentId === assetId) break; // evita loop circular
  }
  return ancestors;
}

// ── Escrita ───────────────────────────────────────────────────────────────────
export function saveAssetsLocal(assets: Asset[], ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT INTO assets 
    (id, title, type, imageUrl, status, statusType, details, parent_id, display_order, deleted_at, owner_email) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      imageUrl = excluded.imageUrl,
      status = excluded.status,
      statusType = excluded.statusType,
      details = excluded.details,
      parent_id = excluded.parent_id,
      display_order = COALESCE(excluded.display_order, assets.display_order),
      deleted_at = COALESCE(excluded.deleted_at, assets.deleted_at),
      owner_email = COALESCE(excluded.owner_email, assets.owner_email)
  `);

  assets.forEach(asset => {
    let detailsBlob = '{}';
    try { detailsBlob = asset.details ? JSON.stringify(asset.details) : '{}'; } catch (_) {}
    stmt.executeSync([
      asset.id,
      asset.title,
      asset.type,
      asset.imageUrl || null,
      asset.status,
      asset.statusType,
      detailsBlob,
      asset.parentId || null,
      asset.displayOrder || 0,
      asset.deletedAt || null,
      (asset as any).owner_email || ownerEmail || null,
    ]);
  });
}

export function saveAssetsForUser(assets: Asset[], ownerEmail: string) {
  const stmt = db.prepareSync(`
    INSERT INTO assets 
    (id, title, type, imageUrl, status, statusType, details, parent_id, display_order, deleted_at, owner_email) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      imageUrl = excluded.imageUrl,
      status = excluded.status,
      statusType = excluded.statusType,
      details = excluded.details,
      parent_id = excluded.parent_id,
      display_order = COALESCE(excluded.display_order, assets.display_order),
      deleted_at = COALESCE(excluded.deleted_at, assets.deleted_at),
      owner_email = excluded.owner_email
  `);

  assets.forEach(asset => {
    let detailsBlob = '{}';
    try { detailsBlob = asset.details ? JSON.stringify(asset.details) : '{}'; } catch (_) {}
    stmt.executeSync([
      asset.id,
      asset.title,
      asset.type,
      asset.imageUrl || null,
      asset.status,
      asset.statusType,
      detailsBlob,
      asset.parentId || null,
      asset.displayOrder || 0,
      asset.deletedAt || null,
      (asset as any).owner_email || ownerEmail,
    ]);
  });
}

export function updateAssetParent(assetId: string, parentId: string | null, ownerEmail?: string) {
  db.runSync('UPDATE assets SET parent_id = ? WHERE id = ?', [parentId, assetId]);
  
  const asset = getLocalAssets(ownerEmail || '').find(a => a.id === assetId);
  if (asset) {
    queueOfflineAction('UPDATE_ASSET', asset, ownerEmail || '');
  }
}

export function updateAssetOrder(updates: { id: string, displayOrder: number }[], ownerEmail?: string) {
  const stmt = db.prepareSync('UPDATE assets SET display_order = ? WHERE id = ?');
  db.withTransactionSync(() => {
    updates.forEach(u => stmt.executeSync([u.displayOrder, u.id]));
  });
}

// ── Histórico ─────────────────────────────────────────────────────────────────
export function logAssetHistory(assetId: string, action: string, details: string = '', ownerEmail?: string) {
  const stmt = db.prepareSync('INSERT INTO assets_history (asset_id, action, details, owner_email) VALUES (?, ?, ?, ?)');
  stmt.executeSync([assetId, action, details, ownerEmail || null]);
}

export function getAssetHistoryLocal(assetId: string, ownerEmail?: string) {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM assets_history WHERE asset_id = ? AND owner_email = ? ORDER BY created_at DESC', [assetId, ownerEmail]);
  }
  return db.getAllSync('SELECT * FROM assets_history WHERE asset_id = ? ORDER BY created_at DESC', [assetId]);
}

// ── Soft Delete ───────────────────────────────────────────────────────────────
export function softDeleteAssetLocal(assetId: string, ownerEmail?: string) {
  if (ownerEmail) {
    db.runSync("UPDATE assets SET deleted_at = datetime('now') WHERE id = ? AND owner_email = ?", [assetId, ownerEmail]);
  } else {
    db.runSync("UPDATE assets SET deleted_at = datetime('now') WHERE id = ?", [assetId]);
  }
  logAssetHistory(assetId, 'EXCLUSÃO LÓGICA', 'Ativo removido via Soft Delete.', ownerEmail);
}

// ── Sync Queue ────────────────────────────────────────────────────────────────
export function queueOfflineAction(action: string, payload: any, ownerEmail?: string) {
  const stmt = db.prepareSync('INSERT INTO sync_queue (action, payload, owner_email) VALUES (?, ?, ?)');
  stmt.executeSync([action, JSON.stringify(payload), ownerEmail || null]);
}

export function addToSyncQueue(module: string, action: string, payload: object, ownerEmail?: string): void {
  queueOfflineAction(`${module}:${action}`, payload, ownerEmail);
}

export function getSyncQueue(ownerEmail?: string) {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM sync_queue WHERE owner_email = ? ORDER BY created_at ASC', [ownerEmail]);
  }
  return db.getAllSync('SELECT * FROM sync_queue ORDER BY created_at ASC');
}

export function clearSyncQueueItem(id: number) {
  const stmt = db.prepareSync('DELETE FROM sync_queue WHERE id = ?');
  stmt.executeSync([id]);
}

// ── Providers & Categories ────────────────────────────────────────────────────

export function getProviders(): any[] {
  const result = db.getAllSync('SELECT * FROM providers');
  return result.map((r: any) => ({
    ...r,
    tags:     safeParseStringOrArray(r.tags),
    keywords: safeParseStringOrArray(r.keywords),
    verified: r.verified === 1
  }));
}

/** Safely parses a field that may be a JSON array or a CSV string */
function safeParseStringOrArray(val: string | null): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    // CSV string: "elétrica,hidráulica,gerador"
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
}


export function saveProviders(providers: any[]) {
  const stmt = db.prepareSync(`
    INSERT INTO providers (id, name, category, rating, reviews, photo, tags, verified, keywords, phone, city, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      rating = excluded.rating,
      reviews = excluded.reviews,
      photo = excluded.photo,
      tags = excluded.tags,
      verified = excluded.verified,
      keywords = excluded.keywords,
      phone = excluded.phone,
      city = excluded.city,
      state = excluded.state
  `);
  providers.forEach(p => {
    stmt.executeSync([
      p.id, p.name, p.category, p.rating, p.reviews, p.photo,
      Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || ''),
      p.verified ? 1 : 0,
      p.keywords || '',
      p.phone || null, p.city || null, p.state || 'SP',
    ]);
  });
}

/** saveProvidersLocal — substitui providers do backend (fonte da verdade: PostgreSQL) */
export function saveProvidersLocal(providers: any[]) {
  if (!providers?.length) return;
  // Usa upsert para preservar dados locais que ainda não subiram
  saveProviders(providers);
}

export function getServiceCategories(): any[] {
  return db.getAllSync('SELECT * FROM service_categories');
}

export function saveServiceCategories(categories: any[]) {
  const stmt = db.prepareSync(`
    INSERT INTO service_categories (id, label, icon) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label, icon = excluded.icon
  `);
  categories.forEach(c => stmt.executeSync([c.id, c.label, c.icon]));
}

export function getSystemConfigs(category: string): any[] {
  return db.getAllSync('SELECT * FROM system_configs WHERE category = ?', [category]);
}

export function saveSystemConfigs(category: string, items: { id: string, label: string }[]) {
  const stmt = db.prepareSync(`
    INSERT INTO system_configs (id, category, label) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label
  `);
  items.forEach(item => stmt.executeSync([item.id, category, item.label]));
}

// ── Chat & Asset Types ────────────────────────────────────────────────────────

export function getChatRooms(): any[] {
  return db.getAllSync('SELECT * FROM chat_rooms ORDER BY lastMessageAt DESC');
}

export function saveChatRooms(rooms: any[]) {
  const stmt = db.prepareSync(`
    INSERT INTO chat_rooms (id, name, description, avatarColor, lastMessage, lastSender, lastMessageAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      avatarColor = excluded.avatarColor,
      lastMessage = excluded.lastMessage,
      lastSender = excluded.lastSender,
      lastMessageAt = excluded.lastMessageAt
  `);
  rooms.forEach(r => stmt.executeSync([r.id, r.name, r.description || null, r.avatarColor, r.lastMessage || null, r.lastSender || null, r.lastMessageAt || null]));
}

export function getAssetTypes(): any[] {
  return db.getAllSync('SELECT * FROM asset_types');
}

export function saveAssetTypes(types: any[]) {
  const stmt = db.prepareSync(`
    INSERT INTO asset_types (id, titleKey, subtitleKey, icon, color) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      titleKey = excluded.titleKey,
      subtitleKey = excluded.subtitleKey,
      icon = excluded.icon,
      color = excluded.color
  `);
  types.forEach(t => stmt.executeSync([
    t.id,
    t.titleKey || t.id,
    t.subtitleKey || t.titleKey || t.id,  // fallback: never null
    t.icon,
    t.color,
  ]));
}

// ── Stock (bens / locais de ativo) ───────────────────────────────────────────

export function getLocalStockItems(ownerEmail?: string): any[] {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM stock_items WHERE owner_email = ?', [ownerEmail]);
  }
  return db.getAllSync('SELECT * FROM stock_items');
}

/** Itens de stock cuja localização é um bem do portfólio (exclui órfãos do antigo armazém móvel). */
export function getVenueStockItemsOnly(ownerEmail?: string): any[] {
  const items = getLocalStockItems(ownerEmail);
  if (ownerEmail === undefined || ownerEmail === '') {
    return items;
  }
  const allowed = new Set(
    getLocalAssets(ownerEmail, { includeMobileWarehouse: false }).map((a) => a.id)
  );
  return items.filter((i: any) => {
    const loc = i.locationId != null && String(i.locationId).trim() !== '' ? String(i.locationId).trim() : '';
    if (!loc) return true;
    return allowed.has(loc);
  });
}

export function getMobileWarehouseAssetIdsFromLocalDb(ownerEmail?: string): string[] {
  const assets = getLocalAssets(ownerEmail);
  return assets.filter((a) => isMobileWarehouseAsset(a)).map((a) => a.id);
}

/** Migra linhas de stock_items apontando ao armazém móvel (legado) para tech_stock_*. */
export function migrateLegacyMobileWarehouseStockRows(mobileLocationIds: string[]): void {
  if (!mobileLocationIds.length) return;
  const seen = new Set<string>();
  for (const locId of mobileLocationIds) {
    if (!locId || seen.has(locId)) continue;
    seen.add(locId);
    const rows = db.getAllSync<any>('SELECT * FROM stock_items WHERE locationId = ?', [locId]);
    for (const row of rows) {
      const oid = row.owner_email || null;
      const item = {
        id: row.id,
        sku: row.sku,
        name: row.name,
        category: row.category || 'general',
        unit: row.unit || 'un',
        currentStock: row.currentStock ?? 0,
        minStock: row.minStock ?? 0,
        subLocation: row.subLocation || null,
        costPrice: row.costPrice ?? 0,
        owner_email: oid,
      };
      saveTechStockItemLocal(item, oid || undefined);
      const moves = db.getAllSync<any>('SELECT * FROM stock_movements WHERE itemId = ?', [row.id]);
      for (const m of moves) {
        saveTechStockMovementLocal({ ...m }, m.owner_email || oid || undefined);
        db.runSync('DELETE FROM stock_movements WHERE id = ?', [m.id]);
      }
      db.runSync('DELETE FROM stock_items WHERE id = ?', [row.id]);
    }
  }
}

// ── Estoque do técnico (entidade separada; sem locationId / Asset) ──────────

export function getLocalTechStockItems(ownerEmail?: string): any[] {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM tech_stock_items WHERE owner_email = ?', [ownerEmail]);
  }
  return db.getAllSync('SELECT * FROM tech_stock_items');
}

export function getTechStockRowById(itemId: string): any | null {
  return db.getFirstSync<any>('SELECT * FROM tech_stock_items WHERE id = ?', [itemId]);
}

export function saveTechStockItemLocal(item: any, ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT INTO tech_stock_items (id, sku, name, category, unit, currentStock, minStock, subLocation, costPrice, owner_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sku = excluded.sku,
      name = excluded.name,
      category = excluded.category,
      unit = excluded.unit,
      currentStock = excluded.currentStock,
      minStock = excluded.minStock,
      subLocation = excluded.subLocation,
      costPrice = excluded.costPrice,
      owner_email = COALESCE(excluded.owner_email, tech_stock_items.owner_email)
  `);
  stmt.executeSync([
    item.id,
    item.sku,
    item.name,
    item.category || 'general',
    item.unit || 'un',
    item.currentStock ?? 0,
    item.minStock ?? 0,
    item.subLocation || null,
    item.costPrice ?? 0,
    item.owner_email || ownerEmail || null,
  ]);
}

export function deleteTechStockItemLocal(itemId: string) {
  db.runSync('DELETE FROM tech_stock_movements WHERE itemId = ?', [itemId]);
  db.runSync('DELETE FROM tech_stock_items WHERE id = ?', [itemId]);
}

export function getLocalTechStockMovements(ownerEmail?: string): any[] {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM tech_stock_movements WHERE owner_email = ? ORDER BY timestamp DESC', [
      ownerEmail,
    ]);
  }
  return db.getAllSync('SELECT * FROM tech_stock_movements ORDER BY timestamp DESC');
}

export function saveTechStockMovementLocal(mov: any, ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT OR REPLACE INTO tech_stock_movements (
      id, itemId, type, quantity, unitPrice, destinationAssetId, subLocation, timestamp, owner_email, reason, responsibleId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.executeSync([
    mov.id,
    mov.itemId,
    mov.type,
    mov.quantity,
    mov.unitPrice || null,
    mov.destinationAssetId || null,
    mov.subLocation || null,
    mov.timestamp,
    ownerEmail || mov.owner_email || null,
    mov.reason != null ? String(mov.reason) : null,
    mov.responsibleId != null ? String(mov.responsibleId) : null,
  ]);
}

// ── Financeiro do técnico (sem vínculo a Asset / custos de bens) ─────────────

export function getLocalTechFinanceEntries(ownerEmail?: string): any[] {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM tech_finance_entries WHERE owner_email = ? ORDER BY createdAt DESC', [
      ownerEmail,
    ]);
  }
  return db.getAllSync('SELECT * FROM tech_finance_entries ORDER BY createdAt DESC');
}

export function getTechFinanceRowById(id: string): any | null {
  return db.getFirstSync<any>('SELECT * FROM tech_finance_entries WHERE id = ?', [id]);
}

export function saveTechFinanceEntryLocal(row: any, ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT INTO tech_finance_entries (
      id, kind, amount, currency, description, taskId, templateId, fieldId, scopeSuffix, source, createdAt, owner_email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      amount = excluded.amount,
      currency = excluded.currency,
      description = excluded.description,
      taskId = excluded.taskId,
      templateId = excluded.templateId,
      fieldId = excluded.fieldId,
      scopeSuffix = excluded.scopeSuffix,
      source = excluded.source,
      createdAt = excluded.createdAt,
      owner_email = COALESCE(excluded.owner_email, tech_finance_entries.owner_email)
  `);
  stmt.executeSync([
    row.id,
    row.kind,
    Number(row.amount) || 0,
    row.currency || 'BRL',
    row.description != null ? String(row.description) : null,
    row.taskId != null ? String(row.taskId) : null,
    row.templateId != null ? String(row.templateId) : null,
    row.fieldId != null ? String(row.fieldId) : null,
    row.scopeSuffix != null ? String(row.scopeSuffix) : '',
    row.source || 'manual',
    row.createdAt || new Date().toISOString(),
    row.owner_email || ownerEmail || null,
  ]);
}

export function deleteTechFinanceEntryLocal(id: string) {
  db.runSync('DELETE FROM tech_finance_entries WHERE id = ?', [id]);
}

/** Remove linhas do mesmo campo/OS que deixaram de existir no JSON (idempotência por revisão). */
export function deleteTechFinanceEntriesExceptIds(
  ownerEmail: string,
  taskId: string,
  fieldId: string,
  scopeSuffix: string,
  keepIds: string[]
) {
  if (keepIds.length === 0) {
    db.runSync(
      'DELETE FROM tech_finance_entries WHERE owner_email = ? AND taskId = ? AND fieldId = ? AND scopeSuffix = ? AND source = ?',
      [ownerEmail, taskId, fieldId, scopeSuffix || '', 'checklist']
    );
    return;
  }
  const placeholders = keepIds.map(() => '?').join(',');
  db.runSync(
    `DELETE FROM tech_finance_entries WHERE owner_email = ? AND taskId = ? AND fieldId = ? AND scopeSuffix = ? AND source = ? AND id NOT IN (${placeholders})`,
    [ownerEmail, taskId, fieldId, scopeSuffix || '', 'checklist', ...keepIds]
  );
}

export function saveStockItemLocal(item: any, ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT INTO stock_items (id, sku, name, category, unit, currentStock, minStock, locationId, subLocation, costPrice, owner_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sku = excluded.sku,
      name = excluded.name,
      category = excluded.category,
      unit = excluded.unit,
      currentStock = excluded.currentStock,
      minStock = excluded.minStock,
      locationId = excluded.locationId,
      subLocation = excluded.subLocation,
      costPrice = excluded.costPrice,
      owner_email = COALESCE(excluded.owner_email, stock_items.owner_email)
  `);
  stmt.executeSync([
    item.id, 
    item.sku, 
    item.name, 
    item.category, 
    item.unit, 
    item.currentStock, 
    item.minStock, 
    item.locationId || null, 
    item.subLocation || null, 
    item.costPrice || 0, 
    item.owner_email || ownerEmail || null
  ]);
}

export function deleteStockItemLocal(itemId: string) {
  db.runSync('DELETE FROM stock_movements WHERE itemId = ?', [itemId]);
  db.runSync('DELETE FROM stock_items WHERE id = ?', [itemId]);
}

export function getLocalStockMovements(ownerEmail?: string): any[] {
  if (ownerEmail) {
    return db.getAllSync('SELECT * FROM stock_movements WHERE owner_email = ? ORDER BY timestamp DESC', [ownerEmail]);
  }
  return db.getAllSync('SELECT * FROM stock_movements ORDER BY timestamp DESC');
}

export function saveStockMovementLocal(mov: any, ownerEmail?: string) {
  const stmt = db.prepareSync(`
    INSERT INTO stock_movements (id, itemId, type, quantity, unitPrice, destinationAssetId, subLocation, timestamp, owner_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.executeSync([mov.id, mov.itemId, mov.type, mov.quantity, mov.unitPrice || null, mov.destinationAssetId || null, mov.subLocation || null, mov.timestamp, ownerEmail || null]);
}

export function getGlobalContacts(): any[] {
  return db.getAllSync('SELECT * FROM global_contacts');
}

export function saveGlobalContacts(contacts: any[]) {
  const stmt = db.prepareSync(`
    INSERT INTO global_contacts (id, name, role, color) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      color = excluded.color
  `);
  contacts.forEach(c => stmt.executeSync([c.id, c.name, c.role, c.color]));
}

export function clearLocalDatabase() {
  db.execSync('DELETE FROM assets;');
  db.execSync('DELETE FROM sync_queue;');
  db.execSync('DELETE FROM assets_history;');
  db.execSync('DELETE FROM stock_items;');
  db.execSync('DELETE FROM stock_movements;');
  db.execSync('DELETE FROM tech_stock_items;');
  db.execSync('DELETE FROM tech_stock_movements;');
  db.execSync('DELETE FROM tech_finance_entries;');
  db.execSync('DELETE FROM asset_locations;');
  db.execSync('DELETE FROM providers;');
  db.execSync('DELETE FROM media_items;');
  db.execSync('DELETE FROM chat_rooms;');
  db.execSync('DELETE FROM system_configs;');
}

/** Verifica quem é o "dono" predominante dos dados locais para evitar vazamentos */
export function getDatabaseOwner(): string | null {
  const row = db.getFirstSync<{ owner_email: string }>('SELECT owner_email FROM assets WHERE owner_email IS NOT NULL AND owner_email != "" LIMIT 1');
  return row?.owner_email || null;
}

/** saveConfigLocal — salva assetTypes e categories do backend no SQLite */
export function saveConfigLocal(config: { assetTypes?: any[]; categories?: any[] }) {
  if (config.assetTypes?.length) saveAssetTypes(config.assetTypes);
  if (config.categories?.length)  saveServiceCategories(config.categories);
}

// ── Media Items ───────────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video' | 'file' | 'image' | 'audio';
  description?: string;
  tag?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  stampedGeo: boolean;
  stampedDatetime: boolean;
  createdAt: string;
  ownerEmail?: string;
  remoteUrl?: string;  // URL no BrSpark Cloud Storage após upload
}

export function saveMediaItem(item: MediaItem) {
  db.runSync(
    `INSERT INTO media_items
      (id, uri, type, description, tag, latitude, longitude, address, stamped_geo, stamped_datetime, created_at, owner_email, remote_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       description = excluded.description,
       tag = excluded.tag,
       remote_url = COALESCE(excluded.remote_url, remote_url)`,
    [
      item.id, item.uri, item.type,
      item.description || null,
      item.tag || null,
      item.latitude ?? null, item.longitude ?? null,
      item.address || null,
      item.stampedGeo ? 1 : 0,
      item.stampedDatetime ? 1 : 0,
      item.createdAt,
      item.ownerEmail || null,
      item.remoteUrl || null,
    ]
  );
}

/** Atualiza apenas o remote_url de um item após upload bem-sucedido */
export function updateMediaRemoteUrl(id: string, remoteUrl: string) {
  db.runSync('UPDATE media_items SET remote_url = ? WHERE id = ?', [remoteUrl, id]);
}

export function getMediaItems(ownerEmail?: string): MediaItem[] {
  const rows = ownerEmail
    ? db.getAllSync<any>('SELECT * FROM media_items WHERE owner_email = ? ORDER BY created_at DESC', [ownerEmail])
    : db.getAllSync<any>('SELECT * FROM media_items ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    uri: r.uri,
    type: r.type as 'photo' | 'video',
    description: r.description || '',
    tag: r.tag || '',
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address || '',
    stampedGeo: r.stamped_geo === 1,
    stampedDatetime: r.stamped_datetime === 1,
    createdAt: r.created_at,
    ownerEmail: r.owner_email,
    remoteUrl: r.remote_url || undefined,
  }));
}

export function deleteMediaItem(id: string, ownerEmail?: string) {
  db.runSync('DELETE FROM media_items WHERE id = ?', [id]);
  
  // Enfilera para deletar na nuvem
  addToSyncQueue('media', 'DELETE', { id }, ownerEmail);
}

export function updateMediaItem(id: string, fields: { description?: string; tag?: string }, ownerEmail?: string) {
  db.runSync(
    'UPDATE media_items SET description = ?, tag = ? WHERE id = ?',
    [fields.description ?? null, fields.tag ?? null, id]
  );
  
  // Enfilera para sync na nuvem
  addToSyncQueue('media', 'UPDATE', { id, ...fields }, ownerEmail);
}

