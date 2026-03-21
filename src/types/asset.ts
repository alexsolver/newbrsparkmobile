export interface Asset {
  id: string;
  title: string;
  type: 'REAL_ESTATE' | 'VEHICLE' | 'COLLECTION' | 'OTHER';
  imageUrl?: string;
  status: 'MAINTENANCE OK' | 'INSURANCE RENEWAL SOON' | string;
  statusType: 'success' | 'warning';
  details?: {
    address?: string;
    mileage?: number;
    year?: number;
  };
}
