import { StockItem, StockMovement } from '../types/stock';
import { NotificationService } from './notifications';
import {
  getLocalTechStockItems,
  getTechStockRowById,
  saveTechStockItemLocal,
  getLocalTechStockMovements,
  saveTechStockMovementLocal,
  deleteTechStockItemLocal,
} from '../database';
import { enqueueMutation } from './syncService';
import { ensureTechnicianStockLegacyMigration } from './technicianStockMigration';

function rowToItem(row: any): StockItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category || 'general',
    unit: (row.unit || 'un') as StockItem['unit'],
    currentStock: Number(row.currentStock) || 0,
    minStock: Number(row.minStock) || 0,
    targetStock: Number(row.targetStock) || 0,
    locationId: '',
    subLocation: row.subLocation || undefined,
    costPrice: row.costPrice != null ? Number(row.costPrice) : undefined,
    photoUri: row.photoUri,
  };
}

/** Estoque do técnico: independente de bens, ativos e portfólio. */
export const TechnicianStockService = {
  getItems: async (ownerEmail?: string): Promise<StockItem[]> => {
    await ensureTechnicianStockLegacyMigration(ownerEmail);
    return getLocalTechStockItems(ownerEmail).map(rowToItem);
  },

  getItemById: async (itemId: string): Promise<StockItem | null> => {
    const raw = getTechStockRowById(itemId);
    return raw ? rowToItem(raw) : null;
  },

  saveItem: async (item: StockItem, ownerEmail?: string) => {
    await ensureTechnicianStockLegacyMigration(ownerEmail);
    const row = {
      ...item,
      owner_email: ownerEmail || null,
    };
    saveTechStockItemLocal(row, ownerEmail);
    enqueueMutation('tech_stock', 'tech_stock:CREATE_ITEM', row, ownerEmail);
  },

  deleteItem: async (itemId: string, ownerEmail?: string) => {
    deleteTechStockItemLocal(itemId);
    enqueueMutation('tech_stock', 'tech_stock:DELETE_ITEM', { id: itemId }, ownerEmail);
  },

  getMovements: async (ownerEmail?: string): Promise<StockMovement[]> => {
    await ensureTechnicianStockLegacyMigration(ownerEmail);
    return getLocalTechStockMovements(ownerEmail) as StockMovement[];
  },

  recordMovement: async (mov: Omit<StockMovement, 'id' | 'timestamp'>, ownerEmail?: string) => {
    await ensureTechnicianStockLegacyMigration(ownerEmail);
    let raw = getTechStockRowById(mov.itemId);
    if (!raw) {
      const items = getLocalTechStockItems(ownerEmail);
      const itemIdx = items.findIndex((i) => i.id === mov.itemId);
      if (itemIdx === -1) throw new Error('Item não encontrado.');
      raw = items[itemIdx];
    }
    const rowOwner = raw.owner_email != null && String(raw.owner_email).trim() !== '' ? String(raw.owner_email).trim() : null;
    const persistEmail = rowOwner || ownerEmail || undefined;

    const item = rowToItem(raw);
    const newMovement: StockMovement = {
      ...mov,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
    };

    if (mov.subLocation) item.subLocation = mov.subLocation;

    if (mov.type === 'IN') {
      item.currentStock += mov.quantity;
      if (mov.unitPrice) item.costPrice = mov.unitPrice;
    } else if (mov.type === 'OUT') {
      item.currentStock -= mov.quantity;
    } else if (mov.type === 'ADJUST') {
      item.currentStock = mov.quantity;
    } else if (mov.type === 'TRANSFER') {
      throw new Error('Transferência não suportada no estoque do técnico.');
    }

    if (item.currentStock <= item.minStock) {
      NotificationService.addNotification({
        title: `Estoque técnico: ${item.name}`,
        body: `Saldo baixo: ${item.currentStock} ${item.unit}. SKU: ${item.sku}.`,
        category: 'alert',
      });
    }

    saveTechStockItemLocal({ ...item, owner_email: persistEmail || null }, persistEmail);
    saveTechStockMovementLocal(newMovement, persistEmail);
    enqueueMutation('tech_stock', 'tech_stock:RECORD_MOVEMENT', newMovement, persistEmail);
  },
};
