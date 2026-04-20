/**
 * Página Estoque crítico, pt-BR, en-US e es-ES (locale do painel).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    sc_pageTitle: 'BrSpark Admin, Estoque abaixo do mínimo',
    sc_bc_panel: 'Painel',
    sc_bc_here: 'Estoque abaixo do mínimo',
    sc_hero_title: 'Estoque abaixo do mínimo',
    sc_hero_sub:
      'Lista consolidada de linhas de estoque em ou abaixo do mínimo configurado. Filtre por tenant, pesquise por SKU ou nome e exporte CSV até 5000 linhas.',
    sc_kpi_total_lbl: 'Total em alerta',
    sc_kpi_shown_lbl: 'Linhas nesta página',
    sc_search_ph: 'Buscar item, SKU, bem ou tenant…',
    sc_filter_tenant: 'Tenant',
    sc_filter_all_tenants: 'Todos os tenants',
    sc_limit: 'Por página',
    sc_refresh: 'Atualizar',
    sc_refresh_aria: 'Recarregar lista',
    sc_export: 'Exportar CSV',
    sc_export_aria: 'Descarregar CSV com o filtro atual (até 5000 linhas)',
    sc_table_title: 'Itens abaixo do mínimo',
    sc_th_tenant: 'Tenant',
    sc_th_asset: 'Bem',
    sc_th_item: 'Item',
    sc_th_sku: 'SKU',
    sc_th_current: 'Atual',
    sc_th_min: 'Mín.',
    sc_th_gap: 'Déficit',
    sc_th_unit: 'Un.',
    sc_empty_title: 'Nenhum item abaixo do mínimo',
    sc_empty_sub: 'Não há linhas de estoque com quantidade em ou abaixo do mínimo com os filtros atuais.',
    sc_load_err: 'Não foi possível carregar a lista.',
    sc_count_one: '1 item',
    sc_count_many: '{n} itens',
    sc_prev: 'Página anterior',
    sc_next: 'Próxima página',
    sc_page_of: 'Página {page} de {total}',
  },
  'en-US': {
    sc_pageTitle: 'BrSpark Admin, Below-minimum stock',
    sc_bc_panel: 'Home',
    sc_bc_here: 'Below-minimum stock',
    sc_hero_title: 'Below-minimum stock',
    sc_hero_sub:
      'Consolidated list of stock lines at or below the configured minimum. Filter by tenant, search by SKU or name, and export CSV (up to 5000 rows).',
    sc_kpi_total_lbl: 'Total in alert',
    sc_kpi_shown_lbl: 'Rows on this page',
    sc_search_ph: 'Search item, SKU, asset or tenant…',
    sc_filter_tenant: 'Tenant',
    sc_filter_all_tenants: 'All tenants',
    sc_limit: 'Per page',
    sc_refresh: 'Refresh',
    sc_refresh_aria: 'Reload list',
    sc_export: 'Export CSV',
    sc_export_aria: 'Download CSV with current filters (up to 5000 rows)',
    sc_table_title: 'Below-minimum items',
    sc_th_tenant: 'Tenant',
    sc_th_asset: 'Asset',
    sc_th_item: 'Item',
    sc_th_sku: 'SKU',
    sc_th_current: 'Current',
    sc_th_min: 'Min.',
    sc_th_gap: 'Gap',
    sc_th_unit: 'Unit',
    sc_empty_title: 'No below-minimum items',
    sc_empty_sub: 'No stock rows match the current filters.',
    sc_load_err: 'Could not load the list.',
    sc_count_one: '1 item',
    sc_count_many: '{n} items',
    sc_prev: 'Previous page',
    sc_next: 'Next page',
    sc_page_of: 'Page {page} of {total}',
  },
  'es-ES': {
    sc_pageTitle: 'BrSpark Admin, Stock por debajo del mínimo',
    sc_bc_panel: 'Inicio',
    sc_bc_here: 'Stock por debajo del mínimo',
    sc_hero_title: 'Stock por debajo del mínimo',
    sc_hero_sub:
      'Lista consolidada de líneas en o por debajo del mínimo configurado. Filtre por inquilino, busque por SKU o nombre y exporte CSV (hasta 5000 filas).',
    sc_kpi_total_lbl: 'Total en alerta',
    sc_kpi_shown_lbl: 'Filas en esta página',
    sc_search_ph: 'Buscar artículo, SKU, activo o inquilino…',
    sc_filter_tenant: 'Inquilino',
    sc_filter_all_tenants: 'Todos los inquilinos',
    sc_limit: 'Por página',
    sc_refresh: 'Atualizar',
    sc_refresh_aria: 'Recargar lista',
    sc_export: 'Exportar CSV',
    sc_export_aria: 'Descargar CSV con el filtro actual (hasta 5000 filas)',
    sc_table_title: 'Artículos por debajo del mínimo',
    sc_th_tenant: 'Inquilino',
    sc_th_asset: 'Activo',
    sc_th_item: 'Artículo',
    sc_th_sku: 'SKU',
    sc_th_current: 'Atual',
    sc_th_min: 'Mín.',
    sc_th_gap: 'Déficit',
    sc_th_unit: 'Ud.',
    sc_empty_title: 'Sin artículos por debajo del mínimo',
    sc_empty_sub: 'No hay líneas de stock que coincidan con los filtros.',
    sc_load_err: 'No se pudo cargar la lista.',
    sc_count_one: '1 artículo',
    sc_count_many: '{n} artículos',
    sc_prev: 'Página anterior',
    sc_next: 'Página siguiente',
    sc_page_of: 'Página {page} de {total}',
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

export function scT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

export function scFmtNum(n) {
  const loc = adminIntlLocale(getAdminUiLocale());
  return (Number(n) || 0).toLocaleString(loc);
}

export function applyStockCriticalPageI18n() {
  if (typeof document === 'undefined') return;
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }
  document.title = scT('sc_pageTitle');
  const set = (id, key, vars) => {
    const el = document.getElementById(id);
    if (el) el.textContent = vars ? scT(key, vars) : scT(key);
  };
  set('sc-bc-panel', 'sc_bc_panel');
  set('sc-bc-here', 'sc_bc_here');
  set('sc-hero-title', 'sc_hero_title');
  set('sc-hero-sub', 'sc_hero_sub');
  set('sc-kpi-total-lbl', 'sc_kpi_total_lbl');
  set('sc-kpi-shown-lbl', 'sc_kpi_shown_lbl');
  const si = document.getElementById('sc-search');
  if (si) si.placeholder = scT('sc_search_ph');
  set('sc-lbl-tenant', 'sc_filter_tenant');
  const ft = document.getElementById('sc-filter-tenant');
  if (ft && ft.options[0]) ft.options[0].textContent = scT('sc_filter_all_tenants');
  set('sc-lbl-limit', 'sc_limit');
  const rb = document.getElementById('sc-refresh-btn');
  if (rb) {
    rb.setAttribute('aria-label', scT('sc_refresh_aria'));
    rb.title = scT('sc_refresh_aria');
    const sp = rb.querySelector('.sc-refresh-label');
    if (sp) sp.textContent = scT('sc_refresh');
  }
  const ex = document.getElementById('sc-export-btn');
  if (ex) {
    ex.setAttribute('aria-label', scT('sc_export_aria'));
    ex.title = scT('sc_export_aria');
    const sp = ex.querySelector('.sc-export-label');
    if (sp) sp.textContent = scT('sc_export');
  }
  set('sc-table-title', 'sc_table_title');
  set('sc-th-tenant', 'sc_th_tenant');
  set('sc-th-asset', 'sc_th_asset');
  set('sc-th-item', 'sc_th_item');
  set('sc-th-sku', 'sc_th_sku');
  set('sc-th-current', 'sc_th_current');
  set('sc-th-min', 'sc_th_min');
  set('sc-th-gap', 'sc_th_gap');
  set('sc-th-unit', 'sc_th_unit');
  const pb = document.getElementById('sc-prev-btn');
  const nb = document.getElementById('sc-next-btn');
  if (pb) pb.setAttribute('aria-label', scT('sc_prev'));
  if (nb) nb.setAttribute('aria-label', scT('sc_next'));
}
