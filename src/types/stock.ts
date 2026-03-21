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
  unit: 'un' | 'lt' | 'kg' | 'mt';
  currentStock: number;
  minStock: number;
  targetStock: number;
  locationId: string; // Ref ao Ativo (ID do Patrimônio)
  subLocation?: string; // Endereçamento interno: Gaveta X, Prateleira Y
  costPrice?: number;
  photoUri?: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  timestamp: string;
  responsibleId: string;
  reason?: string;
  assetId?: string; // Se vinculado a um consumo de ativo específico
}
