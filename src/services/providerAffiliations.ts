import { apiFetch } from './api';

export type ProviderAffiliationRelationshipType = 'PARTNER' | 'DEDICATED' | 'OWNER';
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

/** Janelas de exclusividade partner (leitura — definidas pela empresa no painel). */
export type DedicatedExclusiveSchedule = {
  timezone: string;
  weeklyWindows: { weekday: string; start: string; end: string }[];
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
  suspendedAt?: string | null;
  dedicatedExclusive?: DedicatedExclusiveSchedule | null;
};

export const ProviderAffiliationsApi = {
  async getMeStatus(): Promise<{ affiliations: ProviderAffiliation[] }> {
    const r = await apiFetch(`/api/providers/me/onboarding/status?_=${Date.now()}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
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

  /** Aceita convite a partir do id da afiliação (sessão autenticada; sem token na lista). */
  async acceptByAffiliationId(affiliationId: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(affiliationId || '').trim());
    const r = await apiFetch(`/api/providers/me/affiliations/${safe}/accept`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Não foi possível aceitar o convite.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },

  async declineByAffiliationId(affiliationId: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(affiliationId || '').trim());
    const r = await apiFetch(`/api/providers/me/affiliations/${safe}/decline`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Não foi possível recusar o convite.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },

  async suspendByAffiliationId(affiliationId: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(affiliationId || '').trim());
    const r = await apiFetch(`/api/providers/me/affiliations/${safe}/suspend`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Não foi possível suspender o vínculo.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },

  async resumeByAffiliationId(affiliationId: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(affiliationId || '').trim());
    const r = await apiFetch(`/api/providers/me/affiliations/${safe}/resume`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Não foi possível reativar o vínculo.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },

  async endByAffiliationId(affiliationId: string): Promise<ProviderAffiliation> {
    const safe = encodeURIComponent(String(affiliationId || '').trim());
    const r = await apiFetch(`/api/providers/me/affiliations/${safe}/end`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Não foi possível encerrar o vínculo.');
    return (j?.affiliation || null) as ProviderAffiliation;
  },
};

