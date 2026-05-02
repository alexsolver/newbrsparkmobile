import { Asset } from '../types/asset';
import {
  getSyncQueue,
  clearSyncQueueItem,
  saveAssetsLocal,
  saveConfigLocal,
  getProviders,
  replaceDirectoryProvidersCache,
} from '../database';
import { primeOsrmBaseFromConfig } from './osrmConfig';
import { apiFetch, API_BASE } from './auth';
import { fullSync } from './syncService';

export { API_BASE, apiFetch };

const PROVIDERS_CACHE_MAX = 50;

/**
 * Catálogo do diretório (prestadores do CMS web), paginado no servidor.
 * Mantém o nome ProviderService por compatibilidade; cada item é um profissional listado (`id` = professional_id; detalhe aceita tenant_id).
 * Caches the last PROVIDERS_CACHE_MAX entries in SQLite for offline fallback.
 */
function filterProvidersLocal(
  rows: any[],
  q: string,
  category: string,
  city: string
): any[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((p) => {
    const matchQ =
      !needle ||
      (typeof p.name === 'string' && p.name.toLowerCase().includes(needle)) ||
      (typeof p.keywords === 'string' && p.keywords.toLowerCase().includes(needle)) ||
      (typeof p.tags === 'string' && p.tags.toLowerCase().includes(needle));
    const matchCat = !category || p.category === category;
    const matchCity = !city || (p.city || '').toLowerCase().includes(city.toLowerCase());
    return matchQ && matchCat && matchCity;
  });
}

export const ProviderService = {
  async search(params: {
    q?: string;
    category?: string;
    city?: string;
    page?: number;
    limit?: number;
    /** Ignora cache HTTP / evita 304; bust de proxy. Usar após pull-to-refresh ou TTL de diretório. */
    forceRefresh?: boolean;
  }): Promise<{ data: any[]; total: number; totalPages: number; fromCache: boolean }> {
    const { q = '', category = '', city = '', page = 1, limit = 20, forceRefresh = false } = params;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (category) qs.set('category', category);
    if (city) qs.set('city', city);
    qs.set('page', String(page));
    qs.set('limit', String(Math.min(limit, 50)));
    if (forceRefresh) {
      qs.set('_', String(Date.now()));
    }

    const url = `${API_BASE}/api/providers?${qs.toString()}`;
    const fetchOpts: RequestInit = {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    };

    const applyFilteredCache = () => {
      const cached = getProviders();
      const filtered = filterProvidersLocal(cached, q, category, city);
      return {
        data: filtered,
        total: filtered.length,
        totalPages: 1,
        fromCache: true as const,
      };
    };

    try {
      let res = await fetch(url, fetchOpts);

      // 304 sem corpo: não reutilizar lista completa ignorando filtros — força nova ida ao servidor.
      if (res.status === 304) {
        const retryUrl = `${API_BASE}/api/providers?${qs.toString()}&_r=${Date.now()}`;
        res = await fetch(retryUrl, fetchOpts);
      }

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      const dirSrc = (res.headers.get('X-BrSpark-Directory-Source') || '').trim();
      // Defesa: BFF deve usar 4xx/5xx quando o CMS falha; se algum proxy devolver 200 + erro lógico, cai no cache local.
      if (dirSrc === 'laravel-error' || dirSrc === 'cms-not-configured') {
        return applyFilteredCache();
      }
      const results: any[] = json.data || [];

      // Snapshot da 1.ª página sem filtros = espelho do servidor (remove empresas deslistadas do SQLite).
      if (!q && !category && !city && page === 1) {
        replaceDirectoryProvidersCache(results.slice(0, PROVIDERS_CACHE_MAX));
      }

      return {
        data: results,
        total: json.total ?? results.length,
        totalPages: json.totalPages ?? 1,
        fromCache: false,
      };
    } catch {
      return applyFilteredCache();
    }
  },
};

/**
 * Sincroniza dados do app com o servidor (PostgreSQL como fonte da verdade).
 *
 * Estratégia:
 * - Assets:    pull autenticado (bens do próprio utilizador + partilhas; não há inventário por empresa)
 * - Config:    pull PÚBLICO (metatags/tipos de ativo, sem auth)
 * - Providers: NÃO puxados aqui em massa — use ProviderService.search (substitui snapshot local na 1.ª página sem filtros).
 * - SQLite local = cache offline do diretório + bens + config
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

