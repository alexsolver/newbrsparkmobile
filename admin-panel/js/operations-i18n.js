/**
 * Textos da Central de Operações (painel admin) — pt-BR, en-US e es-ES.
 * Preferência: `getAdminUiLocale()` (localStorage `brspark_admin_ui_locale`; padrão pt-BR).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    ops_pageTitle: 'BrSpark Admin — Central de Operações',
    ops_bc_panel: 'Painel',
    ops_bc_current: 'Central de operações',
    ops_hero_title: 'Central de operações',
    ops_hero_sub:
      'Quadro de OS e tarefas de rotina (RT), filtros por escopo e técnico, despacho e atualização em tempo quase real.',
    ops_live_dot_title: 'Atualização automática do quadro ativa (30 s)',
    ops_board_title: 'Quadro de OS e RT',
    ops_scope_title: 'O que mostrar no quadro',
    ops_scope_os: 'Apenas OS (FT)',
    ops_scope_rt: 'Apenas RT',
    ops_scope_all: 'OS e RT (todas)',
    ops_filter_all_techs: 'Todos os técnicos',
    ops_search_placeholder: 'Buscar FT, RT, ID, título…',
    ops_limit_label: 'Limite na API',
    ops_limit_select_title: 'Máximo de execuções pedidas à API por cada atualização do quadro',
    ops_limit_opt_100: '100 OS',
    ops_limit_opt_200: '200 OS',
    ops_limit_opt_500: '500 OS',
    ops_refresh: '↻ Atualizar',
    ops_dispatch: 'Despachar OS',
    ops_col_pending: 'Não iniciadas',
    ops_col_progress: 'Em campo',
    ops_col_completed: 'Concluídas',
    ops_col_error: 'Erro / bloqueadas',
    ops_col_cancelled: 'Canceladas',
    ops_col_filter_pending: 'Filtrar pendentes…',
    ops_col_filter_progress: 'Filtrar em campo…',
    ops_col_filter_completed: 'Filtrar concluídas…',
    ops_col_filter_error: 'Filtrar erros…',
    ops_col_filter_cancelled: 'Filtrar canceladas…',
    ops_sort_toggle_title: 'Alterar ordenação',
    ops_sort_new_first: 'Novas primeiro',
    ops_sort_old_first: 'Antigas primeiro',
    ops_sort_by_title: 'Ordenar por',
    ops_sort_key_created: 'Data de criação',
    ops_sort_key_due: 'Data de vencimento (agenda)',
    ops_sort_key_sync: 'Último sincronismo',
    ops_sort_key_completed: 'Data de conclusão',
    ops_empty_col: 'Nenhuma atividade aqui',
    ops_trunc_banner:
      'Você está vendo no máximo {limit} OS mais recentes (limite da API). Aumente o limite na barra ou refine os filtros na API.',
    ops_tenant_chip: 'Organização: {name}',
    ops_tenant_chip_slug: '{name} · {slug}',
    ops_time_dash: '—',
    ops_submission_badge: '{n}ª submissão',
    ops_api_unexpected:
      'A API devolveu um formato inesperado ao carregar o quadro. Abra o console (F12) ou confirme se você está logado.',
    ops_detail_pdf_preset_default: 'Padrão (todos os blocos)',
    ops_modal_close_aria: 'Fechar',
    ops_btn_cancel: 'Cancelar',
    ops_btn_close: 'Fechar',
    ops_btn_open: 'Abrir',
    ops_btn_search: 'Buscar',
    ops_detail_title: 'Detalhes da OS',
    ops_detail_pdf_layout: 'Layout PDF',
    ops_detail_pdf_btn: 'PDF',
    ops_detail_pdf_btn_title: 'Exportar PDF / Imprimir',
    ops_detail_tab_info: 'Informações',
    ops_detail_tab_report: 'Relatório',
    ops_detail_tab_raw: 'Debug (JSON)',
    ops_detail_cancel_os: 'Cancelar OS',
    ops_rev_pick_title: 'Qual submissão abrir?',
    ops_rev_pick_hint:
      'Esta FT tem mais de uma submissão concluída indexada. Escolha qual snapshot deseja ver no relatório e nas informações.',
    ops_rev_snap_title: 'Submissão',
    ops_rev_snap_tab_form: 'Relatório',
    ops_rev_snap_tab_meta: 'Metadados do envio',
    ops_rev_snap_tab_json: 'Respostas (JSON)',
    ops_reopen_title: 'Reabrir para revisão',
    ops_reopen_intro_before: 'A FT',
    ops_reopen_intro_after:
      'volta para "Em campo" (mesmo número). Quem deve executar esta revisão?',
    ops_reopen_same: 'Manter o mesmo técnico',
    ops_reopen_other: 'Atribuir a outro técnico',
    ops_reopen_other_hint: 'Usuário com login no app móvel',
    ops_reopen_tech_label: 'Técnico',
    ops_reopen_confirm: 'Reabrir OS',
    ops_card_chat_title: 'Chat desta FT (gestor e técnico)',
    ops_chat_modal_title: 'Chat da FT · {label}',
    ops_chat_modal_sub: 'Técnico: {tech}. O histórico é só desta execução.',
    ops_chat_ph: 'Escreva uma mensagem…',
    ops_chat_send: 'Enviar',
    ops_chat_loading: 'Carregando…',
    ops_chat_empty: 'Ainda não há mensagens nesta FT.',
    ops_chat_error: 'Não foi possível carregar o chat.',
    ops_chat_kind_gestor: 'Gestor',
    ops_chat_kind_tech: 'Técnico',
    ops_chat_missing_id: 'ID da execução ausente. Atualize o quadro (F5).',
    ops_chat_empty_send: 'Escreva uma mensagem antes de enviar.',
    ops_dispatch_modal_title: 'Despachar nova OS',
    ops_dispatch_section_design: 'Designação',
    ops_dispatch_section_design_html:
      '<ion-icon name="clipboard-outline" style="vertical-align:-2px"></ion-icon> Designação',
    ops_dispatch_section_schedule_html:
      '<ion-icon name="time-outline" style="vertical-align:-2px"></ion-icon> Agenda (bloco horário)',
    ops_dispatch_section_geo_html:
      '<ion-icon name="location-outline" style="vertical-align:-2px"></ion-icon> Local de serviço (cerca eletrônica)',
    ops_dispatch_email_lbl: 'E-mail do técnico *',
    ops_dispatch_email_ph: 'Nome ou e-mail — sugestões ao digitar',
    ops_dispatch_suggest_aria: 'Técnicos sugeridos',
    ops_dispatch_template_lbl: 'Formulário / template *',
    ops_dispatch_template_ph: 'Selecionar formulário…',
    ops_dispatch_title_lbl: 'Título da OS',
    ops_dispatch_title_ph: 'Ex.: vistoria técnica — apt. 302',
    ops_dispatch_address_ph: 'Ex.: Rua das Flores, 123, São Paulo',
    ops_dispatch_desc_lbl: 'Descrição',
    ops_dispatch_desc_ph: 'Instruções adicionais para o técnico…',
    ops_dispatch_section_schedule: 'Agenda (bloco horário)',
    ops_dispatch_sched_lbl: 'Início na agenda *',
    ops_dispatch_sched_hint:
      'Defina quando a OS aparece na agenda do técnico (largura proporcional à duração prevista do formulário).',
    ops_dispatch_dur_lbl: 'Tempo previsto do formulário (min) — opcional',
    ops_dispatch_dur_ph: 'Usar valor do formulário (ou 60 min se vazio)',
    ops_dispatch_dur_hint:
      'Só preenchimento do checklist, sem deslocamento. Múltiplos de 5 min; mínimo 5. Se vazio, usa o definido no builder ou 60 min.',
    ops_dispatch_planned_end_preview:
      'Fim previsto (formulário): {when} — {mins} min de preenchimento (sem deslocamento).',
    ops_dispatch_section_geo: 'Local de serviço (cerca eletrônica)',
    ops_dispatch_geo_point: 'Ponto',
    ops_dispatch_geo_segment: 'Trecho',
    ops_dispatch_geo_route: 'Rota',
    ops_dispatch_geo_polygon: 'Polígono',
    ops_dispatch_geo_free: 'Livre',
    ops_dispatch_send: 'Enviar OS',
    ops_dispatch_success_alert: '✅ OS enviada com sucesso!\n{numLine}{geoLine}',
    ops_dispatch_success_num: 'Nº: {label}',
    ops_dispatch_success_geo: '\n📍 Validação: {mode}',
    ops_dispatch_geo_val_none: 'Nenhuma',
    ops_dispatch_geo_val_point: 'Ponto ({radius}m)',
    ops_dispatch_geo_val_route: 'Rota ({radius}m de tolerância de desvio)',
    ops_dispatch_geo_val_segment: 'Trecho A↔B ({radius}m em cada ponto)',
    ops_dispatch_geo_val_polygon: 'Polígono',
    ops_dispatch_fail: 'Erro: {detail}',
    ops_dispatch_fail_unknown: 'desconhecido',
    ops_dispatch_fail_network: 'Erro ao despachar OS: {detail}',
    ops_dispatch_fail_retry: 'tente novamente.',
    ops_geo_radius_help_html:
      '<ion-icon name="location-outline" style="vertical-align:-2px"></ion-icon> <strong>Ponto:</strong> o técnico deve estar dentro do raio definido ao redor do endereço.<br/>Validação: <code>distância ≤ raio</code>',
    ops_geo_route_help_html:
      '<ion-icon name="git-branch-outline" style="vertical-align:-2px"></ion-icon> <strong>Rota:</strong> o técnico deve seguir o trajeto definido. Alerta se se afastar além da tolerância.<br/>Validação: <code>distância perpendicular da linha ≤ tolerância</code>',
    ops_geo_segment_help_html:
      '<ion-icon name="swap-horizontal-outline" style="vertical-align:-2px"></ion-icon> <strong>Trecho (A↔B):</strong> o técnico deve estar perto do <strong>ponto A</strong> ou do <strong>ponto B</strong>.<br/>Preencha os endereços ou coordenadas abaixo ou clique no mapa para os 2 pontos.',
    ops_geo_polygon_help_html:
      '<ion-icon name="shapes-outline" style="vertical-align:-2px"></ion-icon> <strong>Polígono:</strong> o técnico deve estar <strong>dentro</strong> da área delimitada.<br/>Validação: dentro / fora — sem tolerância de borda.',
    ops_geo_none_help_html:
      '<ion-icon name="warning-outline" style="color:var(--amber);vertical-align:-2px"></ion-icon> <strong>Sem validação geográfica.</strong> O técnico pode executar a OS de qualquer local. Campos do tipo "Validar cerca" apenas registram a posição GPS como evidência.',
    ops_label_address: 'Endereço (busca por nome)',
    ops_label_lat: 'Latitude',
    ops_label_lng: 'Longitude',
    ops_label_radius: 'Raio de aceitação (metros)',
    ops_label_radius_hint: 'Técnico precisa estar dentro deste raio do ponto para ser validado.',
    ops_geo_map_preview: 'Mapa de prévia',
    ops_geo_use_my_location: 'Usar minha localização',
    ops_geo_route_import_title: 'Importar KML de rota (Google Earth / Maps)',
    ops_geo_file_none: 'Nenhum arquivo selecionado…',
    ops_geo_choose_kml: 'Escolher KML',
    ops_geo_route_kml_hint:
      'Suporta arquivos .kml com <strong>LineString</strong> (trajeto) exportados do Google Earth ou Maps.',
    ops_geo_route_tol_lbl: 'Tolerância de desvio (metros)',
    ops_geo_route_tol_hint: 'Distância máxima permitida do trajeto. Padrão: 100 m.',
    ops_geo_point_a: 'Ponto A',
    ops_geo_point_b: 'Ponto B',
    ops_geo_segment_tol_lbl: 'Tolerância (metros) em cada ponta',
    ops_geo_segment_tol_hint: 'Distância permitida ao redor de A ou de B.',
    ops_geo_map_click_twice: 'Mapa (clique 2 vezes)',
    ops_geo_clear_segment: 'Limpar trecho',
    ops_geo_area_import_title: 'Importar KML de área (Google Earth / Maps)',
    ops_geo_polygon_kml_hint:
      'Suporta arquivos .kml com <strong>Polygon</strong> exportados do Google Earth, Google Maps ou QGIS.',
    ops_geo_polygon_json_lbl: 'Ou cole manualmente (JSON)',
    ops_geo_polygon_json_ph:
      '[[lat,lng],[lat,lng],[lat,lng]]\nEx.: [[-23.55,-46.63],[-23.56,-46.63],[-23.56,-46.62]]',
    ops_geo_polygon_preview: 'Visualizar polígono no mapa',
  },
  'en-US': {
    ops_pageTitle: 'BrSpark Admin — Operations Center',
    ops_bc_panel: 'Home',
    ops_bc_current: 'Operations center',
    ops_hero_title: 'Operations center',
    ops_hero_sub:
      'Board for work orders (WO) and routine tasks (RT), scope and technician filters, dispatch, and near real-time refresh.',
    ops_live_dot_title: 'Board auto-refresh on (30 s)',
    ops_board_title: 'WO & RT board',
    ops_scope_title: 'What to show on the board',
    ops_scope_os: 'Work orders only',
    ops_scope_rt: 'Routine tasks only',
    ops_scope_all: 'Work orders and routine tasks',
    ops_filter_all_techs: 'All technicians',
    ops_search_placeholder: 'Search WO, RT, ID, title…',
    ops_limit_label: 'API limit',
    ops_limit_select_title: 'Maximum executions fetched from the API per board refresh',
    ops_limit_opt_100: '100 rows',
    ops_limit_opt_200: '200 rows',
    ops_limit_opt_500: '500 rows',
    ops_refresh: '↻ Refresh',
    ops_dispatch: 'Dispatch WO',
    ops_col_pending: 'Not started',
    ops_col_progress: 'In the field',
    ops_col_completed: 'Completed',
    ops_col_error: 'Error / blocked',
    ops_col_cancelled: 'Cancelled',
    ops_col_filter_pending: 'Filter pending…',
    ops_col_filter_progress: 'Filter in progress…',
    ops_col_filter_completed: 'Filter completed…',
    ops_col_filter_error: 'Filter errors…',
    ops_col_filter_cancelled: 'Filter cancelled…',
    ops_sort_toggle_title: 'Change sort order',
    ops_sort_new_first: 'Newest first',
    ops_sort_old_first: 'Oldest first',
    ops_sort_by_title: 'Sort by',
    ops_sort_key_created: 'Creation date',
    ops_sort_key_due: 'Due date (schedule)',
    ops_sort_key_sync: 'Last sync',
    ops_sort_key_completed: 'Completion date',
    ops_empty_col: 'Nothing here',
    ops_trunc_banner:
      'You are viewing at most {limit} newest rows (API cap). Raise the limit in the toolbar or narrow filters.',
    ops_tenant_chip: 'Organization: {name}',
    ops_tenant_chip_slug: '{name} · {slug}',
    ops_time_dash: '—',
    ops_submission_badge: 'Submission #{n}',
    ops_api_unexpected:
      'The API returned an unexpected format while loading the board. Check the console (F12) or sign in again.',
    ops_detail_pdf_preset_default: 'Default (all blocks)',
    ops_modal_close_aria: 'Close',
    ops_btn_cancel: 'Cancel',
    ops_btn_close: 'Close',
    ops_btn_open: 'Open',
    ops_btn_search: 'Search',
    ops_detail_title: 'Work order details',
    ops_detail_pdf_layout: 'PDF layout',
    ops_detail_pdf_btn: 'PDF',
    ops_detail_pdf_btn_title: 'Export PDF / print',
    ops_detail_tab_info: 'Information',
    ops_detail_tab_report: 'Report',
    ops_detail_tab_raw: 'Debug (JSON)',
    ops_detail_cancel_os: 'Cancel work order',
    ops_rev_pick_title: 'Which submission to open?',
    ops_rev_pick_hint:
      'This work order has more than one completed submission indexed. Choose which snapshot to show in the report and details.',
    ops_rev_snap_title: 'Submission',
    ops_rev_snap_tab_form: 'Report',
    ops_rev_snap_tab_meta: 'Upload metadata',
    ops_rev_snap_tab_json: 'Responses (JSON)',
    ops_reopen_title: 'Reopen for revision',
    ops_reopen_intro_before: 'Work order ',
    ops_reopen_intro_after:
      'returns to “In the field” (same number). Who should perform this revision?',
    ops_reopen_same: 'Keep the same technician',
    ops_reopen_other: 'Assign to another technician',
    ops_reopen_other_hint: 'User signed in on the mobile app',
    ops_reopen_tech_label: 'Technician',
    ops_reopen_confirm: 'Reopen work order',
    ops_card_chat_title: 'Chat for this job (manager & technician)',
    ops_chat_modal_title: 'Job chat · {label}',
    ops_chat_modal_sub: 'Technician: {tech}. History is scoped to this execution only.',
    ops_chat_ph: 'Write a message…',
    ops_chat_send: 'Send',
    ops_chat_loading: 'Loading…',
    ops_chat_empty: 'No messages on this job yet.',
    ops_chat_error: 'Could not load chat.',
    ops_chat_kind_gestor: 'Manager',
    ops_chat_kind_tech: 'Technician',
    ops_chat_missing_id: 'Execution id missing. Refresh the board (F5).',
    ops_chat_empty_send: 'Write a message before sending.',
    ops_dispatch_modal_title: 'Dispatch new work order',
    ops_dispatch_section_design: 'Assignment',
    ops_dispatch_section_design_html:
      '<ion-icon name="clipboard-outline" style="vertical-align:-2px"></ion-icon> Assignment',
    ops_dispatch_section_schedule_html:
      '<ion-icon name="time-outline" style="vertical-align:-2px"></ion-icon> Schedule (time block)',
    ops_dispatch_section_geo_html:
      '<ion-icon name="location-outline" style="vertical-align:-2px"></ion-icon> Service location (geofence)',
    ops_dispatch_email_lbl: 'Technician email *',
    ops_dispatch_email_ph: 'Name or email — suggestions as you type',
    ops_dispatch_suggest_aria: 'Suggested technicians',
    ops_dispatch_template_lbl: 'Form / template *',
    ops_dispatch_template_ph: 'Select a form…',
    ops_dispatch_title_lbl: 'Work order title',
    ops_dispatch_title_ph: 'e.g. Technical inspection — Apt 302',
    ops_dispatch_address_ph: 'e.g. 123 Main St, São Paulo',
    ops_dispatch_desc_lbl: 'Description',
    ops_dispatch_desc_ph: 'Extra instructions for the technician…',
    ops_dispatch_section_schedule: 'Schedule (time block)',
    ops_dispatch_sched_lbl: 'Schedule start *',
    ops_dispatch_sched_hint:
      'Controls when the work order appears on the technician’s calendar (width follows the expected form duration).',
    ops_dispatch_dur_lbl: 'Expected form time (min) — optional',
    ops_dispatch_dur_ph: 'Use form default (or 60 min if empty)',
    ops_dispatch_dur_hint:
      'Checklist filling only, no travel time. Multiples of 5 minutes; minimum 5. If empty, uses the builder default or 60 min.',
    ops_dispatch_planned_end_preview:
      'Expected end (form): {when} — {mins} min of filling (no travel).',
    ops_dispatch_section_geo: 'Service location (geofence)',
    ops_dispatch_geo_point: 'Point',
    ops_dispatch_geo_segment: 'Segment',
    ops_dispatch_geo_route: 'Route',
    ops_dispatch_geo_polygon: 'Polygon',
    ops_dispatch_geo_free: 'None',
    ops_dispatch_send: 'Send work order',
    ops_dispatch_success_alert: '✅ Work order sent successfully!\n{numLine}{geoLine}',
    ops_dispatch_success_num: 'No.: {label}',
    ops_dispatch_success_geo: '\n📍 Validation: {mode}',
    ops_dispatch_geo_val_none: 'None',
    ops_dispatch_geo_val_point: 'Point ({radius} m)',
    ops_dispatch_geo_val_route: 'Route ({radius} m drift tolerance)',
    ops_dispatch_geo_val_segment: 'Segment A↔B ({radius} m at each end)',
    ops_dispatch_geo_val_polygon: 'Polygon',
    ops_dispatch_fail: 'Error: {detail}',
    ops_dispatch_fail_unknown: 'unknown',
    ops_dispatch_fail_network: 'Could not dispatch work order: {detail}',
    ops_dispatch_fail_retry: 'Please try again.',
    ops_geo_radius_help_html:
      '<ion-icon name="location-outline" style="vertical-align:-2px"></ion-icon> <strong>Point:</strong> the technician must be inside the radius around the address.<br/>Rule: <code>distance ≤ radius</code>',
    ops_geo_route_help_html:
      '<ion-icon name="git-branch-outline" style="vertical-align:-2px"></ion-icon> <strong>Route:</strong> the technician must follow the path. Alert if they drift beyond tolerance.<br/>Rule: <code>perpendicular distance to line ≤ tolerance</code>',
    ops_geo_segment_help_html:
      '<ion-icon name="swap-horizontal-outline" style="vertical-align:-2px"></ion-icon> <strong>Segment (A↔B):</strong> the technician must be near <strong>point A</strong> or <strong>point B</strong>.<br/>Fill addresses or coordinates below, or click the map for both points.',
    ops_geo_polygon_help_html:
      '<ion-icon name="shapes-outline" style="vertical-align:-2px"></ion-icon> <strong>Polygon:</strong> the technician must be <strong>inside</strong> the area.<br/>Rule: inside / outside — no edge tolerance.',
    ops_geo_none_help_html:
      '<ion-icon name="warning-outline" style="color:var(--amber);vertical-align:-2px"></ion-icon> <strong>No geographic validation.</strong> The technician can execute the work order from anywhere. “Validate fence” fields only log GPS as evidence.',
    ops_label_address: 'Address (search by name)',
    ops_label_lat: 'Latitude',
    ops_label_lng: 'Longitude',
    ops_label_radius: 'Acceptance radius (meters)',
    ops_label_radius_hint: 'Technician must be inside this radius of the point to validate.',
    ops_geo_map_preview: 'Preview map',
    ops_geo_use_my_location: 'Use my location',
    ops_geo_route_import_title: 'Import route KML (Google Earth / Maps)',
    ops_geo_file_none: 'No file selected…',
    ops_geo_choose_kml: 'Choose KML',
    ops_geo_route_kml_hint:
      'Supports .kml files with a <strong>LineString</strong> (path) exported from Google Earth or Maps.',
    ops_geo_route_tol_lbl: 'Drift tolerance (meters)',
    ops_geo_route_tol_hint: 'Maximum allowed distance from the path. Default: 100 m.',
    ops_geo_point_a: 'Point A',
    ops_geo_point_b: 'Point B',
    ops_geo_segment_tol_lbl: 'Tolerance (meters) at each end',
    ops_geo_segment_tol_hint: 'Allowed distance around A or B.',
    ops_geo_map_click_twice: 'Map (double-click)',
    ops_geo_clear_segment: 'Clear segment',
    ops_geo_area_import_title: 'Import area KML (Google Earth / Maps)',
    ops_geo_polygon_kml_hint:
      'Supports .kml files with a <strong>Polygon</strong> exported from Google Earth, Google Maps, or QGIS.',
    ops_geo_polygon_json_lbl: 'Or paste manually (JSON)',
    ops_geo_polygon_json_ph:
      '[[lat,lng],[lat,lng],[lat,lng]]\nEx.: [[-23.55,-46.63],[-23.56,-46.63],[-23.56,-46.62]]',
    ops_geo_polygon_preview: 'Show polygon on map',
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

export function opsT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

/** Locale BCP-47 para `localeCompare` (nomes na lista de despacho / reabrir). */
export function opsSortLocale() {
  const loc = getAdminUiLocale();
  if (loc === 'en-US') return 'en';
  if (loc === 'es-ES') return 'es';
  return 'pt';
}

/** Linha "Fim previsto…" no despacho (data/hora + cópia conforme locale do painel). */
export function opsDispatchPlannedEndPreviewText(schedStart, durationMinutes) {
  if (!schedStart || !(schedStart instanceof Date) || !Number.isFinite(schedStart.getTime())) return '';
  const mins = Math.max(0, Math.floor(Number(durationMinutes)) || 0);
  const end = new Date(schedStart.getTime() + mins * 60000);
  if (!Number.isFinite(end.getTime())) return '';
  const loc = adminIntlLocale(getAdminUiLocale());
  const when = end.toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
  return opsT('ops_dispatch_planned_end_preview', { when, mins: String(mins) });
}

/** Rótulos ⬇/⬆ nas colunas do Kanban. */
export function opsSortButtonLabel(sortDir) {
  const arrow = sortDir === 'desc' ? '⬇' : '⬆';
  const label = sortDir === 'desc' ? opsT('ops_sort_new_first') : opsT('ops_sort_old_first');
  return `${arrow} ${label}`;
}

/** Texto curto tipo "há 3 min" / "3 min ago" para cartões do quadro. */
/** Data/hora curta nos cartões (dia/mês + hora), conforme locale do painel. */
export function opsFormatCardDateTime(d) {
  if (!d) return opsT('ops_time_dash');
  try {
    const loc = adminIntlLocale(getAdminUiLocale());
    return new Date(d).toLocaleString(loc, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return opsT('ops_time_dash');
  }
}

export function opsFormatTimeAgo(dateStr) {
  if (!dateStr) return opsT('ops_time_dash');
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const loc = adminIntlLocale(getAdminUiLocale());
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  try {
    if (secs < 60) return rtf.format(-secs, 'second');
    if (secs < 3600) return rtf.format(-Math.floor(secs / 60), 'minute');
    if (secs < 86400) return rtf.format(-Math.floor(secs / 3600), 'hour');
    return rtf.format(-Math.floor(secs / 86400), 'day');
  } catch {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)} min`;
    if (secs < 86400) return `${Math.floor(secs / 3600)} h`;
    return `${Math.floor(secs / 86400)} d`;
  }
}

function setLabelFor(forAttr, key) {
  const el =
    document.querySelector(`label.form-label[for="${forAttr}"]`) ||
    document.querySelector(`label[for="${forAttr}"]`);
  if (el) el.textContent = opsT(key);
}

function setBtnWithIcon(btn, iconName, textKey, iconStyle = 'vertical-align:-2px') {
  if (!btn) return;
  btn.textContent = '';
  const icon = document.createElement('ion-icon');
  icon.setAttribute('name', iconName);
  icon.setAttribute('style', iconStyle);
  btn.appendChild(icon);
  btn.appendChild(document.createTextNode(` ${opsT(textKey)}`));
}

function setGeoTabBtn(id, iconName, key) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.innerHTML = `<ion-icon name="${iconName}" style="vertical-align:-2px"></ion-icon> ${opsT(key)}`;
}

/** Espelha o estado visual das abas geo (sem depender de `switchGeoTab`, ainda não definido no carregamento inicial). */
function opsRefreshGeoTabChrome() {
  const mode =
    typeof window !== 'undefined' && window._geoMode ? String(window._geoMode) : 'radius';
  const TAB_COLORS = {
    radius: { bg: '#0f172a', color: '#fff' },
    route: { bg: '#f97316', color: '#fff' },
    segment: { bg: '#eab308', color: '#fff' },
    polygon: { bg: '#3b82f6', color: '#fff' },
    none: { bg: '#64748b', color: '#fff' },
  };
  for (const m of ['radius', 'route', 'segment', 'polygon', 'none']) {
    const panel = document.getElementById(`geo-panel-${m}`);
    if (panel) panel.style.display = m === mode ? 'block' : 'none';
    const btn = document.getElementById(`geo-tab-${m}`);
    if (!btn) continue;
    const active = m === mode;
    const c = TAB_COLORS[m];
    btn.style.background = active ? c.bg : 'transparent';
    btn.style.color = active ? c.color : 'var(--text2)';
    btn.style.boxShadow = active ? '0 2px 6px rgba(0,0,0,0.15)' : 'none';
  }
}

/** Modais estáticos (detalhe, revisões, reabrir, despacho). */
export function applyOperationsModalsStaticI18n() {
  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = opsT(key);
  };
  const setHtml = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opsT(key);
  };

  set('detail-modal-title', 'ops_detail_title');
  const pdfWrapLbl = document.querySelector('#detail-report-preset-wrap label[for="detail-report-preset"]');
  if (pdfWrapLbl) pdfWrapLbl.textContent = opsT('ops_detail_pdf_layout');
  const pdfBtn = document.getElementById('detail-pdf-btn');
  if (pdfBtn) {
    pdfBtn.textContent = '';
    const ic = document.createElement('ion-icon');
    ic.setAttribute('name', 'print-outline');
    ic.setAttribute('style', 'vertical-align:-2px');
    pdfBtn.appendChild(ic);
    pdfBtn.appendChild(document.createTextNode(` ${opsT('ops_detail_pdf_btn')}`));
    pdfBtn.setAttribute('title', opsT('ops_detail_pdf_btn_title'));
  }

  const tabInfo = document.getElementById('tab-info');
  if (tabInfo) {
    tabInfo.innerHTML = `<ion-icon name="clipboard-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_detail_tab_info')}`;
  }
  const tabReport = document.getElementById('tab-report');
  if (tabReport) {
    tabReport.innerHTML = `<ion-icon name="document-text-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_detail_tab_report')}`;
  }
  const tabRaw = document.getElementById('tab-raw');
  if (tabRaw) {
    tabRaw.innerHTML = `<ion-icon name="build-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_detail_tab_raw')}`;
  }

  const cancelOs = document.getElementById('detail-cancel-btn');
  if (cancelOs) {
    cancelOs.textContent = '';
    const ic = document.createElement('ion-icon');
    ic.setAttribute('name', 'trash-outline');
    ic.setAttribute('style', 'vertical-align:-2px');
    cancelOs.appendChild(ic);
    cancelOs.appendChild(document.createTextNode(` ${opsT('ops_detail_cancel_os')}`));
  }
  const detailFoot = document.querySelector('#detail-modal .modal-footer .btn.btn-ghost');
  if (detailFoot && detailFoot.getAttribute('onclick') === 'closeDetailModal()') {
    detailFoot.textContent = opsT('ops_btn_close');
  }

  document.querySelectorAll('#detail-modal .modal-close').forEach((el) => {
    el.setAttribute('aria-label', opsT('ops_modal_close_aria'));
  });

  const revTitle = document.getElementById('revision-picker-dialog-title');
  if (revTitle) {
    revTitle.innerHTML = `<ion-icon name="layers-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_rev_pick_title')}`;
  }
  set('revision-picker-hint', 'ops_rev_pick_hint');
  const revPickFoot = document.querySelectorAll('#revision-picker-modal .modal-footer button');
  if (revPickFoot[0]) revPickFoot[0].textContent = opsT('ops_btn_cancel');
  if (revPickFoot[1]) revPickFoot[1].textContent = opsT('ops_btn_open');
  document.querySelectorAll('#revision-picker-modal .modal-close').forEach((el) => {
    el.setAttribute('aria-label', opsT('ops_modal_close_aria'));
  });

  set('revision-snapshot-title', 'ops_rev_snap_title');
  const rsForm = document.getElementById('rev-snap-tab-form');
  if (rsForm) {
    rsForm.innerHTML = `<ion-icon name="document-text-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_rev_snap_tab_form')}`;
  }
  const rsMeta = document.getElementById('rev-snap-tab-meta');
  if (rsMeta) {
    rsMeta.innerHTML = `<ion-icon name="cloud-upload-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_rev_snap_tab_meta')}`;
  }
  const rsJson = document.getElementById('rev-snap-tab-json');
  if (rsJson) {
    rsJson.innerHTML = `<ion-icon name="code-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_rev_snap_tab_json')}`;
  }
  const rsClose = document.querySelector('#revision-snapshot-modal .modal-footer button');
  if (rsClose) rsClose.textContent = opsT('ops_btn_close');
  document.querySelectorAll('#revision-snapshot-modal .modal-close').forEach((el) => {
    el.setAttribute('aria-label', opsT('ops_modal_close_aria'));
  });

  const reopenTitle = document.getElementById('reopen-revision-modal-title');
  if (reopenTitle) {
    reopenTitle.innerHTML = `<ion-icon name="refresh-circle-outline" style="vertical-align:-2px;color:var(--accent)"></ion-icon> ${opsT('ops_reopen_title')}`;
  }
  set('ops-reopen-intro-before', 'ops_reopen_intro_before');
  set('ops-reopen-intro-after', 'ops_reopen_intro_after');
  set('ops-reopen-lbl-same', 'ops_reopen_same');
  set('ops-reopen-lbl-other', 'ops_reopen_other');
  set('ops-reopen-other-hint', 'ops_reopen_other_hint');
  setLabelFor('reopen-revision-tech-select', 'ops_reopen_tech_label');
  const reopenFoot = document.querySelectorAll('#reopen-revision-modal .modal-footer button');
  if (reopenFoot[0]) reopenFoot[0].textContent = opsT('ops_btn_cancel');
  if (reopenFoot[1]) reopenFoot[1].textContent = opsT('ops_reopen_confirm');
  document.querySelectorAll('#reopen-revision-modal .modal-close').forEach((el) => {
    el.setAttribute('aria-label', opsT('ops_modal_close_aria'));
  });

  document.querySelectorAll('#ops-chat-modal .modal-close').forEach((el) => {
    el.setAttribute('aria-label', opsT('ops_modal_close_aria'));
  });
  const occFoot = document.querySelector('#ops-chat-modal .modal-footer button');
  if (occFoot) occFoot.textContent = opsT('ops_btn_close');
  const occSend = document.getElementById('ops-chat-send-btn');
  if (occSend) occSend.textContent = opsT('ops_chat_send');

  const dispTitle = document.querySelector('#dispatch-modal .modal-header .modal-title');
  if (dispTitle) {
    dispTitle.innerHTML = `<ion-icon name="rocket-outline" style="color:var(--accent);vertical-align:-2px"></ion-icon> ${opsT('ops_dispatch_modal_title')}`;
  }
  document.querySelectorAll('#dispatch-modal .modal-close').forEach((el) => {
    el.setAttribute('aria-label', opsT('ops_modal_close_aria'));
  });

  setHtml('ops-dispatch-sec-design', 'ops_dispatch_section_design_html');
  setHtml('ops-dispatch-sec-schedule', 'ops_dispatch_section_schedule_html');
  setHtml('ops-dispatch-sec-geo', 'ops_dispatch_section_geo_html');

  setLabelFor('d-email', 'ops_dispatch_email_lbl');
  const dEmail = document.getElementById('d-email');
  if (dEmail) dEmail.setAttribute('placeholder', opsT('ops_dispatch_email_ph'));
  const sug = document.getElementById('d-email-suggestions');
  if (sug) sug.setAttribute('aria-label', opsT('ops_dispatch_suggest_aria'));

  setLabelFor('d-template', 'ops_dispatch_template_lbl');
  const dTpl = document.getElementById('d-template');
  if (dTpl && dTpl.options[0]) dTpl.options[0].textContent = opsT('ops_dispatch_template_ph');

  setLabelFor('d-title', 'ops_dispatch_title_lbl');
  const dTitle = document.getElementById('d-title');
  if (dTitle) dTitle.setAttribute('placeholder', opsT('ops_dispatch_title_ph'));
  setLabelFor('d-desc', 'ops_dispatch_desc_lbl');
  const dDesc = document.getElementById('d-desc');
  if (dDesc) dDesc.setAttribute('placeholder', opsT('ops_dispatch_desc_ph'));

  setLabelFor('d-scheduled-start', 'ops_dispatch_sched_lbl');
  setHtml('d-hint-scheduled', 'ops_dispatch_sched_hint');
  setLabelFor('d-expected-duration-override', 'ops_dispatch_dur_lbl');
  const dDur = document.getElementById('d-expected-duration-override');
  if (dDur) dDur.setAttribute('placeholder', opsT('ops_dispatch_dur_ph'));
  setHtml('d-hint-duration', 'ops_dispatch_dur_hint');

  setHtml('geo-help-radius', 'ops_geo_radius_help_html');
  setHtml('geo-help-route', 'ops_geo_route_help_html');
  setHtml('geo-help-segment', 'ops_geo_segment_help_html');
  setHtml('geo-help-polygon', 'ops_geo_polygon_help_html');
  setHtml('geo-help-none', 'ops_geo_none_help_html');

  setGeoTabBtn('geo-tab-radius', 'location-outline', 'ops_dispatch_geo_point');
  setGeoTabBtn('geo-tab-segment', 'swap-horizontal-outline', 'ops_dispatch_geo_segment');
  setGeoTabBtn('geo-tab-route', 'git-branch-outline', 'ops_dispatch_geo_route');
  setGeoTabBtn('geo-tab-polygon', 'shapes-outline', 'ops_dispatch_geo_polygon');
  setGeoTabBtn('geo-tab-none', 'ban-outline', 'ops_dispatch_geo_free');
  opsRefreshGeoTabChrome();

  setLabelFor('d-address', 'ops_label_address');
  const dAddr = document.getElementById('d-address');
  if (dAddr) dAddr.setAttribute('placeholder', opsT('ops_dispatch_address_ph'));
  const geoSearchBtn = document.querySelector('#geo-panel-radius .btn-outline');
  if (geoSearchBtn && geoSearchBtn.getAttribute('onclick') === 'window.geocodeAddress()') {
    setBtnWithIcon(geoSearchBtn, 'search-outline', 'ops_btn_search');
  }
  setLabelFor('d-lat', 'ops_label_lat');
  setLabelFor('d-lng', 'ops_label_lng');
  setLabelFor('d-radius', 'ops_label_radius');
  setHtml('d-hint-radius', 'ops_label_radius_hint');
  set('ops-geo-map-preview-lbl', 'ops_geo_map_preview');
  const useLoc = document.querySelector('#geo-panel-radius .btn-ghost[onclick*="useMyLocation"]');
  if (useLoc) setBtnWithIcon(useLoc, 'radio-outline', 'ops_geo_use_my_location', 'vertical-align:-2px;font-size:10px');

  set('ops-geo-route-import-title', 'ops_geo_route_import_title');
  const dKmlRouteLabel = document.getElementById('d-kml-route-label');
  if (dKmlRouteLabel) dKmlRouteLabel.textContent = opsT('ops_geo_file_none');
  const chooseKmlRoute = document.getElementById('d-kml-route-choose-btn');
  if (chooseKmlRoute) {
    chooseKmlRoute.innerHTML = `<ion-icon name="folder-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_geo_choose_kml')}`;
  }
  setHtml('d-kml-route-status', 'ops_geo_route_kml_hint');
  setLabelFor('d-route-tolerance', 'ops_geo_route_tol_lbl');
  setHtml('d-hint-route-tol', 'ops_geo_route_tol_hint');

  set('ops-geo-point-a', 'ops_geo_point_a');
  set('ops-geo-point-b', 'ops_geo_point_b');
  setLabelFor('d-segment-address-a', 'ops_label_address');
  setLabelFor('d-segment-address-b', 'ops_label_address');
  setLabelFor('d-segment-lat-a', 'ops_label_lat');
  setLabelFor('d-segment-lng-a', 'ops_label_lng');
  setLabelFor('d-segment-lat-b', 'ops_label_lat');
  setLabelFor('d-segment-lng-b', 'ops_label_lng');
  document.querySelectorAll('#geo-panel-segment .btn-outline').forEach((b) => {
    if (String(b.getAttribute('onclick') || '').includes('geocodeSegmentAddress')) {
      setBtnWithIcon(b, 'search-outline', 'ops_btn_search', 'vertical-align:-2px;font-size:10px');
    }
  });
  setLabelFor('d-segment-radius', 'ops_geo_segment_tol_lbl');
  setHtml('d-hint-segment-tol', 'ops_geo_segment_tol_hint');
  set('ops-geo-seg-map-lbl', 'ops_geo_map_click_twice');
  const clearSeg = document.querySelector('#geo-panel-segment .btn-ghost[onclick*="clearSegmentMap"]');
  if (clearSeg) setBtnWithIcon(clearSeg, 'trash-outline', 'ops_geo_clear_segment', 'vertical-align:-2px;font-size:10px');

  set('ops-geo-area-import-title', 'ops_geo_area_import_title');
  const dKmlLabel = document.getElementById('d-kml-label');
  if (dKmlLabel) dKmlLabel.textContent = opsT('ops_geo_file_none');
  const chooseKmlPoly = document.getElementById('d-kml-polygon-choose-btn');
  if (chooseKmlPoly) {
    chooseKmlPoly.innerHTML = `<ion-icon name="folder-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_geo_choose_kml')}`;
  }
  setHtml('d-kml-status', 'ops_geo_polygon_kml_hint');
  setLabelFor('d-polygon', 'ops_geo_polygon_json_lbl');
  const dPoly = document.getElementById('d-polygon');
  if (dPoly) dPoly.setAttribute('placeholder', opsT('ops_geo_polygon_json_ph'));
  const polyPreview = document.getElementById('ops-geo-polygon-preview-btn');
  if (polyPreview) {
    polyPreview.innerHTML = `<ion-icon name="shapes-outline" style="vertical-align:-2px"></ion-icon> ${opsT('ops_geo_polygon_preview')}`;
  }

  const dispFoot = document.querySelectorAll('#dispatch-modal .modal-footer button');
  if (dispFoot[0]) dispFoot[0].textContent = opsT('ops_btn_cancel');
  if (dispFoot[1]) {
    dispFoot[1].textContent = '';
    const ic = document.createElement('ion-icon');
    ic.setAttribute('name', 'rocket-outline');
    ic.setAttribute('style', 'color:var(--accent);vertical-align:-2px');
    dispFoot[1].appendChild(ic);
    dispFoot[1].appendChild(document.createTextNode(` ${opsT('ops_dispatch_send')}`));
  }
}

export function refreshOpsTenantChip() {
  const chip = document.getElementById('ops-tenant-chip');
  if (!chip) return;
  const panelMode = sessionStorage.getItem('brspark_panel_mode') || '';
  let show = false;
  let text = '';
  try {
    const raw = sessionStorage.getItem('brspark_panel_tenant');
    if (raw && panelMode === 'tenant') {
      const t = JSON.parse(raw);
      const name = (t && t.name) || '';
      const slug = (t && t.slug) || '';
      show = Boolean(name || slug);
      text = slug
        ? opsT('ops_tenant_chip_slug', { name: name || slug, slug })
        : opsT('ops_tenant_chip', { name: name || '—' });
    }
  } catch {
    show = false;
  }
  chip.style.display = show ? 'inline-flex' : 'none';
  chip.textContent = text;
  chip.setAttribute('title', text);
}

export function applyOperationsStaticI18n() {
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

  document.title = opsT('ops_pageTitle');
  const bcPanel = document.getElementById('ops-bc-panel');
  if (bcPanel) bcPanel.textContent = opsT('ops_bc_panel');
  set('ops-bc-current', opsT('ops_bc_current'));
  set('ops-hero-title-text', opsT('ops_hero_title'));
  const sub = document.getElementById('ops-hero-sub');
  if (sub) sub.textContent = opsT('ops_hero_sub');
  const liveDot = document.getElementById('ops-live-dot');
  if (liveDot) liveDot.setAttribute('title', opsT('ops_live_dot_title'));

  const scopeSel = document.getElementById('filter-scope');
  if (scopeSel) {
    scopeSel.setAttribute('title', opsT('ops_scope_title'));
    const o = (v) => scopeSel.querySelector(`option[value="${v}"]`);
    const os = o('os');
    const rt = o('rt');
    const all = o('all');
    if (os) os.textContent = opsT('ops_scope_os');
    if (rt) rt.textContent = opsT('ops_scope_rt');
    if (all) all.textContent = opsT('ops_scope_all');
  }

  const search = document.getElementById('filter-search');
  if (search) search.setAttribute('placeholder', opsT('ops_search_placeholder'));

  const limLbl = document.getElementById('ops-limit-label');
  if (limLbl) limLbl.textContent = opsT('ops_limit_label');
  const limSel = document.getElementById('ops-limit-select');
  if (limSel) {
    limSel.setAttribute('title', opsT('ops_limit_select_title'));
    const q = (v) => limSel.querySelector(`option[value="${v}"]`);
    const o100 = q('100');
    const o200 = q('200');
    const o500 = q('500');
    if (o100) o100.textContent = opsT('ops_limit_opt_100');
    if (o200) o200.textContent = opsT('ops_limit_opt_200');
    if (o500) o500.textContent = opsT('ops_limit_opt_500');
  }

  const refBtn = document.getElementById('ops-btn-refresh');
  if (refBtn) refBtn.textContent = opsT('ops_refresh');
  const dispBtn = document.getElementById('ops-btn-dispatch');
  if (dispBtn) {
    dispBtn.textContent = '';
    const icon = document.createElement('ion-icon');
    icon.setAttribute('name', 'rocket-outline');
    icon.style.cssText = 'color:var(--accent);vertical-align:-2px';
    dispBtn.appendChild(icon);
    dispBtn.appendChild(document.createTextNode(` ${opsT('ops_dispatch')}`));
  }

  set('ops-board-title', opsT('ops_board_title'));

  set('ops-h-pending', opsT('ops_col_pending'));
  set('ops-h-progress', opsT('ops_col_progress'));
  set('ops-h-completed', opsT('ops_col_completed'));
  set('ops-h-error', opsT('ops_col_error'));
  set('ops-h-cancelled', opsT('ops_col_cancelled'));

  const ph = [
    ['ops-f-pending', 'ops_col_filter_pending'],
    ['ops-f-progress', 'ops_col_filter_progress'],
    ['ops-f-completed', 'ops_col_filter_completed'],
    ['ops-f-error', 'ops_col_filter_error'],
    ['ops-f-cancelled', 'ops_col_filter_cancelled'],
  ];
  for (const [id, key] of ph) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('placeholder', opsT(key));
  }

  const sortIds = ['pending', 'progress', 'completed', 'error', 'cancelled'];
  const sortKeyOpts = [
    ['created', 'ops_sort_key_created'],
    ['due', 'ops_sort_key_due'],
    ['sync', 'ops_sort_key_sync'],
    ['completed', 'ops_sort_key_completed'],
  ];
  for (const col of sortIds) {
    const sel = document.getElementById(`ops-sort-key-${col}`);
    if (sel) {
      sel.setAttribute('title', opsT('ops_sort_by_title'));
      sel.setAttribute('aria-label', opsT('ops_sort_by_title'));
      for (const opt of sel.querySelectorAll('option[data-ops-sort-key]')) {
        const k = opt.getAttribute('data-ops-sort-key');
        const map = sortKeyOpts.find((x) => x[0] === k);
        if (map) opt.textContent = opsT(map[1]);
      }
      try {
        const st = window.__opsColState && window.__opsColState[col];
        const key = st && st.sortKey && sortKeyOpts.some((x) => x[0] === st.sortKey) ? st.sortKey : 'created';
        sel.value = key;
      } catch {
        sel.value = 'created';
      }
    }
    const btn = document.getElementById(`sort-btn-${col}`);
    if (btn) {
      btn.setAttribute('title', opsT('ops_sort_toggle_title'));
      try {
        const st = window.__opsColState && window.__opsColState[col];
        const dir = st && st.sort ? st.sort : 'desc';
        btn.textContent = opsSortButtonLabel(dir);
      } catch {
        btn.textContent = opsSortButtonLabel('desc');
      }
    }
  }

  applyOperationsModalsStaticI18n();
  refreshOpsTenantChip();
}
