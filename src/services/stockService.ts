import { StockItem, StockLocation, StockMovement } from '../types/stock';
import { NotificationService } from './notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getVenueStockItemsOnly,
  saveStockItemLocal,
  getLocalStockMovements,
  saveStockMovementLocal,
  deleteStockItemLocal,
} from '../database';
export const StockService = {
  /** Stock ligado a bens / locais do portfólio (não inclui estoque do técnico). */
  getItems: async (ownerEmail?: string): Promise<StockItem[]> => {
    return getVenueStockItemsOnly(ownerEmail);
  },

  saveItem: async (item: StockItem, ownerEmail?: string) => {
    saveStockItemLocal(item, ownerEmail);
  },

  deleteItem: async (itemId: string, ownerEmail?: string) => {
    deleteStockItemLocal(itemId);
  },

  getMovements: async (ownerEmail?: string): Promise<StockMovement[]> => {
    const venueIds = new Set(getVenueStockItemsOnly(ownerEmail).map((i: { id: string }) => i.id));
    return getLocalStockMovements(ownerEmail).filter((m) => venueIds.has(m.itemId));
  },

  recordMovement: async (mov: Omit<StockMovement, 'id' | 'timestamp'>, ownerEmail?: string) => {
    const items = getVenueStockItemsOnly(ownerEmail);
    const itemIdx = items.findIndex(i => i.id === mov.itemId);
    if (itemIdx === -1) throw new Error('Item não encontrado.');

    const item = items[itemIdx];
    const newMovement: StockMovement = {
      ...mov,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
    };

    if (mov.subLocation) { item.subLocation = mov.subLocation; }

    if (mov.type === 'IN') {
      item.currentStock += mov.quantity;
      if (mov.unitPrice) item.costPrice = mov.unitPrice;
    } else if (mov.type === 'OUT') {
      item.currentStock -= mov.quantity;
    } else if (mov.type === 'ADJUST') {
      item.currentStock = mov.quantity;
    } else if (mov.type === 'TRANSFER' && mov.destinationAssetId) {
      item.currentStock -= mov.quantity;
      
      const targetSub = mov.destinationSubLocation || '';
      const destIndex = items.findIndex(i => i.sku === item.sku && i.locationId === mov.destinationAssetId && (i.subLocation || '') === targetSub);
      if (destIndex > -1) {
        items[destIndex].currentStock += mov.quantity;
        saveStockItemLocal(items[destIndex], ownerEmail);
      } else {
        const newItem: StockItem = {
          ...item,
          id: Math.random().toString(36).substring(7),
          locationId: mov.destinationAssetId,
          subLocation: targetSub,
          currentStock: mov.quantity,
        };
        saveStockItemLocal(newItem, ownerEmail);
      }
    }

    if (item.currentStock <= item.minStock) {
       NotificationService.addNotification({
         title: `ESTOQUE CRÍTICO: ${item.name}`,
         body: `Limite atingido: ${item.currentStock} ${item.unit}. SKU: ${item.sku}.`,
         category: 'alert',
         assetId: item.locationId
       });
    }

    saveStockItemLocal(item, ownerEmail);
    saveStockMovementLocal(newMovement, ownerEmail);
  },

  getLocations: async (): Promise<StockLocation[]> => {
     // Stock locations are usually Assets (venues)
     return []; // Could be extended if specific stock-only locations exist
  },

  exportStockAsCSV: async (items: StockItem[], venues: any[]) => {
    try {
      if (items.length === 0) throw new Error('Não há itens para exportar.');
      
      let csv = 'Nome,SKU,Categoria,Saldo,Unidade,Local,Sub-local\n';
      items.forEach(i => {
        const asset = venues.find(v => v.id === i.locationId);
        const name = i.name.replace(/"/g, '""');
        const cat = i.category.replace(/"/g, '""');
        const loc = (asset?.title || 'Geral').replace(/"/g, '""');
        const sub = (i.subLocation || '').replace(/"/g, '""');
        
        csv += `"${name}","${i.sku}","${cat}",${i.currentStock},"${i.unit}","${loc}","${sub}"\n`;
      });
      
      const fileUri = `${(FileSystem as any).cacheDirectory}inventario_brspark.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
      
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('A função de compartilhamento não está disponível.');
      }
      
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar Inventário' });

    } catch (e: any) {
      console.error('Export Error:', e);
      throw e;
    }
  }
};

