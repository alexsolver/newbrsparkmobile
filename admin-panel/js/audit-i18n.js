/**
 * Textos da página de auditoria, pt-BR, en-US e es-ES (locale do painel).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    au_pageTitle: 'BrSpark Admin, Auditoria',
    au_bc_panel: 'Painel',
    au_bc_here: 'Auditoria',
    au_hero_title: 'Log de auditoria',
    au_hero_sub:
      'Eventos de autenticação, dados, administração e sistema. Filtre por categoria e exporte para análise externa (CSV respeita o filtro atual).',
    au_filter_cat: 'Categoria',
    au_cat_all: 'Todas as ações',
    au_cat_AUTH: 'Autenticação',
    au_cat_DATA: 'Dados',
    au_cat_ADMIN: 'Admin',
    au_cat_SYSTEM: 'Sistema',
    au_refresh: 'Actualizar',
    au_refresh_title: 'Recarregar eventos',
    au_export: 'Exportar CSV',
    au_export_title: 'Exportar até 1000 eventos com o filtro atual',
    au_table_title: 'Eventos do sistema',
    au_loading: 'Carregando…',
    au_th_time: 'Data e hora',
    au_th_actor: 'Ator',
    au_th_action: 'Ação',
    au_th_resource: 'Recurso',
    au_th_tenant: 'Tenant',
    au_th_category: 'Categoria',
    au_actor_system: 'sistema',
    au_empty_title: 'Nenhum evento encontrado',
    au_empty_sub: 'Altere o filtro de categoria ou aguarde novos registros de auditoria.',
    au_count_one: '1 evento',
    au_count_many: '{n} eventos',
    au_csv_time: 'Data e hora',
    au_csv_actor: 'Ator',
    au_csv_action: 'Ação',
    au_csv_resource: 'Recurso',
    au_csv_tenant: 'Tenant',
    au_csv_category: 'Categoria',
  },
  'en-US': {
    au_pageTitle: 'BrSpark Admin, Audit log',
    au_bc_panel: 'Home',
    au_bc_here: 'Audit',
    au_hero_title: 'Audit log',
    au_hero_sub:
      'Authentication, data, administration and system events. Filter by category and export to CSV (export respects the current filter).',
    au_filter_cat: 'Category',
    au_cat_all: 'All actions',
    au_cat_AUTH: 'Authentication',
    au_cat_DATA: 'Data',
    au_cat_ADMIN: 'Admin',
    au_cat_SYSTEM: 'System',
    au_refresh: 'Refresh',
    au_refresh_title: 'Reload events',
    au_export: 'Export CSV',
    au_export_title: 'Export up to 1000 events with the current filter',
    au_table_title: 'System events',
    au_loading: 'Loading…',
    au_th_time: 'Date & time',
    au_th_actor: 'Actor',
    au_th_action: 'Action',
    au_th_resource: 'Resource',
    au_th_tenant: 'Tenant',
    au_th_category: 'Category',
    au_actor_system: 'system',
    au_empty_title: 'No events found',
    au_empty_sub: 'Change the category filter or wait for new audit records.',
    au_count_one: '1 event',
    au_count_many: '{n} events',
    au_csv_time: 'Timestamp',
    au_csv_actor: 'Actor',
    au_csv_action: 'Action',
    au_csv_resource: 'Resource',
    au_csv_tenant: 'Tenant',
    au_csv_category: 'Category',
  },
  'es-ES': {
    au_pageTitle: 'BrSpark Admin, Registro de auditoría',
    au_bc_panel: 'Inicio',
    au_bc_here: 'Auditoría',
    au_hero_title: 'Registro de auditoría',
    au_hero_sub:
      'Eventos de autenticación, datos, administración y sistema. Filtre por categoría y exporte a CSV (respeta el filtro actual).',
    au_filter_cat: 'Categoría',
    au_cat_all: 'Todas las acciones',
    au_cat_AUTH: 'Autenticación',
    au_cat_DATA: 'Datos',
    au_cat_ADMIN: 'Admin',
    au_cat_SYSTEM: 'Sistema',
    au_refresh: 'Atualizar',
    au_refresh_title: 'Recargar eventos',
    au_export: 'Exportar CSV',
    au_export_title: 'Exportar hasta 1000 eventos con el filtro actual',
    au_table_title: 'Eventos del sistema',
    au_loading: 'Cargando…',
    au_th_time: 'Fecha y hora',
    au_th_actor: 'Actor',
    au_th_action: 'Acción',
    au_th_resource: 'Recurso',
    au_th_tenant: 'Inquilino',
    au_th_category: 'Categoría',
    au_actor_system: 'sistema',
    au_empty_title: 'No se encontraron eventos',
    au_empty_sub: 'Cambie el filtro de categoría o espere nuevos registros.',
    au_count_one: '1 evento',
    au_count_many: '{n} eventos',
    au_csv_time: 'Marca de tiempo',
    au_csv_actor: 'Actor',
    au_csv_action: 'Acción',
    au_csv_resource: 'Recurso',
    au_csv_tenant: 'Inquilino',
    au_csv_category: 'Categoría',
  },
};

function interpolate(str, vars) {
  let out = String(str ?? '');
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
  }
  return out;
}

export function auT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

export function auFormatDateTime(iso) {
  const loc = adminIntlLocale(getAdminUiLocale());
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(loc, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}

export function applyAuditPageI18n() {
  if (typeof document === 'undefined') return;
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }
  document.title = auT('au_pageTitle');
  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = auT(key);
  };
  set('au-bc-panel', 'au_bc_panel');
  set('au-bc-here', 'au_bc_here');
  set('au-hero-title', 'au_hero_title');
  set('au-hero-sub', 'au_hero_sub');
  const fl = document.getElementById('au-filter-cat-lbl');
  if (fl) {
    fl.innerHTML = `<ion-icon name="funnel-outline" aria-hidden="true"></ion-icon> ${auT('au_filter_cat')}`;
  }
  const sel = document.getElementById('filter-cat');
  if (sel && sel.options.length >= 5) {
    sel.options[0].textContent = auT('au_cat_all');
    sel.options[1].textContent = auT('au_cat_AUTH');
    sel.options[2].textContent = auT('au_cat_DATA');
    sel.options[3].textContent = auT('au_cat_ADMIN');
    sel.options[4].textContent = auT('au_cat_SYSTEM');
  }
  const rb = document.getElementById('au-refresh-btn');
  if (rb) {
    rb.title = auT('au_refresh_title');
    rb.setAttribute('aria-label', auT('au_refresh_title'));
    const sp = rb.querySelector('.au-refresh-label');
    if (sp) sp.textContent = auT('au_refresh');
  }
  const ex = document.getElementById('au-export-btn');
  if (ex) {
    ex.title = auT('au_export_title');
    ex.setAttribute('aria-label', auT('au_export_title'));
    const sp = ex.querySelector('.au-export-label');
    if (sp) sp.textContent = auT('au_export');
  }
  set('au-table-title', 'au_table_title');
  set('au-count-badge', 'au_loading');
  set('au-th-time', 'au_th_time');
  set('au-th-actor', 'au_th_actor');
  set('au-th-action', 'au_th_action');
  set('au-th-resource', 'au_th_resource');
  set('au-th-tenant', 'au_th_tenant');
  set('au-th-category', 'au_th_category');
  const ld = document.getElementById('au-tbody-loading');
  if (ld) ld.textContent = auT('au_loading');
}

const CAT_ICONS = {
  AUTH: 'lock-closed-outline',
  DATA: 'stats-chart-outline',
  ADMIN: 'shield-outline',
  SYSTEM: 'settings-outline',
};

function escHtmlLite(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function auCategoryBadgeHtml(catKey) {
  const k = String(catKey || '').toUpperCase();
  const icon = CAT_ICONS[k] || 'ellipse-outline';
  const rawLab = auT(`au_cat_${k}`);
  const text = rawLab.startsWith('au_cat_') ? k : rawLab;
  return `<ion-icon name="${icon}" style="font-size:16px;vertical-align:middle;margin-right:8px" aria-hidden="true"></ion-icon> ${escHtmlLite(text)}`;
}
