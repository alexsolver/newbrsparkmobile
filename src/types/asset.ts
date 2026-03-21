export interface Asset {
  id: string;
  title: string;
  type: 'REAL_ESTATE' | 'VEHICLE' | 'COLLECTION' | 'OTHER';
  imageUrl?: string;
  status: 'MAINTENANCE OK' | 'INSURANCE RENEWAL SOON' | string;
  statusType: 'success' | 'warning';
  parentId?: string | null;       // null = ativo raiz
  childrenCount?: number;         // calculado na query
  details?: {
    address?: string;
    mileage?: number;
    year?: number;
    [key: string]: any;
  };
}
