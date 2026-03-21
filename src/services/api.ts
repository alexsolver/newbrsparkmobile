import { Asset } from '../types/asset';
import { getSyncQueue, clearSyncQueueItem, saveAssetsLocal } from '../database';

// Como o aplicativo usa o modo Tunnel (Ngrok), se a sua rede bloqueia o tráfego 
// interno, teremos que usar o seu IP local real para o Celular achar o Laptop.
// Pelo log anterior do metro, seu IP da máquina era 192.168.15.73 e a API é 3000.
const MAC_IP = '192.168.15.73';
const API_BASE_URL = `http://${MAC_IP}:3000/api`;

export class ApiService {
  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Request failed: ${response.statusText}`);
    }
    return response.json();
  }

  static async sync() {
    console.log('[SYNC] Iniciando comunicação bidirecional com Node Backend...');
    try {
      // 1. O App lê as ações que você fez na Fila "Offline" local (Ex: Agendar Manutenção, Criar Ativo)
      const queue = getSyncQueue();
      if (queue.length > 0) {
        console.log(`[SYNC] Empurrando ${queue.length} pacotes offline para o Cloud...`);
        // Dispara pacote pesado (BULK PUSH) pro Node/Express Backend
        await this.request('/sync/push', { 
          method: 'POST', 
          body: JSON.stringify({ queue }) 
        });

        // Como a nuvem aceitou com sucesso 200 OK, a gente destrói e limpa a fila de cache pesada local do celular!
        queue.forEach(item => clearSyncQueueItem(item.id));
      }
      
      // 2. Com a casa organizada, eu peço pro Backend todos os Ativos atuais formatados (PULL)
      const remoteAssets: Asset[] = await this.request('/assets');

      // Eu sobrescrevo meu SQLite interno local com exatamente os dados de Single-source-of-truth puxados da Cloud
      saveAssetsLocal(remoteAssets);
      console.log('[SYNC] Finalizado: Cópia Gêmea Exata da Nuvem Salva Nativamente no Celular.');

      return true;
    } catch (error) {
      console.error('[SYNC] O Backend NodeJS parece estar desligado ou fora da rede:', error);
      // O App devolve false permitindo a tela de Profile de alertar, E MANTÉM OS DADOS SALVOS NA FILA para depois!
      return false; 
    }
  }

  static async getActivePortfolio() {
    await this.sync();
    return Promise.resolve([]);
  }
}
