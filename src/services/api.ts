import { Asset } from '../types/asset';
import { getSyncQueue, clearSyncQueueItem, saveAssetsLocal } from '../database';

const API_BASE_URL = 'https://api.brspark.com/v1';

export class ApiService {
  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = 'MOCK_TOKEN'; 
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Request failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Pushes offline changes to Server, and pulls new Assets to save locally
  static async sync() {
    console.log('[SYNC] Starting Background Synchronization...');
    try {
      // 1. Push Offline Changes stored locally
      const offlineChanges = getSyncQueue();
      for (const item of offlineChanges) {
        console.log(`[SYNC] Pushing offline changes to server: Action = ${item.action}`);
        // Simulate pushing to remote API
        // await this.request('/sync/push', { method: 'POST', body: item.payload });
        clearSyncQueueItem(item.id);
      }
      
      // 2. Pull Remote State
      // Simulate API return matching the mocked dashboard:
      const remoteAssets: Asset[] = [
        {
          id: '1', title: 'Bel Air Residence', type: 'REAL_ESTATE',
          imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&w=800&q=80',
          status: 'MAINTENANCE OK', statusType: 'success',
          details: { address: '10424 Bellagio Rd, Los Angeles, CA' },
        },
        {
          id: '2', title: 'Toyota Corolla Hybrid', type: 'VEHICLE',
          imageUrl: 'https://images.unsplash.com/photo-1629897048514-3dd741530282?ixlib=rb-4.0.3&w=800&q=80',
          status: 'INSURANCE RENEWAL SOON', statusType: 'warning',
          details: { mileage: 12450, year: 2023 },
        }
      ];

      // Save the fresh remote data silently into Local SQLite
      saveAssetsLocal(remoteAssets);
      console.log('[SYNC] Finished: Assets synchronized and saved to Local SQLite.');

      return true;
    } catch (error) {
      console.error('[SYNC] Synchronization failed:', error);
      return false; // App remains offline, user sees existing local data
    }
  }

  static async getActivePortfolio() {
    // Standard implementation: Just trigger a background sync, then the UI relies solely on getLocalAssets().
    // We already mock data for the dashboard via `MOCK_ASSETS` directly in the UI, but this shows how it's done.
    await this.sync();
    return Promise.resolve([]);
  }
}
