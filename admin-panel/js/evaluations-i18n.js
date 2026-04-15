/**
 * Qualidade & Avaliações (painel admin) — pt-BR e en-US.
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { mpT } from './menu-pages-i18n.js';

const M = {
  'pt-BR': {
    ev_pageTitle: 'BrSpark Admin — Qualidade e avaliações',
    ev_bc_panel: 'Painel',
    ev_bc_page: 'Qualidade e avaliações',
    ev_hero_title: 'Avaliações e Minha Produtividade',
    ev_hero_sub_html:
      'Controle de templates, regras de disparo (ex.: OS sincronizada), instâncias, disputas e ranking. O template <strong>CLIENT</strong> ativo com evento <strong>OS_SYNCED</strong> é o usado ao sincronizar uma OS (o registro mais recentemente atualizado prevalece).',
    ev_filter_tenant: 'Tenant',
    ev_tenant_all: 'Todos os tenants',
    ev_refresh: 'Atualizar',
    ev_tab_resumo: 'Resumo',
    ev_tab_disputas: 'Disputas',
    ev_tab_instancias: 'Instâncias',
    ev_tab_templates: 'Templates',
    ev_tab_ranking: 'Ranking técnicos',
    ev_st_inst90: 'Instâncias (90d)',
    ev_st_pend: 'Pendentes',
    ev_st_avg: 'Média 0–100',
    ev_st_crit: 'Críticas',
    ev_st_rate: 'Taxa resposta %',
    ev_dispute_state_lbl: 'Estado',
    ev_dispute_pending: 'Pendentes',
    ev_dispute_all: 'Todas',
    ev_dispute_res_maintain: 'Resolvidas — manter',
    ev_dispute_res_adjusted: 'Resolvidas — ajustadas',
    ev_dispute_res_invalid: 'Resolvidas — invalidadas',
    ev_disputes_panel_title: 'Revisões / disputas',
    ev_disputes_hint_html:
      'Use <strong>Ver conversa</strong> para listar mensagens do chat técnico–cliente na janela da OS (requer e-mail do cliente na metadata da execução e sala 1:1 existente). O acesso fica registado na auditoria.',
    ev_th_tech: 'Técnico',
    ev_th_os_note: 'OS / nota',
    ev_th_just: 'Justificativa',
    ev_th_actions: 'Ações',
    ev_inst_state_lbl: 'Estado instância',
    ev_inst_all: 'Todos',
    ev_st_PENDING: 'Pendente',
    ev_st_RESPONDED: 'Respondida',
    ev_st_IN_REVIEW: 'Em revisão',
    ev_st_FINALIZED: 'Finalizada',
    ev_inst_panel_title: 'Instâncias recentes',
    ev_inst_hint_html:
      'Instâncias <strong>PENDING</strong> mostram o URL completo do formulário web (<code>evaluation-survey.html</code>). Use copiar para enviar ao cliente ou pré-visualizar abaixo.',
    ev_th_status: 'Estado',
    ev_th_template: 'Template',
    ev_th_tech2: 'Técnico',
    ev_th_os: 'OS',
    ev_th_url: 'URL do formulário web',
    ev_preview_title: 'Pré-visualização do formulário (iframe)',
    ev_preview_close: 'Fechar',
    ev_preview_iframe_title: 'Formulário de avaliação ao cliente',
    ev_preview_hint_html:
      'Se o quadro ficar vazio, o servidor pode bloquear iframes (<code>X-Frame-Options</code>). Nesse caso use <strong>Abrir</strong> ou copie o URL.',
    ev_btn_new_template: '+ Novo template',
    ev_tpl_panel_title: 'Templates de avaliação',
    ev_th_name: 'Nome',
    ev_th_type: 'Tipo',
    ev_th_tenant: 'Tenant',
    ev_th_questions: 'Perguntas',
    ev_th_instances: 'Instâncias',
    ev_ranking_title: 'Média por técnico (período dos KPIs)',
    ev_th_rank_name: 'Nome',
    ev_th_rank_email: 'E-mail',
    ev_th_rank_avg: 'Média',
    ev_th_rank_count: 'Nº avaliações',
    ev_modal_tpl_title: 'Template',
    ev_lbl_tenant: 'Tenant',
    ev_tenant_pick: '— Escolha o tenant —',
    ev_lbl_tpl_name: 'Nome do template',
    ev_ph_tpl_name: 'Ex.: Satisfação pós-visita',
    ev_lbl_type: 'Tipo',
    ev_opt_client: 'CLIENT (cliente)',
    ev_opt_audit: 'AUDIT',
    ev_opt_internal: 'INTERNAL',
    ev_active: 'Ativo',
    ev_trigger_rules: 'Regras de disparo',
    ev_trigger_os_synced: 'Criar avaliação quando a OS for sincronizada (SYNCED)',
    ev_trigger_hint_html:
      'Gravado em <code>triggerRules.events</code> (ex.: <code>OS_SYNCED</code>). Apenas templates <strong>CLIENT</strong> ativos com este evento e com perguntas são elegíveis; usa-se o mais recentemente atualizado.',
    ev_questions: 'Perguntas',
    ev_add_question: '+ Pergunta',
    ev_cancel: 'Cancelar',
    ev_save: 'Salvar',
    ev_chat_modal_title: 'Chat técnico — cliente (auditoria)',
    ev_chat_close: 'Fechar',
    ev_chat_download_json: 'Baixar JSON',
    ev_dispute_modal_title: 'Resolver disputa',
    ev_lbl_new_score: 'Nova nota global (0–100)',
    ev_lbl_resolution_note: 'Nota de resolução (opcional)',
    ev_ph_resolution_note: 'Comentário interno',
    ev_dispute_confirm: 'Confirmar',
    ev_loading: 'Carregando…',
    ev_ranking_need_resumo: 'Abra o separador Resumo para carregar dados.',
    ev_no_data_period: 'Sem dados no período.',
    ev_no_records: 'Nenhum registro.',
    ev_no_instances: 'Sem instâncias.',
    ev_no_templates: 'Sem templates.',
    ev_justify_view: 'Ver justificativa',
    ev_note_prefix: '(nota {score})',
    ev_btn_chat: 'Ver conversa',
    ev_btn_maintain: 'Manter',
    ev_btn_adjust: 'Ajustar nota',
    ev_btn_invalidate: 'Invalidar',
    ev_btn_open: 'Abrir',
    ev_btn_copy_url: 'Copiar URL',
    ev_btn_preview: 'Pré-visualizar',
    ev_btn_regen: 'Novo token',
    ev_btn_edit: 'Editar',
    ev_dispute_title_maintain: 'Manter avaliação',
    ev_dispute_title_adjust: 'Ajustar nota global',
    ev_dispute_title_invalidate: 'Invalidar avaliação',
    ev_tpl_title_new: 'Novo template',
    ev_tpl_title_edit: 'Editar template',
    ev_tpl_instances_hint: 'Este template tem {n} instância(s). Não pode remover perguntas já respondidas.',
    ev_q_placeholder: 'Texto da pergunta',
    ev_q_weight_title: 'Peso',
    ev_q_required: 'obrig.',
    ev_q_cat_placeholder: 'categoryKey (ex.: qualidade, prazo) — usado na média por categoria',
    ev_collect_default_q: 'Pergunta',
    ev_default_q1: 'Qualidade do serviço',
    ev_default_q2: 'Cumprimento de prazos',
    ev_default_q3: 'Atendimento',
    ev_resolution_default_note: 'Painel qualidade',
    ev_alert_transcript: 'Não foi possível carregar a transcrição.',
    ev_alert_name_tpl: 'Indique o nome do template.',
    ev_alert_tenant: 'Escolha o tenant.',
    ev_alert_questions: 'Adicione pelo menos uma pergunta.',
    ev_alert_adjust_score: 'Indique uma nota numérica para ajuste.',
    ev_alert_err: 'Erro',
    ev_alert_copy_fail: 'Não foi possível copiar automaticamente. Selecione o texto na caixa acima e use Ctrl+C / ⌘C.',
    ev_copied: 'Copiado!',
    ev_chat_meta_html: '<strong>OS</strong> {os} · <strong>Sala</strong> {room} · <strong>{n}</strong> mensagem(ns)',
    ev_chat_line_instance: 'Instância de avaliação: {id}',
    ev_chat_line_os: 'OS: {os} | Execução: {ex}',
    ev_chat_line_people: 'Técnico: {tech} | Cliente (metadata): {client}',
    ev_chat_line_room: 'Sala de chat: {room}',
    ev_chat_line_window: 'Janela temporal: {from} → {to}',
    ev_chat_warnings: 'AVISOS:',
    ev_chat_no_msgs: '(Sem mensagens de texto/foto nesta janela.)',
    ev_chat_msgs_header: 'Mensagens ({n}):',
    ev_chat_msg_head: '[{at}] {name} <{id}> ({type})',
    ev_chat_media: '[arquivo] {url}',
  },
  'en-US': {
    ev_pageTitle: 'BrSpark Admin — Quality & evaluations',
    ev_bc_panel: 'Home',
    ev_bc_page: 'Quality & evaluations',
    ev_hero_title: 'Evaluations & My Productivity',
    ev_hero_sub_html:
      'Manage templates, trigger rules (e.g. synced work order), instances, disputes and rankings. The active <strong>CLIENT</strong> template with <strong>OS_SYNCED</strong> is used when an WO syncs (the most recently updated record wins).',
    ev_filter_tenant: 'Tenant',
    ev_tenant_all: 'All tenants',
    ev_refresh: 'Refresh',
    ev_tab_resumo: 'Overview',
    ev_tab_disputas: 'Disputes',
    ev_tab_instancias: 'Instances',
    ev_tab_templates: 'Templates',
    ev_tab_ranking: 'Technician ranking',
    ev_st_inst90: 'Instances (90d)',
    ev_st_pend: 'Pending',
    ev_st_avg: 'Average 0–100',
    ev_st_crit: 'Critical',
    ev_st_rate: 'Response rate %',
    ev_dispute_state_lbl: 'Status',
    ev_dispute_pending: 'Pending',
    ev_dispute_all: 'All',
    ev_dispute_res_maintain: 'Resolved — keep',
    ev_dispute_res_adjusted: 'Resolved — adjusted',
    ev_dispute_res_invalid: 'Resolved — invalidated',
    ev_disputes_panel_title: 'Reviews / disputes',
    ev_disputes_hint_html:
      'Use <strong>View conversation</strong> to list technician–client chat messages for the WO window (requires client email in execution metadata and an existing 1:1 room). Access is logged in audit.',
    ev_th_tech: 'Technician',
    ev_th_os_note: 'WO / score',
    ev_th_just: 'Justification',
    ev_th_actions: 'Actions',
    ev_inst_state_lbl: 'Instance status',
    ev_inst_all: 'All',
    ev_st_PENDING: 'Pending',
    ev_st_RESPONDED: 'Responded',
    ev_st_IN_REVIEW: 'In review',
    ev_st_FINALIZED: 'Finalized',
    ev_inst_panel_title: 'Recent instances',
    ev_inst_hint_html:
      '<strong>PENDING</strong> instances show the full web survey URL (<code>evaluation-survey.html</code>). Copy to send to the client or preview below.',
    ev_th_status: 'Status',
    ev_th_template: 'Template',
    ev_th_tech2: 'Technician',
    ev_th_os: 'WO',
    ev_th_url: 'Web survey URL',
    ev_preview_title: 'Survey preview (iframe)',
    ev_preview_close: 'Close',
    ev_preview_iframe_title: 'Client evaluation form',
    ev_preview_hint_html:
      'If the frame is blank, the server may block iframes (<code>X-Frame-Options</code>). In that case use <strong>Open</strong> or copy the URL.',
    ev_btn_new_template: '+ New template',
    ev_tpl_panel_title: 'Evaluation templates',
    ev_th_name: 'Name',
    ev_th_type: 'Type',
    ev_th_tenant: 'Tenant',
    ev_th_questions: 'Questions',
    ev_th_instances: 'Instances',
    ev_ranking_title: 'Average per technician (KPI period)',
    ev_th_rank_name: 'Name',
    ev_th_rank_email: 'Email',
    ev_th_rank_avg: 'Average',
    ev_th_rank_count: 'Evaluations',
    ev_modal_tpl_title: 'Template',
    ev_lbl_tenant: 'Tenant',
    ev_tenant_pick: '— Select tenant —',
    ev_lbl_tpl_name: 'Template name',
    ev_ph_tpl_name: 'e.g. Post-visit satisfaction',
    ev_lbl_type: 'Type',
    ev_opt_client: 'CLIENT (customer)',
    ev_opt_audit: 'AUDIT',
    ev_opt_internal: 'INTERNAL',
    ev_active: 'Active',
    ev_trigger_rules: 'Trigger rules',
    ev_trigger_os_synced: 'Create evaluation when the WO is synced (SYNCED)',
    ev_trigger_hint_html:
      'Stored in <code>triggerRules.events</code> (e.g. <code>OS_SYNCED</code>). Only active <strong>CLIENT</strong> templates with this event and questions are eligible; the most recently updated wins.',
    ev_questions: 'Questions',
    ev_add_question: '+ Question',
    ev_cancel: 'Cancel',
    ev_save: 'Save',
    ev_chat_modal_title: 'Technician — client chat (audit)',
    ev_chat_close: 'Close',
    ev_chat_download_json: 'Download JSON',
    ev_dispute_modal_title: 'Resolve dispute',
    ev_lbl_new_score: 'New overall score (0–100)',
    ev_lbl_resolution_note: 'Resolution note (optional)',
    ev_ph_resolution_note: 'Internal comment',
    ev_dispute_confirm: 'Confirm',
    ev_loading: 'Loading…',
    ev_ranking_need_resumo: 'Open the Overview tab to load data.',
    ev_no_data_period: 'No data in the period.',
    ev_no_records: 'No records.',
    ev_no_instances: 'No instances.',
    ev_no_templates: 'No templates.',
    ev_justify_view: 'View justification',
    ev_note_prefix: '(score {score})',
    ev_btn_chat: 'View conversation',
    ev_btn_maintain: 'Keep',
    ev_btn_adjust: 'Adjust score',
    ev_btn_invalidate: 'Invalidate',
    ev_btn_open: 'Open',
    ev_btn_copy_url: 'Copy URL',
    ev_btn_preview: 'Preview',
    ev_btn_regen: 'New token',
    ev_btn_edit: 'Edit',
    ev_dispute_title_maintain: 'Keep evaluation',
    ev_dispute_title_adjust: 'Adjust overall score',
    ev_dispute_title_invalidate: 'Invalidate evaluation',
    ev_tpl_title_new: 'New template',
    ev_tpl_title_edit: 'Edit template',
    ev_tpl_instances_hint: 'This template has {n} instance(s). You cannot remove questions that were already answered.',
    ev_q_placeholder: 'Question text',
    ev_q_weight_title: 'Weight',
    ev_q_required: 'req.',
    ev_q_cat_placeholder: 'categoryKey (e.g. quality, deadline) — used in per-category average',
    ev_collect_default_q: 'Question',
    ev_default_q1: 'Service quality',
    ev_default_q2: 'Deadline adherence',
    ev_default_q3: 'Customer service',
    ev_resolution_default_note: 'Quality panel',
    ev_alert_transcript: 'Could not load the transcript.',
    ev_alert_name_tpl: 'Enter the template name.',
    ev_alert_tenant: 'Choose a tenant.',
    ev_alert_questions: 'Add at least one question.',
    ev_alert_adjust_score: 'Enter a numeric score for the adjustment.',
    ev_alert_err: 'Error',
    ev_alert_copy_fail: 'Could not copy automatically. Select the text in the box above and use Ctrl+C / ⌘C.',
    ev_copied: 'Copied!',
    ev_chat_meta_html: '<strong>WO</strong> {os} · <strong>Room</strong> {room} · <strong>{n}</strong> message(s)',
    ev_chat_line_instance: 'Evaluation instance: {id}',
    ev_chat_line_os: 'WO: {os} | Execution: {ex}',
    ev_chat_line_people: 'Technician: {tech} | Client (metadata): {client}',
    ev_chat_line_room: 'Chat room: {room}',
    ev_chat_line_window: 'Time window: {from} → {to}',
    ev_chat_warnings: 'WARNINGS:',
    ev_chat_no_msgs: '(No text/photo messages in this window.)',
    ev_chat_msgs_header: 'Messages ({n}):',
    ev_chat_msg_head: '[{at}] {name} <{id}> ({type})',
    ev_chat_media: '[file] {url}',
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

export function evT(key, vars) {
  const loc = getAdminUiLocale();
  const pack = M[loc] || M['pt-BR'];
  const raw = pack[key] != null ? pack[key] : M['pt-BR'][key] != null ? M['pt-BR'][key] : key;
  return vars ? interpolate(raw, vars) : raw;
}

function setText(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = vars ? evT(key, vars) : evT(key);
}

function setHtml(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = vars ? evT(key, vars) : evT(key);
}

export function applyEvaluationsStaticI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = loc === 'en-US' ? 'en-US' : 'pt-BR';
  } catch {
    /* ignore */
  }
  document.title = evT('ev_pageTitle');
  const bcPanel = document.getElementById('mpc-bc-panel');
  if (bcPanel) bcPanel.textContent = mpT('common_bc_panel');
  setText('mpc-bc-here', 'ev_bc_page');
  setText('mpc-hero-title', 'ev_hero_title');
  setHtml('mpc-hero-sub', 'ev_hero_sub_html');
  setText('ev-filter-tenant-lbl', 'ev_filter_tenant');
  const opt0 = document.querySelector('#filter-tenant option[value=""]');
  if (opt0) opt0.textContent = evT('ev_tenant_all');
  setText('btn-refresh', 'ev_refresh');
  setText('ev-tab-resumo', 'ev_tab_resumo');
  setText('ev-tab-disputas', 'ev_tab_disputas');
  setText('ev-tab-instancias', 'ev_tab_instancias');
  setText('ev-tab-templates', 'ev_tab_templates');
  setText('ev-tab-ranking', 'ev_tab_ranking');
  setText('ev-st-lbl-total', 'ev_st_inst90');
  setText('ev-st-lbl-pend', 'ev_st_pend');
  setText('ev-st-lbl-avg', 'ev_st_avg');
  setText('ev-st-lbl-crit', 'ev_st_crit');
  setText('ev-st-lbl-rate', 'ev_st_rate');
  setText('ev-dispute-state-lbl', 'ev_dispute_state_lbl');
  const dsel = document.getElementById('dispute-status-filter');
  if (dsel) {
    const opts = ['PENDING', 'ALL', 'MAINTAIN_EVAL', 'ADJUSTED', 'INVALIDATED'];
    const keys = ['ev_dispute_pending', 'ev_dispute_all', 'ev_dispute_res_maintain', 'ev_dispute_res_adjusted', 'ev_dispute_res_invalid'];
    [...dsel.options].forEach((op, i) => {
      if (keys[i]) op.textContent = evT(keys[i]);
    });
  }
  setText('ev-disputes-panel-title', 'ev_disputes_panel_title');
  setHtml('ev-disputes-hint', 'ev_disputes_hint_html');
  setText('ev-th-dispute-tech', 'ev_th_tech');
  setText('ev-th-dispute-os', 'ev_th_os_note');
  setText('ev-th-dispute-just', 'ev_th_just');
  setText('ev-th-dispute-actions', 'ev_th_actions');
  setText('ev-inst-state-lbl', 'ev_inst_state_lbl');
  const isel = document.getElementById('instance-status-filter');
  if (isel) {
    const first = isel.querySelector('option[value=""]');
    if (first) first.textContent = evT('ev_inst_all');
    const stMap = { PENDING: 'ev_st_PENDING', RESPONDED: 'ev_st_RESPONDED', IN_REVIEW: 'ev_st_IN_REVIEW', FINALIZED: 'ev_st_FINALIZED' };
    [...isel.options].forEach((op) => {
      const k = stMap[op.value];
      if (k) op.textContent = evT(k);
    });
  }
  setText('ev-inst-panel-title', 'ev_inst_panel_title');
  setHtml('ev-inst-hint', 'ev_inst_hint_html');
  setText('ev-th-inst-status', 'ev_th_status');
  setText('ev-th-inst-template', 'ev_th_template');
  setText('ev-th-inst-tech', 'ev_th_tech2');
  setText('ev-th-inst-os', 'ev_th_os');
  setText('ev-th-inst-url', 'ev_th_url');
  setText('ev-th-inst-actions', 'ev_th_actions');
  setText('ev-preview-title', 'ev_preview_title');
  setText('eval-survey-preview-close', 'ev_preview_close');
  const ifr = document.getElementById('eval-survey-iframe');
  if (ifr) ifr.title = evT('ev_preview_iframe_title');
  setHtml('ev-preview-hint', 'ev_preview_hint_html');
  setText('btn-new-template', 'ev_btn_new_template');
  setText('ev-tpl-panel-title', 'ev_tpl_panel_title');
  setText('ev-th-tpl-name', 'ev_th_name');
  setText('ev-th-tpl-type', 'ev_th_type');
  setText('ev-th-tpl-tenant', 'ev_th_tenant');
  setText('ev-th-tpl-q', 'ev_th_questions');
  setText('ev-th-tpl-inst', 'ev_th_instances');
  setText('ev-th-tpl-actions', 'ev_th_actions');
  setText('ev-ranking-panel-title', 'ev_ranking_title');
  setText('ev-th-rank-name', 'ev_th_rank_name');
  setText('ev-th-rank-email', 'ev_th_rank_email');
  setText('ev-th-rank-avg', 'ev_th_rank_avg');
  setText('ev-th-rank-count', 'ev_th_rank_count');
  setText('tpl-modal-title', 'ev_modal_tpl_title');
  setText('ev-lbl-tpl-tenant', 'ev_lbl_tenant');
  setText('ev-lbl-tpl-name', 'ev_lbl_tpl_name');
  const tn = document.getElementById('tpl-name');
  if (tn) tn.placeholder = evT('ev_ph_tpl_name');
  setText('ev-lbl-tpl-type', 'ev_lbl_type');
  const tt = document.getElementById('tpl-type');
  if (tt) {
    const tk = ['ev_opt_client', 'ev_opt_audit', 'ev_opt_internal'];
    [...tt.options].forEach((op, i) => {
      if (tk[i]) op.textContent = evT(tk[i]);
    });
  }
  setText('ev-tpl-active-text', 'ev_active');
  setText('ev-tpl-trigger-title', 'ev_trigger_rules');
  setText('ev-tpl-rule-os-text', 'ev_trigger_os_synced');
  setHtml('ev-tpl-trigger-hint', 'ev_trigger_hint_html');
  setText('ev-tpl-questions-lbl', 'ev_questions');
  setText('tpl-add-question', 'ev_add_question');
  setText('tpl-modal-cancel', 'ev_cancel');
  setText('tpl-modal-save', 'ev_save');
  setText('chat-transcript-title', 'ev_chat_modal_title');
  setText('chat-transcript-close', 'ev_chat_close');
  setText('chat-transcript-json', 'ev_chat_download_json');
  setText('dispute-modal-title', 'ev_dispute_modal_title');
  setText('ev-lbl-dispute-score', 'ev_lbl_new_score');
  setText('ev-lbl-dispute-note', 'ev_lbl_resolution_note');
  const dn = document.getElementById('dispute-modal-note');
  if (dn) dn.placeholder = evT('ev_ph_resolution_note');
  setText('dispute-modal-cancel', 'ev_cancel');
  setText('dispute-modal-confirm', 'ev_dispute_confirm');
  setText('ev-loading-disputes', 'ev_loading');
  setText('ev-loading-inst', 'ev_loading');
  setText('ev-loading-tpl', 'ev_loading');
  setText('ev-loading-ranking', 'ev_ranking_need_resumo');
}
