export interface StockLocation {
  id: string;
  name: string;
  description?: string;
}

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: 'un' | 'lt' | 'kg' | 'mt' | 'pct';
  currentStock: number;
  minStock: number;
  targetStock: number;
  locationId: string;
  subLocation?: string;
  costPrice?: number;
  photoUri?: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  type: 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER'; // <-- TRANSFERÊNCIA ADICIONADA ✅
  quantity: number;
  timestamp: string;
  responsibleId: string;
  reason?: string;
  assetId?: string; // Ativo de origem/contexto
  destinationAssetId?: string; // APENAS PARA TRANSFERÊNCIA ✅
  destinationSubLocation?: string; // Para enviar a uma sala específica
  subLocation?: string;
  unitPrice?: number; // Preço pago na transação (IN ou ADJUST) ✅
}
