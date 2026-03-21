// Mock API Base URL - update this once the SaaS API URL is known
const API_BASE_URL = 'https://api.brspark.com/v1';

export class ApiService {
  /**
   * Helper for making authenticated requests
   */
  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // In the future, retrieve the auth token from secure storage (e.g. expo-secure-store)
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

  // --- Example endpoints --- //

  static async getActivePortfolio() {
    // return this.request<Asset[]>('/assets/active');
    
    // For now, returning mock data until API is ready
    return Promise.resolve([]);
  }

  static async getAssetDetails(assetId: string) {
    // return this.request<Asset>(`/assets/${assetId}`);
    return Promise.resolve(null);
  }
}
