/**
 * Construtor de relatório PDF, pt-BR e en-US.
 */
import { getAdminUiLocale } from './user-pages-i18n.js';

const M = {
  'pt-BR': {
    rep_pageTitle: 'Aria Admin, Construtor de relatório PDF',
    rep_bc_panel: 'Painel',
    rep_bc_page: 'Relatórios PDF',
    rep_hero_title: 'Construtor de relatório PDF',
    rep_hero_badge_title: 'Pré-visualização em tempo real',
    rep_hero_badge: 'WYSIWYG',
    rep_hero_sub:
      'Presets alinhados à Central de Operações; pré-visualização A4 em tempo quase real. Ajuste blocos na coluna à esquerda e acompanhe o PDF à direita.',
    rep_lbl_preset: 'Preset',
    rep_help_sum: 'Notas + API',
    rep_help_body_html:
      'O painel à direita simula a planilha A4. As alterações aplicam-se em tempo real. O preset escolhido na Central de Operações usa a mesma configuração.<div style="margin-top:6px;font-size:10px;word-break:break-all"><strong>API</strong>, <code>GET /api/reports/executions/&lt;id&gt;/export?presetId=&amp;format=json</code></div>',
    rep_btn_new: '+ Novo',
    rep_save: 'Salvar',
    rep_delete: 'Excluir',
    rep_h3_preset: 'Preset',
    rep_lbl_name: 'Nome *',
    rep_ph_name: 'Ex.: Cliente final',
    rep_lbl_slug: 'Slug',
    rep_ph_slug: 'opcional',
    rep_lbl_deeplink: 'Link direto',
    rep_copy: 'Copiar',
    rep_preview_title: 'Dados na pré-visualização',
    rep_preview_help_sum: 'Ajuda',
    rep_preview_help_body_html:
      'Por padrão o canvas usa um <strong>exemplo</strong>. Informe o <strong>ID interno</strong> da execução ou o número <strong>FT-…</strong> da OS e clique em Carregar para ver respostas reais (só na pré-visualização).',
    rep_ph_exec: 'ID ou FT-AAAA-MM-…',
    rep_load: 'Carregar',
    rep_example: 'Exemplo',
    rep_h3_banner: 'Aparência (banner)',
    rep_lbl_logo: 'URL do logo',
    rep_ph_logo: 'https://… ou /uploads/…',
    rep_lbl_title: 'Título (H2)',
    rep_ph_title: 'Vazio = RELATÓRIO DA ATIVIDADE',
    rep_lbl_sub: 'Subtítulo',
    rep_ph_sub: 'Vazio = número OS',
    rep_h3_modules: 'Módulos na planilha',
    rep_mod_help_sum: 'Ordem e agrupamento',
    rep_mod_help_body:
      'Use o interruptor para mostrar ou ocultar; as setas definem a ordem no PDF. Se «Produtividade» vier logo a seguir a «Bloco técnico», a faixa fica dentro do mesmo cartão.',
    rep_h3_theme: 'Tipo e cores',
    rep_lbl_font: 'Fonte (família CSS)',
    rep_ph_font: 'Inter, system-ui, sans-serif',
    rep_lbl_scale: 'Escala do texto',
    rep_color_banner_start: 'Banner (início)',
    rep_color_banner_end: 'Banner (fim)',
    rep_color_tech_start: 'Cabeçalho técnico (início)',
    rep_color_tech_end: 'Cabeçalho técnico (fim)',
    rep_color_accent: 'Destaque (links, formulário)',
    rep_color_form_num: 'Nº pergunta',
    rep_color_pill_yes: 'Pill «sim»',
    rep_color_pill_no: 'Pill «não»',
    rep_color_tl_blue: 'Linha do tempo (azul)',
    rep_color_tl_green: 'Linha do tempo (verde)',
    rep_color_photo: 'Fotos / galeria',
    rep_color_transit: 'Deslocamento',
    rep_h3_fields: 'Campos do formulário',
    rep_hide_empty: 'Ocultar vazios no PDF',
    rep_fields_help_sum: 'Rótulos e lista',
    rep_fields_help_body:
      'Mostrar ou ocultar campos e renomear rótulos no PDF. Com uma OS carregada, a lista segue o formulário dessa execução.',
    rep_canvas_a4: 'A4',
    rep_live: 'Live',
    rep_mod_visible: 'Visível no PDF',
    rep_ph_fld_label: 'Rótulo no PDF (opcional)',
    rep_techfin_warn_html:
      '<ion-icon name="warning-outline" style="vertical-align:-3px"></ion-icon> Por padrão este campo não entra no PDF. Se ativar a visibilidade, dados de custos internos do técnico podem ficar disponíveis ao cliente.',
    rep_techfin_alert:
      'Ao incluir «Custos do técnico» no PDF, informações que podem corresponder a custos operacionais internos passam a poder ser vistas pelo cliente ou por quem receber o relatório. Confirme que deseja expor estes dados.',
    rep_mod_topbar: 'Barra + logo + data',
    rep_mod_headerBanner: 'Faixa azul (título / técnico)',
    rep_mod_technicalBlock: 'Bloco técnico (3 colunas)',
    rep_mod_productivity: 'Produtividade (bloco PDF)',
    rep_mod_timeline: 'Linha do tempo',
    rep_mod_transit: 'Deslocamento',
    rep_mod_formResponses: 'Respostas numeradas',
    rep_mod_photoGallery: 'Galeria de fotos',
    rep_mod_footer: 'Rodapé',
    rep_opt_new_preset: '— Novo preset —',
    rep_alert_name: 'Indique o nome do preset.',
    rep_alert_delete: 'Excluir este preset?',
    rep_err_save: 'Erro: ',
    rep_exec_need: 'Indique o ID da execução.',
    rep_exec_loading: 'Carregando…',
    rep_exec_not_found: 'Execução não encontrada.',
    rep_exec_loaded: 'Dados reais carregados no canvas.',
    rep_mock_reset: 'Exemplo padrão.',
  },
  'en-US': {
    rep_pageTitle: 'Aria Admin, PDF report builder',
    rep_bc_panel: 'Home',
    rep_bc_page: 'PDF reports',
    rep_hero_title: 'PDF report builder',
    rep_hero_badge_title: 'Live preview',
    rep_hero_badge: 'WYSIWYG',
    rep_hero_sub:
      'Presets aligned with Operations Center; near–real-time A4 preview. Adjust blocks in the left column and watch the PDF on the right.',
    rep_lbl_preset: 'Preset',
    rep_help_sum: 'Notes + API',
    rep_help_body_html:
      'The right panel simulates the A4 sheet. Changes apply in near real time. The preset selected in Operations Center uses the same configuration.<div style="margin-top:6px;font-size:10px;word-break:break-all"><strong>API</strong>, <code>GET /api/reports/executions/&lt;id&gt;/export?presetId=&amp;format=json</code></div>',
    rep_btn_new: '+ New',
    rep_save: 'Save',
    rep_delete: 'Delete',
    rep_h3_preset: 'Preset',
    rep_lbl_name: 'Name *',
    rep_ph_name: 'e.g. End customer',
    rep_lbl_slug: 'Slug',
    rep_ph_slug: 'optional',
    rep_lbl_deeplink: 'Direct link',
    rep_copy: 'Copy',
    rep_preview_title: 'Preview data',
    rep_preview_help_sum: 'Help',
    rep_preview_help_body_html:
      'By default the canvas uses a <strong>sample</strong>. Enter the execution <strong>internal ID</strong> or the <strong>FT-…</strong> WO number and click Load to see real responses (preview only).',
    rep_ph_exec: 'ID or FT-YYYY-MM-…',
    rep_load: 'Load',
    rep_example: 'Sample',
    rep_h3_banner: 'Look & feel (banner)',
    rep_lbl_logo: 'Logo URL',
    rep_ph_logo: 'https://… or /uploads/…',
    rep_lbl_title: 'Title (H2)',
    rep_ph_title: 'Empty = ACTIVITY REPORT',
    rep_lbl_sub: 'Subtitle',
    rep_ph_sub: 'Empty = WO number',
    rep_h3_modules: 'Sheet modules',
    rep_mod_help_sum: 'Order & grouping',
    rep_mod_help_body:
      'Use the switch to show or hide; arrows set PDF order. If «Productivity» sits right after «Technical block», the strip stays in the same card.',
    rep_h3_theme: 'Type & colours',
    rep_lbl_font: 'Font (CSS family)',
    rep_ph_font: 'Inter, system-ui, sans-serif',
    rep_lbl_scale: 'Text scale',
    rep_color_banner_start: 'Banner (start)',
    rep_color_banner_end: 'Banner (end)',
    rep_color_tech_start: 'Tech header (start)',
    rep_color_tech_end: 'Tech header (end)',
    rep_color_accent: 'Accent (links, form)',
    rep_color_form_num: 'Question no.',
    rep_color_pill_yes: 'Pill «yes»',
    rep_color_pill_no: 'Pill «no»',
    rep_color_tl_blue: 'Timeline (blue)',
    rep_color_tl_green: 'Timeline (green)',
    rep_color_photo: 'Photos / gallery',
    rep_color_transit: 'Transit',
    rep_h3_fields: 'Form fields',
    rep_hide_empty: 'Hide empty fields in PDF',
    rep_fields_help_sum: 'Labels & list',
    rep_fields_help_body:
      'Show or hide fields and rename labels in the PDF. With a loaded WO, the list follows that execution’s form.',
    rep_canvas_a4: 'A4',
    rep_live: 'Live',
    rep_mod_visible: 'Visible in PDF',
    rep_ph_fld_label: 'PDF label (optional)',
    rep_techfin_warn_html:
      '<ion-icon name="warning-outline" style="vertical-align:-3px"></ion-icon> By default this field is not included in the PDF. If you enable visibility, internal technician cost data may be exposed to the client.',
    rep_techfin_alert:
      'Including «Technician costs» in the PDF may expose internal operational cost information to the client or anyone receiving the report. Confirm you want to expose this data.',
    rep_mod_topbar: 'Bar + logo + date',
    rep_mod_headerBanner: 'Blue strip (title / technician)',
    rep_mod_technicalBlock: 'Technical block (3 columns)',
    rep_mod_productivity: 'Productivity (PDF block)',
    rep_mod_timeline: 'Timeline',
    rep_mod_transit: 'Transit',
    rep_mod_formResponses: 'Numbered answers',
    rep_mod_photoGallery: 'Photo gallery',
    rep_mod_footer: 'Footer',
    rep_opt_new_preset: '— New preset —',
    rep_alert_name: 'Enter the preset name.',
    rep_alert_delete: 'Delete this preset?',
    rep_err_save: 'Error: ',
    rep_exec_need: 'Enter the execution ID.',
    rep_exec_loading: 'Loading…',
    rep_exec_not_found: 'Execution not found.',
    rep_exec_loaded: 'Real data loaded on the canvas.',
    rep_mock_reset: 'Default sample.',
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

export function reportsT(key, vars) {
  const loc = getAdminUiLocale();
  const pack = M[loc] || M['pt-BR'];
  const raw = pack[key] != null ? pack[key] : M['pt-BR'][key] != null ? M['pt-BR'][key] : key;
  return vars ? interpolate(raw, vars) : raw;
}

function setText(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = vars ? reportsT(key, vars) : reportsT(key);
}

function setHtml(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = vars ? reportsT(key, vars) : reportsT(key);
}

export function applyReportsStaticI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = loc === 'en-US' ? 'en-US' : 'pt-BR';
  } catch {
    /* ignore */
  }
  document.title = reportsT('rep_pageTitle');
  setText('rep-bc-panel', 'rep_bc_panel');
  setText('rep-bc-page', 'rep_bc_page');
  setText('rep-hero-title', 'rep_hero_title');
  const badge = document.getElementById('rep-hero-badge');
  if (badge) {
    badge.textContent = reportsT('rep_hero_badge');
    badge.title = reportsT('rep_hero_badge_title');
  }
  setText('rep-hero-sub', 'rep_hero_sub');
  setText('rep-lbl-preset', 'rep_lbl_preset');
  setText('rep-compact-help-sum-text', 'rep_help_sum');
  setHtml('rep-help-body', 'rep_help_body_html');
  setText('btn-new-preset', 'rep_btn_new');
  setText('ed-save', 'rep_save');
  setText('ed-delete', 'rep_delete');
  setText('rep-h3-preset', 'rep_h3_preset');
  setText('rep-lbl-name', 'rep_lbl_name');
  setText('rep-lbl-slug', 'rep_lbl_slug');
  const en = document.getElementById('ed-name');
  if (en) en.placeholder = reportsT('rep_ph_name');
  const es = document.getElementById('ed-slug');
  if (es) es.placeholder = reportsT('rep_ph_slug');
  setText('rep-lbl-deeplink', 'rep_lbl_deeplink');
  setText('ed-copy-link', 'rep_copy');
  setText('rep-preview-title', 'rep_preview_title');
  setText('rep-preview-help-summary', 'rep_preview_help_sum');
  setHtml('rep-preview-help-body', 'rep_preview_help_body_html');
  const pe = document.getElementById('preview-exec-id');
  if (pe) {
    pe.placeholder = reportsT('rep_ph_exec');
    pe.setAttribute('aria-label', reportsT('rep_ph_exec'));
  }
  const loadBtn = document.getElementById('preview-load-exec');
  if (loadBtn) {
    loadBtn.title = reportsT('rep_load');
    const icon = loadBtn.querySelector('ion-icon');
    loadBtn.textContent = '';
    if (icon) loadBtn.appendChild(icon);
    loadBtn.appendChild(document.createTextNode(reportsT('rep_load')));
  }
  const exBtn = document.getElementById('preview-reset-mock');
  if (exBtn) {
    exBtn.title = reportsT('rep_example');
    const icon = exBtn.querySelector('ion-icon');
    exBtn.textContent = '';
    if (icon) exBtn.appendChild(icon);
    exBtn.appendChild(document.createTextNode(reportsT('rep_example')));
  }
  setText('rep-h3-banner', 'rep_h3_banner');
  setText('rep-lbl-logo', 'rep_lbl_logo');
  setText('rep-lbl-title', 'rep_lbl_title');
  setText('rep-lbl-sub', 'rep_lbl_sub');
  const lg = document.getElementById('ed-logo');
  if (lg) lg.placeholder = reportsT('rep_ph_logo');
  const et = document.getElementById('ed-report-title');
  if (et) et.placeholder = reportsT('rep_ph_title');
  const esu = document.getElementById('ed-report-subtitle');
  if (esu) esu.placeholder = reportsT('rep_ph_sub');
  setText('rep-h3-modules', 'rep_h3_modules');
  setText('rep-mod-help-sum-text', 'rep_mod_help_sum');
  setText('rep-mod-help-body', 'rep_mod_help_body');
  setText('rep-h3-theme', 'rep_h3_theme');
  setText('rep-lbl-font', 'rep_lbl_font');
  setText('rep-lbl-scale', 'rep_lbl_scale');
  const tf = document.getElementById('th-font');
  if (tf) tf.placeholder = reportsT('rep_ph_font');
  const themeLabels = [
    ['th-color-banner-start', 'rep_color_banner_start'],
    ['th-color-banner-end', 'rep_color_banner_end'],
    ['th-color-tech-start', 'rep_color_tech_start'],
    ['th-color-tech-end', 'rep_color_tech_end'],
    ['th-color-accent', 'rep_color_accent'],
    ['th-color-form-num', 'rep_color_form_num'],
    ['th-color-pill-yes', 'rep_color_pill_yes'],
    ['th-color-pill-no', 'rep_color_pill_no'],
    ['th-color-tl-blue', 'rep_color_tl_blue'],
    ['th-color-tl-green', 'rep_color_tl_green'],
    ['th-color-photo', 'rep_color_photo'],
    ['th-color-transit', 'rep_color_transit'],
  ];
  for (const [inputId, key] of themeLabels) {
    const inp = document.getElementById(inputId);
    if (!inp) continue;
    const lab = inp.closest('label');
    if (!lab) continue;
    const t = reportsT(key);
    for (const node of [...lab.childNodes]) {
      if (node === inp) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = t;
        break;
      }
    }
  }
  setText('rep-h3-fields', 'rep_h3_fields');
  setText('rep-hide-empty-text', 'rep_hide_empty');
  setText('rep-fields-help-sum-text', 'rep_fields_help_sum');
  setText('rep-fields-help-body', 'rep_fields_help_body');
  setText('rep-canvas-a4', 'rep_canvas_a4');
  setText('rep-canvas-live', 'rep_live');
}

export function reportModuleLabel(key) {
  const k = `rep_mod_${key}`;
  const v = reportsT(k);
  return v === k ? key : v;
}
