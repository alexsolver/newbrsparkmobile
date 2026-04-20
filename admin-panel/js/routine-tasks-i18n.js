/**
 * Textos da página RT (tarefas de rotina), pt-BR, en-US e es-ES.
 * Preferência: `getAdminUiLocale()` (localStorage `brspark_admin_ui_locale`; padrão pt-BR).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    rt_pageTitle: 'BrSpark Admin, RT, Tarefas de rotina',
    rt_bc_panel: 'Painel',
    rt_bc_page: 'Tarefas de rotina',
    rt_hero_title: 'RT, Tarefas de rotina',
    rt_hero_sub:
      'Associe modelos do Form Builder a prestadores da organização e gerencie rótulos do menu «Mais», ordem e pré-carga no app.',
    rt_tenant_bar_html:
      '<strong>Organização:</strong> selecione a organização (perfil SaaS) ou use o modo organização ao iniciar sessão no painel.',
    rt_tenant_lbl: 'Organização',
    rt_tenant_filter_lbl: 'Filtrar organizações',
    rt_tenant_filter_ph: 'Filtrar organizações por nome ou e-mail…',
    rt_tenant_pick: 'Selecione a organização…',
    rt_bulk_title: 'Associar modelo a prestadores',
    rt_bulk_hint:
      'Escolha um modelo do Form Builder, selecione um ou vários prestadores (use a busca para listas grandes; atalho de seleção múltipla no sistema operativo) e, se quiser, defina o nome no menu «Mais» no app (vazio = usa o título do modelo). Só entram contas ativas que não sejam cliente (papel diferente de cliente), alinhadas a OS, FT e RT no app.',
    rt_form_model_lbl: 'Modelo de formulário',
    rt_option_pick_template: '— Escolha o modelo —',
    rt_all_templates: '(todos os modelos)',
    rt_menu_lbl: 'Nome no menu «Mais» (opcional)',
    rt_menu_ph: 'Ex.: Abertura de turno',
    rt_providers_lbl: 'Prestadores da organização',
    rt_providers_hint:
      'Mantenha Ctrl (Windows/Linux) ou ⌘ (macOS) para selecionar vários. Use «Selecionar filtrados» após filtrar pela busca.',
    rt_user_filter_ph: 'Buscar prestador por nome ou e-mail…',
    rt_select_filtered: 'Selecionar filtrados',
    rt_apply_bulk: 'Aplicar associações',
    rt_assign_title: 'Associações atuais',
    rt_assign_hint:
      'Edite o rótulo do menu, a ordem ou a pré-carga no app (1 a 20 tarefas); use «Salvar» por linha ou exclua a associação (as RT ativas dessa combinação são canceladas). Use a busca e a paginação para listas grandes.',
    rt_filter_template_lbl: 'Modelo de formulário',
    rt_filter_user_lbl: 'Prestador',
    rt_all_providers: '(todos os prestadores)',
    rt_refresh: 'Atualizar lista',
    rt_export_csv: 'Exportar CSV (filtrado)',
    rt_search_table_ph: 'Buscar na tabela (prestador, e-mail, modelo, menu)…',
    rt_table_search_lbl: 'Busca na tabela',
    rt_page_size_lbl: 'Por página',
    rt_th_provider: 'Prestador',
    rt_th_email: 'E-mail',
    rt_th_model: 'Modelo',
    rt_th_menu: 'Nome no menu',
    rt_th_order: 'Ordem',
    rt_th_prefetch: 'Pré-carga no app',
    rt_th_actions: 'Ações',
    rt_save: 'Salvar',
    rt_delete: 'Excluir',
    rt_delete_ok: 'Associação removida.',
    rt_saving: '…',
    rt_loading: 'Carregando…',
    rt_none_filtered: 'Nenhuma associação com os filtros atuais.',
    rt_empty_cta: 'Ir para «Associar modelo a prestadores»',
    rt_page_prev: 'Anterior',
    rt_page_next: 'Seguinte',
    rt_page_of: 'Página {page} de {pages} · {count} associações',
    rt_prefetch_title: 'Quantidade de RT em pré-carga no app (1 a 20)',
    rt_pick_org: 'Selecione a organização.',
    rt_err_pick_template: 'Escolha o modelo de formulário.',
    rt_pick_users: 'Selecione pelo menos um prestador.',
    rt_sending: 'Enviando…',
    rt_assoc_updated: 'Associação atualizada.',
    rt_save_failed: 'Falha ao salvar. Abra a consola do navegador para detalhes.',
    rt_del_confirm:
      'Excluir esta associação de RT?\n\nAs execuções de rotina ativas desta combinação prestador + modelo serão canceladas.',
    rt_bulk_new: '{n} nova(s)',
    rt_bulk_updated: '{n} já existente(s) atualizada(s)',
    rt_bulk_skipped: '{n} ignorada(s)',
    rt_bulk_done: 'Concluído.',
    rt_bulk_more_reasons: ' (+{n} motivo(s); passe o rato sobre o resumo para ver todos)',
    rt_inactive: ' [inativo]',
    rt_template_inactive: '(inativo)',
    rt_csv_provider: 'Prestador',
    rt_csv_email: 'E-mail',
    rt_csv_model: 'Modelo',
    rt_csv_menu: 'Nome no menu',
    rt_csv_order: 'Ordem',
    rt_csv_prefetch: 'Pre_carga',
    rt_csv_template_id: 'ID do modelo',
    rt_csv_user_id: 'ID do usuário',
    rt_export_empty: 'Não há linhas para exportar com os filtros atuais.',
    rt_aria_live_region: 'Mensagens de tarefas de rotina',
  },
  'en-US': {
    rt_pageTitle: 'BrSpark Admin, RT, Routine tasks',
    rt_bc_panel: 'Home',
    rt_bc_page: 'Routine tasks',
    rt_hero_title: 'RT, Routine tasks',
    rt_hero_sub:
      'Link Form Builder templates to field technicians in your organization and manage «More» menu labels, order, and mobile prefetch in the app.',
    rt_tenant_bar_html:
      '<strong>Organization:</strong> select the organization (SaaS profile) or sign in to the panel in organization mode.',
    rt_tenant_lbl: 'Organization',
    rt_tenant_filter_lbl: 'Filter organizations',
    rt_tenant_filter_ph: 'Filter organizations by name or email…',
    rt_tenant_pick: 'Select organization…',
    rt_bulk_title: 'Link template to technicians',
    rt_bulk_hint:
      'Pick a Form Builder template, select one or more technicians (use search for long lists; use your OS multi-select shortcut) and optionally set the «More» menu label in the app (empty = template title). Only active accounts that are not end-customer role are included, consistent with WO, FT and RT in the app.',
    rt_form_model_lbl: 'Form template',
    rt_option_pick_template: '— Choose template —',
    rt_all_templates: '(all templates)',
    rt_menu_lbl: '«More» menu label (optional)',
    rt_menu_ph: 'e.g. Shift opening',
    rt_providers_lbl: 'Organization technicians',
    rt_providers_hint:
      'Hold Ctrl (Windows/Linux) or ⌘ (macOS) to multi-select. Use «Select filtered» after narrowing the list with search.',
    rt_user_filter_ph: 'Search technician by name or email…',
    rt_select_filtered: 'Select filtered',
    rt_apply_bulk: 'Apply assignments',
    rt_assign_title: 'Current assignments',
    rt_assign_hint:
      'Edit menu label, sort order, or app prefetch (1–20 tasks); use «Save» per row or delete the assignment (active RT runs for that pair are cancelled). Use search and paging for large lists.',
    rt_filter_template_lbl: 'Form template',
    rt_filter_user_lbl: 'Technician',
    rt_all_providers: '(all technicians)',
    rt_refresh: 'Refresh list',
    rt_export_csv: 'Export CSV (filtered)',
    rt_search_table_ph: 'Search table (technician, email, template, menu)…',
    rt_table_search_lbl: 'Table search',
    rt_page_size_lbl: 'Per page',
    rt_th_provider: 'Technician',
    rt_th_email: 'Email',
    rt_th_model: 'Template',
    rt_th_menu: 'Menu label',
    rt_th_order: 'Order',
    rt_th_prefetch: 'App prefetch',
    rt_th_actions: 'Actions',
    rt_save: 'Save',
    rt_delete: 'Delete',
    rt_delete_ok: 'Assignment removed.',
    rt_saving: '…',
    rt_loading: 'Loading…',
    rt_none_filtered: 'No assignments match the current filters.',
    rt_empty_cta: 'Go to «Link template to technicians»',
    rt_page_prev: 'Previous',
    rt_page_next: 'Next',
    rt_page_of: 'Page {page} of {pages} · {count} assignments',
    rt_prefetch_title: 'Number of RT items prefetched in the app (1–20)',
    rt_pick_org: 'Select the organization.',
    rt_err_pick_template: 'Choose a form template.',
    rt_pick_users: 'Select at least one technician.',
    rt_sending: 'Sending…',
    rt_assoc_updated: 'Assignment updated.',
    rt_save_failed: 'Could not save. Open the browser console for details.',
    rt_del_confirm:
      'Delete this routine-task assignment?\n\nActive routine runs for this technician + template pair will be cancelled.',
    rt_bulk_new: '{n} new',
    rt_bulk_updated: '{n} existing updated',
    rt_bulk_skipped: '{n} skipped',
    rt_bulk_done: 'Done.',
    rt_bulk_more_reasons: ' (+{n} more reason(s); hover the summary for full list)',
    rt_inactive: ' [inactive]',
    rt_template_inactive: '(inactive)',
    rt_csv_provider: 'Technician',
    rt_csv_email: 'Email',
    rt_csv_model: 'Template',
    rt_csv_menu: 'Menu_label',
    rt_csv_order: 'Order',
    rt_csv_prefetch: 'Prefetch',
    rt_csv_template_id: 'Template_id',
    rt_csv_user_id: 'User_id',
    rt_export_empty: 'No rows to export with the current filters.',
    rt_aria_live_region: 'Routine task messages',
  },
};
M['es-ES'] = { ...M['en-US'] };

function interpolate(str, vars) {
  let out = String(str ?? '');
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
  }
  return out;
}

export function rtT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

export function applyRoutineTasksStaticI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }

  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = rtT(key);
  };

  document.title = rtT('rt_pageTitle');
  setText('rt-bc-panel', 'rt_bc_panel');
  setText('rt-bc-page', 'rt_bc_page');
  setText('rt-hero-title', 'rt_hero_title');
  setText('rt-hero-sub', 'rt_hero_sub');

  const tenantBar = document.getElementById('rt-tenant-bar');
  if (tenantBar) tenantBar.innerHTML = rtT('rt_tenant_bar_html');

  setText('rt-tenant-lbl', 'rt_tenant_lbl');
  setText('rt-tenant-filter-lbl', 'rt_tenant_filter_lbl');
  const tf = document.getElementById('rt-tenant-filter');
  if (tf) tf.placeholder = rtT('rt_tenant_filter_ph');

  setText('rt-bulk-heading', 'rt_bulk_title');
  setText('rt-bulk-hint', 'rt_bulk_hint');
  setText('rt-form-model-lbl', 'rt_form_model_lbl');
  setText('rt-menu-lbl', 'rt_menu_lbl');
  const menuInp = document.getElementById('rt-bulk-menu');
  if (menuInp) menuInp.placeholder = rtT('rt_menu_ph');
  setText('rt-providers-lbl', 'rt_providers_lbl');
  setText('rt-providers-hint', 'rt_providers_hint');
  const uf = document.getElementById('rt-bulk-user-filter');
  if (uf) uf.placeholder = rtT('rt_user_filter_ph');
  setText('rt-bulk-select-filtered', 'rt_select_filtered');
  setText('rt-bulk-apply', 'rt_apply_bulk');

  setText('rt-assign-title', 'rt_assign_title');
  setText('rt-assign-hint', 'rt_assign_hint');
  setText('rt-filter-template-lbl', 'rt_filter_template_lbl');
  setText('rt-filter-user-lbl', 'rt_filter_user_lbl');
  setText('rt-assign-reload', 'rt_refresh');
  setText('rt-export-csv', 'rt_export_csv');
  const ts = document.getElementById('rt-table-search');
  if (ts) ts.placeholder = rtT('rt_search_table_ph');
  setText('rt-table-search-lbl', 'rt_table_search_lbl');
  setText('rt-page-size-lbl', 'rt_page_size_lbl');

  setText('rt-th-provider', 'rt_th_provider');
  setText('rt-th-email', 'rt_th_email');
  setText('rt-th-model', 'rt_th_model');
  setText('rt-th-menu', 'rt_th_menu');
  setText('rt-th-order', 'rt_th_order');
  setText('rt-th-prefetch', 'rt_th_prefetch');
  setText('rt-th-actions', 'rt_th_actions');

  const live = document.getElementById('rt-aria-live');
  if (live) live.setAttribute('aria-label', rtT('rt_aria_live_region'));
}
