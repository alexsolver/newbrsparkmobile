export interface SubLocation {
  floor: string;
  room: string;
  icon?: string;   // Ionicons name for custom rooms
  notes?: string;
}

export interface AssetLocation {
  id: string;
  assetId: string;
  floor: string;
  room: string;
  icon: string;
  isStock?: boolean;   // true = this location is used as a stock/inventory point
  createdAt?: string;
}

export interface Asset {
  id: string;
  title: string;
  /** TERRESTRIAL: legado — tratado como MOBILITY na jornada e filtros */
  type:
    | 'REAL_ESTATE'
    | 'TERRESTRIAL'
    | 'MOBILITY'
    | 'MACHINERY'
    | 'AQUATIC'
    | 'IT'
    | 'COLLECTIONS'
    | 'SPECIAL'
    | 'OTHER';
  imageUrl?: string;
  status: 'MAINTENANCE OK' | 'INSURANCE RENEWAL SOON' | string;
  statusType: 'success' | 'warning';
  parentId?: string | null;       // null = ativo raiz
  parentTitle?: string | null;    // Nome do pai (denormalizado)
  childrenCount?: number;         // calculado na query
  displayOrder?: number;          // ordem manual na listagem do portfólio
  deletedAt?: string | null;      // Soft Delete
  subLocation?: SubLocation | null; // Localização dentro do bem pai
  details?: {
    address?: string;
    mileage?: number;
    year?: number;
    customIcon?: string;   // Ionicons name chosen by user
    customColor?: string;  // hex color for the icon squircle
    [key: string]: any;
  };
}
