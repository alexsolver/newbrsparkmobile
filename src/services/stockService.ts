import AsyncStorage from '@react-native-async-storage/async-storage';
import { StockItem, StockLocation, StockMovement } from '../types/stock';

const KEYS = {
  ITEMS: 'brspark_stock_items',
  LOCATIONS: 'brspark_stock_locations',
  MOVEMENTS: 'brspark_stock_movements',
};

export const StockService = {
  // ── Items Management ──────────────────────────────────────────────────────────
  getItems: async (): Promise<StockItem[]> => {
    const data = await AsyncStorage.getItem(KEYS.ITEMS);
    return data ? JSON.parse(data) : [];
  },

  saveItem: async (item: StockItem) => {
    const items = await StockService.getItems();
    const idx = items.findIndex(i => i.id === item.id);
    if (idx >= 0) items[idx] = item;
    else items.push(item);
    await AsyncStorage.setItem(KEYS.ITEMS, JSON.stringify(items));
  },

  // ── Locations Management ──────────────────────────────────────────────────────
  getLocations: async (): Promise<StockLocation[]> => {
    const data = await AsyncStorage.getItem(KEYS.LOCATIONS);
    return data ? JSON.parse(data) : [];
  },

  saveLocation: async (loc: StockLocation) => {
    const locs = await StockService.getLocations();
    const idx = locs.findIndex(l => l.id === loc.id);
    if (idx >= 0) locs[idx] = loc;
    else locs.push(loc);
    await AsyncStorage.setItem(KEYS.LOCATIONS, JSON.stringify(locs));
  },

  // ── Movements & Ledger ───────────────────────────────────────────────────────
  getMovements: async (): Promise<StockMovement[]> => {
    const data = await AsyncStorage.getItem(KEYS.MOVEMENTS);
    return data ? JSON.parse(data) : [];
  },

  recordMovement: async (mov: Omit<StockMovement, 'id' | 'timestamp'>) => {
    const items = await StockService.getItems();
    const itemIdx = items.findIndex(i => i.id === mov.itemId);
    
    if (itemIdx === -1) throw new Error('Item não encontrado no estoque.');

    const movement: StockMovement = {
      ...mov,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
    };

    // Atualizar saldo do item
    const item = items[itemIdx];
    if (movement.type === 'IN') {
      item.currentStock += movement.quantity;
    } else if (movement.type === 'OUT') {
      if (item.currentStock < movement.quantity) {
        // Permitir saldo negativo se for consumo crítico, mas alertar?
        // Por enquanto, bloquearemos ou alertaremos conforme a regra de negócio.
        throw new Error(`Estoque insuficiente. Saldo atual: ${item.currentStock} ${item.unit}`);
      }
      item.currentStock -= movement.quantity;
    } else if (movement.type === 'ADJUST') {
      // No ajuste, a quantidade enviada é o NOVO SALDO REAL
      const diff = movement.quantity - item.currentStock;
      movement.reason = (movement.reason || 'Ajuste de inventário') + ` (Dif: ${diff > 0 ? '+' : ''}${diff})`;
      item.currentStock = movement.quantity; // Sincroniza com a contagem física
    }
    // (Ajustes e transferências poderiam ser tratados aqui)

    // Salvar Item Atualizado
    await StockService.saveItem(item);

    // Salvar Histórico de Movimentação
    const moves = await StockService.getMovements();
    moves.push(movement);
    await AsyncStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(moves));

    return movement;
  },

  // ── Statistics & Alerts ──────────────────────────────────────────────────────
  getLowStockItems: async (): Promise<StockItem[]> => {
    const items = await StockService.getItems();
    return items.filter(i => i.currentStock <= i.minStock);
  }
};
