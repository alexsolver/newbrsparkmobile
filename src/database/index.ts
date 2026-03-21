import * as SQLite from 'expo-sqlite';
import { Asset } from '../types/asset';

const db = SQLite.openDatabaseSync('brspark.db');

export function initDatabase() {
  db.execSync(`
    DROP TABLE IF EXISTS assets;
    DROP TABLE IF EXISTS assets_history;

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      imageUrl TEXT,
      status TEXT,
      statusType TEXT,
      details TEXT,
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
}

export function saveAssetsLocal(assets: Asset[]) {
  const stmt = db.prepareSync(`
    INSERT OR REPLACE INTO assets 
    (id, title, type, imageUrl, status, statusType, details, deleted_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  assets.forEach(asset => {
    let detailsBlob = '{}';
    try {
      detailsBlob = asset.details ? JSON.stringify(asset.details) : '{}';
    } catch(e) {}

    stmt.executeSync([
      asset.id,
      asset.title,
      asset.type,
      asset.imageUrl || null,
      asset.status,
      asset.statusType,
      detailsBlob,
      (asset as any).deletedAt || null
    ]);
  });
}

export function getLocalAssets(): Asset[] {
  const result = db.getAllSync('SELECT * FROM assets WHERE deleted_at IS NULL');
  return result.map((row: any) => {
    let parsedDetails = {};
    if (row.details) {
       try { parsedDetails = JSON.parse(row.details); } catch(e) {}
    }
    
    return {
      id: row.id,
      title: row.title,
      type: row.type as any,
      imageUrl: row.imageUrl,
      status: row.status,
      statusType: row.statusType,
      details: parsedDetails
    };
  });
}

// LOG HISTÓRICO CONTÍNUO
export function logAssetHistory(assetId: string, action: string, details: string = '') {
  const stmt = db.prepareSync('INSERT INTO assets_history (asset_id, action, details) VALUES (?, ?, ?)');
  stmt.executeSync([assetId, action, details]);
}

export function getAssetHistoryLocal(assetId: string) {
  return db.getAllSync('SELECT * FROM assets_history WHERE asset_id = ? ORDER BY created_at DESC', [assetId]);
}

// SOFT DELETE
export function softDeleteAssetLocal(assetId: string) {
  const stmt = db.prepareSync("UPDATE assets SET deleted_at = datetime('now') WHERE id = ?");
  stmt.executeSync([assetId]);
  logAssetHistory(assetId, 'EXCLUSÃO LÓGICA', 'Ativo removido do inventário via Soft Delete pelo usuário.');
}

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
