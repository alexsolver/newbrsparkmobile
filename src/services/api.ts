import { Asset } from '../types/asset';
import { getSyncQueue, clearSyncQueueItem, saveAssetsLocal, saveConfigLocal, saveProviders, getProviders } from '../database';
import { primeOsrmBaseFromConfig } from './osrmConfig';
import { apiFetch, API_BASE } from './auth';
import { fullSync } from './syncService';

export { API_BASE, apiFetch };

const PROVIDERS_CACHE_MAX = 50;

/**
 * On-demand provider search — paginated, server-side.
 * Caches the last PROVIDERS_CACHE_MAX viewed providers in SQLite for offline fallback.
 */
export const ProviderService = {
  async search(params: {
    q?: string;
    category?: string;
    city?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number; totalPages: number; fromCache: boolean }> {
    const { q = '', category = '', city = '', page = 1, limit = 20 } = params;
    const qs = new URLSearchParams();
    if (q)        qs.set('q', q);
    if (category) qs.set('category', category);
    if (city)     qs.set('city', city);
    qs.set('page',  String(page));
    qs.set('limit', String(Math.min(limit, 50)));

    try {
      const res = await fetch(`${API_BASE}/api/providers?${qs.toString()}`);

      // 304 Not Modified = server says data unchanged, use local cache
      if (res.status === 304) {
        const cached = getProviders();
        return { data: cached, total: cached.length, totalPages: 1, fromCache: true };
      }

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      const results: any[] = json.data || [];

      // Cache only the first page of unfiltered results (likely "all / recent")
      if (!q && !category && !city && page === 1 && results.length > 0) {
        const existing = getProviders();
        const merged = [...results, ...existing]
          .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
          .slice(0, PROVIDERS_CACHE_MAX);
        saveProviders(merged);
      }

      return { data: results, total: json.total ?? results.length, totalPages: json.totalPages ?? 1, fromCache: false };
    } catch {
      // Offline fallback — return local cache filtered client-side
      const cached = getProviders();
      const filtered = cached.filter(p => {
        const matchQ    = !q        || p.name.toLowerCase().includes(q.toLowerCase());
        const matchCat  = !category || p.category === category;
        const matchCity = !city     || (p.city || '').toLowerCase().includes(city.toLowerCase());
        return matchQ && matchCat && matchCity;
      });
      return { data: filtered, total: filtered.length, totalPages: 1, fromCache: true };
    }
  },
};

/**
 * Sincroniza dados do app com o servidor (PostgreSQL como fonte da verdade).
 *
 * Estratégia:
 * - Assets:    pull autenticado (dados do tenant do usuário)
 * - Config:    pull PÚBLICO (metatags/tipos de ativo, sem auth)
 * - Providers: NÃO sincronizado em massa — buscado sob demanda via ProviderService
 * - SQLite local = cache offline de bens + config + últimos 50 prestadores vistos
 */
export class ApiService {

  /** Sync completo: assets (auth) + config (público). Providers removidos do sync em massa. */
  static async sync(ownerEmail?: string): Promise<boolean> {
    console.log('[SYNC] Iniciando sincronização com BrSpark Cloud...');
    let success = true;

    // 1. Push and Pull modular data (costs, insurance, vault, media) via SyncService
    try {
      await fullSync(ownerEmail);
    } catch (e) {
      console.warn('[SYNC] Falha no fullSync modular:', e);
      success = false;
    }

    // 2. Pull assets do tenant (requer auth)
    try {
      const res = await apiFetch('/api/sync/assets');
      if (res.ok) {
        const remoteAssets: Asset[] = await res.json();
        saveAssetsLocal(remoteAssets, ownerEmail);
        console.log(`[SYNC] ✅ ${remoteAssets.length} bens sincronizados.`);
      }
    } catch (e) {
      console.warn('[SYNC] Assets: offline ou não autenticado.', e);
      success = false;
    }

    // 3. Pull config/metatags (público — sem auth)
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      if (res.ok) {
        const config = await res.json();
        saveConfigLocal(config);
        primeOsrmBaseFromConfig(config);
        console.log('[SYNC] ✅ Config sincronizado.');
      }
    } catch (e) {
      console.warn('[SYNC] Config: offline.', e);
    }

    // NOTE: Providers are NOT synced here. Use ProviderService.search() on-demand.

    // fullSync already called at step 1

    return success;
  }

  static async getActivePortfolio(ownerEmail?: string) {
    await this.sync(ownerEmail);
    return [];
  }
}

