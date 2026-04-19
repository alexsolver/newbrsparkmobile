/**
 * Formulário público de avaliação — pt-BR e en-US.
 * Locale: parâmetro URL `lang` (pt-BR | en-US), senão localStorage do painel, senão navegador.
 */
const LS = 'brspark_admin_ui_locale';

export function getSurveyUiLocale() {
  try {
    const u = new URL(window.location.href);
    const q = (u.searchParams.get('lang') || '').trim().toLowerCase();
    if (q === 'en' || q === 'en-us') return 'en-US';
    if (q === 'pt' || q === 'pt-br') return 'pt-BR';
    const ls = localStorage.getItem(LS);
    if (ls === 'en-US' || ls === 'pt-BR') return ls;
  } catch {
    /* ignore */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : '').toLowerCase();
  if (nav.startsWith('en')) return 'en-US';
  return 'pt-BR';
}

const M = {
  'pt-BR': {
    esv_pageTitle: 'Avaliação de serviço — BrSpark',
    esv_title: 'Avaliação de serviço',
    esv_loading: 'Carregando…',
    esv_invalid_link: 'Link inválido (sem token).',
    esv_err_load: 'Erro ao carregar',
    esv_err_submit: 'Erro ao enviar',
    esv_fail_load: 'Falha ao carregar o formulário.',
    esv_yes: 'Sim',
    esv_no: 'Não',
    esv_ph_text: 'Sua resposta',
    esv_ph_other: 'Resposta',
    esv_comment_lbl: 'Comentário opcional',
    esv_comment_ph: 'Compartilhe sua experiência',
    esv_submit: 'Enviar avaliação',
    esv_required: 'Responda todas as perguntas obrigatórias.',
    esv_thanks: 'Obrigado. Sua avaliação foi registrada.',
    esv_os_prefix: ' · OS ',
    esv_preview_banner:
      'Modo pré-visualização: as respostas não são gravadas. Use para conferir logo e textos do template.',
    esv_preview_btn: 'Pré-visualização (não envia)',
    esv_preview_need_login:
      'Abra esta página a partir do painel administrativo (sessão ativa) ou use o link com token do cliente.',
    esv_preview_badge: '(pré-visualização)',
  },
  'en-US': {
    esv_pageTitle: 'Service evaluation — BrSpark',
    esv_title: 'Service evaluation',
    esv_loading: 'Loading…',
    esv_invalid_link: 'Invalid link (missing token).',
    esv_err_load: 'Failed to load',
    esv_err_submit: 'Failed to submit',
    esv_fail_load: 'Could not load the form.',
    esv_yes: 'Yes',
    esv_no: 'No',
    esv_ph_text: 'Your answer',
    esv_ph_other: 'Answer',
    esv_comment_lbl: 'Optional comment',
    esv_comment_ph: 'Share your experience',
    esv_submit: 'Submit evaluation',
    esv_required: 'Please answer all required questions.',
    esv_thanks: 'Thank you. Your evaluation was saved.',
    esv_os_prefix: ' · WO ',
    esv_preview_banner:
      'Preview mode: answers are not saved. Use this to check the template logo and copy.',
    esv_preview_btn: 'Preview (does not submit)',
    esv_preview_need_login:
      'Open this page from the admin panel (active session) or use the customer link with a token.',
    esv_preview_badge: '(preview)',
  },
};

export function esvT(key) {
  const loc = getSurveyUiLocale();
  const pack = M[loc] || M['pt-BR'];
  return pack[key] != null ? pack[key] : M['pt-BR'][key] != null ? M['pt-BR'][key] : key;
}

export function applySurveyStaticI18n() {
  const loc = getSurveyUiLocale();
  try {
    document.documentElement.lang = loc === 'en-US' ? 'en-US' : 'pt-BR';
  } catch {
    /* ignore */
  }
  document.title = esvT('esv_pageTitle');
  const t = document.getElementById('title');
  if (t) t.textContent = esvT('esv_title');
  const s = document.getElementById('sub');
  if (s) s.textContent = esvT('esv_loading');
  const d = document.getElementById('done');
  if (d) d.textContent = esvT('esv_thanks');
}
