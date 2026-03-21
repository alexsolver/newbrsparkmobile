import * as SQLite from 'expo-sqlite';
import { Asset } from '../types/asset';

// Abrir ou criar a base local SQLite de forma síncrona
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
      details_address TEXT,
      details_mileage INTEGER,
      details_year INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function saveAssetsLocal(assets: Asset[]) {
  const stmt = db.prepareSync(`
    INSERT OR REPLACE INTO assets 
    (id, title, type, imageUrl, status, statusType, details_address, details_mileage, details_year) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  assets.forEach(asset => {
    stmt.executeSync([
      asset.id,
      asset.title,
      asset.type,
      asset.imageUrl || null,
      asset.status,
      asset.statusType,
      asset.details?.address || null,
      asset.details?.mileage || null,
      asset.details?.year || null
    ]);
  });
}

export function getLocalAssets(): Asset[] {
  const result = db.getAllSync('SELECT * FROM assets');
  return result.map((row: any) => ({
    id: row.id,
    title: row.title,
    type: row.type as any,
    imageUrl: row.imageUrl,
    status: row.status,
    statusType: row.statusType,
    details: {
      address: row.details_address,
      mileage: row.details_mileage,
      year: row.details_year,
    }
  }));
}

// Quando o aplicativo está "offline", as ações do usuário vão para uma Fila (Queue)
export function queueOfflineAction(action: string, payload: any) {
  const stmt = db.prepareSync('INSERT INTO sync_queue (action, payload) VALUES (?, ?)');
  stmt.executeSync([action, JSON.stringify(payload)]);
}

// Função para buscar o que falta sincronizar com o provedor B2B (Back-end)
export function getSyncQueue() {
  return db.getAllSync('SELECT * FROM sync_queue ORDER BY created_at ASC');
}

export function clearSyncQueueItem(id: number) {
  const stmt = db.prepareSync('DELETE FROM sync_queue WHERE id = ?');
  stmt.executeSync([id]);
}
