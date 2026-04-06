/** IDs estáveis para histórico de pausas; textos via i18n (`pause.cat.*`, `pause.sub.*`). */

export type PauseSubDef = {
  id: string;
  /** chave i18n, ex.: pause.sub.personal.meal */
  i18nKey: string;
  /** obrigatório texto livre (ex.: categoria Outros) */
  requiresDetail?: boolean;
};

export type PauseCategoryDef = {
  id: string;
  i18nKey: string;
  subs: PauseSubDef[];
};

export const PAUSE_CATEGORIES: PauseCategoryDef[] = [
  {
    id: 'personal',
    i18nKey: 'pause.cat.personal',
    subs: [
      { id: 'meal', i18nKey: 'pause.sub.personal.meal' },
      { id: 'rest', i18nKey: 'pause.sub.personal.rest' },
      { id: 'hygiene', i18nKey: 'pause.sub.personal.hygiene' },
      { id: 'other_personal', i18nKey: 'pause.sub.personal.other', requiresDetail: true },
    ],
  },
  {
    id: 'operational',
    i18nKey: 'pause.cat.operational',
    subs: [
      { id: 'wait_parts', i18nKey: 'pause.sub.operational.wait_parts' },
      { id: 'wait_approval', i18nKey: 'pause.sub.operational.wait_approval' },
      { id: 'redo_work', i18nKey: 'pause.sub.operational.redo_work' },
      { id: 'other_ops', i18nKey: 'pause.sub.operational.other', requiresDetail: true },
    ],
  },
  {
    id: 'logistics',
    i18nKey: 'pause.cat.logistics',
    subs: [
      { id: 'traffic', i18nKey: 'pause.sub.logistics.traffic' },
      { id: 'fuel', i18nKey: 'pause.sub.logistics.fuel' },
      { id: 'parking', i18nKey: 'pause.sub.logistics.parking' },
      { id: 'other_log', i18nKey: 'pause.sub.logistics.other', requiresDetail: true },
    ],
  },
  {
    id: 'client_site',
    i18nKey: 'pause.cat.client_site',
    subs: [
      { id: 'client_absent', i18nKey: 'pause.sub.client_site.client_absent' },
      { id: 'site_closed', i18nKey: 'pause.sub.client_site.site_closed' },
      { id: 'access_denied', i18nKey: 'pause.sub.client_site.access_denied' },
      { id: 'other_site', i18nKey: 'pause.sub.client_site.other', requiresDetail: true },
    ],
  },
  {
    id: 'equipment',
    i18nKey: 'pause.cat.equipment',
    subs: [
      { id: 'tool_failure', i18nKey: 'pause.sub.equipment.tool_failure' },
      { id: 'vehicle_issue', i18nKey: 'pause.sub.equipment.vehicle_issue' },
      { id: 'ppe', i18nKey: 'pause.sub.equipment.ppe' },
      { id: 'other_eq', i18nKey: 'pause.sub.equipment.other', requiresDetail: true },
    ],
  },
  {
    id: 'safety',
    i18nKey: 'pause.cat.safety',
    subs: [
      { id: 'weather', i18nKey: 'pause.sub.safety.weather' },
      { id: 'hazard', i18nKey: 'pause.sub.safety.hazard' },
      { id: 'incident', i18nKey: 'pause.sub.safety.incident' },
      { id: 'other_safe', i18nKey: 'pause.sub.safety.other', requiresDetail: true },
    ],
  },
  {
    id: 'communication',
    i18nKey: 'pause.cat.communication',
    subs: [
      { id: 'call_supervisor', i18nKey: 'pause.sub.communication.call_supervisor' },
      { id: 'system_down', i18nKey: 'pause.sub.communication.system_down' },
      { id: 'other_comm', i18nKey: 'pause.sub.communication.other', requiresDetail: true },
    ],
  },
  {
    id: 'admin',
    i18nKey: 'pause.cat.admin',
    subs: [
      { id: 'documentation', i18nKey: 'pause.sub.admin.documentation' },
      { id: 'billing', i18nKey: 'pause.sub.admin.billing' },
      { id: 'other_admin', i18nKey: 'pause.sub.admin.other', requiresDetail: true },
    ],
  },
  {
    id: 'other',
    i18nKey: 'pause.cat.other',
    subs: [{ id: 'other_free', i18nKey: 'pause.sub.other.free', requiresDetail: true }],
  },
];

export const PAUSE_DETAIL_MIN_LEN = 12;
