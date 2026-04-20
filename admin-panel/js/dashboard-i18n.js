/**
 * Textos do dashboard admin, pt-BR, en-US e es-ES.
 * Preferência: `getAdminUiLocale()` (localStorage `brspark_admin_ui_locale`; padrão pt-BR).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    dash_pageTitle: 'BrSpark Admin, Dashboard',
    dash_bc_panel: 'Painel',
    dash_bc_summary: 'Resumo',
    dash_hero_title: 'Dashboard',
    dash_hero_sub:
      'Visão geral da plataforma: métricas principais, última atividade de auditoria e tenants recentes.',
    dash_last_update_loading: 'Carregando…',
    dash_last_update_server: 'Dados do servidor: {datetime}',
    dash_last_update_local: 'Atualizado nesta aba: {time}',
    dash_refresh: 'Atualizar',
    dash_refresh_aria: 'Recarregar dados do painel',
    dash_stat_tenants: 'Tenants',
    dash_stat_users: 'Usuários ativos',
    dash_stat_assets: 'Bens cadastrados',
    dash_stat_stock: 'Itens em estoque',
    dash_stat_critical: 'Abaixo do mínimo (estoque)',
    dash_panel_alerts: 'Estoque abaixo do mínimo',
    dash_panel_activity: 'Atividade recente',
    dash_see_all: 'Ver tudo',
    dash_see_all_title: 'Abrir auditoria (todas as categorias)',
    dash_see_system_only: 'Só sistema',
    dash_see_system_only_title: 'Abrir auditoria filtrada pela categoria Sistema',
    dash_manage_tenants: 'Gerenciar',
    dash_tenants_section: 'Tenants recentes',
    dash_th_tenant: 'Tenant',
    dash_th_plan: 'Plano',
    dash_th_users: 'Usuários',
    dash_th_assets: 'Bens',
    dash_th_status: 'Status',
    dash_th_created: 'Criado em',
    dash_alerts_empty_title: 'Nenhum item abaixo do mínimo',
    dash_alerts_empty_sub: 'Não há itens com estoque em ou abaixo do mínimo configurado.',
    dash_alerts_summary: '{count} itens em ou abaixo do mínimo',
    dash_alerts_hint: 'Lista dos casos mais urgentes (por diferença para o mínimo).',
    dash_alerts_open_full: 'Ver lista completa',
    dash_activity_empty_title: 'Nenhuma atividade recente',
    dash_activity_empty_sub: 'Quando houver eventos de auditoria, eles aparecem aqui.',
    dash_tenants_empty_title: 'Nenhum tenant cadastrado',
    dash_tenants_empty_sub: 'Quando existirem contas, elas surgirão nesta tabela.',
    dash_tenant_row_open_users: 'Ver usuários deste tenant',
    dash_load_error: 'Não foi possível carregar o dashboard. Tente atualizar.',
    dash_row_qty: 'Atual: {current} · Mín.: {min}',
    dash_badge_alert_one: '1 item abaixo do mínimo',
    dash_badge_alert_many: '{n} itens abaixo do mínimo',
    dash_stat_go_tenants: 'Abrir lista de tenants',
    dash_stat_go_users: 'Abrir gestão de usuários',
    dash_stat_go_assets: 'Métrica global de bens (sem lista dedicada no painel)',
    dash_stat_go_stock: 'Abrir página de estoque abaixo do mínimo',
    dash_stat_go_critical: 'Abrir página de estoque abaixo do mínimo',
    dash_auto_lbl: 'Atualização automática',
    dash_auto_0: 'Desligada',
    dash_auto_60: '1 min',
    dash_auto_120: '2 min',
    dash_auto_300: '5 min',
    dash_auto_aria: 'Intervalo de atualização automática do painel',
    dash_activity_tenant: 'Tenant: {name}',
    dash_system_events_24h: 'Sistema (24 h): {count}',
    dash_system_events_24h_title: 'Abrir auditoria, categoria Sistema',
    dash_stock_preview_link_title: 'Ver estoque crítico filtrado por este tenant e SKU',
    st_TRIAL: 'Avaliação',
    st_ACTIVE: 'Ativo',
    st_SUSPENDED: 'Suspenso',
    st_CANCELLED: 'Cancelado',
  },
  'en-US': {
    dash_pageTitle: 'BrSpark Admin, Dashboard',
    dash_bc_panel: 'Home',
    dash_bc_summary: 'Overview',
    dash_hero_title: 'Dashboard',
    dash_hero_sub:
      'Platform overview: key metrics, latest audit activity, and recent tenants.',
    dash_last_update_loading: 'Loading…',
    dash_last_update_server: 'Server snapshot: {datetime}',
    dash_last_update_local: 'Refreshed in this tab: {time}',
    dash_refresh: 'Refresh',
    dash_refresh_aria: 'Reload dashboard data',
    dash_stat_tenants: 'Tenants',
    dash_stat_users: 'Active users',
    dash_stat_assets: 'Registered assets',
    dash_stat_stock: 'Stock line items',
    dash_stat_critical: 'Below minimum (stock)',
    dash_panel_alerts: 'Below-minimum stock',
    dash_panel_activity: 'Recent activity',
    dash_see_all: 'See all',
    dash_see_all_title: 'Open audit log (all categories)',
    dash_see_system_only: 'System only',
    dash_see_system_only_title: 'Open audit log filtered to System category',
    dash_manage_tenants: 'Manage',
    dash_tenants_section: 'Recent tenants',
    dash_th_tenant: 'Tenant',
    dash_th_plan: 'Plan',
    dash_th_users: 'Users',
    dash_th_assets: 'Assets',
    dash_th_status: 'Status',
    dash_th_created: 'Created',
    dash_alerts_empty_title: 'No below-minimum items',
    dash_alerts_empty_sub: 'There are no stock rows at or below the configured minimum.',
    dash_alerts_summary: '{count} items at or below minimum',
    dash_alerts_hint: 'Most urgent cases first (gap to minimum).',
    dash_alerts_open_full: 'See full list',
    dash_activity_empty_title: 'No recent activity',
    dash_activity_empty_sub: 'Audit events will appear here when available.',
    dash_tenants_empty_title: 'No tenants yet',
    dash_tenants_empty_sub: 'When accounts exist, they will show in this table.',
    dash_tenant_row_open_users: 'View users for this tenant',
    dash_load_error: 'Could not load the dashboard. Try refreshing.',
    dash_row_qty: 'Current: {current} · Min: {min}',
    dash_badge_alert_one: '1 below-minimum item',
    dash_badge_alert_many: '{n} below-minimum items',
    dash_stat_go_tenants: 'Open tenant list',
    dash_stat_go_users: 'Open user management',
    dash_stat_go_assets: 'Global asset count (no dedicated list in admin)',
    dash_stat_go_stock: 'Open below-minimum stock page',
    dash_stat_go_critical: 'Open below-minimum stock page',
    dash_auto_lbl: 'Auto-refresh',
    dash_auto_0: 'Off',
    dash_auto_60: '1 min',
    dash_auto_120: '2 min',
    dash_auto_300: '5 min',
    dash_auto_aria: 'Dashboard auto-refresh interval',
    dash_activity_tenant: 'Tenant: {name}',
    dash_system_events_24h: 'System (24h): {count}',
    dash_system_events_24h_title: 'Open audit log, System category',
    dash_stock_preview_link_title: 'Critical stock for this tenant and SKU',
    st_TRIAL: 'Trial',
    st_ACTIVE: 'Active',
    st_SUSPENDED: 'Suspended',
    st_CANCELLED: 'Cancelled',
  },
  'es-ES': {
    dash_pageTitle: 'BrSpark Admin, Panel',
    dash_bc_panel: 'Inicio',
    dash_bc_summary: 'Resumen',
    dash_hero_title: 'Panel',
    dash_hero_sub:
      'Visión general de la plataforma: métricas clave, última actividad de auditoría e inquilinos recientes.',
    dash_last_update_loading: 'Cargando…',
    dash_last_update_server: 'Instantánea del servidor: {datetime}',
    dash_last_update_local: 'Atualizado en esta pestaña: {time}',
    dash_refresh: 'Atualizar',
    dash_refresh_aria: 'Recargar datos del panel',
    dash_stat_tenants: 'Inquilinos',
    dash_stat_users: 'Usuarios activos',
    dash_stat_assets: 'Activos registrados',
    dash_stat_stock: 'Líneas de stock',
    dash_stat_critical: 'Por debajo del mínimo (stock)',
    dash_panel_alerts: 'Stock por debajo del mínimo',
    dash_panel_activity: 'Actividad reciente',
    dash_see_all: 'Ver todo',
    dash_see_all_title: 'Abrir registro de auditoría (todas las categorías)',
    dash_see_system_only: 'Solo sistema',
    dash_see_system_only_title: 'Abrir auditoría filtrada por categoría Sistema',
    dash_manage_tenants: 'Gestionar',
    dash_tenants_section: 'Inquilinos recientes',
    dash_th_tenant: 'Inquilino',
    dash_th_plan: 'Plan',
    dash_th_users: 'Usuarios',
    dash_th_assets: 'Activos',
    dash_th_status: 'Estado',
    dash_th_created: 'Creado',
    dash_alerts_empty_title: 'Sin artículos por debajo del mínimo',
    dash_alerts_empty_sub: 'No hay líneas de stock en o por debajo del mínimo configurado.',
    dash_alerts_summary: '{count} artículos en o por debajo del mínimo',
    dash_alerts_hint: 'Casos más urgentes primero (diferencia respecto al mínimo).',
    dash_alerts_open_full: 'Ver lista completa',
    dash_activity_empty_title: 'Sin actividad reciente',
    dash_activity_empty_sub: 'Los eventos de auditoría aparecerán aquí cuando existan.',
    dash_tenants_empty_title: 'Aún no hay inquilinos',
    dash_tenants_empty_sub: 'Cuando existan cuentas, se mostrarán en esta tabla.',
    dash_tenant_row_open_users: 'Ver usuarios de este inquilino',
    dash_load_error: 'No se pudo cargar el panel. Intente actualizar.',
    dash_row_qty: 'Atual: {current} · Mín.: {min}',
    dash_badge_alert_one: '1 artículo por debajo del mínimo',
    dash_badge_alert_many: '{n} artículos por debajo del mínimo',
    dash_stat_go_tenants: 'Abrir lista de inquilinos',
    dash_stat_go_users: 'Abrir gestión de usuarios',
    dash_stat_go_assets: 'Recuento global de activos (sin lista dedicada en el admin)',
    dash_stat_go_stock: 'Abrir página de stock por debajo del mínimo',
    dash_stat_go_critical: 'Abrir página de stock por debajo del mínimo',
    dash_auto_lbl: 'Atualización automática',
    dash_auto_0: 'Desactivada',
    dash_auto_60: '1 min',
    dash_auto_120: '2 min',
    dash_auto_300: '5 min',
    dash_auto_aria: 'Intervalo de actualización automática del panel',
    dash_activity_tenant: 'Inquilino: {name}',
    dash_system_events_24h: 'Sistema (24 h): {count}',
    dash_system_events_24h_title: 'Abrir auditoría, categoría Sistema',
    dash_stock_preview_link_title: 'Stock crítico para este inquilino y SKU',
    st_TRIAL: 'Prueba',
    st_ACTIVE: 'Activo',
    st_SUSPENDED: 'Suspendido',
    st_CANCELLED: 'Cancelado',
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

export function dashT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

export function dashStatusLabel(status) {
  const k = `st_${String(status || '').trim()}`;
  const v = dashT(k);
  return v === k ? String(status || '—') : v;
}

export function applyDashboardStaticI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  document.title = dashT('dash_pageTitle');
  set('dash-bc-panel', dashT('dash_bc_panel'));
  set('dash-bc-summary', dashT('dash_bc_summary'));
  set('dash-hero-title', dashT('dash_hero_title'));
  const sub = document.getElementById('dash-hero-sub');
  if (sub) sub.textContent = dashT('dash_hero_sub');
  set('last-update', dashT('dash_last_update_loading'));

  const refreshBtn = document.getElementById('dash-refresh-btn');
  if (refreshBtn) {
    refreshBtn.setAttribute('aria-label', dashT('dash_refresh_aria'));
    refreshBtn.title = dashT('dash_refresh_aria');
    const rt = refreshBtn.querySelector('.dash-refresh-label');
    if (rt) rt.textContent = dashT('dash_refresh');
  }
  const arLbl = document.getElementById('dash-auto-refresh-lbl');
  if (arLbl) arLbl.textContent = dashT('dash_auto_lbl');
  const arSel = document.getElementById('dash-auto-refresh');
  if (arSel) {
    arSel.setAttribute('aria-label', dashT('dash_auto_aria'));
    const opt0 = arSel.querySelector('option[value="0"]');
    const o60 = arSel.querySelector('option[value="60"]');
    const o120 = arSel.querySelector('option[value="120"]');
    const o300 = arSel.querySelector('option[value="300"]');
    if (opt0) opt0.textContent = dashT('dash_auto_0');
    if (o60) o60.textContent = dashT('dash_auto_60');
    if (o120) o120.textContent = dashT('dash_auto_120');
    if (o300) o300.textContent = dashT('dash_auto_300');
  }

  const actBtn = document.getElementById('dash-audit-all-btn');
  if (actBtn) {
    actBtn.textContent = dashT('dash_see_all');
    const tAll = dashT('dash_see_all_title');
    actBtn.title = tAll;
    actBtn.setAttribute('aria-label', tAll);
  }
  const actSysBtn = document.getElementById('dash-audit-system-btn');
  if (actSysBtn) {
    actSysBtn.textContent = dashT('dash_see_system_only');
    const st = dashT('dash_see_system_only_title');
    actSysBtn.title = st;
    actSysBtn.setAttribute('aria-label', st);
  }
  set('dash-panel-activity-title', dashT('dash_panel_activity'));

  const tenBtn = document.getElementById('dash-tenants-manage-btn');
  if (tenBtn) tenBtn.textContent = dashT('dash_manage_tenants');
  set('dash-tenants-section-title', dashT('dash_tenants_section'));

  set('dash-th-tenant', dashT('dash_th_tenant'));
  set('dash-th-plan', dashT('dash_th_plan'));
  set('dash-th-users', dashT('dash_th_users'));
  set('dash-th-assets', dashT('dash_th_assets'));
  set('dash-th-status', dashT('dash_th_status'));
  set('dash-th-created', dashT('dash_th_created'));
}

export function dashFormatDate(iso, opts) {
  const loc = adminIntlLocale(getAdminUiLocale());
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(loc, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...opts,
    }).format(d);
  } catch {
    return '—';
  }
}

export function dashFormatNumber(n) {
  const loc = adminIntlLocale(getAdminUiLocale());
  const num = Number(n) || 0;
  return num.toLocaleString(loc);
}

/** Só data (sem hora), conforme locale do painel. */
export function dashFormatDateOnly(iso) {
  const loc = adminIntlLocale(getAdminUiLocale());
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(loc, { dateStyle: 'short' }).format(d);
  } catch {
    return '—';
  }
}

/** Hora local da aba (curta), para complementar o horário do snapshot do servidor. */
export function dashFormatTimeOnly(d) {
  const loc = adminIntlLocale(getAdminUiLocale());
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return new Intl.DateTimeFormat(loc, { timeStyle: 'short' }).format(dt);
  } catch {
    return '—';
  }
}
