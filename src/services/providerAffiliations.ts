import { apiFetch } from './api';

export type ProviderAffiliationRelationshipType = 'PARTNER' | 'DEDICATED';
export type ProviderAffiliationStatus =
  | 'INVITED'
  | 'REQUESTED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'REJECTED';

export type ProviderAffiliationTenant = {
  id: string;
  name: string;
  slug?: string | null;
};

export type ProviderAffiliation = {
  id: string;
  status: ProviderAffiliationStatus;
  relationshipType: ProviderAffiliationRelationshipType;
  note?: string | null;
  tenant: ProviderAffiliationTenant;
  invitedAt?: string | null;
  requestedAt?: string | null;
  activatedAt?: string | null;
  endedAt?: string | null;
};

export const ProviderAffiliationsApi = {
  async getMeStatus(): Promise<{ affiliations: ProviderAffiliation[] }> {
    const r = await apiFetch('/api/providers/me/onboarding/status', { method: 'GET' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Falha ao carregar status do prestador.');
    return { affiliations: (j?.affiliations || []) as ProviderAffiliation[] };
  },

  async previewInvite(token: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(token || '').trim());
    const r = await apiFetch(`/api/providers/affiliations/${safe}`, { method: 'GET' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Convite inválido ou expirado.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },

  async acceptInvite(token: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(token || '').trim());
    const r = await apiFetch(`/api/providers/affiliations/${safe}/accept`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Não foi possível aceitar o convite.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },
};

