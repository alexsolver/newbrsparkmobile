import AsyncStorage from '@react-native-async-storage/async-storage';
import { StockItem, StockLocation, StockMovement } from '../types/stock';
import { NotificationService } from './notifications';

const KEYS = {
  ITEMS: 'brspark_stock_items',
  MOVEMENTS: 'brspark_stock_movements',
  LOCATIONS: 'brspark_stock_locations'
};

export const StockService = {
  getItems: async (): Promise<StockItem[]> => {
    const data = await AsyncStorage.getItem(KEYS.ITEMS);
    return data ? JSON.parse(data) : [];
  },

  saveItem: async (item: StockItem) => {
    const items = await StockService.getItems();
    const idx = items.findIndex(i => i.id === item.id);
    if (idx > -1) items[idx] = item;
    else items.push(item);
    await AsyncStorage.setItem(KEYS.ITEMS, JSON.stringify(items));
  },

  getMovements: async (): Promise<StockMovement[]> => {
    const data = await AsyncStorage.getItem(KEYS.MOVEMENTS);
    return data ? JSON.parse(data) : [];
  },

  recordMovement: async (mov: Omit<StockMovement, 'id' | 'timestamp'>) => {
    const items = await StockService.getItems();
    const itemIdx = items.findIndex(i => i.id === mov.itemId);
    if (itemIdx === -1) throw new Error('Item não encontrado.');

    const item = items[itemIdx];
    const newMovement: StockMovement = {
      ...mov,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
    };

    // ATUALIZAR LOCALIZAÇÃO (EX: GAVETA/PRATELEIRA) SE INFORMADO
    if (mov.subLocation) { item.subLocation = mov.subLocation; }

    if (mov.type === 'IN') {
      item.currentStock += mov.quantity;
      if (mov.unitPrice) item.costPrice = mov.unitPrice; // Atualiza custo médio/último pago ✅
    } else if (mov.type === 'OUT') {
      item.currentStock -= mov.quantity;
    } else if (mov.type === 'ADJUST') {
      item.currentStock = mov.quantity;
    } else if (mov.type === 'TRANSFER' && mov.destinationAssetId) {
      // LOGICA DE TRANSFERENCIA:
      // 1. Tirar do item de origem
      item.currentStock -= mov.quantity;
      
      // 2. Procurar/Criar no destino (pelo SKU)
      const destIndex = items.findIndex(i => i.sku === item.sku && i.locationId === mov.destinationAssetId);
      if (destIndex > -1) {
        items[destIndex].currentStock += mov.quantity;
      } else {
        // Criar ficha no destino se não existia
        const newItem: StockItem = {
          ...item,
          id: Math.random().toString(36).substring(7),
          locationId: mov.destinationAssetId,
          currentStock: mov.quantity,
          subLocation: '', // Inicia sem subloc no destino
        };
        items.push(newItem);
      }
    }

    // CHECK ESTOQUE CRÍTICO -> NOTIFICAR
    if (item.currentStock <= item.minStock) {
       NotificationService.addNotification({
         title: `ESTOQUE CRÍTICO: ${item.name}`,
         body: `Limite atingido: ${item.currentStock} ${item.unit}. SKU: ${item.sku}.`,
         category: 'alert',
         assetId: item.locationId
       });
    }

    // Salvar Tudo
    await AsyncStorage.setItem(KEYS.ITEMS, JSON.stringify(items));

    // Salvar Histórico
    const history = await StockService.getMovements();
    history.push(newMovement);
    await AsyncStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(history));
  },

  getLocations: async (): Promise<StockLocation[]> => {
    const data = await AsyncStorage.getItem(KEYS.LOCATIONS);
    return data ? JSON.parse(data) : [];
  }
};
