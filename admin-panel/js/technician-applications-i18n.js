/**
 * Cadastro de prestadores, pt-BR, en-US e es-ES (locale do painel).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang, adminIntlLocale } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    tp_pageTitle: 'Aria Admin — Prestadores · Candidaturas',
    tp_bc_panel: 'Painel',
    tp_bc_prestadores: 'Prestadores',
    tp_bc_here: 'Candidaturas',
    tp_hero_title: 'Candidaturas (onboarding)',
    tp_hero_sub_html:
      'Convites, revisão e aprovação do formulário global. O hub <a href="prestadores.html" style="color:var(--accent);font-weight:600">Prestadores</a> concentra parcerias e vínculos; aqui ficam as <em>candidaturas</em> e perfis «Perfil sem candidatura». Use «Convidar por e-mail» para enviar o link.',
    tp_back_prestadores: 'Voltar a Prestadores',
    tp_filter_state: 'Estado',
    tp_search_lbl: 'Busca',
    tp_search_ph: 'E-mail, nome do tenant ou nome do usuário (órfãos)…',
    tp_filt_all: 'Todos (candidaturas + perfil sem formulário)',
    tp_filt_orphan: 'Só perfil pendente sem candidatura',
    tp_filt_invited: 'Convidado',
    tp_filt_draft: 'Rascunho',
    tp_filt_submitted: 'Submetido',
    tp_filt_needs_rev: 'Aguardando correção',
    tp_filt_approved: 'Aprovado',
    tp_filt_rejected: 'Recusado',
    tp_btn_invite: 'Convidar por e-mail',
    tp_table_title: 'Candidaturas',
    tp_th_email: 'E-mail',
    tp_th_tenant: 'Tenant',
    tp_th_state: 'Estado',
    tp_th_updated: 'Atualizado',
    tp_th_actions: 'Ações',
    tp_loading: 'Carregando…',
    tp_err_load: 'Erro ao carregar',
    tp_empty_title: 'Nenhuma candidatura neste filtro',
    tp_empty_sub: 'Altere o estado ou envie um convite com «Convidar por e-mail».',
    tp_badge_orphan: 'Perfil sem candidatura',
    tp_badge_orphan_title:
      'Há TechnicianProfile PENDING mas não há candidatura de cadastro em curso',
    tp_act_user: 'Usuário',
    tp_act_invite: 'Criar convite',
    tp_act_open: 'Abrir',
    tp_detail_title: 'Candidatura',
    tp_detail_back: '← Voltar à lista',
    tp_detail_state: 'Estado',
    tp_detail_revision: 'Mensagem ao candidato:',
    tp_detail_summary_email: 'E-mail convidado',
    tp_detail_summary_tenant: 'Tenant',
    tp_detail_summary_status: 'Estado',
    tp_detail_summary_submitted: 'Submetido em',
    tp_detail_summary_created: 'Criado em',
    tp_detail_summary_name: 'Nome no formulário',
    tp_detail_json_summary: 'Registro completo (JSON)',
    tp_hist_title: 'Histórico',
    tp_wait_submit: 'Aguardando submissão do candidato (link com token enviado no convite).',
    tp_open_created_user: 'Abrir usuário criado',
    tp_act_approve: 'Aprovar e criar prestador',
    tp_act_approve_loading: 'A criar prestador…',
    tp_act_revision: 'Pedir ajustes',
    tp_act_reject: 'Recusar',
    tp_modal_invite_title: 'Convidar prestador',
    tp_modal_invite_note_html:
      '<strong>Requisito:</strong> o prestador já deve ter <strong>conta no app Aria</strong> com o <strong>mesmo e-mail</strong> que você vai convidar (cadastro na aba «Criar conta» na tela de login do app). Se ainda não existir usuário com esse e-mail, o convite não será criado.',
    tp_lbl_invite_email: 'E-mail do candidato *',
    tp_ph_invite_email: 'tecnico@exemplo.com',
    tp_lbl_invite_tenant: 'Tenant (conta) *',
    tp_hint_invite_tenant: 'Necessário no modo global da plataforma.',
    tp_cancel: 'Cancelar',
    tp_invite_submit: 'Enviar convite',
    tp_modal_rev_title: 'Pedir ajustes ao candidato',
    tp_lbl_revision_template: 'Template de ajustes',
    tp_revision_tpl_placeholder: 'Escolher template…',
    tp_revision_tpl_docs:
      'Revise e reenviar os documentos obrigatórios: a foto do documento deve estar legível, sem cortes e sem reflexos; também confirme tipo e número do documento.',
    tp_revision_tpl_face:
      'Refaça as fotos de biometria facial: envie imagens nítidas, apenas do seu rosto, com boa iluminação e sem outras pessoas no enquadramento.',
    tp_revision_tpl_schedule_regions:
      'Complete disponibilidade e regiões atendidas: marque pelo menos um dia/horário e selecione as bases onde você pode atuar.',
    tp_revision_tpl_data:
      'Atualize os dados cadastrais: confirme nome completo, telefone de contato e endereço (cidade/UF) antes de reenviar.',
    tp_ph_revision: 'Descreva o que falta ou deve ser corrigido…',
    tp_rev_submit: 'Enviar pedido',
    tp_alert_email: 'Informe o e-mail.',
    tp_alert_tenant: 'Selecione o tenant.',
    tp_alert_rev_msg: 'Escreva a mensagem.',
    tp_cf_approve: 'Aprovar esta candidatura? Será criado o usuário prestador com os dados submetidos.',
    tp_cf_approve_early:
      'Aprovar agora, mesmo sem o candidato ter enviado o formulário? A conta já existente neste tenant será ativada como prestador com os dados que constam no registo (o que estiver vazio permanece em branco ou com valores por omissão).',
    tp_ok_approve: 'Prestador criado e ativado com sucesso.',
    tp_prompt_reject: 'Motivo da recusa (obrigatório):',
    tp_invite_email_sent: 'Um e-mail com o convite foi enviado ao candidato (Nylas).',
    tp_invite_email_skipped: 'E-mail não enviado: {detail}',
    tp_invite_email_skipped_default: 'configure Nylas (API Key + Grant ID) no servidor ou em Integrações.',
    tp_invite_email_fail: 'Aviso: o convite foi criado, mas o envio por e-mail falhou: {detail}',
    tp_invite_email_fail_unknown: 'erro desconhecido',
    tp_invite_ok_intro:
      'Convite criado.\n\nO prestador já deve ter conta no Aria com este e-mail (cadastro no app) antes de abrir o link.',
    tp_invite_ok_token: 'Token (guarde para o candidato):',
    tp_invite_ok_link: 'Sugestão de link no app:',
    tp_st_invited: 'Convidado',
    tp_st_draft: 'Rascunho',
    tp_st_submitted: 'Submetido',
    tp_st_needs_revision: 'Aguardando correção',
    tp_st_approved: 'Aprovado',
    tp_st_rejected: 'Recusado',
  },
  'en-US': {
    tp_pageTitle: 'Aria Admin — Providers · Applications',
    tp_bc_panel: 'Home',
    tp_bc_prestadores: 'Providers',
    tp_bc_here: 'Applications',
    tp_hero_title: 'Applications (onboarding)',
    tp_hero_sub_html:
      'Invites, review and approval of the global form. The <a href="prestadores.html" style="color:var(--accent);font-weight:600">Providers</a> hub covers partnerships and links; this screen lists <em>applications</em> and “Profile without application”. Use “Invite by email” to send the link.',
    tp_back_prestadores: 'Back to Providers',
    tp_filter_state: 'Status',
    tp_search_lbl: 'Search',
    tp_search_ph: 'Email, tenant name, or user name (orphan profiles)…',
    tp_filt_all: 'All (applications + profile without form)',
    tp_filt_orphan: 'Pending profile only (no application)',
    tp_filt_invited: 'Invited',
    tp_filt_draft: 'Draft',
    tp_filt_submitted: 'Submitted',
    tp_filt_needs_rev: 'Needs changes',
    tp_filt_approved: 'Approved',
    tp_filt_rejected: 'Rejected',
    tp_btn_invite: 'Invite by email',
    tp_table_title: 'Applications',
    tp_th_email: 'Email',
    tp_th_tenant: 'Tenant',
    tp_th_state: 'Status',
    tp_th_updated: 'Updated',
    tp_th_actions: 'Actions',
    tp_loading: 'Loading…',
    tp_err_load: 'Failed to load',
    tp_empty_title: 'No applications for this filter',
    tp_empty_sub: 'Change the status or send an invite with “Invite by email”.',
    tp_badge_orphan: 'Profile without application',
    tp_badge_orphan_title: 'TechnicianProfile is PENDING but there is no signup application in progress',
    tp_act_user: 'User',
    tp_act_invite: 'Create invite',
    tp_act_open: 'Open',
    tp_detail_title: 'Application',
    tp_detail_back: '← Back to list',
    tp_detail_state: 'Status',
    tp_detail_revision: 'Message to applicant:',
    tp_detail_summary_email: 'Invited email',
    tp_detail_summary_tenant: 'Tenant',
    tp_detail_summary_status: 'Status',
    tp_detail_summary_submitted: 'Submitted at',
    tp_detail_summary_created: 'Created at',
    tp_detail_summary_name: 'Name on form',
    tp_detail_json_summary: 'Full record (JSON)',
    tp_hist_title: 'History',
    tp_wait_submit: 'Waiting for the applicant to submit (link with token was sent in the invite).',
    tp_open_created_user: 'Open created user',
    tp_act_approve: 'Approve and create provider',
    tp_act_approve_loading: 'Creating provider…',
    tp_act_revision: 'Request changes',
    tp_act_reject: 'Reject',
    tp_modal_invite_title: 'Invite technician',
    tp_modal_invite_note_html:
      '<strong>Requirement:</strong> the technician must already have a <strong>Aria app account</strong> with the <strong>same email</strong> you are inviting (sign up from “Create account” on the app login). If no user exists with that email, the invite will not be created.',
    tp_lbl_invite_email: 'Applicant email *',
    tp_ph_invite_email: 'tech@example.com',
    tp_lbl_invite_tenant: 'Tenant (account) *',
    tp_hint_invite_tenant: 'Required in global platform mode.',
    tp_cancel: 'Cancel',
    tp_invite_submit: 'Send invite',
    tp_modal_rev_title: 'Ask applicant to fix issues',
    tp_lbl_revision_template: 'Revision template',
    tp_revision_tpl_placeholder: 'Choose a template…',
    tp_revision_tpl_docs:
      'Please review and re-submit required documents: document photo must be readable, uncropped, and without glare; also confirm document type and number.',
    tp_revision_tpl_face:
      'Please retake face enrollment photos: submit clear images with only your face, good lighting, and no other people in frame.',
    tp_revision_tpl_schedule_regions:
      'Please complete availability and service regions: set at least one day/time and select the locations where you can operate.',
    tp_revision_tpl_data:
      'Please update profile data: confirm full name, contact phone, and address (city/state) before submitting again.',
    tp_ph_revision: 'Describe what is missing or must be corrected…',
    tp_rev_submit: 'Send request',
    tp_alert_email: 'Enter the email.',
    tp_alert_tenant: 'Select a tenant.',
    tp_alert_rev_msg: 'Write the message.',
    tp_cf_approve: 'Approve this application? A provider user will be created from the submitted data.',
    tp_cf_approve_early:
      'Approve now even if the applicant has not submitted the form? The existing account in this tenant will be activated as a provider using whatever is already on file (empty fields stay empty or use defaults).',
    tp_ok_approve: 'Provider created and activated successfully.',
    tp_prompt_reject: 'Rejection reason (required):',
    tp_invite_email_sent: 'An email with the invite was sent to the applicant (Nylas).',
    tp_invite_email_skipped: 'Email not sent: {detail}',
    tp_invite_email_skipped_default: 'configure Nylas (API Key + Grant ID) on the server or under Integrations.',
    tp_invite_email_fail: 'Note: the invite was created but email delivery failed: {detail}',
    tp_invite_email_fail_unknown: 'unknown error',
    tp_invite_ok_intro:
      'Invite created.\n\nThe technician must already have a Aria account with this email (app sign-up) before opening the link.',
    tp_invite_ok_token: 'Token (keep for the applicant):',
    tp_invite_ok_link: 'Suggested in-app link:',
    tp_st_invited: 'Invited',
    tp_st_draft: 'Draft',
    tp_st_submitted: 'Submitted',
    tp_st_needs_revision: 'Needs changes',
    tp_st_approved: 'Approved',
    tp_st_rejected: 'Rejected',
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

export function tpT(key, vars) {
  const raw = adminResolve(M, getAdminUiLocale(), key);
  return vars ? interpolate(raw, vars) : raw;
}

export function tpFormatDateTime(iso) {
  const loc = adminIntlLocale(getAdminUiLocale());
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(loc, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}

export function tpStatusLabel(status) {
  const s = String(status || '').trim();
  const map = {
    INVITED: 'tp_st_invited',
    DRAFT: 'tp_st_draft',
    SUBMITTED: 'tp_st_submitted',
    NEEDS_REVISION: 'tp_st_needs_revision',
    APPROVED: 'tp_st_approved',
    REJECTED: 'tp_st_rejected',
  };
  const k = map[s];
  return k ? tpT(k) : s;
}

export function applyTechnicianApplicationsPageI18n() {
  if (typeof document === 'undefined') return;
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }
  document.title = tpT('tp_pageTitle');
  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = tpT(key);
  };
  set('tp-bc-panel', 'tp_bc_panel');
  set('tp-bc-prestadores', 'tp_bc_prestadores');
  set('tp-bc-here', 'tp_bc_here');
  set('tp-hero-title', 'tp_hero_title');
  const hero = document.getElementById('tp-hero-sub');
  if (hero) hero.innerHTML = tpT('tp_hero_sub_html');
  set('tp-back-prestadores', 'tp_back_prestadores');
  const fl = document.getElementById('tp-filter-state-lbl');
  if (fl) {
    fl.innerHTML = `<ion-icon name="funnel-outline" aria-hidden="true"></ion-icon> ${tpT('tp_filter_state')}`;
  }
  set('tp-search-lbl', 'tp_search_lbl');
  const fs = document.getElementById('filter-search');
  if (fs) fs.placeholder = tpT('tp_search_ph');
  const djs = document.getElementById('detail-json-summary');
  if (djs) djs.textContent = tpT('tp_detail_json_summary');
  const sel = document.getElementById('filter-status');
  if (sel && sel.options.length >= 8) {
    const opts = [
      'tp_filt_all',
      'tp_filt_orphan',
      'tp_filt_invited',
      'tp_filt_draft',
      'tp_filt_submitted',
      'tp_filt_needs_rev',
      'tp_filt_approved',
      'tp_filt_rejected',
    ];
    opts.forEach((k, i) => {
      if (sel.options[i]) sel.options[i].textContent = tpT(k);
    });
  }
  set('tp-table-title', 'tp_table_title');
  set('tp-th-email', 'tp_th_email');
  set('tp-th-tenant', 'tp_th_tenant');
  set('tp-th-state', 'tp_th_state');
  set('tp-th-updated', 'tp_th_updated');
  set('tp-th-actions', 'tp_th_actions');
  const inv = document.getElementById('btn-invite');
  if (inv) inv.innerHTML = `<ion-icon name="mail-outline" style="font-size:18px;vertical-align:-3px" aria-hidden="true"></ion-icon> ${tpT('tp_btn_invite')}`;
  const ld = document.getElementById('tp-tbody-loading');
  if (ld) ld.textContent = tpT('tp_loading');
  set('detail-title', 'tp_detail_title');
  set('btn-close-detail', 'tp_detail_back');
  set('tp-hist-title', 'tp_hist_title');
  set('modal-invite-title', 'tp_modal_invite_title');
  const note = document.getElementById('tp-invite-note');
  if (note) note.innerHTML = tpT('tp_modal_invite_note_html');
  set('tp-lbl-invite-email', 'tp_lbl_invite_email');
  const ie = document.getElementById('invite-email');
  if (ie) ie.placeholder = tpT('tp_ph_invite_email');
  set('tp-lbl-invite-tenant', 'tp_lbl_invite_tenant');
  set('tp-hint-invite-tenant', 'tp_hint_invite_tenant');
  document.querySelectorAll('[data-close-invite]').forEach((b) => {
    if (b.classList.contains('modal-close')) return;
    b.textContent = tpT('tp_cancel');
  });
  set('invite-submit', 'tp_invite_submit');
  set('modal-revision-title', 'tp_modal_rev_title');
  set('tp-lbl-revision-template', 'tp_lbl_revision_template');
  const rt = document.getElementById('revision-template');
  if (rt && rt.options[0]) rt.options[0].textContent = tpT('tp_revision_tpl_placeholder');
  const ta = document.getElementById('revision-msg');
  if (ta) ta.placeholder = tpT('tp_ph_revision');
  document.querySelectorAll('[data-close-rev]').forEach((b) => {
    if (b.classList.contains('modal-close')) return;
    b.textContent = tpT('tp_cancel');
  });
  set('revision-submit', 'tp_rev_submit');
}
