import * as SQLite from 'expo-sqlite';
import { Asset } from '../types/asset';

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
      deleted_at TEXT DEFAULT NULL
    );
    
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Adiciona coluna parent_id caso a tabela já exista sem ela (migração)
  try {
    db.execSync(`ALTER TABLE assets ADD COLUMN parent_id TEXT DEFAULT NULL;`);
  } catch (_) { /* coluna já existe */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseRow(row: any): Asset {
  let parsedDetails = {};
  if (row.details) {
    try { parsedDetails = JSON.parse(row.details); } catch (_) {}
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
    details: parsedDetails,
  };
}

// ── Leitura ───────────────────────────────────────────────────────────────────
/** Todos os ativos raiz (sem pai) com contagem de filhos */
export function getRootAssets(): Asset[] {
  const result = db.getAllSync(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id AND c.deleted_at IS NULL) as childrenCount
    FROM assets a
    WHERE a.deleted_at IS NULL AND (a.parent_id IS NULL OR a.parent_id = '')
    ORDER BY a.title ASC
  `);
  return result.map(parseRow);
}

/** Filhos diretos de um ativo pai */
export function getChildAssets(parentId: string): Asset[] {
  const result = db.getAllSync(`
    SELECT a.*,
      (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id AND c.deleted_at IS NULL) as childrenCount
    FROM assets a
    WHERE a.deleted_at IS NULL AND a.parent_id = ?
    ORDER BY a.title ASC
  `, [parentId]);
  return result.map(parseRow);
}

/** Todos os ativos (para seletores de pai) */
export function getLocalAssets(): Asset[] {
  const result = db.getAllSync(`
    SELECT a.*,
      (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id AND c.deleted_at IS NULL) as childrenCount
    FROM assets a
    WHERE a.deleted_at IS NULL
    ORDER BY a.title ASC
  `);
  return result.map(parseRow);
}

/** Breadcrumb: caminho do ativo até a raiz */
export function getAssetAncestors(assetId: string): Asset[] {
  const ancestors: Asset[] = [];
  let currentId: string | null = assetId;
  const all = getLocalAssets();
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
export function saveAssetsLocal(assets: Asset[]) {
  const stmt = db.prepareSync(`
    INSERT OR REPLACE INTO assets 
    (id, title, type, imageUrl, status, statusType, details, parent_id, deleted_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      (asset as any).deletedAt || null,
    ]);
  });
}

export function updateAssetParent(assetId: string, parentId: string | null) {
  db.runSync('UPDATE assets SET parent_id = ? WHERE id = ?', [parentId, assetId]);
}

// ── Histórico ─────────────────────────────────────────────────────────────────
export function logAssetHistory(assetId: string, action: string, details: string = '') {
  const stmt = db.prepareSync('INSERT INTO assets_history (asset_id, action, details) VALUES (?, ?, ?)');
  stmt.executeSync([assetId, action, details]);
}

export function getAssetHistoryLocal(assetId: string) {
  return db.getAllSync('SELECT * FROM assets_history WHERE asset_id = ? ORDER BY created_at DESC', [assetId]);
}

// ── Soft Delete ───────────────────────────────────────────────────────────────
export function softDeleteAssetLocal(assetId: string) {
  const stmt = db.prepareSync("UPDATE assets SET deleted_at = datetime('now') WHERE id = ?");
  stmt.executeSync([assetId]);
  logAssetHistory(assetId, 'EXCLUSÃO LÓGICA', 'Ativo removido via Soft Delete.');
}

// ── Sync Queue ────────────────────────────────────────────────────────────────
export function queueOfflineAction(action: string, payload: any) {
  const stmt = db.prepareSync('INSERT INTO sync_queue (action, payload) VALUES (?, ?)');
  stmt.executeSync([action, JSON.stringify(payload)]);
}

export function getSyncQueue() {
  return db.getAllSync('SELECT * FROM sync_queue ORDER BY created_at ASC');
}

export function clearSyncQueueItem(id: number) {
  const stmt = db.prepareSync('DELETE FROM sync_queue WHERE id = ?');
  stmt.executeSync([id]);
}
