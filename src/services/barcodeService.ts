import { apiFetch } from './auth';
import { getDeviceRegion } from '../i18n/index';

export interface BarcodeProduct {
  description: string;
  brand?: string | { name: string; picture?: string };
  thumbnail?: string;
  category?: string;
}

export class BarcodeService {
  /**
   * Busca um produto por código de barras.
   * Roteia para UPCItemDB (US) ou Bluesoft Cosmos (BR) dependendo da localidade.
   */
  static async getProductByBarcode(barcode: string): Promise<BarcodeProduct | null> {
    try {
      const gtin = barcode.replace(/[^0-9]/g, '');
      if (gtin.length < 8) return null;

      const region = getDeviceRegion();
      const res = await apiFetch(`/api/barcode/${gtin}?country=${region}`);
      
      if (!res.ok) {
        console.warn(`[BarcodeAPI] HTTP ${res.status} for ${gtin}`);
        return null;
      }

      const json = await res.json();
      if (!json.found) {
        return null;
      }

      return json as BarcodeProduct;
    } catch (err) {
      console.warn('[BarcodeAPI] Erro de conexão:', err);
      return null;
    }
  }
}
