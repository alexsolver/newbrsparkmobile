/**
 * Integrações, textos do painel (pt-BR / en-US; es-ES via fallback em adminResolve).
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { adminResolve, adminDocumentLang } from './admin-i18n-resolve.js';

const M = {
  'pt-BR': {
    integ_pageTitle: 'Aria Admin, Integrações',
    integ_bc_panel: 'Painel',
    integ_bc_here: 'Integrações',
    integ_hero_title: 'Integrações',
    integ_hero_sub:
      'Chaves de API e serviços externos (IA, e-mail, mapas, FaceMatch, etc.). Campos sensíveis não são mostrados em claro após gravar, use «Testar» ou «Salvar» para validar.',
    integ_active_count: '{n} ativas',
    integ_sec_ai: 'Inteligência Artificial / LLM',
    integ_sec_email: 'E-mail e notificações',
    integ_sec_catalog: 'Catálogos e APIs externas',
    integ_sec_storage: 'Storage e cloud',
    integ_sec_payments: 'Pagamentos',
    integ_sec_identity: 'Identidade (KYC)',
    integ_didit_cat: 'KYC (didit.me)',
    integ_sec_maps: 'Mapas e roteamento',
    integ_sec_bio: 'Biometria e reconhecimento facial',
    integ_status_disconnected: 'Desconectado',
    integ_status_public: 'Público',
    integ_status_connected: 'Conectado',
    integ_status_error: 'Erro',
    integ_btn_save: 'Salvar',
    integ_btn_test: 'Testar',
    integ_btn_remove: 'Remover',
    integ_test_testing: 'Testando…',
    integ_toast_save_first: 'Salve a integração antes de testar.',
    integ_toast_ok: 'Conectado com sucesso!',
    integ_toast_fail: 'Falha na conexão',
    integ_toast_test_err: 'Erro ao testar: {msg}',
    integ_confirm_remove: 'Remover integração «{name}»?',
    integ_alert_nylas_key: 'API Key da Nylas é obrigatória.',
    integ_alert_smtp_host: 'Host SMTP é obrigatório.',
    integ_alert_dropbox_tokens: 'App Key, App Secret e Refresh Token são obrigatórios.',
    integ_alert_s3_fields: 'Access Key, Secret e Bucket são obrigatórios.',
    integ_alert_r2_fields: 'Access Key, Secret e Bucket são obrigatórios.',
    integ_alert_aws_rekog: 'Region, Key e Secret são obrigatórios.',
    integ_alert_webhook_url: 'URL é obrigatória.',
    integ_alert_compreface_first: 'Na primeira configuração, URL e Recognition API Key são obrigatórias.',
    integ_alert_webhook_post_url: 'Informe o URL completo do POST no serviço externo.',
    integ_alert_timeout: 'Timeout inválido: use um valor ≥ 10000 ms (10 s).',
    integ_alert_googleai_key: 'Informe a API key do Google AI Studio.',
    integ_alert_mailersend_token: 'Informe o API token da MailerSend (painel → API tokens).',
    integ_alert_save_err: 'Erro ao salvar: {detail}',
    integ_save_fallback: 'verifique os campos.',
    integ_toast_google_saved: 'Integração Google AI Studio salva!',
    integ_toast_mailersend_saved: 'Integração MailerSend salva!',
    integ_alert_msgraph_fields: 'Informe o ID do inquilino, o ID da aplicação e o endereço/UPN «Enviar como».',
    integ_alert_msgraph_secret: 'Informe o segredo do cliente (ou guarde só metadados deixando o segredo em branco se já existir).',
    integ_toast_msgraph_saved: 'Integração Microsoft Graph salva!',
    integ_toast_msgraph_updated: 'Integração Microsoft Graph atualizada (segredo mantido).',
    integ_toast_compreface_updated: 'Integração FaceMatch atualizada!',
    integ_toast_bio_saved: 'Integração de Biometria salva!',
    integ_toast_vision_yolo_updated: 'Integração «Visão IA - YOLO» atualizada!',
    integ_toast_vision_yolo_saved: 'Integração «Visão IA - YOLO» salva!',
    integ_alert_moondream_key: 'Informe a API key Moondream.',
    integ_toast_vision_moondream_updated: 'Integração «Visão IA - Moondream» atualizada!',
    integ_toast_vision_moondream_saved: 'Integração «Visão IA - Moondream» salva!',
    integ_type_AI_LLM: 'IA / LLM',
    integ_type_EMAIL: 'E-mail',
    integ_type_STORAGE: 'Storage',
    integ_type_WEBHOOK: 'Webhook',
    integ_type_ERP: 'ERP',
    integ_type_PUSH: 'Push',
    integ_type_MAPS: 'Mapas',
    integ_type_VISION: 'Visão IA',
    integ_type_PAYMENT: 'Pagamentos',
    integ_alert_stripe_secret: 'Informe a chave secreta Stripe (sk_test_… ou sk_live_…).',
    integ_toast_stripe_saved: 'Integração Stripe salva.',
    integ_alert_didit_key: 'Informe a API key do Didit (cópia em API & Webhooks do consola).',
    integ_toast_didit_saved: 'Integração Didit salva.',
  },
  'en-US': {
    integ_pageTitle: 'Aria Admin, Integrations',
    integ_bc_panel: 'Home',
    integ_bc_here: 'Integrations',
    integ_hero_title: 'Integrations',
    integ_hero_sub:
      'API keys and external services (AI, e-mail, maps, FaceMatch, etc.). Sensitive fields stay masked after saving, use «Test» or «Save» to validate.',
    integ_active_count: '{n} active',
    integ_sec_ai: 'Artificial intelligence / LLM',
    integ_sec_email: 'E-mail and notifications',
    integ_sec_catalog: 'Catalogs and external APIs',
    integ_sec_storage: 'Storage and cloud',
    integ_sec_payments: 'Payments',
    integ_sec_identity: 'Identity (KYC)',
    integ_didit_cat: 'KYC (didit.me)',
    integ_sec_maps: 'Maps and routing',
    integ_sec_bio: 'Biometrics and facial recognition',
    integ_status_disconnected: 'Disconnected',
    integ_status_public: 'Public',
    integ_status_connected: 'Connected',
    integ_status_error: 'Error',
    integ_btn_save: 'Save',
    integ_btn_test: 'Test',
    integ_btn_remove: 'Remove',
    integ_test_testing: 'Testing…',
    integ_toast_save_first: 'Save the integration before testing.',
    integ_toast_ok: 'Connected successfully!',
    integ_toast_fail: 'Connection failed',
    integ_toast_test_err: 'Test error: {msg}',
    integ_confirm_remove: 'Remove integration «{name}»?',
    integ_alert_nylas_key: 'Nylas API key is required.',
    integ_alert_smtp_host: 'SMTP host is required.',
    integ_alert_dropbox_tokens: 'App Key, App Secret and Refresh Token are required.',
    integ_alert_s3_fields: 'Access Key, Secret and Bucket are required.',
    integ_alert_r2_fields: 'Access Key, Secret and Bucket are required.',
    integ_alert_aws_rekog: 'Region, Key and Secret are required.',
    integ_alert_webhook_url: 'URL is required.',
    integ_alert_compreface_first: 'On first setup, URL and Recognition API Key are required.',
    integ_alert_webhook_post_url: 'Enter the full POST URL for the external service.',
    integ_alert_timeout: 'Invalid timeout: use a value ≥ 10000 ms (10 s).',
    integ_alert_googleai_key: 'Enter the Google AI Studio API key.',
    integ_alert_mailersend_token: 'Enter the MailerSend API token (dashboard → API tokens).',
    integ_alert_save_err: 'Save error: {detail}',
    integ_save_fallback: 'check the fields.',
    integ_toast_google_saved: 'Google AI Studio integration saved!',
    integ_toast_mailersend_saved: 'MailerSend integration saved!',
    integ_alert_msgraph_fields: 'Enter tenant ID, application (client) ID, and the «Send as» mailbox UPN or address.',
    integ_alert_msgraph_secret: 'Enter the client secret (or leave it blank when updating metadata only if the integration already exists).',
    integ_toast_msgraph_saved: 'Microsoft Graph integration saved!',
    integ_toast_msgraph_updated: 'Microsoft Graph integration updated (secret unchanged).',
    integ_toast_compreface_updated: 'FaceMatch integration updated!',
    integ_toast_bio_saved: 'Biometrics integration saved!',
    integ_toast_vision_yolo_updated: '«Vision AI - YOLO» integration updated!',
    integ_toast_vision_yolo_saved: '«Vision AI - YOLO» integration saved!',
    integ_alert_moondream_key: 'Moondream API key is required.',
    integ_toast_vision_moondream_updated: '«Vision AI - Moondream» integration updated!',
    integ_toast_vision_moondream_saved: '«Vision AI - Moondream» integration saved!',
    integ_type_AI_LLM: 'AI / LLM',
    integ_type_EMAIL: 'E-mail',
    integ_type_STORAGE: 'Storage',
    integ_type_WEBHOOK: 'Webhook',
    integ_type_ERP: 'ERP',
    integ_type_PUSH: 'Push',
    integ_type_MAPS: 'Maps',
    integ_type_VISION: 'Computer vision',
    integ_type_PAYMENT: 'Payments',
    integ_alert_stripe_secret: 'Enter the Stripe secret key (sk_test_… or sk_live_…).',
    integ_toast_stripe_saved: 'Stripe integration saved.',
    integ_alert_didit_key: 'Enter your Didit API key (from the console, API & Webhooks).',
    integ_toast_didit_saved: 'Didit integration saved.',
  },
};

function interp(str, vars) {
  let out = String(str ?? '');
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
  }
  return out;
}

export function integT(key, vars) {
  const loc = getAdminUiLocale();
  const raw = adminResolve(M, loc, key);
  return vars ? interp(raw, vars) : raw;
}

function setText(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = vars ? integT(key, vars) : integT(key);
}

/** Atualiza cabeçalho, secções e contador «ativas» (texto inicial). */
export function applyIntegrationsPageI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = adminDocumentLang(loc);
  } catch {
    /* ignore */
  }
  document.title = integT('integ_pageTitle');
  setText('mpc-bc-panel', 'integ_bc_panel');
  setText('mpc-bc-here', 'integ_bc_here');
  setText('mpc-hero-title', 'integ_hero_title');
  setText('mpc-hero-sub', 'integ_hero_sub');
  const sec = [
    ['integ-sec-ai', 'integ_sec_ai'],
    ['integ-sec-email', 'integ_sec_email'],
    ['integ-sec-catalog', 'integ_sec_catalog'],
    ['integ-sec-payments', 'integ_sec_payments'],
    ['integ-sec-identity', 'integ_sec_identity'],
    ['integ-sec-storage', 'integ_sec_storage'],
    ['integ-sec-maps', 'integ_sec_maps'],
    ['integ-sec-bio', 'integ_sec_bio'],
  ];
  for (const [id, k] of sec) setText(id, k);
  setText('didit-cat-label', 'integ_didit_cat');
}

/** Rótulo «○ Desconectado» / «○ Público» (sem prefixo, só o texto após ○). */
export function integDisconnectedLabel(isPublic) {
  return `○ ${integT(isPublic ? 'integ_status_public' : 'integ_status_disconnected')}`;
}

export function integConnectedStatusHtml(hasError) {
  if (hasError) {
    return `<ion-icon name="close-outline" style="vertical-align:-2px"></ion-icon> ${integT('integ_status_error')}`;
  }
  return `● ${integT('integ_status_connected')}`;
}

export function integTypeLabel(type) {
  const k = `integ_type_${String(type || '').trim()}`;
  const v = integT(k);
  return v === k ? String(type || '') : v;
}

export function integActiveCountText(n) {
  return integT('integ_active_count', { n });
}
