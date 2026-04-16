/**
 * checklists-builder.js
 * Lógica do Criador de Formulários Drag & Drop com Vanilla JS e SortableJS
 */

function brsparkApiBase() {
  if (typeof window !== 'undefined' && window.__BRSPARK_API_BASE__) {
    let b = String(window.__BRSPARK_API_BASE__).replace(/\/+$/, '');
    // Evita pedidos a …/api/api/checklists/… (404 "Route not found" no Express)
    while (/\/api\/api$/i.test(b)) {
      b = b.replace(/\/api$/i, '');
    }
    return b;
  }
  try {
    const ls = localStorage.getItem('brspark_admin_api_origin');
    if (ls) return String(ls).replace(/\/$/, '') + '/api';
  } catch (e) { /* ignore */ }
  if (typeof window !== 'undefined' && window.location?.origin && window.location.protocol !== 'file:') {
    return window.location.origin + '/api';
  }
  return 'http://127.0.0.1:3001/api';
}

/** Origem do servidor Node (sem /api) — imagens /uploads/… */
function brsparkServerOrigin() {
  return brsparkApiBase().replace(/\/api\/?$/, '');
}

function absoluteUploadUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return brsparkServerOrigin() + (path.startsWith('/') ? path : '/' + path);
}

/** Alinhado a `admin-panel/backend/src/constants/visionSimNaoQuestions.js`. */
const MAX_VISION_SIMNAO_QUESTIONS = 10;
const MAX_VISION_STRUCTURED_PROMPT_CHARS = 12000;
/** Alinhado a `checklistsVision.js` / `visionSimNaoQuestions.js` quando há mais de uma pergunta. */
const MAX_VISION_MULTI_SIMNAO_TEXT_CHARS = 500;

/** URL da imagem no preview do builder: origem da página se a porta for a da API (corrige localhost vs 127.0.0.1). */
function helpImageDisplayUrl(pathOrUrl) {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl;
  if (typeof window !== 'undefined' && window.location?.origin && window.location.protocol.startsWith('http')) {
    try {
      const apiO = new URL(brsparkServerOrigin());
      const pageO = new URL(window.location.origin);
      const normPort = (u) => u.port || (u.protocol === 'https:' ? '443' : '80');
      if (normPort(apiO) === normPort(pageO)) {
        return window.location.origin + path;
      }
    } catch (e) { /* fall through */ }
  }
  return absoluteUploadUrl(pathOrUrl);
}

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Catálogo local `brspark_checklists_db` — JSON inválido não deve quebrar o painel. */
function parseLocalChecklistsDb() {
  try {
    const raw = localStorage.getItem('brspark_checklists_db');
    if (raw == null || !String(raw).trim()) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) {
    console.warn(
      '[checklists-builder] Cache brspark_checklists_db inválido ou corrompido; a repor catálogo vazio.',
      e,
    );
    try {
      localStorage.removeItem('brspark_checklists_db');
    } catch (_) {
      /* ignore */
    }
    return {};
  }
}

function fbStr(key, vars, fallbackPt) {
  try {
    if (typeof window.fbT === 'function') {
      const s = window.fbT(key, vars);
      if (s && s !== key) return s;
    }
  } catch (e) {
    /* ignore */
  }
  return fallbackPt != null ? String(fallbackPt) : String(key);
}

function fbAlert(key, vars, fallbackPt) {
  alert(fbStr(key, vars, fallbackPt));
}

/** Rótulo de `section_break` no canvas: reconhece «Etapa N» / «Step N» / marcadores por defeito em qualquer idioma. */
function translateStepLabelForCanvasDisplay(rawLabel) {
  const s = String(rawLabel || '').trim();
  if (!s) return fbStr('fb_canvas_new_step', null, 'Nova etapa');
  const mEt = s.match(/^Etapa\s+(\d+)$/i);
  if (mEt) return fbStr('fb_canvas_step_n', { n: mEt[1] }, 'Etapa ' + mEt[1]);
  const mSt = s.match(/^Step\s+(\d+)$/i);
  if (mSt) return fbStr('fb_canvas_step_n', { n: mSt[1] }, 'Step ' + mSt[1]);
  const u = s.toUpperCase();
  if (u === 'NOVA ETAPA' || u === 'NEW STEP') return fbStr('fb_canvas_new_step', null, 'Nova etapa');
  return s;
}

function adminJsonHeaders() {
  const h = { 'Content-Type': 'application/json' };
  try {
    const t = sessionStorage.getItem('brspark_admin_token');
    if (t) h['Authorization'] = 'Bearer ' + t;
  } catch (e) { /* ignore */ }
  return h;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error('Leitura do arquivo falhou'));
    r.readAsDataURL(file);
  });
}

window.fieldHelpQuill = null;
/** ID do campo cujo texto está actualmente no Quill (evita perder edições ao re-renderizar o painel). */
window.quillBoundFieldId = null;
window.fieldReadingQuill = null;
window.quillReadingBoundFieldId = null;

/** Remove links e conteúdo perigoso do HTML da Leitura (só browser / painel). */
function stripReadingHtml(html) {
  const s = String(html || '');
  if (!s.trim()) return '';
  try {
    const doc = new DOMParser().parseFromString('<div id="__rroot">' + s + '</div>', 'text/html');
    const root = doc.getElementById('__rroot');
    if (!root) return s;
    root.querySelectorAll('script, iframe, object, embed, form, button, input, select, textarea').forEach((n) => n.remove());
    root.querySelectorAll('a').forEach((a) => {
      const span = doc.createElement('span');
      span.innerHTML = a.innerHTML;
      a.replaceWith(span);
    });
    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on')) el.removeAttribute(attr.name);
        if ((n === 'href' || n === 'src') && /^javascript:/i.test(String(attr.value))) el.removeAttribute(attr.name);
      });
    });
    return root.innerHTML;
  } catch (e) {
    return s
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<a\b[^>]*>/gi, '<span>')
      .replace(/<\/a>/gi, '</span>');
  }
}

function flushReadingQuillToBoundField() {
  const quill = window.fieldReadingQuill;
  const bid = window.quillReadingBoundFieldId;
  if (!quill || !bid) return;
  const f = fields.find((x) => x.id === bid);
  if (f) {
    f.contentHtml = stripReadingHtml(quill.root.innerHTML);
  }
}

function flushQuillToBoundField() {
  const quill = window.fieldHelpQuill;
  const bid = window.quillBoundFieldId;
  if (!quill || !bid) return;
  const f = fields.find((x) => x.id === bid);
  if (f) {
    f.helpHtml = quill.root.innerHTML;
    f.description = quill.getText().trim();
  }
}

/** Instruções com texto OU só imagem (Quill). */
function fieldHasRichHelp(f) {
  if (!f || !f.helpHtml || !String(f.helpHtml).trim()) return false;
  const html = String(f.helpHtml);
  const textOnly = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  if (textOnly.length > 0) return true;
  return /<img\b/i.test(html);
}

/** Texto simples em description OU rich help (para inferir flag em templates antigos). */
function fieldHasInstructionContent(f) {
  if (!f) return false;
  if (f.description && String(f.description).trim()) return true;
  return fieldHasRichHelp(f);
}

/** Garante boolean explícito em showFieldInstructions (templates antigos vinham sem a chave). */
function ensureShowFieldInstructionsFlag(f) {
  const base = { ...f };
  if (base.showFieldInstructions === true || base.showFieldInstructions === false) return base;
  base.showFieldInstructions = fieldHasInstructionContent(base);
  return base;
}

/** Visão IA Análise: só 1×1 e 2×2; valores antigos migram para 2×2. */
function normalizeVisionAnalysisGridStored(f) {
  if (!f || f.type !== 'vision_ai_analysis') return f;
  const raw = String(f.visionAnalysisGrid || '1x1')
    .trim()
    .toLowerCase()
    .replace(/\*/g, 'x');
  let g = '1x1';
  if (raw === '1x1' || raw === '2x2') g = raw;
  else if (['2x1', '3x1', '3x2', '3x3'].includes(raw)) g = '2x2';
  if (g === String(f.visionAnalysisGrid || '').trim().toLowerCase().replace(/\*/g, 'x')) return f;
  return { ...f, visionAnalysisGrid: g };
}

function ensureSchemaInstructionFlags(schema) {
  if (!Array.isArray(schema)) return schema;
  return schema.map((x) => normalizeVisionAnalysisGridStored(ensureShowFieldInstructionsFlag(x)));
}

/**
 * A API por vezes devolve schemaData sem helpHtml; o Quill também pode falhar ao converter HTML com <img>.
 * Preserva helpHtml/description ricos do lado local (prevSnapshot) quando o campo vindo da API veio “limpo”.
 */
function mergeSchemaKeepRichHelp(prevSnapshot, apiSchema) {
  if (!Array.isArray(apiSchema) || apiSchema.length === 0) {
    return Array.isArray(prevSnapshot) ? prevSnapshot : [];
  }
  if (!Array.isArray(prevSnapshot)) prevSnapshot = [];
  const localById = new Map(prevSnapshot.map((x) => [x.id, x]));
    const merged = apiSchema.map((apiField) => {
    if (fieldHasRichHelp(apiField)) return apiField;
    const loc = localById.get(apiField.id);
    if (loc && fieldHasRichHelp(loc)) {
      return {
        ...apiField,
        helpHtml: loc.helpHtml,
        description:
          apiField.description && String(apiField.description).trim()
            ? apiField.description
            : loc.description || '',
      };
    }
    return apiField;
  });
    return merged.map((fld) => {
      if (fld.showFieldInstructions === true || fld.showFieldInstructions === false) return fld;
      const loc = localById.get(fld.id);
      if (loc && (loc.showFieldInstructions === true || loc.showFieldInstructions === false)) {
        return { ...fld, showFieldInstructions: loc.showFieldInstructions };
      }
      return ensureShowFieldInstructionsFlag(fld);
    });
}

window.destroyFieldHelpEditor = function () {
  window.fieldHelpQuill = null;
  window.quillBoundFieldId = null;
  const el = document.getElementById('field-help-editor');
  if (el) el.innerHTML = '';
};

window.destroyFieldReadingEditor = function () {
  window.fieldReadingQuill = null;
  window.quillReadingBoundFieldId = null;
  const el = document.getElementById('field-reading-editor');
  if (el) el.innerHTML = '';
};

function fieldHelpImageHandler() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:-2000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(input);
  const cleanup = () => {
    try {
      if (input.parentNode) input.parentNode.removeChild(input);
    } catch (e) { /* ignore */ }
  };
  input.addEventListener(
    'change',
    async () => {
    const file = input.files && input.files[0];
    cleanup();
    if (!file) return;
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch(`${brsparkApiBase()}/checklists/help-image`, {
        method: 'POST',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ fileBase64, mimeType: file.type || 'image/jpeg' }),
      });
      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (_) {
        data = { error: rawText.slice(0, 200) || 'Resposta inválida do servidor' };
      }
      if (!res.ok) {
        const hint401 =
          res.status === 401 ? fbStr('fb_alert_help_image_401_hint', null, '') : '';
        const base = data.error || fbStr('fb_alert_upload_rejected', null, 'Upload recusado.');
        alert(base + hint401);
        return;
      }
      const url = data.url;
      if (!url) {
        fbAlert('fb_alert_no_image_url', null, 'O servidor não devolveu o URL da imagem.');
        return;
      }
      const quill = window.fieldHelpQuill;
      if (!quill) {
        fbAlert(
          'fb_alert_editor_not_ready',
          null,
          'O editor não está pronto. Clique de novo no campo e tente inserir a imagem.'
        );
        return;
      }
      const imgSrc = helpImageDisplayUrl(url);
      quill.focus();
      const sel = quill.getSelection(true);
      const len = quill.getLength();
      let index = sel && typeof sel.index === 'number' ? sel.index : Math.max(0, len - 1);
      index = Math.max(0, Math.min(index, Math.max(0, len - 1)));

      // insertEmbed com imagem (BlockEmbed) no Quill 1.3 falha em vários índices; HTML é fiável
      const snippet = `<p><img src="${escapeHtmlAttr(imgSrc)}" alt="" /></p>`;
      try {
        quill.clipboard.dangerouslyPasteHTML(index, snippet, 'user');
      } catch (e1) {
        try {
          const Delta = Quill.import('delta');
          quill.updateContents(new Delta().retain(index).insert({ image: imgSrc }).insert('\n'), 'user');
        } catch (e2) {
          console.error('[help-image] paste', e1, e2);
          fbAlert(
            'fb_alert_image_insert_fail',
            null,
            'Não foi possível inserir a imagem no editor. Actualize a página e tente de novo.'
          );
          return;
        }
      }

      const after = Math.min(quill.getLength(), index + 2);
      quill.setSelection(after, 0, 'silent');
    } catch (err) {
      console.error(err);
      fbAlert(
        'fb_alert_image_send_fail',
        { detail: String(err && err.message ? err.message : err) },
        'Falha ao enviar imagem: ' + (err.message || err)
      );
    }
    },
    { once: true }
  );
  input.addEventListener(
    'cancel',
    () => {
      cleanup();
    },
    { once: true }
  );
  try {
    input.click();
  } catch (e) {
    cleanup();
    console.error('[help-image] file picker', e);
    fbAlert(
      'fb_alert_file_picker',
      null,
      'Não foi possível abrir o seletor de arquivos. Tente outro navegador ou permissões de arquivos.'
    );
  }
}

function fieldReadingImageHandler() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:-2000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(input);
  const cleanup = () => {
    try {
      if (input.parentNode) input.parentNode.removeChild(input);
    } catch (e) { /* ignore */ }
  };
  input.addEventListener(
    'change',
    async () => {
      const file = input.files && input.files[0];
      cleanup();
      if (!file) return;
      try {
        const fileBase64 = await fileToBase64(file);
        const res = await fetch(`${brsparkApiBase()}/checklists/help-image`, {
          method: 'POST',
          headers: adminJsonHeaders(),
          body: JSON.stringify({ fileBase64, mimeType: file.type || 'image/jpeg' }),
        });
        const rawText = await res.text();
        let data = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch (_) {
          data = { error: rawText.slice(0, 200) || 'Resposta inválida do servidor' };
        }
        if (!res.ok) {
          fbAlert('fb_alert_upload_rejected', null, data.error || 'Upload recusado.');
          return;
        }
        const url = data.url;
        if (!url) {
          fbAlert('fb_alert_no_image_url', null, 'O servidor não devolveu o URL da imagem.');
          return;
        }
        const quill = window.fieldReadingQuill;
        if (!quill) {
          fbAlert(
            'fb_alert_editor_not_ready',
            null,
            'O editor não está pronto. Clique de novo no campo e tente inserir a imagem.'
          );
          return;
        }
        const imgSrc = helpImageDisplayUrl(url);
        quill.focus();
        const sel = quill.getSelection(true);
        const len = quill.getLength();
        let index = sel && typeof sel.index === 'number' ? sel.index : Math.max(0, len - 1);
        index = Math.max(0, Math.min(index, Math.max(0, len - 1)));
        const snippet = `<p><img src="${escapeHtmlAttr(imgSrc)}" alt="" /></p>`;
        try {
          quill.clipboard.dangerouslyPasteHTML(index, snippet, 'user');
        } catch (e1) {
          try {
            const Delta = Quill.import('delta');
            quill.updateContents(new Delta().retain(index).insert({ image: imgSrc }).insert('\n'), 'user');
          } catch (e2) {
            console.error('[reading-image] paste', e1, e2);
            fbAlert(
              'fb_alert_image_insert_fail',
              null,
              'Não foi possível inserir a imagem no editor. Actualize a página e tente de novo.'
            );
            return;
          }
        }
        const after = Math.min(quill.getLength(), index + 2);
        quill.setSelection(after, 0, 'silent');
      } catch (err) {
        console.error(err);
        fbAlert(
          'fb_alert_image_send_fail',
          { detail: String(err && err.message ? err.message : err) },
          'Falha ao enviar imagem: ' + (err.message || err)
        );
      }
    },
    { once: true }
  );
  input.addEventListener('cancel', () => cleanup(), { once: true });
  try {
    input.click();
  } catch (e) {
    cleanup();
    console.error('[reading-image] file picker', e);
    fbAlert(
      'fb_alert_file_picker',
      null,
      'Não foi possível abrir o seletor de arquivos. Tente outro navegador ou permissões de arquivos.'
    );
  }
}

function refocusCanvasTitleInputIfRequested(field) {
  const refocusId = window.__brsparkLabelInputRefocusId;
  if (!field || !refocusId || refocusId !== field.id) return;
  window.__brsparkLabelInputRefocusId = null;
  requestAnimationFrame(() => {
    const row = document.querySelector('.canvas-item[data-id="' + refocusId + '"]');
    const inp = row && row.querySelector('.canvas-item-title-input');
    if (inp) inp.focus({ preventScroll: true });
  });
}

window.initFieldHelpEditor = function (field) {
  flushReadingQuillToBoundField();
  if (typeof window.destroyFieldReadingEditor === 'function') window.destroyFieldReadingEditor();
  flushQuillToBoundField();
  window.destroyFieldHelpEditor();
  if (typeof Quill === 'undefined') {
    console.warn('[builder] Quill não disponível (CDN).');
    refocusCanvasTitleInputIfRequested(field);
    return;
  }
  const host = document.getElementById('field-help-editor');
  if (!host) {
    refocusCanvasTitleInputIfRequested(field);
    return;
  }
  const quill = new Quill('#field-help-editor', {
    theme: 'snow',
    modules: {
      toolbar: {
        container: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image'],
        ],
        handlers: { image: fieldHelpImageHandler },
      },
    },
    placeholder: fbStr(
      'fb_quill_help_placeholder',
      null,
      'Texto e imagens que o técnico consulta no app (botão «Instruções»).'
    ),
  });
  window.fieldHelpQuill = quill;
  window.quillBoundFieldId = field.id;
  quill.on('text-change', function () {
    const bid = window.quillBoundFieldId;
    if (!bid) return;
    const f = fields.find((x) => x.id === bid);
    if (!f) return;
    f.helpHtml = quill.root.innerHTML;
    f.description = quill.getText().trim();
    if (typeof window.renderMobilePreview === 'function') window.renderMobilePreview();
  });
  const initial = (field.helpHtml && String(field.helpHtml).trim())
    ? field.helpHtml
    : (field.description ? `<p>${String(field.description).replace(/</g, '&lt;')}</p>` : '');
  if (initial) {
    try {
      // Mesmo caminho que o upload de imagem; clipboard.convert() costuma falhar ou esvaziar com <img>
      quill.clipboard.dangerouslyPasteHTML(0, initial, 'silent');
    } catch (e1) {
      try {
        quill.setContents(quill.clipboard.convert({ html: initial }), 'silent');
      } catch (e2) {
        console.warn('[builder] helpHtml load', e1, e2);
        quill.setText(field.description || '', 'silent');
      }
    }
  }
  refocusCanvasTitleInputIfRequested(field);
};

window.initFieldReadingEditor = function (field) {
  flushReadingQuillToBoundField();
  window.destroyFieldReadingEditor();
  if (typeof Quill === 'undefined') {
    console.warn('[builder] Quill não disponível (CDN).');
    refocusCanvasTitleInputIfRequested(field);
    return;
  }
  const host = document.getElementById('field-reading-editor');
  if (!host) {
    refocusCanvasTitleInputIfRequested(field);
    return;
  }
  const quill = new Quill('#field-reading-editor', {
    theme: 'snow',
    modules: {
      toolbar: {
        container: [
          ['bold', 'italic', 'underline'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['image'],
        ],
        handlers: { image: fieldReadingImageHandler },
      },
    },
    placeholder: fbStr(
      'fb_quill_reading_placeholder',
      null,
      'Texto formatado exibido no app (só leitura). Hiperlinks não são permitidos.'
    ),
  });
  window.fieldReadingQuill = quill;
  window.quillReadingBoundFieldId = field.id;
  quill.on('text-change', function () {
    const bid = window.quillReadingBoundFieldId;
    if (!bid) return;
    const f = fields.find((x) => x.id === bid);
    if (!f) return;
    f.contentHtml = stripReadingHtml(quill.root.innerHTML);
    if (typeof window.renderMobilePreview === 'function') window.renderMobilePreview();
  });
  const initial = field.contentHtml && String(field.contentHtml).trim() ? field.contentHtml : '';
  if (initial) {
    try {
      quill.clipboard.dangerouslyPasteHTML(0, initial, 'silent');
    } catch (e1) {
      try {
        quill.setContents(quill.clipboard.convert({ html: initial }), 'silent');
      } catch (e2) {
        console.warn('[builder] contentHtml load', e1, e2);
        quill.setText('', 'silent');
      }
    }
  }
  refocusCanvasTitleInputIfRequested(field);
};

// 1. Initialize State
let fields = [];
let selectedFieldId = null;
/** Usado pelo i18n do builder para re-renderizar o painel de propriedades ao mudar o idioma. */
window.__fbHasSelectedFieldForProps = function () {
    return Boolean(selectedFieldId);
};
let currentFormId = null;
let currentFormTitle = '';

/** Título ainda não personalizado (valor inicial / mudança de idioma). */
function isGenericDefaultFormTitle(raw) {
    const s = String(raw || '').trim();
    if (!s) return true;
    const t = s.toLowerCase();
    return (
        t === 'novo formulário' ||
        t === 'novo formulario' ||
        t === 'novo checklist' ||
        t === 'new form' ||
        t === 'new checklist'
    );
}

/** Chamado pelo i18n do builder: preenche #tpl-title e `currentFormTitle` com o título padrão no idioma atual. */
window.__fbApplyLocalizedDefaultFormTitle = function () {
    const el = document.getElementById('tpl-title');
    if (!el) return;
    if (!isGenericDefaultFormTitle(el.value)) return;
    const nt = fbStr('mdl_new_form_title', null, 'Novo formulário');
    el.value = nt;
    currentFormTitle = nt;
};

let currentFormDesc = '';
let currentFormIcon = '';
/** Biblioteca do ícone do modelo (`metadata.iconLibrary`) — paridade com o app e com `renderWebIcon`. */
let currentFormIconLibrary = 'Ionicons';
/** Pasta do modelo em edição (null = raiz) — persistida na API como folderId */
let currentFormFolderId = null;
/** Pasta aberta no modal “Meus Formulários” */
let builderBrowseFolderId = null;
/** Lista plana de pastas (GET /template-folders) */
let builderFolders = [];

let iconPickerCallback = null;
let currentIconLib = 'Ionicons';
let currentIconColor = '#1d4ed8';

const ICON_PICKER_COLOR_LS = 'brspark_builder_last_icon_color';
/** Valor do &lt;select&gt; para mostrar amostra de todas as bibliotecas (sem pesquisa). */
const ICON_LIB_ALL = '__ALL__';

/**
 * Palavras em português → termo em inglês presente nos nomes dos ícones (a pesquisa continua por substring).
 * Não cobre todas as bibliotecas; amplia casos comuns.
 */
const ICON_SEARCH_PT_ALIASES = {
    estrela: 'star',
    carro: 'car',
    casa: 'home',
    telefone: 'phone',
    celular: 'phone',
    chamada: 'call',
    email: 'mail',
    correio: 'mail',
    envelope: 'mail',
    localizacao: 'location',
    localização: 'location',
    mapa: 'map',
    gps: 'location',
    pessoa: 'person',
    usuario: 'user',
    camera: 'camera',
    câmera: 'camera',
    foto: 'camera',
    imagem: 'image',
    copiar: 'copy',
    apagar: 'trash',
    lixo: 'trash',
    eliminar: 'delete',
    configuracao: 'settings',
    configuração: 'settings',
    engrenagem: 'settings',
    guardar: 'save',
    salvar: 'save',
    pesquisa: 'search',
    buscar: 'search',
    calendario: 'calendar',
    calendário: 'calendar',
    relogio: 'time',
    relógio: 'time',
    tempo: 'time',
    documento: 'document',
    arquivo: 'file',
    pasta: 'folder',
    cadeado: 'lock',
    seguranca: 'security',
    aviso: 'warning',
    informacao: 'information',
    informação: 'information',
    ajuda: 'help',
    coracao: 'heart',
    coração: 'heart',
    música: 'music',
    musica: 'music',
    video: 'video',
    vídeo: 'video',
    play: 'play',
    pausa: 'pause',
    seta: 'arrow',
    voltar: 'back',
    fechar: 'close',
    certo: 'check',
    visto: 'check',
    erro: 'error',
    sucesso: 'success',
    carrinho: 'cart',
    compras: 'cart',
    dinheiro: 'money',
    cartao: 'card',
    cartão: 'card',
    banco: 'bank',
    edificio: 'building',
    edifício: 'building',
    empresa: 'business',
    trabalho: 'work',
    ferramenta: 'tool',
    chave: 'key',
    lapis: 'pencil',
    lápis: 'pencil',
    caneta: 'pen',
    olho: 'eye',
    visivel: 'eye',
    invisivel: 'eye-off',
    nota: 'note',
    lista: 'list',
    menu: 'menu',
    mais: 'plus',
    menos: 'minus',
    adicionar: 'add',
    remover: 'remove',
};

function expandIconSearchTerms(raw) {
    const q = String(raw || '').trim().toLowerCase();
    if (!q) return [];
    const terms = new Set([q]);
    q.split(/[\s,;]+/).forEach((w) => {
        if (!w) return;
        terms.add(w);
        const en = ICON_SEARCH_PT_ALIASES[w];
        if (en) terms.add(en.toLowerCase());
    });
    return [...terms];
}

function loadStoredIconPickerColor() {
    try {
        const v = localStorage.getItem(ICON_PICKER_COLOR_LS);
        if (v && /^#[0-9A-Fa-f]{6}$/.test(v.trim())) return v.trim();
    } catch (e) { /* ignore */ }
    return '#1d4ed8';
}

function saveLastIconPickerColor(hex) {
    if (!hex || typeof hex !== 'string') return;
    const h = hex.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return;
    lastIconPickerColor = h;
    currentIconColor = h;
    try {
        localStorage.setItem(ICON_PICKER_COLOR_LS, h);
    } catch (e) { /* ignore */ }
}

/** Última cor usada no picker — reabre o modal com esta cor (não volta ao preto). */
let lastIconPickerColor = loadStoredIconPickerColor();
currentIconColor = lastIconPickerColor;

window.openIconPicker = function(cb) {
    iconPickerCallback = cb;
    document.getElementById('icon-picker-modal').style.display = 'flex';
    document.getElementById('icon-search').value = '';
    
    const libSelect = document.getElementById('icon-lib-select');
    if (libSelect) {
        const prev = libSelect.value;
        libSelect.innerHTML = `<option value="${ICON_LIB_ALL}">Todos</option>`;
        Object.keys(window.ICON_LIBRARIES || {})
            .sort((a, b) => a.localeCompare(b))
            .forEach((lib) => {
                libSelect.innerHTML += `<option value="${lib}">${lib}</option>`;
            });
        const keep = prev && [...libSelect.options].some((o) => o.value === prev);
        libSelect.value = keep ? prev : 'Ionicons';
    }
    const colorEl = document.getElementById('icon-color');
    colorEl.value = lastIconPickerColor;
    currentIconColor = lastIconPickerColor;
    
    window.switchIconLibrary();
};

window.switchIconLibrary = function() {
    const v = document.getElementById('icon-lib-select').value;
    currentIconLib = v || 'Ionicons';
    const q = (document.getElementById('icon-search') && document.getElementById('icon-search').value) || '';
    window.filterIcons(q);
};

window.updateIconGridColors = function() {
    currentIconColor = document.getElementById('icon-color').value || lastIconPickerColor;
    saveLastIconPickerColor(currentIconColor);
    document.querySelectorAll('.icon-btn-picker .icon-render').forEach(el => {
        el.style.color = currentIconColor;
    });
};

window.renderWebIcon = function(lib, name, hexColor, sizePx, compact) {
    const s = sizePx || 24;
    const mb = compact ? '0' : '6px';
    const style = `text-align:center; font-size:${s}px; margin-bottom:${mb}; line-height:1; color:${hexColor||'inherit'}`;
    
    // Native Universal Expo Vector Icons Mapping Generated!
    return `<i class="icon-render rnvi-${lib} rnvi-${lib}-${name}" style="${style}"></i>`;
};

function appendIconPickerCell(ic, libForRender, libOverrideOnConfirm, showLibBadge) {
    const grid = document.getElementById('icon-grid');
    const div = document.createElement('div');
    div.className = 'icon-btn-picker';
    div.style.cssText =
        'display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 8px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; background:#f8fafc; transition:0.2s;';
    const visual = window.renderWebIcon(libForRender, ic, currentIconColor, 24);
    const badge = showLibBadge
        ? `<span style="font-size:7px; color:#94a3b8; text-align:center; line-height:1.1; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${libForRender}</span>`
        : '';
    div.innerHTML = `${visual}<span style="font-size:9px; color:#64748b; text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis;">${ic.substring(0, 20)}</span>${badge}`;
    div.onclick = () => window.confirmIconSelection(ic, libOverrideOnConfirm);
    div.onmouseover = () => {
        div.style.borderColor = 'var(--primary)';
        div.style.backgroundColor = '#eff6ff';
    };
    div.onmouseout = () => {
        div.style.borderColor = '#e2e8f0';
        div.style.backgroundColor = '#f8fafc';
    };
    grid.appendChild(div);
}

window.filterIcons = function(query) {
    const grid = document.getElementById('icon-grid');
    grid.innerHTML = '';
    const raw = String(query || '').trim();
    const q = raw.toLowerCase();
    const searchTerms = expandIconSearchTerms(raw);
    const primaryForSort = q;

    const libs = window.ICON_LIBRARIES || {};

    if (!q) {
        if (currentIconLib === ICON_LIB_ALL) {
            const maxTotal = 260;
            const perLibCap = 36;
            let count = 0;
            Object.keys(libs)
                .sort((a, b) => a.localeCompare(b))
                .forEach((lib) => {
                    if (count >= maxTotal) return;
                    const icons = libs[lib] || [];
                    const n = Math.min(perLibCap, maxTotal - count);
                    icons.slice(0, n).forEach((ic) => {
                        if (count >= maxTotal) return;
                        appendIconPickerCell(ic, lib, lib, true);
                        count++;
                    });
                });
            return;
        }
        const icons = libs[currentIconLib] || [];
        icons.slice(0, 150).forEach((ic) => appendIconPickerCell(ic, currentIconLib, undefined, false));
        return;
    }

    const maxTotal = 200;
    const pairs = [];
    const matchesIcon = (ic) => {
        const al = ic.toLowerCase();
        return searchTerms.some((t) => al.includes(t));
    };
    Object.keys(libs).forEach((lib) => {
        const icons = libs[lib] || [];
        icons.forEach((ic) => {
            if (matchesIcon(ic)) pairs.push({ lib, ic });
        });
    });
    pairs.sort((a, b) => {
        const al = a.ic.toLowerCase();
        const bl = b.ic.toLowerCase();
        const ap = al.startsWith(primaryForSort) ? 0 : 1;
        const bp = bl.startsWith(primaryForSort) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (al.length !== bl.length) return al.length - bl.length;
        return al.localeCompare(bl);
    });
    pairs.slice(0, maxTotal).forEach(({ lib, ic }) => appendIconPickerCell(ic, lib, lib, true));
};

window.confirmIconSelection = function(val, libOverride) {
    const colorEl = document.getElementById('icon-color');
    if (colorEl && colorEl.value) {
        currentIconColor = colorEl.value;
        saveLastIconPickerColor(currentIconColor);
    }
    if (iconPickerCallback) {
        if (!val) iconPickerCallback('', '', '');
        else iconPickerCallback(val, libOverride || currentIconLib, currentIconColor);
    }
    document.getElementById('icon-picker-modal').style.display = 'none';
};

/** Rascunho do modal "Editar etapa" (nome + ícone da seção). */
window.__sectionStepEditDraft = {
    sectionId: null,
    label: '',
    icon: '',
    iconLibrary: 'Ionicons',
    iconColor: '#7c3aed',
};

function sectionStepIconCanvasHtml(sf) {
    if (sf && sf.icon) {
        return window.renderWebIcon(sf.iconLibrary || 'Ionicons', sf.icon, sf.iconColor || '#7c3aed', 18);
    }
    return '<ion-icon name="albums-outline" style="vertical-align:-3px;color:#7c3aed;"></ion-icon>';
}

window.refreshSectionStepEditIconPreview = function () {
    const el = document.getElementById('section-step-edit-icon-preview');
    if (!el) return;
    const d = window.__sectionStepEditDraft;
    if (d && d.icon) {
        el.innerHTML = window.renderWebIcon(d.iconLibrary || 'Ionicons', d.icon, d.iconColor || '#1d4ed8', 36);
    } else {
        el.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;color:#94a3b8;font-size:12px;font-weight:600;"><ion-icon name="albums-outline" style="font-size:40px;color:#cbd5e1;"></ion-icon>Padrão (álbuns)</div>';
    }
};

window.openSectionStepEditModal = function (sectionId) {
    const sf = fields.find((x) => x.id === sectionId && x.type === 'section_break');
    if (!sf) return;
    const m = document.getElementById('section-step-edit-modal');
    const inp = document.getElementById('section-step-edit-title');
    if (!m || !inp) return;
    if (typeof window.closeFieldPropertiesModal === 'function') window.closeFieldPropertiesModal();
    window.selectField(sf.id);
    window.__sectionStepEditDraft = {
        sectionId: sf.id,
        label: sf.label || '',
        icon: sf.icon || '',
        iconLibrary: sf.iconLibrary || 'Ionicons',
        iconColor: sf.iconColor || lastIconPickerColor,
    };
    inp.value = window.__sectionStepEditDraft.label;
    window.refreshSectionStepEditIconPreview();
    m.style.display = 'flex';
    setTimeout(() => {
        inp.focus();
        try {
            inp.select();
        } catch (e) {
            /* ignore */
        }
    }, 50);
};

window.closeSectionStepEditModal = function () {
    const modal = document.getElementById('section-step-edit-modal');
    if (modal) modal.style.display = 'none';
};

window.sectionStepEditPickIcon = function () {
    window.openIconPicker((iconName, iconLib, iconColor) => {
        const d = window.__sectionStepEditDraft;
        if (!d || !d.sectionId) return;
        d.icon = iconName || '';
        d.iconLibrary = iconLib || 'Ionicons';
        d.iconColor = iconColor || lastIconPickerColor;
        window.refreshSectionStepEditIconPreview();
    });
};

window.sectionStepEditClearIcon = function () {
    const d = window.__sectionStepEditDraft;
    if (!d) return;
    d.icon = '';
    d.iconLibrary = 'Ionicons';
    d.iconColor = '#7c3aed';
    window.refreshSectionStepEditIconPreview();
};

window.applySectionStepEditModal = function () {
    const inp = document.getElementById('section-step-edit-title');
    const d = window.__sectionStepEditDraft;
    if (!d || !d.sectionId) {
        window.closeSectionStepEditModal();
        return;
    }
    const sf = fields.find((x) => x.id === d.sectionId && x.type === 'section_break');
    if (!sf) {
        window.closeSectionStepEditModal();
        return;
    }
    sf.label = inp ? String(inp.value || '') : d.label;
    if (d.icon) {
        sf.icon = d.icon;
        sf.iconLibrary = d.iconLibrary || 'Ionicons';
        sf.iconColor = d.iconColor || '#1d4ed8';
    } else {
        sf.icon = '';
        sf.iconLibrary = '';
        sf.iconColor = '';
    }
    window.closeSectionStepEditModal();
    flushQuillToBoundField();
    renderCanvas();
    if (selectedFieldId === sf.id && window.fieldPropertiesModalOpen) renderProperties();
    if (typeof window.renderMobilePreview === 'function') window.renderMobilePreview();
};

/** O builder é carregado por `<script src>` injectado no `<head>`; sem re-resolver, estes refs podem ficar `null` para sempre. */
let elToolbox = document.getElementById('toolbox');
let elCanvas = document.getElementById('canvas');

function ensureBuilderToolboxEl() {
    if (!elToolbox) elToolbox = document.getElementById('toolbox');
    return elToolbox;
}

function ensureBuilderCanvasEl() {
    if (!elCanvas) elCanvas = document.getElementById('canvas');
    return elCanvas;
}

/** Baseline JSON para detetar alterações não guardadas (evita `rebuildFieldsOrderFromCanvas` aqui — risco de reentrância em `renderCanvas`). */
let __fbPersistBaseline = null;
let __fbDirtyTimer = null;

function getBuilderPersistFingerprint(opts) {
    opts = opts || {};
    try {
        flushQuillToBoundField();
    } catch (e) {
        /* ignore */
    }
    try {
        if (window.readAppSectionNavFromRadios) window.readAppSectionNavFromRadios();
    } catch (e2) {
        /* ignore */
    }
    if (opts.rebuildBefore) {
        try {
            rebuildFieldsOrderFromCanvas();
        } catch (eRb) {
            /* ignore */
        }
    }
    let settingsCopy = {};
    try {
        settingsCopy = JSON.parse(JSON.stringify(globalFormSettings || {}));
    } catch (e3) {
        settingsCopy = globalFormSettings || {};
    }
    let fieldsCopy = [];
    try {
        fieldsCopy = JSON.parse(JSON.stringify(fields || []));
    } catch (e4) {
        fieldsCopy = fields || [];
    }
    const tit = document.getElementById('tpl-title');
    const desc = document.getElementById('tpl-desc');
    const ic = document.getElementById('tpl-icon');
    const icl = document.getElementById('tpl-icon-library');
    return JSON.stringify({
        folderId: currentFormFolderId == null ? null : String(currentFormFolderId),
        formId: currentFormId == null ? null : String(currentFormId),
        title: tit ? String(tit.value || '') : '',
        desc: desc ? String(desc.value || '') : '',
        icon: ic ? String(ic.value || '') : '',
        iconLib: icl ? String(icl.value || '') : 'Ionicons',
        settings: settingsCopy,
        schema: fieldsCopy,
    });
}

function updateFbUnsavedBadge() {
    const badge = document.getElementById('fb-unsaved-badge');
    if (!badge) return;
    if (window.__fbHasUnsavedChanges) {
        badge.style.display = 'inline-flex';
        try {
            if (window.fbT) badge.textContent = window.fbT('fb_unsaved');
        } catch (e) {
            /* manter texto */
        }
    } else {
        badge.style.display = 'none';
    }
}

function recomputeBuilderDirtyState() {
    let cur = '';
    try {
        cur = getBuilderPersistFingerprint();
    } catch (e) {
        cur = '';
    }
    const dirty = __fbPersistBaseline != null && cur !== __fbPersistBaseline;
    window.__fbHasUnsavedChanges = !!dirty;
    updateFbUnsavedBadge();
}

window.syncBuilderPersistBaseline = function () {
    if (__fbDirtyTimer) {
        clearTimeout(__fbDirtyTimer);
        __fbDirtyTimer = null;
    }
    try {
        __fbPersistBaseline = getBuilderPersistFingerprint();
    } catch (e) {
        __fbPersistBaseline = '';
    }
    window.__fbHasUnsavedChanges = false;
    updateFbUnsavedBadge();
};

window.scheduleBuilderDirtyRecompute = function () {
    if (__fbDirtyTimer) clearTimeout(__fbDirtyTimer);
    __fbDirtyTimer = setTimeout(function () {
        __fbDirtyTimer = null;
        recomputeBuilderDirtyState();
    }, 250);
};

function validateChecklistLightBeforeSave() {
    const out = [];
    let emptyLabel = false;
    for (const f of fields || []) {
        if (!f || f.type === 'section_break') continue;
        if (!String(f.label || '').trim()) emptyLabel = true;
    }
    if (emptyLabel) {
        out.push(
            fbStr(
                'fb_val_empty_labels',
                null,
                'Há campos sem rótulo (etapas ignoradas). Corrija antes de salvar.'
            )
        );
    }
    const seen = new Map();
    for (const f of fields || []) {
        if (!f || !f.id) continue;
        const id = String(f.id);
        seen.set(id, (seen.get(id) || 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    if (dups.length) {
        out.push(
            fbStr(
                'fb_val_dup_ids',
                { ids: dups.join(', ') },
                'IDs de campo duplicados: ' + dups.join(', ') + '. Corrija antes de salvar.'
            )
        );
    }
    return out.length ? out : null;
}

window.initBuilderDirtyTracking = function () {
    if (window.initBuilderDirtyTracking.__done) return;
    window.initBuilderDirtyTracking.__done = true;
    window.addEventListener('beforeunload', function (ev) {
        let dirty = false;
        try {
            const cur = getBuilderPersistFingerprint({ rebuildBefore: true });
            dirty = __fbPersistBaseline != null && cur !== __fbPersistBaseline;
        } catch (e) {
            dirty = !!window.__fbHasUnsavedChanges;
        }
        if (!dirty) return;
        let msg = 'Tem alterações não guardadas. Sair mesmo assim?';
        try {
            if (window.fbT) msg = window.fbT('fb_unsaved_leave');
        } catch (e) {
            /* pt por defeito */
        }
        ev.preventDefault();
        ev.returnValue = msg;
        return msg;
    });
    window.addEventListener(
        'keydown',
        function (ev) {
            const k = String(ev.key || '').toLowerCase();
            if (!(ev.ctrlKey || ev.metaKey) || k !== 's') return;
            ev.preventDefault();
            if (typeof window.saveChecklist === 'function') void window.saveChecklist();
        },
        true
    );
    const root = document.querySelector('.fb-page-chrome') || document.body;
    root.addEventListener(
        'input',
        function (ev) {
            const t = ev.target;
            if (!t || !t.id) return;
            if (t.id === 'fb-toolbox-filter') return;
            if (t.id === 'tpl-title' || t.id === 'tpl-desc') {
                if (window.scheduleBuilderDirtyRecompute) window.scheduleBuilderDirtyRecompute();
            }
        },
        true
    );
    root.addEventListener(
        'change',
        function (ev) {
            const t = ev.target;
            if (!t || !t.id) return;
            if (t.id === 'tpl-icon' || t.id === 'tpl-icon-library') {
                if (window.scheduleBuilderDirtyRecompute) window.scheduleBuilderDirtyRecompute();
            }
        },
        true
    );
    setTimeout(function () {
        if (window.syncBuilderPersistBaseline) window.syncBuilderPersistBaseline();
    }, 0);
};

const elPropsBody = document.getElementById('field-properties-modal-body');

/** Modal de propriedades; quando false, clicar só no cartão não re-renderiza o painel. */
window.fieldPropertiesModalOpen = false;

function syncFieldPropertiesModalSubtitle() {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    const sub = document.getElementById('field-properties-modal-subtitle');
    if (sub && f) {
        const typeKey = 'fb_tb_' + String(f.type || '').trim();
        const kind =
            f.type === 'section_break'
                ? fbStr('fb_props_kind_section', null, 'Etapa / seção')
                : fbStr(typeKey, null, String(f.type || '').replace(/_/g, ' '));
        const head =
            f.type === 'section_break'
                ? String(f.label || '').trim()
                    ? translateStepLabelForCanvasDisplay(String(f.label).trim())
                    : f.id
                : f.label || f.id;
        sub.textContent = `${head} · ${kind}`;
    }
}

window.showFieldPropertiesModal = function () {
    if (!elPropsBody || !selectedFieldId) return;
    const logicM = document.getElementById('logic-modal');
    if (logicM && logicM.style.display === 'flex' && typeof window.hideLogicModal === 'function') {
        window.hideLogicModal();
    }
    syncFieldPropertiesModalSubtitle();
    const shell = document.getElementById('field-properties-modal');
    if (shell) {
        window.fieldPropertiesModalOpen = true;
        shell.style.display = 'flex';
        shell.style.justifyContent = 'center';
        shell.style.alignItems = 'center';
        try {
            document.body.style.overflow = 'hidden';
        } catch (e) {
            /* ignore */
        }
        try {
            elPropsBody.scrollTop = 0;
        } catch (e2) {
            /* ignore */
        }
    }
};

window.closeFieldPropertiesModal = function () {
    const shell = document.getElementById('field-properties-modal');
    flushReadingQuillToBoundField();
    if (typeof window.destroyFieldReadingEditor === 'function') window.destroyFieldReadingEditor();
    flushQuillToBoundField();
    if (typeof window.destroyFieldHelpEditor === 'function') window.destroyFieldHelpEditor();
    window.fieldPropertiesModalOpen = false;
    if (shell) shell.style.display = 'none';
    try {
        document.body.style.overflow = '';
    } catch (e) {
        /* ignore */
    }
};

if (!window.__fieldPropertiesModalEscapeHook) {
    window.__fieldPropertiesModalEscapeHook = true;
    document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || !window.fieldPropertiesModalOpen) return;
        if (document.getElementById('vision-ai-prompt-examples-modal')) return;
        const logicM = document.getElementById('logic-modal');
        if (logicM && logicM.style.display === 'flex') return;
        const secM = document.getElementById('section-step-edit-modal');
        if (secM && secM.style.display === 'flex') return;
        ev.preventDefault();
        window.closeFieldPropertiesModal();
    });
}

// Mapeamento de emojis por tipo para embelezamento
// Mapeamento de ion-icons por tipo para embelezamento
const iconMap = {
    'text': '<ion-icon name="text-outline"></ion-icon>',
    'number': '<ion-icon name="keypad-outline"></ion-icon>',
    'email': '<ion-icon name="mail-outline"></ion-icon>',
    'phone': '<ion-icon name="call-outline"></ion-icon>',
    'date': '<ion-icon name="calendar-outline"></ion-icon>',
    'checkbox': '<ion-icon name="checkbox-outline"></ion-icon>',
    'yes_no': '<ion-icon name="toggle-outline"></ion-icon>',
    'dropdown': '<ion-icon name="list-outline"></ion-icon>',
    'multiselect': '<ion-icon name="list-circle-outline"></ion-icon>',
    'rating': '<ion-icon name="star-outline"></ion-icon>',
    'calculated': '<ion-icon name="calculator-outline"></ion-icon>',
    'section_break': '<ion-icon name="albums-outline"></ion-icon>',
    'hidden': '<ion-icon name="eye-off-outline"></ion-icon>',
    'transit_start': '<ion-icon name="rocket-outline"></ion-icon>',
    'transit_end': '<ion-icon name="flag-outline"></ion-icon>',
    'geofence_check': '<ion-icon name="location-outline"></ion-icon>',
    'location_pick': '<ion-icon name="map-outline"></ion-icon>',
    'file_upload': '<ion-icon name="document-attach-outline"></ion-icon>',
    'photo': '<ion-icon name="camera-outline"></ion-icon>',
    'photo_stamped': '<ion-icon name="scan-outline"></ion-icon>',
    'facial_recognition': '<ion-icon name="person-outline"></ion-icon>',
    'vision_checklist': '<ion-icon name="videocam-outline"></ion-icon>',
    'vision_ai_analysis': '<ion-icon name="sparkles-outline"></ion-icon>',
    'barcode_scan': '<ion-icon name="barcode-outline"></ion-icon>',
    'materials_consumption': '<ion-icon name="cube-outline"></ion-icon>',
    'materials_receipt': '<ion-icon name="arrow-down-circle-outline"></ion-icon>',
    'technician_finance': '<ion-icon name="cash-outline"></ion-icon>',
    'signature': '<ion-icon name="create-outline"></ion-icon>',
    'signature_summary': '<ion-icon name="reader-outline"></ion-icon>',
    'leitura': '<ion-icon name="book-outline"></ion-icon>',
    'voice_note': '<ion-icon name="mic-outline"></ion-icon>',
    'image_annotation': '<ion-icon name="brush-outline"></ion-icon>',
    'lookup_select': '<ion-icon name="cloud-download-outline"></ion-icon>',
    'repeatable_matrix': '<ion-icon name="grid-outline"></ion-icon>',
    'opinion_scale': '<ion-icon name="analytics-outline"></ion-icon>',
};

/** Estado de seções colapsadas no canvas (id do grupo: __preamble__ ou id do section_break). */
if (typeof window.__brsparkSectionCollapsed !== 'object' || window.__brsparkSectionCollapsed === null) {
    window.__brsparkSectionCollapsed = {};
}
/** Evita que o "click" após soltar o arrasto dispare selectField e corra com o rebuild. */
window.__brsparkCanvasDragging = false;

window.toggleCanvasSectionCollapse = function (groupId) {
    if (!groupId) return;
    window.__brsparkSectionCollapsed[groupId] = !window.__brsparkSectionCollapsed[groupId];
    renderCanvas();
};

/** Agrupa campos por separador de etapa (mesma ordem linear do schema). */
function buildCanvasSectionGroups(fieldList) {
    const groups = [];
    let i = 0;
    const preamble = [];
    while (i < fieldList.length && fieldList[i].type !== 'section_break') {
        preamble.push(fieldList[i]);
        i++;
    }
    if (preamble.length > 0) {
        groups.push({ id: '__preamble__', kind: 'preamble', items: preamble });
    }
    while (i < fieldList.length) {
        const sec = fieldList[i];
        if (sec.type !== 'section_break') {
            if (groups.length === 0) {
                groups.push({ id: '__preamble__', kind: 'preamble', items: [] });
            }
            const last = groups[groups.length - 1];
            if (last.kind === 'preamble') {
                last.items.push(sec);
            } else {
                groups.push({ id: '__preamble__', kind: 'preamble', items: [sec] });
            }
            i++;
            continue;
        }
        const items = [sec];
        i++;
        while (i < fieldList.length && fieldList[i].type !== 'section_break') {
            items.push(fieldList[i]);
            i++;
        }
        groups.push({ id: sec.id, kind: 'section', sectionField: sec, items });
    }
    return groups;
}

function destroyCanvasBodySortables() {
    (window._brsparkBodySortables || []).forEach((s) => {
        try {
            s.destroy();
        } catch (e) { /* ignore */ }
    });
    window._brsparkBodySortables = [];
}

function destroyCanvasGroupsSortable() {
    if (window._brsparkCanvasGroupsSortable) {
        try {
            window._brsparkCanvasGroupsSortable.destroy();
        } catch (e) { /* ignore */ }
        window._brsparkCanvasGroupsSortable = null;
    }
}

function makeSectionHeadDragGrip() {
    const secDrag = document.createElement('span');
    secDrag.className = 'canvas-section-head__section-drag';
    secDrag.setAttribute('title', 'Arrastar para reordenar as seções');
    secDrag.setAttribute('aria-label', 'Arrastar para reordenar as seções');
    secDrag.innerHTML =
        '<ion-icon name="reorder-two-outline" style="font-size:20px;vertical-align:-2px;"></ion-icon>';
    return secDrag;
}

/**
 * Reordena `fields` conforme a ordem dos `.canvas-section-group` dentro do stack.
 */
function applySectionGroupOrderFromDom(stackEl) {
    const stack =
        stackEl || (ensureBuilderCanvasEl() && elCanvas.querySelector('.canvas-section-groups-stack'));
    if (!stack) return;
    const wraps = stack.querySelectorAll(':scope > .canvas-section-group');
    const orderedIds = Array.from(wraps).map((w) => w.dataset.groupId);
    const beforeSeg = buildCanvasSectionGroups(fields);
    const beforeOrder = beforeSeg.map((g) => g.id).join('|');
    if (orderedIds.join('|') === beforeOrder) return;

    const byId = Object.create(null);
    beforeSeg.forEach((g) => {
        byId[g.id] = g;
    });
    const next = [];
    orderedIds.forEach((id) => {
        const g = byId[id];
        if (!g) return;
        g.items.forEach((f) => next.push(f));
        delete byId[id];
    });
    Object.keys(byId).forEach((id) => {
        byId[id].items.forEach((f) => next.push(f));
    });
    if (next.length !== fields.length) return;
    fields.splice(0, fields.length, ...next);
    normalizeFieldsRequireSections(fields);
    fixTransitDisplacementViolations(fields);
    renderCanvas();
}

function initCanvasGroupsSortable() {
    if (typeof Sortable === 'undefined') return;
    const stack = ensureBuilderCanvasEl() && elCanvas.querySelector('.canvas-section-groups-stack');
    if (!stack) return;
    destroyCanvasGroupsSortable();
    const n = stack.querySelectorAll(':scope > .canvas-section-group').length;
    if (n < 2) return;

    window._brsparkCanvasGroupsSortable = new Sortable(stack, {
        animation: 150,
        handle: '.canvas-section-head__section-drag',
        draggable: '.canvas-section-group',
        direction: 'vertical',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 4,
        ghostClass: 'hover-ghost',
        chosenClass: 'canvas-sortable-chosen',
        dragClass: 'canvas-sortable-drag',
        onStart() {
            window.__brsparkCanvasDragging = true;
        },
        onEnd() {
            setTimeout(() => {
                try {
                    applySectionGroupOrderFromDom(stack);
                } finally {
                    window.__brsparkCanvasDragging = false;
                }
            }, 0);
        },
    });
}

/**
 * Reconstrói `fields` a partir do DOM (grupos de seção + ordem dos cartões).
 * As etapas (`section_break`) não são `.canvas-item`; a versão antiga só lia o corpo
 * e reapendava todas as seções no fim, corrompendo o schema e quebrando drag/salvamento.
 */
function rebuildFieldsOrderFromCanvas() {
    const stack = ensureBuilderCanvasEl() && elCanvas.querySelector('.canvas-section-groups-stack');
    if (!stack) return;

    const prevGroups = buildCanvasSectionGroups(fields);
    const groupById = new Map(prevGroups.map((g) => [g.id, g]));

    const next = [];
    stack.querySelectorAll(':scope > .canvas-section-group').forEach((wrap) => {
        const groupId = wrap.dataset.groupId;
        const prevGroup = groupById.get(groupId);
        const body = wrap.querySelector(':scope > .canvas-section-body');
        if (!body || !prevGroup) return;

        if (prevGroup.kind === 'preamble') {
            body.querySelectorAll(':scope > .canvas-item').forEach((item) => {
                const id = item.dataset.id;
                if (!id) return;
                const f = fields.find((x) => x.id === id);
                if (f) next.push(f);
            });
            return;
        }

        const sec = prevGroup.sectionField;
        if (sec && sec.type === 'section_break') {
            next.push(sec);
        }
        body.querySelectorAll(':scope > .canvas-item').forEach((item) => {
            const id = item.dataset.id;
            if (!id) return;
            const f = fields.find((x) => x.id === id);
            if (f) next.push(f);
        });
    });

    const seen = new Set(next.map((x) => x.id));
    fields.forEach((f) => {
        if (!seen.has(f.id)) next.push(f);
    });

    const prevSig = fields.map((f) => f.id).join('\0');
    const nextSig = next.map((f) => f.id).join('\0');
    if (prevSig === nextSig) return;
    fields.splice(0, fields.length, ...next);
    if (fields.length === 0) {
        fields.push(createDefaultSectionField(fields));
    } else {
        normalizeFieldsRequireSections(fields);
    }
    fixTransitDisplacementViolations(fields);
    renderCanvas();
}

/** Um único rebuild após o Sortable terminar (evita estados intermédios / double onEnd). */
let _canvasReorderRaf = 0;
function scheduleRebuildFieldsOrderFromCanvas() {
    if (_canvasReorderRaf) cancelAnimationFrame(_canvasReorderRaf);
    _canvasReorderRaf = requestAnimationFrame(() => {
        _canvasReorderRaf = 0;
        rebuildFieldsOrderFromCanvas();
        if (typeof renderMobilePreview === 'function') {
            renderMobilePreview();
        }
    });
}

/**
 * Índice global no array `fields` onde inserir o novo campo vindo da palette.
 * IMPORTANTE: nunca use `return` dentro de `forEach` pensando que sai da função — só saía do callback.
 */
function computeToolboxInsertIndex(targetBody, droppedEl, sortableEvt) {
    if (!ensureBuilderCanvasEl()) return 0;
    let prefix = 0;
    const groups = elCanvas.querySelectorAll('.canvas-section-group');
    for (let gi = 0; gi < groups.length; gi++) {
        const b = groups[gi].querySelector(':scope > .canvas-section-body');
        if (!b) continue;
        if (b !== targetBody) {
            for (let j = 0; j < b.children.length; j++) {
                const node = b.children[j];
                if (node.classList && node.classList.contains('canvas-item') && node.dataset && node.dataset.id) {
                    prefix++;
                }
            }
            continue;
        }
        const children = Array.from(b.children);
        let splitIdx = droppedEl ? children.indexOf(droppedEl) : -1;
        if (splitIdx < 0 && sortableEvt && typeof sortableEvt.newIndex === 'number') {
            splitIdx = sortableEvt.newIndex;
        }
        if (splitIdx < 0) splitIdx = 0;
        let local = 0;
        for (let i = 0; i < splitIdx && i < children.length; i++) {
            const node = children[i];
            if (node.classList && node.classList.contains('canvas-item') && node.dataset && node.dataset.id) {
                local++;
            }
        }
        return prefix + local;
    }
    return prefix;
}

/**
 * Ordem linear entre **cartões** do canvas (só `.canvas-item`), ignorando `section_break` no array `fields`.
 * Não é índice do array `fields` — use `mapCanvasOrdinalToFieldsSpliceIndex` antes de `splice`.
 */
function computeGlobalFieldInsertIndex(targetBody, localIndex) {
    if (!ensureBuilderCanvasEl()) return 0;
    let prefix = 0;
    const groups = elCanvas.querySelectorAll('.canvas-section-group');
    for (let gi = 0; gi < groups.length; gi++) {
        const b = groups[gi].querySelector(':scope > .canvas-section-body');
        if (!b) continue;
        if (b === targetBody) {
            const n = b.querySelectorAll(':scope > .canvas-item').length;
            const ix = Math.max(0, Math.min(localIndex, n));
            return prefix + ix;
        }
        prefix += b.querySelectorAll(':scope > .canvas-item').length;
    }
    return prefix;
}

/**
 * Converte posição 0…N entre cartões do canvas no índice correcto para `fields.splice` (inclui etapas).
 * @param {number} canvasOrdinal — 0 = antes do 1.º cartão; N = depois do último (N = contagem de `.canvas-item`).
 */
function mapCanvasOrdinalToFieldsSpliceIndex(canvasOrdinal) {
    const stack = ensureBuilderCanvasEl() && elCanvas.querySelector('.canvas-section-groups-stack');
    if (!stack || !Array.isArray(fields) || fields.length === 0) {
        return 0;
    }
    const prevGroups = buildCanvasSectionGroups(fields);
    const groupById = new Map(prevGroups.map((g) => [g.id, g]));
    const idxs = [];
    stack.querySelectorAll(':scope > .canvas-section-group').forEach((wrap) => {
        const g = groupById.get(wrap.dataset.groupId);
        const body = wrap.querySelector(':scope > .canvas-section-body');
        if (!g || !body) return;
        body.querySelectorAll(':scope > .canvas-item').forEach((item) => {
            const fid = item.dataset.id;
            const fi = fields.findIndex((f) => f.id === fid);
            if (fi >= 0) idxs.push(fi);
        });
    });
    const n = idxs.length;
    const ord = Math.max(0, Math.min(Number(canvasOrdinal) || 0, n));
    if (n === 0) return fields.length;
    if (ord >= n) return idxs[n - 1] + 1;
    return idxs[ord];
}

/** Posição de inserção local (0…n) a partir da coordenada Y do rato. */
function computeDropLocalIndexFromPointer(body, clientY) {
    const items = body.querySelectorAll(':scope > .canvas-item');
    if (!items.length) return 0;
    for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
}

function clearPaletteDropIndicator() {
    document.querySelectorAll('.canvas-section-body.fb-palette-drop-target').forEach((b) => {
        b.classList.remove('fb-palette-drop-target');
        b.querySelectorAll(':scope > .fb-palette-drop-line').forEach((n) => n.remove());
    });
    try {
        window.__brsparkPaletteDropInd = null;
    } catch (e) {
        /* ignore */
    }
}

/** Linha luminosa de inserção ao arrastar campo da palette sobre o canvas. */
function updatePaletteDropIndicator(body, clientY) {
    if (!body || !body.classList.contains('canvas-section-body')) return;
    const items = body.querySelectorAll(':scope > .canvas-item');
    const localIx = computeDropLocalIndexFromPointer(body, clientY);
    const prev = window.__brsparkPaletteDropInd;
    if (prev && prev.body === body && prev.localIx === localIx) return;

    clearPaletteDropIndicator();

    const line = document.createElement('div');
    line.className = 'fb-palette-drop-line';
    line.setAttribute('aria-hidden', 'true');

    const br = body.getBoundingClientRect();
    let y = 14;
    if (!items.length) {
        y = Math.max(18, body.clientHeight / 2);
    } else if (localIx <= 0) {
        const r = items[0].getBoundingClientRect();
        y = r.top - br.top;
    } else if (localIx >= items.length) {
        const r = items[items.length - 1].getBoundingClientRect();
        y = r.bottom - br.top;
    } else {
        const r = items[localIx].getBoundingClientRect();
        y = r.top - br.top;
    }
    y = Math.max(6, Math.min(y, Math.max(8, br.height - 6)));
    line.style.top = `${y}px`;

    body.appendChild(line);
    body.classList.add('fb-palette-drop-target');
    window.__brsparkPaletteDropInd = { body, localIx };
}

const BRSPARK_FIELD_MIME = 'application/x-brspark-field-type';
const BRSPARK_FIELD_PLAIN = 'text/plain';
const BRSPARK_FIELD_PREFIX = 'brspark-field:';

/** Safari / alguns browsers não expõem MIME custom em dragover — usamos payload até ao drop. */
function setPaletteDragPayload(type, rawText) {
    window.__brsparkPaletteDragPayload = { type, rawText: rawText || type };
}

function clearPaletteDragPayload() {
    clearPaletteDropIndicator();
    try {
        delete window.__brsparkPaletteDragPayload;
    } catch (e) {
        window.__brsparkPaletteDragPayload = null;
    }
}

function bindToolboxNativeDragSources() {
    if (!ensureBuilderToolboxEl()) return;
    if (!window.__brsparkToolboxDragEndBound) {
        window.__brsparkToolboxDragEndBound = true;
        elToolbox.addEventListener('dragend', clearPaletteDragPayload);
        document.addEventListener('dragend', (e) => {
            if (e.target && elToolbox.contains(e.target)) clearPaletteDragPayload();
        });
    }
    elToolbox.querySelectorAll('.toolbox-item').forEach((el) => {
        if (el.dataset.brsparkDragBound === '1') return;
        el.dataset.brsparkDragBound = '1';
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
            clearPaletteDropIndicator();
            const type = el.getAttribute('data-type');
            if (!type) return;
            const rawText = el.textContent.trim();
            setPaletteDragPayload(type, rawText);
            try {
                e.dataTransfer.setData(BRSPARK_FIELD_MIME, type);
                e.dataTransfer.setData(BRSPARK_FIELD_PLAIN, BRSPARK_FIELD_PREFIX + type + ':' + encodeURIComponent(rawText));
            } catch (err) {
                try {
                    e.dataTransfer.setData(BRSPARK_FIELD_PLAIN, BRSPARK_FIELD_PREFIX + type + ':' + encodeURIComponent(rawText));
                } catch (err2) { /* ignore */ }
            }
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

function installNativePaletteDropOnCanvas() {
    if (!ensureBuilderCanvasEl() || window.__brsparkNativeCanvasDrop) return;
    window.__brsparkNativeCanvasDrop = true;
    elCanvas.addEventListener(
        'dragover',
        (e) => {
            const body = e.target.closest && e.target.closest('.canvas-section-body');
            if (!body) return;
            const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
            const ok =
                types.includes(BRSPARK_FIELD_MIME) ||
                types.includes(BRSPARK_FIELD_PLAIN) ||
                types.includes('text/plain') ||
                types.includes('Text') ||
                !!(window.__brsparkPaletteDragPayload && window.__brsparkPaletteDragPayload.type);
            if (!ok) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            updatePaletteDropIndicator(body, e.clientY);
        },
        false
    );
    elCanvas.addEventListener(
        'dragleave',
        (e) => {
            const rel = e.relatedTarget;
            if (rel && elCanvas.contains(rel)) return;
            clearPaletteDropIndicator();
        },
        false
    );
    elCanvas.addEventListener(
        'drop',
        (e) => {
            const body = e.target.closest && e.target.closest('.canvas-section-body');
            if (!body) return;
            let type = '';
            let rawText = '';
            try {
                type = e.dataTransfer.getData(BRSPARK_FIELD_MIME) || '';
            } catch (err) { /* ignore */ }
            try {
                const plain = e.dataTransfer.getData(BRSPARK_FIELD_PLAIN) || e.dataTransfer.getData('text/plain') || '';
                if (plain.startsWith(BRSPARK_FIELD_PREFIX)) {
                    const rest = plain.slice(BRSPARK_FIELD_PREFIX.length);
                    const ci = rest.indexOf(':');
                    if (ci >= 0) {
                        if (!type) type = rest.slice(0, ci);
                        try {
                            rawText = decodeURIComponent(rest.slice(ci + 1) || '');
                        } catch (e2) {
                            rawText = rest.slice(ci + 1) || '';
                        }
                    }
                }
            } catch (err3) { /* ignore */ }
            if (!type && window.__brsparkPaletteDragPayload && window.__brsparkPaletteDragPayload.type) {
                type = window.__brsparkPaletteDragPayload.type;
                rawText = window.__brsparkPaletteDragPayload.rawText || type;
            }
            clearPaletteDragPayload();
            if (!type) return;
            if (type === 'section_break') return;
            if (!rawText) rawText = type;
            e.preventDefault();
            e.stopPropagation();
            const localIx = computeDropLocalIndexFromPointer(body, e.clientY);
            const canvasOrd = computeGlobalFieldInsertIndex(body, localIx);
            const insertAt = mapCanvasOrdinalToFieldsSpliceIndex(canvasOrd);
            if (type === 'transit_end') {
                const nStart = countTransitStartsBeforeGlobalIndex(fields, insertAt);
                if (nStart === 0) {
                    fbAlert(
                        'fb_alert_transit_end',
                        null,
                        'O campo «Finalizar deslocamento» não pode ficar antes de «Iniciar deslocamento».'
                    );
                    return;
                }
            }
            const newField = createNewFieldFromToolboxType(type, rawText);
            fields.splice(Math.max(0, Math.min(insertAt, fields.length)), 0, newField);
            renderCanvas();
            selectField(newField.id);
        },
        false
    );
}

/**
 * Se o Sortable deixar um clone da palette no DOM sem converter, absorve **um** nó no array `fields`.
 * Chamar em ciclo até retornar false se houver vários órfãos.
 */
/** Pré-visualização em miniatura da grelha (Form Builder — Visão IA Análise). */
function miniVisionAnalysisGridPreview(cols, rows) {
    const total = cols * rows;
    const cells = [];
    for (let i = 0; i < total; i++) {
        cells.push('<div style="background:#fecdd3;border-radius:2px;min-width:0;min-height:0"></div>');
    }
    const h = Math.max(22, Math.round((48 * rows) / Math.max(1, cols)));
    return `<div aria-hidden="true" style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:3px;width:48px;height:${h}px;flex-shrink:0;border:1px solid #fca5a5;padding:3px;border-radius:6px;background:#fff7f7">${cells.join(
        '',
    )}</div>`;
}

function absorbStrayPaletteItemsIntoFields() {
    if (!ensureBuilderCanvasEl()) return false;
    const node = elCanvas.querySelector('.canvas-section-body > [data-type]:not(.canvas-item)');
    if (!node) return false;
    const t = node.getAttribute('data-type');
    if (!t || t === 'section_break') return false;
    const b = node.parentElement;
    if (!b || !b.classList.contains('canvas-section-body')) return false;
    const rawText = node.textContent.trim();
    const evtStub = { newIndex: Array.prototype.indexOf.call(b.children, node) };
    const canvasOrd = computeToolboxInsertIndex(b, node, evtStub);
    const insertAt = mapCanvasOrdinalToFieldsSpliceIndex(canvasOrd);
    const newField = createNewFieldFromToolboxType(t, rawText);
    fields.splice(Math.max(0, Math.min(insertAt, fields.length)), 0, newField);
    fixTransitDisplacementViolations(fields);
    if (node.parentNode) node.parentNode.removeChild(node);
    return true;
}

function canvasHasStrayPaletteNodes() {
    if (!ensureBuilderCanvasEl()) return false;
    return !!elCanvas.querySelector('.canvas-section-body > [data-type]:not(.canvas-item)');
}

/** Rótulo inicial ao adicionar da toolbox — igual ao nome do item no menu (pt-BR). */
function defaultLabelForNewToolboxField(type, rawText) {
    if (type === 'vision_checklist') return 'Visão de IA Detecção';
    if (type === 'vision_ai_analysis') return 'Visão de IA Análise';
    return rawText;
}

function createNewFieldFromToolboxType(type, rawText) {
    return {
        id: 'field_' + Math.floor(Math.random() * 99999),
        type: type,
        label: `${defaultLabelForNewToolboxField(type, rawText)}`,
        required: false,
        multiple: false,
        minItems: '',
        maxItems: '',
        requireOnlineValidation: false,
        dependsOnId: '',
        dependsOnOperator: '==',
        dependsOnValue: '',
        geofenceRadius: type === 'geofence_check' ? '150' : null,
        options: type === 'dropdown' || type === 'multiselect' ? 'Opção 1, Opção 2' : null,
        calcFormula: type === 'calculated' ? '' : null,
        textMask: type === 'text' || type === 'number' || type === 'phone' ? '' : null,
        description: '',
        helpHtml: '',
        showFieldInstructions: false,
        defaultValue: '',
        icon: '',
        allowTechnicianComment: false,
        allowMediaDescription: false,
        ...(type === 'section_break' ? { sectionFillMode: 'list' } : {}),
        ...(type === 'facial_recognition'
          ? {
              facialAuthMode: 'self_verify',
              requireOnlineValidation: false,
            }
          : {}),
        ...(type === 'vision_checklist' || type === 'vision_ai_analysis'
            ? {
              visionStructuredPrompt: 'A evidência visual confirma o item verificado?',
              visionQuestions: [{ id: 'q1', text: 'A evidência visual confirma o item verificado?' }],
              visionCaptureMode: 'photo_and_video',
              requireOnlineValidation: false,
            }
          : {}),
        ...(type === 'vision_ai_analysis'
            ? {
                  visionAnalysisGrid: '1x1',
                  visionRating0To10Enabled: false,
                  visionShowAiResponseInForm: true,
              }
            : {}),
        ...(type === 'signature_summary' ? { summarySourceFieldIds: [] } : {}),
        ...(type === 'leitura' ? { contentHtml: '', required: false } : {}),
        ...(type === 'voice_note' ? { voiceTranscribeLanguage: 'pt' } : {}),
        ...(type === 'image_annotation'
            ? {
                  annotationPenColor: '#dc2626',
                  annotationStrokeWidth: 4,
              }
            : {}),
        ...(type === 'lookup_select'
            ? {
                  lookupSource: 'preset',
                  lookupPreset: 'equipamentos_demo',
                  lookupInlineJson: '',
              }
            : {}),
        ...(type === 'repeatable_matrix'
            ? {
                  matrixColumns: [
                      { id: 'c1', label: 'Item', cellType: 'text' },
                      { id: 'c2', label: 'Valor', cellType: 'number' },
                  ],
                  matrixMinRows: '0',
                  matrixMaxRows: '20',
              }
            : {}),
        ...(type === 'opinion_scale'
            ? {
                  opinionScaleMode: 'nps',
                  likertLabels:
                      'Discordo totalmente\nDiscordo\nNeutro\nConcordo\nConcordo totalmente',
              }
            : {}),
        ...(type === 'transit_start'
            ? { transitKeepScreenAwake: false, transitPurpose: 'service' }
            : {}),
    };
}

function countSectionBreaksInArray(fieldArr) {
    if (!Array.isArray(fieldArr)) return 0;
    return fieldArr.filter((f) => f && f.type === 'section_break').length;
}

/** Próximo rótulo «Etapa N» com base nas secções já presentes em `fieldArr` (antes de inserir a nova). */
function nextSectionBreakLabel(fieldArr) {
    const n = String(countSectionBreaksInArray(fieldArr) + 1);
    return fbStr('fb_canvas_step_n', { n }, 'Etapa ' + n);
}

/**
 * Nova secção inicial (section_break).
 * @param {Array|undefined} fieldArr — array de referência para contar secções (omite → usa `fields`).
 */
function createDefaultSectionField(fieldArr) {
    const arr = fieldArr !== undefined ? fieldArr : fields;
    return createNewFieldFromToolboxType('section_break', nextSectionBreakLabel(arr));
}

/**
 * Garante que não existem campos "órfãos" antes da primeira seção e que o schema começa sempre por um section_break.
 * Corrige também arrastos que colocam o cartão da seção na posição errada.
 */
function normalizeFieldsRequireSections(fieldArr) {
    if (!fieldArr || fieldArr.length === 0) return;
    let i = 0;
    while (i < fieldArr.length && fieldArr[i].type !== 'section_break') {
        i++;
    }
    const leading = fieldArr.slice(0, i);
    const rest = fieldArr.slice(i);
    if (rest.length === 0) {
        fieldArr.splice(0, fieldArr.length, createDefaultSectionField(leading), ...leading);
        return;
    }
    const segments = [];
    let j = 0;
    while (j < rest.length) {
        const s = rest[j];
        if (s.type !== 'section_break') {
            j++;
            continue;
        }
        j++;
        const items = [];
        while (j < rest.length && rest[j].type !== 'section_break') {
            items.push(rest[j]);
            j++;
        }
        segments.push({ section: s, items });
    }
    if (segments.length === 0) {
        fieldArr.splice(
            0,
            fieldArr.length,
            createDefaultSectionField(leading.concat(rest)),
            ...leading,
            ...rest
        );
        return;
    }
    const rebuilt = [];
    if (leading.length > 0) {
        rebuilt.push(createDefaultSectionField(rebuilt), ...leading);
    }
    segments.forEach((seg) => {
        rebuilt.push(seg.section, ...seg.items);
    });
    fieldArr.splice(0, fieldArr.length, ...rebuilt);
}

/**
 * @param {Array<{ type?: string }>} fieldArr
 * @returns {string | null}
 */
function transitDisplacementSchemaErrorMessage(fieldArr) {
    if (!fieldArr || !fieldArr.length) return null;
    let seenStart = false;
    for (const f of fieldArr) {
        if (!f) continue;
        if (f.type === 'transit_start') seenStart = true;
        if (f.type === 'transit_end' && !seenStart) {
            return fbStr(
                'fb_alert_transit_end',
                null,
                'O campo «Finalizar deslocamento» não pode ficar antes de «Iniciar deslocamento».'
            );
        }
    }
    const hasStart = fieldArr.some((f) => f && f.type === 'transit_start');
    const hasEnd = fieldArr.some((f) => f && f.type === 'transit_end');
    if (hasStart && !hasEnd) {
        return fbStr(
            'fb_alert_transit_start',
            null,
            'Com «Iniciar deslocamento» no formulário, também é obrigatório incluir «Finalizar deslocamento».'
        );
    }
    return null;
}

/**
 * Corrige ordem: qualquer transit_end sem transit_start antes passa a ficar depois do primeiro transit_start.
 * @param {Array<{ type?: string }>} fieldArr mutável
 * @returns {boolean} true se alterou
 */
function fixTransitDisplacementViolations(fieldArr) {
    if (!fieldArr || !fieldArr.length) return false;
    let changed = false;
    let guard = 0;
    while (guard++ < 64) {
        let seenStart = false;
        let bad = -1;
        for (let i = 0; i < fieldArr.length; i++) {
            const f = fieldArr[i];
            if (!f) continue;
            if (f.type === 'transit_start') seenStart = true;
            if (f.type === 'transit_end' && !seenStart) {
                bad = i;
                break;
            }
        }
        if (bad < 0) break;
        const [endField] = fieldArr.splice(bad, 1);
        const firstStart = fieldArr.findIndex((f) => f && f.type === 'transit_start');
        if (firstStart < 0) {
            fieldArr.splice(bad, 0, endField);
            break;
        }
        let ins = firstStart + 1;
        while (ins < fieldArr.length && fieldArr[ins] && fieldArr[ins].type === 'transit_start') ins++;
        fieldArr.splice(ins, 0, endField);
        changed = true;
    }
    return changed;
}

function countTransitStartsBeforeGlobalIndex(fieldArr, globalIndex) {
    let n = 0;
    const lim = Math.max(0, Math.min(globalIndex, fieldArr.length));
    for (let i = 0; i < lim; i++) {
        if (fieldArr[i] && fieldArr[i].type === 'transit_start') n++;
    }
    return n;
}

function ensureCanvasSchemaHasSection() {
    if (fields.length === 0) {
        fields.push(createDefaultSectionField(fields));
    }
    normalizeFieldsRequireSections(fields);
}

/**
 * Executado logo após o Sortable concluir o drop (setTimeout 0).
 * A palette usa arrasto nativo (HTML5) — aqui só reordenação entre .canvas-item.
 */
function processCanvasSortEnd(evt) {
    if (!evt || !evt.item) return;
    if (canvasHasStrayPaletteNodes()) {
        renderCanvas();
        return;
    }
    if (evt.from === evt.to && evt.oldIndex === evt.newIndex) {
        return;
    }
    scheduleRebuildFieldsOrderFromCanvas();
}

function buildCanvasFieldElement(f) {
    if (f.type === 'section_break') {
        return null;
    }
    const div = document.createElement('div');
    div.className = `canvas-item ${selectedFieldId === f.id ? 'active' : ''}`;
    div.dataset.id = f.id;

    const iconHTML = f.icon
        ? window.renderWebIcon(f.iconLibrary || 'Ionicons', f.icon, f.iconColor || '#1d4ed8', 18)
        : iconMap[f.type] || '<ion-icon name="help"></ion-icon>';
    const condTag =
        f.rules && f.rules.length > 0
            ? `<div style="display:flex; align-items:center; background:var(--accent-dim); color:var(--accent); font-size:10px; padding:2px 6px; border-radius:4px; font-weight:800;"><ion-icon name="git-network-outline" style="margin-right:2px; font-size:12px;"></ion-icon> ${f.rules.length} Gatilhos</div>`
            : '';
    const multiFieldExcluded = new Set([
        'section_break',
        'hidden',
        'calculated',
        'transit_start',
        'transit_end',
        'materials_consumption',
        'materials_receipt',
        'technician_finance',
        'signature',
        'signature_summary',
        'vision_checklist',
        'vision_ai_analysis',
        'leitura',
        'voice_note',
        'image_annotation',
        'lookup_select',
        'repeatable_matrix',
        'opinion_scale',
    ]);
    const multiTag =
        f.multiple && !multiFieldExcluded.has(f.type)
            ? `<div style="display:flex; align-items:center; background:#f3e8ff; color:#6b21a8; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:800;" title="Várias respostas">M×</div>`
            : '';

    div.innerHTML = `
                <div class="canvas-drag-handle" title="Arrastar para reordenar" aria-label="Arrastar para reordenar"><ion-icon name="reorder-two-outline" style="font-size:22px;"></ion-icon></div>
                <div class="canvas-item-main">
                    <div title="Trocar Ícone deste Campo" onclick="window.triggerIconPickerForField(event, '${f.id}')" style="width:44px; height:44px; flex-shrink:0; background:${f.icon ? '#eff6ff' : '#f8fafc'}; border:1px ${f.icon ? 'solid #3b82f6' : 'dashed #cbd5e1'}; border-radius:10px; display:flex; justify-content:center; align-items:center; cursor:pointer; font-size:22px; color:${f.icon ? '#1d4ed8' : '#64748b'}; transition:0.2s;" onmouseover="this.style.borderColor='#3b82f6'; this.style.color='#3b82f6'" onmouseout="this.style.borderColor='${f.icon ? '#3b82f6' : '#cbd5e1'}'; this.style.color='${f.icon ? '#1d4ed8' : '#64748b'}'">
                        ${iconHTML}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:14.5px; color:var(--text1); display:flex; align-items:center; min-width:0;">
                            <input type="text" class="canvas-item-title-input" style="background:transparent; border:none; border-bottom:1px dashed transparent; color:var(--text1); font-weight:bold; font-size:14.5px; outline:none; flex:1; min-width:0; width:100%; cursor:text;" value="${escapeHtmlLogic(f.label)}" onfocus="this.style.borderBottomColor='#cbd5e1'; window.selectField('${f.id}', { skipPropertiesIfSame: true, fromCanvasTitleFocus: true });" onblur="this.style.borderBottomColor='transparent'" oninput="window.handleInlineLabelUpdate(event, '${f.id}')" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" />
                        </div>
                        <div class="canvas-item-tags">${multiTag}${condTag}</div>
                        <div class="canvas-item-meta" style="font-size:11px; color:var(--text3); margin-top:6px; letter-spacing:0.5px;">ID: ${f.id} | TYPE: ${f.type.toUpperCase()}</div>
                    </div>
                </div>
                <div class="canvas-item-toolbar" onclick="event.stopPropagation();">
                    <button type="button" title="Propriedades do campo" onclick="window.selectField('${f.id}', { openPropertiesModal: true })"><ion-icon name="settings-outline"></ion-icon></button>
                    ${
                        f.type === 'leitura'
                            ? ''
                            : `<button type="button" class="${f.required ? 'is-req-active' : ''}" title="${f.required ? 'Obrigatório — clique para opcional' : 'Opcional — clique para obrigatório'}" onclick="window.toggleInlineRequired(event, '${f.id}')"><ion-icon name="${f.required ? 'checkmark-circle-outline' : 'ellipse-outline'}"></ion-icon></button>`
                    }
                    <button type="button" title="Lógica e regras" onclick="window.openLogicModal(event, '${f.id}')"><ion-icon name="options-outline"></ion-icon></button>
                    <button type="button" title="Duplicar" onclick="window.cloneField('${f.id}')"><ion-icon name="copy-outline"></ion-icon></button>
                    <button type="button" title="Excluir" class="danger canvas-item-delete" onclick="window.deleteField('${f.id}')"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
            `;

    div.onclick = (e) => {
        if (window.__brsparkCanvasDragging) return;
        if (e.target.closest('.canvas-item-delete')) return;
        selectField(f.id);
    };

    return div;
}

/** Remove estilos inline que o Sortable deixa no cartão (largura estreita → layout “comprimido”). */
function normalizeCanvasItemLayoutForSortable() {
    if (!ensureBuilderCanvasEl()) return;
    elCanvas.querySelectorAll('.canvas-section-body > .canvas-item').forEach((el) => {
        el.style.removeProperty('width');
        el.style.removeProperty('min-width');
        el.style.removeProperty('max-width');
        el.style.removeProperty('height');
    });
}

function initCanvasSectionSortables() {
    if (typeof Sortable === 'undefined') {
        console.error(
            '[checklists-builder] SortableJS não está disponível (verifique o script no checklists.html).'
        );
        if (!window.__fbSortableMissingAlerted) {
            window.__fbSortableMissingAlerted = true;
            fbAlert(
                'fb_alert_sortable_missing',
                null,
                'A biblioteca SortableJS não carregou (rede ou CDN). O arrastar e soltar no canvas fica desativado — recarregue a página ou verifique o script em checklists.html.',
            );
        }
        return;
    }
    if (!ensureBuilderCanvasEl()) return;
    window._brsparkBodySortables = window._brsparkBodySortables || [];
    elCanvas.querySelectorAll('.canvas-section-body').forEach((body) => {
        const s = new Sortable(body, {
            group: {
                name: 'brspark_canvas',
                pull: true,
                put: true,
            },
            /** Só cartões reais; a palette entra por drag nativo (sem clone Sortable). */
            draggable: '.canvas-item',
            /** Força lista vertical (evita deteção errada com flex/grid). */
            direction: 'vertical',
            handle: '.canvas-drag-handle',
            /** Melhor em painéis com `overflow: auto` / WebKit (listas partilhadas entre secções). */
            forceFallback: true,
            fallbackOnBody: true,
            fallbackTolerance: 4,
            animation: 150,
            ghostClass: 'hover-ghost',
            chosenClass: 'canvas-sortable-chosen',
            dragClass: 'canvas-sortable-drag',
            /** Listas vazias (canvas novo) precisam de zona maior para aceitar o clone da toolbox */
            emptyInsertThreshold: 120,
            swapThreshold: 0.65,
            onStart() {
                window.__brsparkCanvasDragging = true;
            },
            onEnd(evt) {
                const snap = {
                    item: evt.item,
                    to: evt.to,
                    from: evt.from,
                    newIndex: evt.newIndex,
                    oldIndex: evt.oldIndex,
                };
                setTimeout(() => {
                    try {
                        processCanvasSortEnd(snap);
                    } finally {
                        normalizeCanvasItemLayoutForSortable();
                        window.__brsparkCanvasDragging = false;
                    }
                }, 0);
            },
        });
        window._brsparkBodySortables.push(s);
    });
    requestAnimationFrame(() => {
        normalizeCanvasItemLayoutForSortable();
        requestAnimationFrame(normalizeCanvasItemLayoutForSortable);
    });
}

// 2. Palette → canvas: `installNativePaletteDropOnCanvas` + `bindToolboxNativeDragSources` são chamados
//    no início de `renderCanvas()` quando `#canvas` / `#toolbox` já existem (script injectado no head).

// 3. Funções de Renderização Interativa (Declarative-style in Vanilla JS)
function renderCanvas() {
    if (!ensureBuilderCanvasEl()) {
        console.error('[checklists-builder] #canvas não encontrado — Form Builder não pode renderizar.');
        return;
    }
    ensureBuilderToolboxEl();
    bindToolboxNativeDragSources();
    installNativePaletteDropOnCanvas();

    destroyCanvasGroupsSortable();
    destroyCanvasBodySortables();
    while (absorbStrayPaletteItemsIntoFields()) {
        /* múltiplos clones órfãos */
    }

    ensureCanvasSchemaHasSection();

    elCanvas.innerHTML = '';
    const groupsStack = document.createElement('div');
    groupsStack.className = 'canvas-section-groups-stack';
    const groups = buildCanvasSectionGroups(fields);
    const canReorderSections = groups.length >= 2;

    groups.forEach((group) => {
        const wrap = document.createElement('div');
        wrap.className = 'canvas-section-group';
        wrap.dataset.groupId = group.id;

        const isPreamble = group.kind === 'preamble';
        if (isPreamble) {
            wrap.classList.add('canvas-section-group--preamble');
        } else if (group.sectionField && selectedFieldId === group.sectionField.id) {
            wrap.classList.add('canvas-section-group--selected');
        }

        const collapsed = !!window.__brsparkSectionCollapsed[group.id];
        if (collapsed) {
            wrap.classList.add('is-collapsed');
        }

        const head = document.createElement('div');
        head.className = 'canvas-section-head';
        head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

        const chev = document.createElement('span');
        chev.className = 'canvas-section-head__chev';
        chev.innerHTML = '<ion-icon name="chevron-down-outline"></ion-icon>';
        chev.setAttribute('role', 'button');
        chev.setAttribute('tabindex', '0');
        chev.setAttribute(
            'aria-label',
            fbStr('fb_canvas_aria_toggle_section', null, 'Recolher ou expandir esta seção')
        );
        chev.style.cursor = 'pointer';
        chev.addEventListener('click', (e) => {
            e.stopPropagation();
            window.toggleCanvasSectionCollapse(group.id);
        });
        chev.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                window.toggleCanvasSectionCollapse(group.id);
            }
        });

        const titleEl = document.createElement('div');
        titleEl.className = 'canvas-section-head__title';

        const badge = document.createElement('span');
        badge.className = 'canvas-section-head__badge';

        const answerableCount = group.items.filter((x) => x.type !== 'section_break').length;

        if (isPreamble) {
            titleEl.innerHTML =
                '<ion-icon name="document-text-outline" style="vertical-align:-3px;margin-right:6px;color:var(--color-text-light);"></ion-icon> ' +
                escapeHtml(fbStr('fb_canvas_preamble_title', null, 'Antes da primeira seção'));
            badge.textContent =
                answerableCount === 1
                    ? fbStr('fb_canvas_fields_one', { n: String(answerableCount) }, answerableCount + ' campo')
                    : fbStr('fb_canvas_fields_many', { n: String(answerableCount) }, answerableCount + ' campos');
            if (canReorderSections) head.appendChild(makeSectionHeadDragGrip());
            head.appendChild(chev);
            head.appendChild(titleEl);
            head.appendChild(badge);
        } else {
            const sf = group.sectionField;
            const stepTarget = document.createElement('div');
            stepTarget.className = 'canvas-section-head__step-edit-target';
            stepTarget.title = fbStr(
                'fb_canvas_step_edit_title',
                null,
                'Clique para editar o nome e o ícone desta etapa'
            );
            stepTarget.style.display = 'flex';
            stepTarget.style.alignItems = 'center';
            stepTarget.style.gap = '8px';
            stepTarget.style.flex = '1';
            stepTarget.style.minWidth = '0';
            stepTarget.addEventListener('click', (e) => {
                e.stopPropagation();
                window.openSectionStepEditModal(sf.id);
            });
            const iconBox = document.createElement('span');
            iconBox.className = 'canvas-section-head__step-icon';
            iconBox.innerHTML = sectionStepIconCanvasHtml(sf);
            const labSp = document.createElement('span');
            labSp.textContent = fbStr('fb_canvas_section_prefix', null, 'Seção ·');
            labSp.style.flexShrink = '0';
            labSp.style.color = '#64748b';
            labSp.style.fontWeight = '600';
            labSp.style.fontSize = '12px';
            const nameSp = document.createElement('span');
            nameSp.className = 'canvas-section-head__step-name';
            nameSp.textContent = translateStepLabelForCanvasDisplay((sf.label || '').trim());
            nameSp.style.fontWeight = '800';
            nameSp.style.color = '#4c1d95';
            nameSp.style.textTransform = 'uppercase';
            nameSp.style.letterSpacing = '0.4px';
            nameSp.style.overflow = 'hidden';
            nameSp.style.textOverflow = 'ellipsis';
            nameSp.style.whiteSpace = 'nowrap';
            stepTarget.appendChild(iconBox);
            stepTarget.appendChild(labSp);
            stepTarget.appendChild(nameSp);
            titleEl.style.display = 'flex';
            titleEl.style.alignItems = 'center';
            titleEl.style.gap = '4px';
            titleEl.style.flex = '1';
            titleEl.style.minWidth = '0';
            titleEl.appendChild(stepTarget);

            const innerCount = Math.max(0, group.items.length - 1);
            let badgeTxt =
                innerCount === 1
                    ? fbStr('fb_canvas_questions_one', { n: String(innerCount) }, innerCount + ' pergunta')
                    : fbStr('fb_canvas_questions_many', { n: String(innerCount) }, innerCount + ' perguntas');
            if (sf.multiple) badgeTxt += fbStr('fb_canvas_questions_list_suffix', null, ' · lista');
            badge.textContent = badgeTxt;

            const toolbar = document.createElement('div');
            toolbar.className = 'canvas-section-head__toolbar';
            const mkBtn = (title, iconName, danger, fn) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.title = title;
                if (danger) b.classList.add('danger');
                b.innerHTML = '<ion-icon name="' + iconName + '"></ion-icon>';
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fn();
                });
                return b;
            };
            toolbar.appendChild(
                mkBtn(
                    fbStr('fb_canvas_section_props', null, 'Propriedades da seção'),
                    'settings-outline',
                    false,
                    () => {
                    window.selectField(sf.id, { openPropertiesModal: true });
                    }
                )
            );
            const reqSec = document.createElement('button');
            reqSec.type = 'button';
            reqSec.title = sf.required
                ? fbStr(
                      'fb_canvas_step_req_required',
                      null,
                      'Etapa obrigatória — clique para tornar opcional'
                  )
                : fbStr(
                      'fb_canvas_step_req_optional',
                      null,
                      'Etapa opcional — clique para tornar obrigatória'
                  );
            if (sf.required) reqSec.classList.add('is-req-active');
            reqSec.innerHTML =
                '<ion-icon name="' + (sf.required ? 'checkmark-circle-outline' : 'ellipse-outline') + '"></ion-icon>';
            reqSec.addEventListener('click', (e) => {
                e.stopPropagation();
                window.toggleInlineRequired(e, sf.id);
            });
            toolbar.appendChild(reqSec);
            toolbar.appendChild(
                mkBtn(fbStr('fb_canvas_section_logic', null, 'Lógica e regras'), 'options-outline', false, () => {
                    window.openLogicModal(null, sf.id);
                })
            );
            toolbar.appendChild(
                mkBtn(fbStr('fb_canvas_section_dup', null, 'Duplicar seção'), 'copy-outline', false, () => {
                    window.cloneSection(sf.id);
                })
            );
            toolbar.appendChild(
                mkBtn(fbStr('fb_canvas_section_del', null, 'Excluir seção'), 'trash-outline', true, () => {
                    window.deleteSection(sf.id);
                })
            );

            if (canReorderSections) head.appendChild(makeSectionHeadDragGrip());
            head.appendChild(chev);
            head.appendChild(titleEl);
            head.appendChild(toolbar);
            head.appendChild(badge);
            head.addEventListener('click', (e) => {
                if (e.target.closest('.canvas-section-head__section-drag')) return;
                if (e.target.closest('.canvas-section-head__toolbar')) return;
                if (e.target.closest('.canvas-section-head__step-edit-target')) return;
                if (e.target.closest('.canvas-section-head__chev')) return;
                window.selectField(sf.id);
            });
        }

        const body = document.createElement('div');
        body.className = 'canvas-section-body';

        group.items.forEach((f) => {
            if (f.type === 'section_break') return;
            const el = buildCanvasFieldElement(f);
            if (el) body.appendChild(el);
        });

        wrap.appendChild(head);
        wrap.appendChild(body);
        groupsStack.appendChild(wrap);
    });

    elCanvas.appendChild(groupsStack);

    const addSecBar = document.createElement('div');
    addSecBar.className = 'canvas-add-section-bar';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-outline btn-sm';
    addBtn.innerHTML =
        '<ion-icon name="add-circle-outline" style="vertical-align:-2px;margin-right:4px;"></ion-icon> ' +
        escapeHtml(fbStr('fb_canvas_add_section', null, 'Nova seção'));
    addBtn.addEventListener('click', () => window.builderAddSectionAfterLast());
    addSecBar.appendChild(addBtn);
    elCanvas.appendChild(addSecBar);

    initCanvasSectionSortables();
    initCanvasGroupsSortable();
    normalizeCanvasItemLayoutForSortable();

    if (typeof renderMobilePreview === 'function') {
        renderMobilePreview();
    }
    if (typeof window.scheduleBuilderDirtyRecompute === 'function') {
        window.scheduleBuilderDirtyRecompute();
    }
}

window.renderCanvas = renderCanvas;

window.handleInlineLabelUpdate = function(e, id) {
    const f = fields.find(x => x.id === id);
    if(f) {
        f.label = e.target.value;
        if (selectedFieldId === id) {
            const sidebarInput = document.getElementById('prop-label-input');
            if (sidebarInput) sidebarInput.value = f.label;
        }
        if(typeof window.renderMobilePreview === 'function') {
            window.renderMobilePreview();
        }
    }
};

window.toggleInlineRequired = function(e, id) {
    if(e) e.stopPropagation();
    const f = fields.find(x => x.id === id);
    if (f && f.type === 'leitura') return;
    if(f) {
        f.required = !f.required;
        window.renderCanvas(); // Redraws the tag to show updated visual state
        if (selectedFieldId === id && window.fieldPropertiesModalOpen) {
            window.renderProperties();
        }
        if(typeof window.renderMobilePreview === 'function') {
            window.renderMobilePreview();
        }
    }
};

/**
 * @param {string} id
 * @param {{ skipPropertiesIfSame?: boolean; fromCanvasTitleFocus?: boolean }} [opts]
 * - skipPropertiesIfSame: se true e o campo já estava selecionado, não re-renderiza o painel (evita o Quill a roubar o foco do título).
 * - fromCanvasTitleFocus: combinado com a troca de campo, pede refoco no input do cartão após o Quill inicializar.
 */
window.selectField = function(id, opts) {
    opts = opts || {};
    const prevSelected = selectedFieldId;
    if (opts.fromCanvasTitleFocus && prevSelected !== id) {
        window.__brsparkLabelInputRefocusId = id;
    }
    selectedFieldId = id;
    document.querySelectorAll('.canvas-item').forEach(el => {
        if(el.dataset.id === id) el.classList.add('active');
        else el.classList.remove('active');
    });
    const sf = fields.find((x) => x.id === id);
    if (sf && sf.type === 'section_break') {
        renderCanvas();
    }
    function applyCopilotCanvasFollow() {
        try {
            const followEl = document.getElementById('copilot-follow-canvas');
            if (followEl && followEl.checked && id) {
                window.brsparkCopilotPinFieldFromCanvas(id, { skipSelect: true, skipOpenPanel: true });
            }
        } catch (eFollow) {
            /* ignore */
        }
    }
    if (opts.skipPropertiesIfSame && prevSelected === id) {
        applyCopilotCanvasFollow();
        return;
    }
    const shouldRenderProps = opts.openPropertiesModal || window.fieldPropertiesModalOpen;
    if (shouldRenderProps) {
        renderProperties();
    }
    if (opts.openPropertiesModal) {
        window.showFieldPropertiesModal();
    }
    applyCopilotCanvasFollow();
};

window.triggerIconPickerForField = function(evt, id) {
    if (evt) evt.stopPropagation();
    selectField(id);
    window.openIconPicker((iconName, iconLib, iconColor) => {
        const idx = fields.findIndex(f => f.id === id);
        if(idx > -1) {
            fields[idx].icon = iconName;
            fields[idx].iconLibrary = iconLib;
            fields[idx].iconColor = iconColor;
            renderCanvas();
            if (window.fieldPropertiesModalOpen) renderProperties();
        }
    });
};

/** Ícone do modelo (metadata.icon + metadata.iconLibrary) — ao lado do título, como nos cartões do canvas. */
window.openTemplateFormIconPicker = function (evt) {
    if (evt) evt.preventDefault();
    window.openIconPicker((iconName, iconLib, iconColor) => {
        const v = iconName != null ? String(iconName).trim() : '';
        currentFormIcon = v;
        currentFormIconLibrary = v
            ? String(iconLib || 'Ionicons').trim() || 'Ionicons'
            : 'Ionicons';
        const ti = document.getElementById('tpl-icon');
        if (ti) ti.value = v;
        if (iconColor && String(iconColor).trim()) {
            try {
                lastIconPickerColor = String(iconColor).trim();
                saveLastIconPickerColor(lastIconPickerColor);
            } catch (eCol) {
                /* ignore */
            }
        }
        syncBuilderTaskIconDom();
    });
};

function remapCloneFieldRefs(cloneArr, idMap) {
    cloneArr.forEach((f) => {
        if (f.dependsOnId && idMap[f.dependsOnId]) f.dependsOnId = idMap[f.dependsOnId];
        if (Array.isArray(f.rules)) {
            f.rules.forEach((r) => {
                if (!r || !Array.isArray(r.actions)) return;
                r.actions.forEach((a) => {
                    if (a && a.targetId && idMap[a.targetId]) a.targetId = idMap[a.targetId];
                });
            });
        }
    });
}

window.cloneSection = function (sectionId) {
    const i = fields.findIndex((x) => x.id === sectionId && x.type === 'section_break');
    if (i < 0) return;
    flushQuillToBoundField();
    let j = i + 1;
    while (j < fields.length && fields[j].type !== 'section_break') j++;
    const slice = fields.slice(i, j);
    const clone = JSON.parse(JSON.stringify(slice));
    const idMap = {};
    clone.forEach((f) => {
        const newId = 'field_' + Math.floor(Math.random() * 99999);
        idMap[f.id] = newId;
        f.id = newId;
    });
    remapCloneFieldRefs(clone, idMap);
    if (clone[0] && clone[0].type === 'section_break') {
        clone[0].label = nextSectionBreakLabel(fields);
    }
    fields.splice(j, 0, ...clone);
    fixTransitDisplacementViolations(fields);
    selectedFieldId = clone[0].id;
    renderCanvas();
    renderProperties();
    window.showFieldPropertiesModal();
};

window.deleteSection = function (sectionId) {
    if (
        !confirm(
            'Excluir esta seção e todas as perguntas dentro dela? O formulário mantém sempre pelo menos uma seção (será criada uma nova vazia se necessário).'
        )
    ) {
        return;
    }
    flushQuillToBoundField();
    const i = fields.findIndex((x) => x.id === sectionId && x.type === 'section_break');
    if (i < 0) return;
    let j = i + 1;
    while (j < fields.length && fields[j].type !== 'section_break') j++;
    fields.splice(i, j - i);
    if (!fields.some((f) => f.id === selectedFieldId)) selectedFieldId = null;
    if (fields.length === 0) {
        fields.push(createDefaultSectionField(fields));
    } else {
        normalizeFieldsRequireSections(fields);
    }
    renderCanvas();
    renderProperties();
};

window.builderAddSectionAfterLast = function () {
    flushQuillToBoundField();
    const nf = createNewFieldFromToolboxType('section_break', nextSectionBreakLabel(fields));
    fields.push(nf);
    selectedFieldId = nf.id;
    renderCanvas();
    renderProperties();
    window.showFieldPropertiesModal();
};

// Ações na Janela / Global Scope
window.deleteField = function(id) {
    const fDel = fields.find((x) => x.id === id);
    if (fDel && fDel.type === 'section_break') {
        return window.deleteSection(id);
    }
    flushReadingQuillToBoundField();
    if (typeof window.destroyFieldReadingEditor === 'function') window.destroyFieldReadingEditor();
    flushQuillToBoundField();
    fields = fields.filter(f => f.id !== id);
    if (fields.length === 0) {
        fields.push(createDefaultSectionField(fields));
    } else {
        normalizeFieldsRequireSections(fields);
    }
    if(selectedFieldId === id) selectedFieldId = null;
    renderCanvas();
    renderProperties();
};

window.cloneField = function(id) {
    const fPre = fields.find((x) => x.id === id);
    if (fPre && fPre.type === 'section_break') {
        return window.cloneSection(id);
    }
    const fIndex = fields.findIndex(f => f.id === id);
    if(fIndex === -1) return;
    flushReadingQuillToBoundField();
    if (typeof window.destroyFieldReadingEditor === 'function') window.destroyFieldReadingEditor();
    flushQuillToBoundField();
    const f = fields[fIndex];
    const newId = 'field_' + Math.floor(Math.random() * 99999);
    const clone = JSON.parse(JSON.stringify(f)); // Deep copy simple
    clone.id = newId;
    fields.splice(fIndex + 1, 0, clone); // Insere logo abaixo
    fixTransitDisplacementViolations(fields);

    // Auto-seleciona ao clonar
    selectedFieldId = newId;
    renderCanvas();
    renderProperties();
    window.showFieldPropertiesModal();
};

function updateField(key, val, opts) {
    if(!selectedFieldId) return;
    const f = fields.find(x => x.id === selectedFieldId);
    if(f) {
        f[key] = val;
        if (!opts || !opts.skipCanvas) renderCanvas();
    }
}

/** Texto do textarea «Visão de IA — detecção»: várias linhas (até 10) ou prompt único legado. */
function getVisionChecklistPromptEditorText(f) {
    const defaultVisionPrompt = fbStr(
        'fb_prop_vision_default_structured_prompt',
        null,
        'A evidência visual confirma o item verificado?',
    );
    const arr = Array.isArray(f?.visionQuestions) ? f.visionQuestions : [];
    const lines = [];
    for (let i = 0; i < arr.length; i++) {
        const q = arr[i];
        const text =
            q && typeof q === 'object'
                ? String(q.text || q.question || '')
                      .replace(/\r\n/g, '\n')
                      .trim()
                : '';
        if (text) lines.push(text);
    }
    if (lines.length >= 2) return lines.slice(0, MAX_VISION_SIMNAO_QUESTIONS).join('\n');
    if (lines.length === 1) return lines[0];
    const sp = String(f?.visionStructuredPrompt || '').trim();
    if (sp) return sp;
    return defaultVisionPrompt;
}

function renderProperties() {
    if (!elPropsBody) return;
    if(!selectedFieldId) {
        flushReadingQuillToBoundField();
        if (typeof window.destroyFieldReadingEditor === 'function') window.destroyFieldReadingEditor();
        flushQuillToBoundField();
        if (typeof window.destroyFieldHelpEditor === 'function') window.destroyFieldHelpEditor();
        elPropsBody.innerHTML = `<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">${escapeHtmlLogic(
            fbStr('fb_prop_pick_gear_hint', null, 'Clique na engrenagem de um campo ou de uma etapa para editar as propriedades.')
        )}</div>`;
        if (typeof window.closeFieldPropertiesModal === 'function') window.closeFieldPropertiesModal();
        return;
    }

    // Gravar instruções Quill no campo ANTES de apagar o DOM do editor (senão perde-se helpHtml ao trocar de campo / re-renderizar)
    flushReadingQuillToBoundField();
    if (typeof window.destroyFieldReadingEditor === 'function') window.destroyFieldReadingEditor();
    flushQuillToBoundField();
    if (typeof window.destroyFieldHelpEditor === 'function') window.destroyFieldHelpEditor();

    const f = fields.find(x => x.id === selectedFieldId);
    if (!f) {
        selectedFieldId = null;
        elPropsBody.innerHTML = `<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">${escapeHtmlLogic(
            fbStr('fb_prop_pick_gear_hint', null, 'Clique na engrenagem de um campo ou de uma etapa para editar as propriedades.')
        )}</div>`;
        if (typeof window.closeFieldPropertiesModal === 'function') window.closeFieldPropertiesModal();
        return;
    }
    
    // Bloquear circular dependency
    let depOptions =
        '<option value="">' +
        escapeHtmlLogic(fbStr('fb_prop_depends_none_option', null, '(Nenhuma condição — sempre visível)')) +
        '</option>';
    fields.forEach((other) => {
        if (other.id !== f.id) {
            const sel = f.dependsOnId === other.id ? 'selected' : '';
            const idSuf = escapeHtmlLogic(fbStr('fb_prop_depends_id_suffix', { id: other.id }, ' (ID: ' + other.id + ')'));
            depOptions += `<option value="${other.id}" ${sel}>${escapeHtmlLogic(other.label)}${idSuf}</option>`;
        }
    });

    const reqChecked = f.required ? 'checked' : '';

    let extraProps = '';
    // Global Extra Prop: Field Icon
    extraProps += `
    `;

    if (f.type === 'technician_finance') {
        const tfTitle = escapeHtmlLogic(fbStr('fb_prop_tech_finance_title', null, 'PDF e compartilhamento com o cliente'));
        const tfHelp = fbStr(
            'fb_prop_tech_finance_help_html',
            null,
            'Por padrão, <strong>este campo não entra no PDF geral</strong>. No construtor de relatório PDF (Relatórios), só passa a constar se ativar a visibilidade para este campo. Ao fazê-lo, <strong>informações que podem corresponder a custos operacionais internos do técnico poderão ficar disponíveis ao cliente</strong> ou a quem receber o documento — confirme sempre o preset antes de compartilhar.',
        );
        extraProps += `
        <div class="prop-group" style="background:#fffbeb; border:1px solid #fde68a; padding:12px; border-radius:8px; margin-top:12px;">
            <div style="font-size:12px; font-weight:800; color:#92400e; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                <ion-icon name="document-text-outline"></ion-icon> ${tfTitle}
            </div>
            <div style="font-size:10px; color:#78350f; line-height:1.45;">
                ${tfHelp}
            </div>
        </div>`;
    }

    if(f.type === 'text' || f.type === 'number' || f.type === 'phone') {
        const tmTitle = escapeHtmlLogic(fbStr('fb_prop_textmask_title', null, 'Máscara dinâmica (opcional)'));
        const tmPh = escapeHtmlAttr(fbStr('fb_prop_textmask_ph', null, 'Ex.: ##/##/#### (data)'));
        const tmHint = escapeHtmlLogic(fbStr('fb_prop_textmask_hint', null, 'Use "#" para cada dígito ou letra que o app tentará formatar enquanto o técnico digita. Deixe vazio para texto livre.'));
        extraProps += `
        <div class="prop-group" style="background:var(--surface2); border:1px solid var(--border); padding:12px; border-radius:8px; margin-top:16px;">
            <label class="prop-label" style="color:var(--text2);"><ion-icon name="color-wand" style="vertical-align:-2px;color:var(--accent)"></ion-icon> ${tmTitle}</label>
            <input class="prop-input" type="text" placeholder="${tmPh}" value="${escapeHtmlAttr(f.textMask || '')}" onchange="window.handleFieldUpdate('textMask', this.value)" />
            <div style="font-size:10px; color:var(--text3); margin-top:4px; line-height:1.35">${tmHint}</div>
        </div>`;
    }

    if(f.type === 'geofence_check') {
        const geoHint =
            (f.geofenceType || 'radius') === 'radius'
                ? fbStr(
                      'fb_prop_geofence_hint_radius',
                      null,
                      'O app calcula a distância entre o GPS do técnico e o ponto central da OS.',
                  )
                : fbStr(
                      'fb_prop_geofence_hint_polygon',
                      null,
                      'O app verifica se o técnico está dentro do polígono definido na OS.',
                  );
        const geoErrPh = escapeHtmlAttr(
            fbStr('fb_prop_geofence_error_msg_ph', null, 'Ex.: Você está fora da área de serviço autorizada.'),
        );
        extraProps = `
        <div style="background:#ecfdf5; border:1px solid #10b981; padding:14px; border-radius:10px; margin-top:16px; display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:12px; font-weight:800; color:#047857; display:flex; align-items:center; gap:6px;">
                <ion-icon name="location" style="font-size:16px;"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_geofence_title', null, 'Configurações da cerca eletrônica'))}
            </div>
            
            <!-- Tipo de Zona -->
            <div>
                <label class="prop-label" style="color:#047857; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_geofence_zone_type_lbl', null, 'Tipo de zona'))}</label>
                <select class="prop-input" onchange="window.handleFieldUpdate('geofenceType', this.value)" style="font-size:12px;">
                    <option value="radius" ${(f.geofenceType||'radius') === 'radius' ? 'selected' : ''}>📍 ${escapeHtmlLogic(fbStr('fb_prop_geofence_opt_radius', null, 'Ponto + raio (Haversine)'))}</option>
                    <option value="polygon" ${f.geofenceType === 'polygon' ? 'selected' : ''}>🔷 ${escapeHtmlLogic(fbStr('fb_prop_geofence_opt_polygon', null, 'Polígono (definido na OS)'))}</option>
                </select>
                <div style="font-size:10px; color:#059669; margin-top:3px; line-height:1.3">
                    ${escapeHtmlLogic(geoHint)}
                </div>
            </div>

            <!-- Raio (só se radius) -->
            <div id="geofence-radius-block">
                <label class="prop-label" style="color:#047857; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_geofence_radius_lbl', null, 'Raio de aceitação (metros)'))}</label>
                <input class="prop-input" type="number" min="10" max="10000" value="${f.geofenceRadius || 150}" onkeyup="window.handleFieldUpdate('geofenceRadius', this.value)" />
                <div style="font-size:10px; color:#059669; margin-top:3px;">
                    ${escapeHtmlLogic(fbStr('fb_prop_geofence_radius_help', null, 'A OS pode sobrescrever este raio. Este é o padrão do formulário.'))}
                </div>
            </div>

            <!-- Modo de Falha -->
            <div>
                <label class="prop-label" style="color:#047857; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_geofence_fail_mode_lbl', null, 'Modo de falha'))}</label>
                <select class="prop-input" onchange="window.handleFieldUpdate('geofenceFailMode', this.value)" style="font-size:12px;">
                    <option value="block" ${(f.geofenceFailMode||'block') === 'block' ? 'selected' : ''}>🚫 ${escapeHtmlLogic(fbStr('fb_prop_geofence_fail_block', null, 'Bloquear — impede avanço do formulário'))}</option>
                    <option value="warn" ${f.geofenceFailMode === 'warn' ? 'selected' : ''}>⚠️ ${escapeHtmlLogic(fbStr('fb_prop_geofence_fail_warn', null, 'Apenas alertar — registra desvio e continua'))}</option>
                </select>
            </div>

            <!-- Mensagem customizada -->
            <div>
                <label class="prop-label" style="color:#047857; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_geofence_error_msg_lbl', null, 'Mensagem de erro customizada (opcional)'))}</label>
                <input class="prop-input" type="text" placeholder="${geoErrPh}" value="${escapeHtmlAttr(f.geofenceErrorMsg || '')}" oninput="window.handleFieldUpdate('geofenceErrorMsg', this.value)" />
            </div>
        </div>`;
    } else if (f.type === 'transit_start') {
        const keepAwake = f.transitKeepScreenAwake === true;
        const reimb = f.transitPurpose === 'reimbursement';
        const trHelp = fbStr(
            'fb_prop_transit_keep_awake_help_html',
            null,
            'O equipamento pode consumir mais bateria, mas tende a aumentar a precisão e a continuidade da coleta de GPS enquanto o deslocamento estiver em curso (mapa visível ou minimizado). A opção desliga automaticamente ao tocar em <strong>Finalizar deslocamento</strong>.',
        );
        extraProps = `
        <div style="background:#eff6ff;border:1px solid #3b82f6;padding:14px;border-radius:10px;margin-top:16px;display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:12px;font-weight:800;color:#1d4ed8;display:flex;align-items:center;gap:6px;">
                <ion-icon name="phone-portrait-outline" style="font-size:16px"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_transit_screen_title', null, 'Tela durante o deslocamento'))}
            </div>
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
                <input type="checkbox" ${keepAwake ? 'checked' : ''} onchange="window.handleFieldUpdate('transitKeepScreenAwake', this.checked); if(typeof renderProperties==='function') renderProperties();" style="accent-color:#2563eb;width:16px;height:16px;flex-shrink:0;margin-top:2px" />
                <span style="font-size:12px;font-weight:700;color:#1e3a8a;line-height:1.4">${escapeHtmlLogic(fbStr('fb_prop_transit_keep_awake_lbl', null, 'Manter a tela sempre acesa até finalizar o deslocamento'))}</span>
            </label>
            <div style="font-size:10px;color:#1e40af;line-height:1.45;">
                ${trHelp}
            </div>
        </div>
        <div style="background:#fff7ed;border:1px solid #fdba74;padding:14px;border-radius:10px;margin-top:12px;display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
                <input type="checkbox" ${reimb ? 'checked' : ''} onchange="window.handleFieldUpdate('transitPurpose', this.checked ? 'reimbursement' : 'service'); if(typeof renderProperties==='function') renderProperties();" style="accent-color:#ea580c;width:16px;height:16px;flex-shrink:0;margin-top:2px" />
                <span style="font-size:12px;font-weight:700;color:#9a3412;line-height:1.4">${escapeHtmlLogic(fbStr('fb_prop_transit_reimbursement_lbl', null, 'Apenas registro de deslocamento durante a atividade'))}</span>
            </label>
            <div style="font-size:10px;color:#c2410c;line-height:1.45;">${escapeHtmlLogic(fbStr('fb_prop_transit_reimbursement_help', null, 'Regista só a trilha GPS no app. Sem ETA, sem chat com o cliente e sem página de acompanhamento — use um segundo par início/fim depois do deslocamento operacional.'))}</div>
        </div>`;
    } else if (f.type === 'location_pick') {
        extraProps = `
        <div class="prop-group" style="background:#f0f9ff; border:1px solid #0ea5e9; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#0369a1; margin-bottom:4px"><ion-icon name="map-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_location_pick_title', null, 'Localização (GPS + mapa)'))}</div>
            <div style="font-size:10px; color:#0c4a6e; line-height:1.35;">${escapeHtmlLogic(fbStr('fb_prop_location_pick_help', null, 'No app, o técnico obtém o GPS do dispositivo e pode mover o alfinete no mapa. A resposta guarda as duas posições em JSON (relatório e exportações).'))}</div>
        </div>`;
    } else if (f.type === 'photo_stamped') {
         extraProps = `
        <div class="prop-group" style="background:#fffbeb; border:1px solid #f59e0b; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#b45309; margin-bottom:4px">⚠️ ${escapeHtmlLogic(fbStr('fb_prop_photo_stamped_warn_title', null, 'Modo anti-fraude obrigatório'))}</div>
            <div style="font-size:10px; color:#b45309; line-height:1.2;">${escapeHtmlLogic(fbStr('fb_prop_photo_stamped_warn_body', null, 'A galeria do celular ficará bloqueada. Câmera ao vivo exigida.'))}</div>
        </div>`;
    } else if (f.type === 'facial_recognition') {
        const facEngine = fbStr(
            'fb_prop_facial_engine_note_html',
            null,
            'O motor de reconhecimento (FaceMatch, automático ou AWS) é definido por <b>plano</b> em <b>Planos e assinaturas</b> → botão «Biometria / API» em cada cartão de plano. Padrão: FaceMatch.',
        );
        const facOnline = fbStr(
            'fb_prop_facial_online_note_html',
            null,
            '<b>Validação online obrigatória</b> (caixa abaixo, comum a outros campos): <b>desmarcada</b> = pode capturar sem rede; a app tenta validar no servidor quando há internet e ao reabrir a OS. <b>Marcada</b> = exige rede na captura e validação imediata.',
        );
         extraProps = `
        <div class="prop-group" style="background:#fff1f2; border:1px solid #e11d48; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#9f1239; margin-bottom:4px">🧑‍💻 ${escapeHtmlLogic(fbStr('fb_prop_facial_title', null, 'Biometria e IA obrigatórias'))}</div>
            <div style="font-size:10px; color:#9f1239; line-height:1.2; margin-bottom:12px;">${escapeHtmlLogic(fbStr('fb_prop_facial_intro', null, 'A foto tirada será comparada com a foto de perfil do técnico usando o motor de IA selecionado nas integrações do sistema.'))}</div>
            
            <div style="font-size:9px; color:#64748b; line-height:1.35; margin-bottom:10px; padding:8px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
              ${facEngine}
            </div>

            <label class="prop-label" style="color:#e11d48; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_facial_mode_lbl', null, 'Modo de validação biométrica'))}</label>
            <select class="prop-input" onchange="window.handleFieldUpdate('facialAuthMode', this.value)" style="font-size:12px; border-color:#fda4af; margin-bottom:8px;">
                <option value="self_verify" ${(f.facialAuthMode || 'self_verify') === 'self_verify' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_facial_mode_self', null, 'Provar identidade do usuário logado (ponto / OS)'))}</option>
                <option value="identify" ${f.facialAuthMode === 'identify' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_facial_mode_identify', null, 'Identificar qualquer usuário matriculado (mesmo tenant)'))}</option>
            </select>
            <div style="font-size:9px;color:#9f1239;line-height:1.35;margin:-4px 0 10px">${fbStr(
                'fb_prop_facial_identify_help',
                null,
                'Em «identificar», qualquer usuário com sessão na app pode preencher o campo: o rosto é comparado à galeria FaceMatch e o servidor devolve nome e e-mail de quem for reconhecido no <b>mesmo tenant</b> da sessão. Quem é identificado <b>não</b> precisa estar logado na app.',
            )}</div>

            <div style="font-size:9px; color:#64748b; line-height:1.35; margin-top:8px; padding:8px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
                📷 ${escapeHtmlLogic(fbStr('fb_prop_facial_camera_note', null, 'A captura facial na app usa sempre a câmera do sistema (alta resolução).'))}
            </div>
            <div style="font-size:9px; color:#9f1239; line-height:1.35; margin-top:12px; padding:8px; background:#fff7ed; border-radius:6px; border:1px solid #fed7aa;">
                ${facOnline}
            </div>
        </div>`;
    } else if (f.type === 'vision_checklist' || f.type === 'vision_ai_analysis') {
        const isVisionAnalysis = f.type === 'vision_ai_analysis';
        const promptDisplay = isVisionAnalysis
            ? (() => {
                  const sp = String(f.visionStructuredPrompt || '').trim();
                  if (sp) return sp;
                  if (Array.isArray(f.visionQuestions)) {
                      const joined = f.visionQuestions
                          .map((q) => String((q && q.text) || '').trim())
                          .filter(Boolean)
                          .join('\n\n');
                      if (joined) return joined;
                  }
                  return fbStr(
                      'fb_prop_vision_default_structured_prompt',
                      null,
                      'A evidência visual confirma o item verificado?',
                  );
              })()
            : getVisionChecklistPromptEditorText(f);
        const capMode =
            f.visionCaptureMode === 'photo_only' ||
            f.visionCaptureMode === 'video_only' ||
            f.visionCaptureMode === 'photo_and_video'
                ? f.visionCaptureMode
                : 'photo_and_video';
        const vBoxBg = isVisionAnalysis ? '#fef2f2' : '#f0f9ff';
        const vBoxBr = isVisionAnalysis ? '#f87171' : '#38bdf8';
        const vTitle = isVisionAnalysis
            ? fbStr(
                  'fb_prop_vision_title_analysis_html',
                  null,
                  '<ion-icon name="sparkles-outline" style="color:#b91c1c"></ion-icon> <span style="color:#dc2626;font-weight:900">Visão de IA — análise</span>',
              )
            : fbStr(
                  'fb_prop_vision_title_detection_html',
                  null,
                  '<ion-icon name="videocam-outline"></ion-icon> Visão de IA — detecção',
              );
        const vTitleColor = isVisionAnalysis ? '#991b1b' : '#0369a1';
        const vBody = isVisionAnalysis
            ? fbStr(
                  'fb_prop_vision_body_analysis_html',
                  null,
                  'No app, o técnico usa <b>só a câmera</b> — sem galeria nem escolha de arquivo. O servidor BrSpark chama a API <b>Gemini</b> com a integração <b>Google AI Studio</b> (chave e modelo em Integrações). O texto abaixo é um <b>único prompt estruturado</b>; a resposta devolve sim/não + confiança (e racional) para o conjunto.',
              )
            : fbStr(
                  'fb_prop_vision_body_detection_html',
                  null,
                  'No app, o técnico usa <b>só a câmera</b> — sem galeria nem escolha de arquivo. O BrSpark reencaminha ao URL em <b>Integrações → Visão IA - YOLO</b>. O texto abaixo é um <b>único prompt estruturado</b>; a resposta devolve sim/não + confiança para o conjunto.',
              );
        const vBodyColor = isVisionAnalysis ? '#7f1d1d' : '#0c4a6e';
        const vLabel = isVisionAnalysis ? '#b91c1c' : '#0369a1';
        const curGridRaw = String(f.visionAnalysisGrid || '1x1')
            .trim()
            .toLowerCase()
            .replace(/\*/g, 'x');
        let curGridNorm = '1x1';
        if (curGridRaw === '1x1' || curGridRaw === '2x2') curGridNorm = curGridRaw;
        else if (['2x1', '3x1', '3x2', '3x3'].includes(curGridRaw)) curGridNorm = '2x2';
        const gridOpts = [
            {
                v: '1x1',
                label: fbStr('fb_prop_vision_grid_opt_1x1', null, '1 foto — 1×1'),
                c: 1,
                r: 1,
            },
            {
                v: '2x2',
                label: fbStr('fb_prop_vision_grid_opt_2x2', null, '4 fotos — 2×2'),
                c: 2,
                r: 2,
            },
        ];
        const ratingEnabled = !!f.visionRating0To10Enabled;
        const ratingPickHtml = isVisionAnalysis
            ? `
            <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;cursor:pointer;padding:8px 10px;border-radius:8px;border:1px solid ${ratingEnabled ? '#fecaca' : '#e2e8f0'};background:${ratingEnabled ? '#fff1f2' : '#fff'}">
              <input type="checkbox" ${ratingEnabled ? 'checked' : ''} onchange="window.handleFieldUpdate('visionRating0To10Enabled', this.checked); if(typeof renderProperties==='function')renderProperties();" style="accent-color:#dc2626;width:16px;height:16px;flex-shrink:0;margin-top:2px" />
              <span style="font-size:12px;font-weight:700;color:#450a0a;line-height:1.35">${escapeHtmlLogic(fbStr('fb_prop_vision_rating_chk_lbl', null, 'Classificação 0–10 (preenchida pela API após a análise)'))}</span>
            </label>
            <div style="font-size:9px;color:#64748b;margin:-4px 0 12px;line-height:1.35">${fbStr(
                'fb_prop_vision_rating_hint_html',
                null,
                'Com esta opção, o Gemini devolve <code>rating0To10</code> na raiz do JSON (inteiro de 0 a 10, ou <code>null</code> se não for possível). O app mostra a nota junto ao resultado e nos relatórios.',
            )}</div>`
            : '';
        const showAiResp = f.visionShowAiResponseInForm !== false;
        const showAiResponseHtml = isVisionAnalysis
            ? `
            <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;cursor:pointer;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;background:#fff">
              <input type="checkbox" ${showAiResp ? 'checked' : ''} onchange="window.handleFieldUpdate('visionShowAiResponseInForm', this.checked); if(typeof renderProperties==='function')renderProperties();" style="accent-color:#dc2626;width:16px;height:16px;flex-shrink:0;margin-top:2px" />
              <span style="font-size:12px;font-weight:700;color:#450a0a;line-height:1.35">${escapeHtmlLogic(fbStr('fb_prop_vision_show_ai_chk_lbl', null, 'Mostrar detalhes da resposta da IA no app'))}</span>
            </label>
            <div style="font-size:9px;color:#64748b;margin:-4px 0 12px;line-height:1.35">${escapeHtmlLogic(fbStr('fb_prop_vision_show_ai_hint', null, 'Desmarque para ocultar no formulário do técnico o texto da resposta, confiança, racional e bloco de classificação 0–10 (a mídia e o estado «concluído» mantêm-se). Relatórios e resumo de assinatura podem continuar a mostrar os dados.'))}</div>`
            : '';
        const gridPickHtml = isVisionAnalysis
            ? `
            <label class="prop-label" style="color:${vLabel}; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_vision_grid_lbl', null, 'Grade de fotos (envio único ao Gemini)'))}</label>
            <div style="font-size:9px;color:#64748b;margin:-2px 0 10px;line-height:1.35">
              ${fbStr(
                  'fb_prop_vision_grid_help',
                  null,
                  'Só <b>1×1</b> ou <b>2×2</b>. Com mais de uma célula, o app exige <b>todas</b> as fotos (câmera) antes de analisar; só <b>foto</b> (sem vídeo). Modelos antigos com grade maior passam a <b>2×2</b> ao gravar.',
              )}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
                ${gridOpts
                    .map(
                        (o) => `
                <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid ${
                    curGridNorm === o.v ? '#dc2626' : '#e2e8f0'
                };background:${curGridNorm === o.v ? '#fff1f2' : '#fff'}">
                  <input type="radio" name="visionAnalysisGrid_${escapeHtmlAttr(f.id)}" value="${o.v}" ${
                            curGridNorm === o.v ? 'checked' : ''
                        } onchange="window.handleFieldUpdate('visionAnalysisGrid', this.value); if(typeof renderProperties==='function')renderProperties();" style="accent-color:#dc2626;flex-shrink:0" />
                  ${miniVisionAnalysisGridPreview(o.c, o.r)}
                  <span style="font-size:12px;font-weight:700;color:#450a0a">${escapeHtmlLogic(o.label)}</span>
                </label>`,
                    )
                    .join('')}
            </div>`
            : '';
        const visionPromptLabelRow = isVisionAnalysis
            ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
            <label class="prop-label" style="color:${vLabel}; font-size:10px; margin:0;">${escapeHtmlLogic(fbStr('fb_prop_vision_prompt_lbl', null, 'Prompt estruturado (único)'))}</label>
            <button type="button" class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 10px;white-space:nowrap;border-color:#fecaca;color:#b91c1c;" onclick="window.openVisionAiStructuredPromptExamplesModal()" title="${escapeHtmlAttr(
                fbStr('fb_vision_prompt_ex_btn_title', null, 'Modelos de prompt para serviços de campo (Visão de IA — análise)'),
            )}"><ion-icon name="sparkles-outline" style="vertical-align:-2px"></ion-icon> ${escapeHtmlLogic(fbStr('fb_vision_prompt_ex_btn', null, 'Exemplos'))}</button>
          </div>`
            : `<label class="prop-label" style="color:${vLabel}; font-size:10px;">${escapeHtmlLogic(
                  fbStr('fb_prop_vision_detection_prompt_lbl', null, 'Perguntas (sim/não)'),
              )}</label>`;
        const visionPromptBlurHandler = isVisionAnalysis
            ? 'window.updateVisionStructuredPrompt(this.value)'
            : 'window.updateVisionDetectionQuestions(this.value)';
        const visionPromptHintBlock = isVisionAnalysis
            ? fbStr(
                  'fb_prop_vision_ai_structured_prompt_hint',
                  {
                      max:
                          typeof window.fbFormatInt === 'function'
                              ? window.fbFormatInt(MAX_VISION_STRUCTURED_PROMPT_CHARS)
                              : String(MAX_VISION_STRUCTURED_PROMPT_CHARS),
                  },
                  'Descreva critérios, o formato desejado da resposta e o que a IA deve verificar na mídia. Limite aproximado de ' +
                      MAX_VISION_STRUCTURED_PROMPT_CHARS.toLocaleString('pt-BR') +
                      ' caracteres. A API responde em JSON com a lista <code>answers</code> (cada item com o identificador da pergunta, ex.: <code>q1</code>). Se você ativar a classificação 0–10 acima, o objeto na raiz também inclui <code>rating0To10</code>.',
              )
            : fbStr(
                  'fb_prop_vision_detection_prompt_hint',
                  {
                      maxPer:
                          typeof window.fbFormatInt === 'function'
                              ? window.fbFormatInt(MAX_VISION_MULTI_SIMNAO_TEXT_CHARS)
                              : String(MAX_VISION_MULTI_SIMNAO_TEXT_CHARS),
                      maxLines: String(MAX_VISION_SIMNAO_QUESTIONS),
                      maxSingle:
                          typeof window.fbFormatInt === 'function'
                              ? window.fbFormatInt(MAX_VISION_STRUCTURED_PROMPT_CHARS)
                              : String(MAX_VISION_STRUCTURED_PROMPT_CHARS),
                  },
                  'Uma <b>linha</b> por pergunta (sim/não), até 10 linhas. Com várias linhas, cada texto tem até 500 caracteres; com uma única linha, até 12.000. A API devolve JSON com <code>answers</code> e <code>questionId</code> (<code>q1</code>…<code>q10</code>).',
              );
        extraProps = `
        <div class="prop-group" style="background:${vBoxBg}; border:1px solid ${vBoxBr}; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:${vTitleColor}; margin-bottom:6px">${vTitle}</div>
            <div style="font-size:10px; color:${vBodyColor}; line-height:1.35; margin-bottom:10px;">
              ${vBody}
            </div>
            ${ratingPickHtml}
            ${showAiResponseHtml}
            <label class="prop-label" style="color:${vLabel}; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_vision_capture_lbl', null, 'Tipo de captura pela câmera'))}</label>
            <select class="prop-input" style="font-size:12px; margin-bottom:10px;" onchange="window.handleFieldUpdate('visionCaptureMode', this.value)">
                <option value="photo_only" ${capMode === 'photo_only' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_vision_capture_photo_only', null, 'Somente foto'))}</option>
                <option value="video_only" ${capMode === 'video_only' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_vision_capture_video_only', null, 'Somente vídeo'))}</option>
                <option value="photo_and_video" ${capMode === 'photo_and_video' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_vision_capture_photo_video', null, 'Foto e vídeo'))}</option>
            </select>
            <div style="font-size:9px; color:#64748b; line-height:1.35; margin-top:4px; margin-bottom:10px;">${escapeHtmlLogic(
                fbStr(
                    'fb_prop_vision_video_max_hint',
                    null,
                    'Na app, em campos de Visão de IA (detecção ou análise), cada vídeo tem no máximo 10 segundos; clips mais longos são recusados. Na detecção (YOLO), o envio ao servidor usa uma imagem extraída do primeiro instante do vídeo — o serviço externo continua a receber só imagem.',
                ),
            )}</div>
            ${gridPickHtml}
            ${visionPromptLabelRow}
            <textarea class="prop-input" style="height:160px; font-size:12px; font-family:system-ui,sans-serif; line-height:1.45;" onblur="${visionPromptBlurHandler}">${escapeHtmlLogic(
                promptDisplay,
            )}</textarea>
            <div style="font-size:9px; color:#64748b; margin-top:6px;">${visionPromptHintBlock}</div>
        </div>`;
    } else if (f.type === 'voice_note') {
        const vLang = escapeHtmlLogic(String(f.voiceTranscribeLanguage || 'pt').slice(0, 12));
        const voiceHelp = fbStr(
            'fb_prop_voice_help_html',
            null,
            'A transcrição usa <b>OpenAI Whisper</b> no servidor (mesma <b>API key</b> da integração «OpenAI» em Integrações). O técnico precisa de <b>internet</b> ao tocar em «Parar e transcrever».',
        );
        const voiceLangHint = fbStr(
            'fb_prop_voice_lang_hint',
            null,
            'Ex.: <code>pt</code>, <code>en</code>, <code>es</code>. Opcional, mas ajuda com sotaque e ruído.',
        );
        extraProps = `
        <div class="prop-group" style="background:#f5f3ff;border:1px solid #c4b5fd;padding:12px;border-radius:8px;margin-top:16px;">
            <div style="font-size:11px;font-weight:800;color:#5b21b6;margin-bottom:8px;"><ion-icon name="mic-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_voice_title', null, 'Nota de voz'))}</div>
            <div style="font-size:10px;color:#6b21a8;line-height:1.4;margin-bottom:10px;">
              ${voiceHelp}
            </div>
            <label class="prop-label" style="font-size:10px;color:#5b21b6;">${escapeHtmlLogic(fbStr('fb_prop_voice_lang_lbl', null, 'Idioma (Whisper)'))}</label>
            <input class="prop-input" type="text" maxlength="12" placeholder="pt" value="${vLang}" onchange="window.handleFieldUpdate('voiceTranscribeLanguage', this.value)" />
            <div style="font-size:9px;color:#64748b;margin-top:6px;">${voiceLangHint}</div>
        </div>`;
    } else if (f.type === 'file_upload') {
        const fileHelp = fbStr(
            'fb_prop_file_upload_help',
            null,
            'Máximo <b>50 MB</b> por arquivo. O app bloqueia executáveis, scripts e outros tipos habitualmente perigosos; documentos e arquivos correntes (PDF, Office, imagens, ZIP etc.) são aceitos.',
        );
        extraProps = `
        <div class="prop-group" style="background:#fffbeb; border:1px solid #fcd34d; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#b45309; margin-bottom:4px"><ion-icon name="document-attach-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_file_upload_title', null, 'Anexar arquivo (app)'))}</div>
            <div style="font-size:10px; color:#92400e; line-height:1.35;">${fileHelp}</div>
        </div>`;
    } else if (f.type === 'image_annotation') {
        const pen = escapeHtmlAttr(String(f.annotationPenColor || '#dc2626'));
        const sw = String(f.annotationStrokeWidth != null ? f.annotationStrokeWidth : 4);
        extraProps = `
        <div class="prop-group" style="background:#fff7ed; border:1px solid #fdba74; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#9a3412; margin-bottom:6px"><ion-icon name="brush-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_image_annot_title', null, 'Foto com anotações'))}</div>
            <div style="font-size:10px; color:#7c2d12; line-height:1.35; margin-bottom:10px;">${escapeHtmlLogic(fbStr('fb_prop_image_annot_help', null, 'No app, o técnico escolhe câmera ou galeria e pode desenhar por cima da imagem. O valor guardado é JSON (URI local + traços normalizados).'))}</div>
            <label class="prop-label" style="color:#c2410c; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_image_annot_pen_lbl', null, 'Cor do traço'))}</label>
            <input class="prop-input" type="color" value="${pen}" onchange="window.handleFieldUpdate('annotationPenColor', this.value)" style="max-width:120px;height:36px;padding:2px;" />
            <label class="prop-label" style="color:#c2410c; font-size:10px; margin-top:10px;">${escapeHtmlLogic(fbStr('fb_prop_image_annot_width_lbl', null, 'Espessura (1–24)'))}</label>
            <input class="prop-input" type="number" min="1" max="24" value="${escapeHtmlLogic(sw)}" onchange="window.handleFieldUpdate('annotationStrokeWidth', parseInt(this.value,10)||4)" />
        </div>`;
    } else if (f.type === 'lookup_select') {
        const src = f.lookupSource === 'inline_json' ? 'inline_json' : 'preset';
        const preset = escapeHtmlLogic(String(f.lookupPreset || 'equipamentos_demo'));
        const inlineEsc = escapeHtmlLogic(String(f.lookupInlineJson || ''));
        extraProps = `
        <div class="prop-group" style="background:#eff6ff; border:1px solid #93c5fd; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#1e40af; margin-bottom:6px"><ion-icon name="cloud-download-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_lookup_title', null, 'Lista dinâmica'))}</div>
            <label class="prop-label" style="color:#1d4ed8; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_lookup_source_lbl', null, 'Origem'))}</label>
            <select class="prop-input" onchange="window.handleFieldUpdate('lookupSource', this.value); if(typeof renderProperties==='function')renderProperties();" style="font-size:12px; margin-bottom:10px;">
                <option value="preset" ${src === 'preset' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_lookup_src_preset', null, 'Preset no servidor (GET com sessão)'))}</option>
                <option value="inline_json" ${src === 'inline_json' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_lookup_src_inline', null, 'JSON no modelo (sem rede)'))}</option>
            </select>
            <div style="display:${src === 'preset' ? 'block' : 'none'}">
                <label class="prop-label" style="color:#1d4ed8; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_lookup_preset_lbl', null, 'Preset'))}</label>
                <select class="prop-input" onchange="window.handleFieldUpdate('lookupPreset', this.value)" style="font-size:12px;">
                    <option value="equipamentos_demo" ${preset === 'equipamentos_demo' ? 'selected' : ''}>equipamentos_demo</option>
                    <option value="tecnicos_demo" ${preset === 'tecnicos_demo' ? 'selected' : ''}>tecnicos_demo</option>
                    <option value="prioridades_demo" ${preset === 'prioridades_demo' ? 'selected' : ''}>prioridades_demo</option>
                </select>
            </div>
            <div style="display:${src === 'inline_json' ? 'block' : 'none'}; margin-top:8px;">
                <label class="prop-label" style="color:#1d4ed8; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_lookup_json_lbl', null, 'JSON (array de pares value / label)'))}</label>
                <textarea class="prop-input" style="height:100px;font-family:monospace;font-size:11px;" onblur="window.handleFieldUpdate('lookupInlineJson', this.value)">${inlineEsc}</textarea>
            </div>
        </div>`;
    } else if (f.type === 'repeatable_matrix') {
        const colsJson = JSON.stringify(Array.isArray(f.matrixColumns) ? f.matrixColumns : [], null, 2);
        const colsEsc = escapeHtmlLogic(colsJson);
        const minR = escapeHtmlLogic(String(f.matrixMinRows != null && f.matrixMinRows !== '' ? f.matrixMinRows : '0'));
        const maxR = escapeHtmlLogic(String(f.matrixMaxRows != null && f.matrixMaxRows !== '' ? f.matrixMaxRows : '20'));
        const matrixIntro = fbStr(
            'fb_prop_matrix_intro_html',
            null,
            'Colunas (até 8): <code>id</code>, <code>label</code>, <code>cellType</code> = <code>text</code> | <code>number</code> | <code>yes_no</code>. O app guarda um array JSON de linhas.',
        );
        extraProps = `
        <div class="prop-group" style="background:#ecfdf5; border:1px solid #6ee7b7; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#047857; margin-bottom:6px"><ion-icon name="grid-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_matrix_title', null, 'Matriz repetível'))}</div>
            <div style="font-size:10px; color:#065f46; line-height:1.35; margin-bottom:10px;">${matrixIntro}</div>
            <label class="prop-label" style="color:#0f766e; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_matrix_cols_lbl', null, 'Colunas (JSON)'))}</label>
            <textarea class="prop-input" style="height:140px;font-family:monospace;font-size:11px;" onblur="window.applyRepeatableMatrixColumnsJson(this.value)">${colsEsc}</textarea>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                <div style="flex:1; min-width:100px;">
                    <label class="prop-label" style="font-size:10px; color:#047857;">${escapeHtmlLogic(fbStr('fb_prop_matrix_min_rows', null, 'Mín. linhas'))}</label>
                    <input class="prop-input" type="number" min="0" value="${minR}" onchange="window.handleFieldUpdate('matrixMinRows', this.value)" />
                </div>
                <div style="flex:1; min-width:100px;">
                    <label class="prop-label" style="font-size:10px; color:#047857;">${escapeHtmlLogic(fbStr('fb_prop_matrix_max_rows', null, 'Máx. linhas'))}</label>
                    <input class="prop-input" type="number" min="1" value="${maxR}" onchange="window.handleFieldUpdate('matrixMaxRows', this.value)" />
                </div>
            </div>
        </div>`;
    } else if (f.type === 'opinion_scale') {
        const mode = f.opinionScaleMode === 'likert' ? 'likert' : 'nps';
        const likLines =
            typeof f.likertLabels === 'string'
                ? f.likertLabels
                : Array.isArray(f.likertLabels)
                  ? f.likertLabels.join('\n')
                  : '';
        const likEsc = escapeHtmlLogic(likLines);
        extraProps = `
        <div class="prop-group" style="background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#6b21a8; margin-bottom:6px"><ion-icon name="analytics-outline"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_opinion_title', null, 'Escala NPS / Likert'))}</div>
            <label class="prop-label" style="color:#7c3aed; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_opinion_mode_lbl', null, 'Modo'))}</label>
            <select class="prop-input" onchange="window.handleFieldUpdate('opinionScaleMode', this.value)" style="font-size:12px; margin-bottom:10px;">
                <option value="nps" ${mode === 'nps' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_opinion_mode_nps', null, 'NPS (0 a 10)'))}</option>
                <option value="likert" ${mode === 'likert' ? 'selected' : ''}>${escapeHtmlLogic(fbStr('fb_prop_opinion_mode_likert', null, 'Likert (5 níveis)'))}</option>
            </select>
            <label class="prop-label" style="color:#7c3aed; font-size:10px;">${escapeHtmlLogic(fbStr('fb_prop_opinion_likert_lbl', null, 'Rótulos Likert (um por linha, até 5)'))}</label>
            <textarea class="prop-input" style="height:100px;font-size:12px;" onblur="window.handleFieldUpdate('likertLabels', this.value)">${likEsc}</textarea>
        </div>`;
    } else if (f.type === 'dropdown' || f.type === 'multiselect') {
        extraProps = `
        <div class="prop-group" style="background:#eef2ff; border:1px solid #6366f1; padding:12px; border-radius:8px; margin-top:16px;">
            <label class="prop-label" style="color:#4f46e5;"><ion-icon name="list"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_list_options_lbl', null, 'Opções da lista (separe por vírgula)'))}</label>
            <textarea class="prop-input" style="height:60px; font-size:12px;" onkeyup="window.handleFieldUpdate('options', this.value)">${f.options || ''}</textarea>
        </div>`;
    } else if (f.type === 'calculated') {
        const calcPh = escapeHtmlAttr(fbStr('fb_prop_calc_ph', null, 'Ex.: field_123 + field_456'));
        extraProps = `
        <div class="prop-group" style="background:#f5f3ff; border:1px solid #8b5cf6; padding:12px; border-radius:8px; margin-top:16px;">
            <label class="prop-label" style="color:#7c3aed;"><ion-icon name="calculator"></ion-icon> ${escapeHtmlLogic(fbStr('fb_prop_calc_title', null, 'Expressão matemática do sistema'))}</label>
            <input class="prop-input" type="text" placeholder="${calcPh}" value="${escapeHtmlAttr(f.calcFormula || '')}" onkeyup="window.handleFieldUpdate('calcFormula', this.value)" />
            <div style="font-size:10px; color:#7c3aed; margin-top:4px; line-height:1.2;">${escapeHtmlLogic(fbStr('fb_prop_calc_help', null, 'Variáveis: use o ID sublinhado de outros blocos (ex.: field_111 * field_222) ou use "Math.sqrt(field_111)" para fórmulas puras.'))}</div>
        </div>`;
    } else if (f.type === 'signature_summary') {
        const ids = new Set(Array.isArray(f.summarySourceFieldIds) ? f.summarySourceFieldIds : []);
        const eligible = getFieldsEligibleForSignatureSummary(f.id);
        const pickRows = eligible
            .map((o) => {
                const ck = ids.has(o.id) ? 'checked' : '';
                const lab = escapeHtmlLogic(o.label || o.id);
                const typ = escapeHtmlLogic(o.type || '');
                const oid = escapeHtmlAttr(o.id);
                return `<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;border:1px solid #e2e8f0;margin-bottom:4px;background:#fff;">
                  <input type="checkbox" ${ck} onchange="window.toggleSignatureSummarySource('${oid}', this.checked)" style="margin-top:2px;flex-shrink:0;accent-color:var(--primary);" />
                  <span style="font-size:12px;line-height:1.35;"><span style="font-weight:700;color:#0f172a;">${lab}</span> <span style="color:#94a3b8;font-size:10px;">(${typ} · ${escapeHtmlLogic(o.id)})</span></span>
                </label>`;
            })
            .join('');
        const sumTitle = escapeHtmlLogic(
            fbStr('fb_prop_signature_summary_fields_title', null, 'Campos no resumo (ordem = ordem no formulário)'),
        );
        const sumHelp = fbStr(
            'fb_prop_signature_summary_fields_help',
            null,
            'No app, estes valores aparecem num único bloco <b>acima</b> da zona de assinatura. Na raiz, o app também procura valores em seções repetíveis (primeira ocorrência com texto). Dentro de uma linha repetível, usa-se o contexto dessa linha.',
        );
        const sumNone = escapeHtmlLogic(
            fbStr('fb_prop_signature_summary_none_eligible', null, 'Nenhum campo disponível para incluir.'),
        );
        const lblAll = escapeHtmlLogic(fbStr('fb_prop_signature_summary_select_all', null, 'Selecionar todos'));
        const lblClear = escapeHtmlLogic(fbStr('fb_prop_signature_summary_clear_all', null, 'Limpar seleção'));
        extraProps += `
        <div class="prop-group" style="background:#ecfeff; border:1px solid #67e8f9; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:12px; font-weight:800; color:#0e7490; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                <ion-icon name="reader-outline"></ion-icon> ${sumTitle}
            </div>
            <div style="font-size:10px; color:#155e75; line-height:1.4; margin-bottom:10px;">
                ${sumHelp}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                <button type="button" class="btn btn-outline btn-sm" onclick="window.signatureSummarySelectAllSources()" style="font-size:11px;padding:6px 10px;">${lblAll}</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="window.signatureSummaryClearAllSources()" style="font-size:11px;padding:6px 10px;">${lblClear}</button>
            </div>
            <div style="max-height:220px; overflow-y:auto;">${
                pickRows || `<span style="font-size:11px;color:#94a3b8">${sumNone}</span>`
            }</div>
        </div>`;
    }

    const phInst1 = escapeHtmlAttr(fbStr('fb_ph_instance_example', { n: '1' }, 'ex.: 1'));
    const phInst2 = escapeHtmlAttr(fbStr('fb_ph_instance_example', { n: '2' }, 'ex.: 2'));
    const phInst5 = escapeHtmlAttr(fbStr('fb_ph_instance_example', { n: '5' }, 'ex.: 5'));
    const onlineValHint =
        f.type === 'facial_recognition'
            ? fbStr('fb_prop_online_validation_face', null, '')
            : f.type === 'vision_checklist' || f.type === 'vision_ai_analysis'
              ? fbStr('fb_prop_online_validation_vision', null, '')
              : f.type === 'voice_note'
                ? fbStr('fb_prop_online_validation_voice', null, '')
                : f.type === 'lookup_select'
                  ? fbStr('fb_prop_online_validation_lookup', null, '')
                  : fbStr('fb_prop_online_validation_generic', null, '');

    elPropsBody.innerHTML = `
        <div class="prop-group">
            <label class="prop-label">${escapeHtmlLogic(
                f.type === 'section_break'
                    ? fbStr('fb_prop_label_section_title', null, 'Nome da etapa ou seção (como aparece no app móvel)')
                    : fbStr('fb_prop_label_question_panel', null, 'Rótulo da pergunta no painel (técnico vê no app)')
            )}</label>
            <input id="prop-label-input" class="prop-input" type="text" value="${f.label}" onkeyup="window.handleFieldUpdate('label', this.value)" />
        </div>
        <div class="prop-group">
            <label class="prop-label">${escapeHtmlLogic(fbStr('fb_prop_internal_id', null, 'ID interno do campo (slug)'))}</label>
            <input class="prop-input" type="text" value="${f.id}" disabled style="background:#f1f5f9; cursor:not-allowed;" title="${escapeHtmlAttr(
                fbStr('fb_prop_internal_id_copy_title', null, 'Copie isso para usar em fórmulas')
            )}"/>
        </div>
        ${f.type === 'section_break' ? (() => {
            const rawSfm = f.sectionFillMode === 'wizard' ? 'wizard' : f.sectionFillMode === 'list' ? 'list' : 'inherit';
            const pick = rawSfm === 'wizard' ? 'wizard' : 'list';
            return `
        <div class="prop-group" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:12px; border-radius:8px; margin-top:4px;">
            <label class="prop-label">${escapeHtmlLogic(fbStr('fb_prop_section_app_view_title', null, 'Como o técnico vê esta etapa (app)'))}</label>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                <label class="app-fill-mode-card" style="cursor:pointer; border:2px solid var(--border, #e2e8f0); border-radius:10px; padding:10px 12px; display:flex; gap:10px; align-items:flex-start; background:#fff;">
                    <input type="radio" name="propSectionFillMode" value="list" ${pick === 'list' ? 'checked' : ''} style="margin-top:3px; accent-color:var(--primary);" onchange="if(this.checked) window.handleFieldUpdate('sectionFillMode', 'list')" />
                    <span>
                        <span style="display:block; font-weight:800; font-size:12px; color:var(--text1, #0f172a);"><ion-icon name="list-outline" style="font-size:14px; vertical-align:-2px;"></ion-icon> ${escapeHtmlLogic(
                            fbStr('fb_prop_section_fill_list_title', null, 'Lista com scroll')
                        )}</span>
                        <span style="display:block; font-size:11px; color:var(--text3, #64748b); line-height:1.35; margin-top:4px;">${escapeHtmlLogic(
                            fbStr('fb_prop_section_fill_list_desc', null, 'Todos os campos desta seção visíveis com scroll.')
                        )}</span>
                    </span>
                </label>
                <label class="app-fill-mode-card" style="cursor:pointer; border:2px solid var(--border, #e2e8f0); border-radius:10px; padding:10px 12px; display:flex; gap:10px; align-items:flex-start; background:#fff;">
                    <input type="radio" name="propSectionFillMode" value="wizard" ${pick === 'wizard' ? 'checked' : ''} style="margin-top:3px; accent-color:var(--primary);" onchange="if(this.checked) window.handleFieldUpdate('sectionFillMode', 'wizard')" />
                    <span>
                        <span style="display:block; font-weight:800; font-size:12px; color:var(--text1, #0f172a);"><ion-icon name="git-commit-outline" style="font-size:14px; vertical-align:-2px;"></ion-icon> ${escapeHtmlLogic(
                            fbStr('fb_prop_section_fill_wizard_title', null, 'Um campo de cada vez')
                        )}</span>
                        <span style="display:block; font-size:11px; color:var(--text3, #64748b); line-height:1.35; margin-top:4px;">${escapeHtmlLogic(
                            fbStr('fb_prop_section_fill_wizard_desc', null, 'Assistente: Próximo / Voltar só dentro desta seção.')
                        )}</span>
                    </span>
                </label>
            </div>
            ${
                rawSfm === 'inherit'
                    ? `<div style="font-size:10px; color:#b45309; margin-top:8px; line-height:1.35;">${fbStr(
                          'fb_prop_section_legacy_inherit',
                          null,
                          'Legado: «seguir global» — o app usa ainda <code>appFillMode</code> no JSON até escolher uma opção acima.'
                      )}</div>`
                    : ''
            }
        </div>
        <div class="prop-group" style="background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:8px; margin-top:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="prop-section-repeat" ${f.multiple ? 'checked' : ''} onchange="window.handleFieldUpdate('multiple', this.checked)" />
                <label for="prop-section-repeat" style="font-size:13px; font-weight:700; cursor:pointer; color:#581c87;">${escapeHtmlLogic(
                    fbStr('fb_prop_section_repeat_chk', null, 'Repetir esta seção (lista)')
                )}</label>
            </div>
            <div style="font-size:10px; color:#6b21a8; margin-bottom:10px; line-height:1.35;">${fbStr(
                'fb_prop_section_repeat_help',
                null,
                'O técnico pode preencher <b>várias instâncias</b> seguidas dos mesmos campos (ex.: vários equipamentos). Cada linha grava um objeto no array <b>__section_repeat_&lt;id&gt;</b> na execução. Use mín./máx. para limitar quantas instâncias.'
            )}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">${escapeHtmlLogic(
                        fbStr('fb_prop_min_instances_sec', null, 'Mín. instâncias (vazio = 0)')
                    )}</label>
                    <input class="prop-input" type="number" min="0" placeholder="${phInst1}" value="${f.minItems !== undefined && f.minItems !== null && f.minItems !== '' ? String(f.minItems) : ''}" onchange="window.handleFieldUpdate('minItems', this.value)" />
                </div>
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">${escapeHtmlLogic(
                        fbStr('fb_prop_max_instances_sec', null, 'Máx. instâncias (vazio = ilimitado)')
                    )}</label>
                    <input class="prop-input" type="number" min="1" placeholder="${phInst5}" value="${f.maxItems !== undefined && f.maxItems !== null && f.maxItems !== '' ? String(f.maxItems) : ''}" onchange="window.handleFieldUpdate('maxItems', this.value)" />
                </div>
            </div>
        </div>`;
        })() : ''}
        ${
            f.type === 'leitura'
                ? `
        <div class="prop-group">
            <label class="prop-label">${escapeHtmlLogic(fbStr('fb_prop_reading_title', null, 'Texto da leitura (rich text)'))}</label>
            <div style="font-size:10px;color:#64748b;margin-bottom:8px;line-height:1.35;">
              ${fbStr(
                  'fb_prop_reading_intro',
                  null,
                  'Exibido no app como <strong>só leitura</strong> (scroll com o formulário). <strong>Hiperligações não são permitidas</strong> — são removidas ao editar.'
              )}
            </div>
            <div id="field-reading-editor-host" style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              <div id="field-reading-editor"></div>
            </div>
        </div>
        `
                : `
        <div class="prop-group">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
                <label class="prop-label" style="margin:0; flex:1; min-width:160px;">${escapeHtmlLogic(
                    fbStr('fb_prop_instructions_title', null, 'Instruções ao técnico (rich text, opcional)')
                )}</label>
                ${f.type !== 'section_break' ? `
                <label title="${escapeHtmlAttr(fbStr('fb_prop_instructions_show_title', null, 'Mostrar instruções no celular do técnico'))}" style="display:inline-flex; align-items:center; cursor:pointer; user-select:none;">
                    <input type="checkbox" id="prop-show-field-instructions" aria-label="${escapeHtmlAttr(
                        fbStr('fb_prop_instructions_show_aria', null, 'Mostrar instruções no app móvel')
                    )}" ${f.showFieldInstructions === true ? 'checked' : ''} onchange="window.handleFieldUpdate('showFieldInstructions', this.checked)" style="width:15px; height:15px; accent-color:var(--primary); cursor:pointer; flex-shrink:0;" />
                </label>
                ` : ''}
            </div>
            <div id="field-help-editor-host" style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              <div id="field-help-editor"></div>
            </div>
        </div>
        `
        }
        
        ${f.type !== 'section_break' && f.type !== 'leitura' && f.type !== 'voice_note' && f.type !== 'photo' && f.type !== 'photo_stamped' && f.type !== 'facial_recognition' && f.type !== 'vision_checklist' && f.type !== 'vision_ai_analysis' && f.type !== 'file_upload' && f.type !== 'signature' && f.type !== 'signature_summary' && f.type !== 'materials_consumption' && f.type !== 'materials_receipt' && f.type !== 'technician_finance' && f.type !== 'geofence_check' && f.type !== 'location_pick' && f.type !== 'transit_start' && f.type !== 'transit_end' && f.type !== 'image_annotation' && f.type !== 'lookup_select' && f.type !== 'repeatable_matrix' && f.type !== 'opinion_scale' ? `
        <div class="prop-group">
            <label class="prop-label">${escapeHtmlLogic(
                fbStr('fb_prop_default_value_lbl', null, 'Auto-preenchimento / valor padrão (opcional)')
            )}</label>
            <input class="prop-input" type="text" value="${f.defaultValue || ''}" placeholder="${escapeHtmlAttr(
                fbStr('fb_prop_default_value_ph', null, 'Use tags como {{user.name}}, {{date}}')
            )}" onkeyup="window.handleFieldUpdate('defaultValue', this.value)" />
        </div>
        ` : ''}

        ${
            f.type === 'leitura'
                ? `<div class="prop-group" style="font-size:12px;color:#64748b;line-height:1.4;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">${fbStr(
                      'fb_prop_leitura_block_note',
                      null,
                      'Este bloco <strong>não recolhe resposta</strong> no app — serve apenas para o técnico ler (contratos, avisos, etc.).'
                  )}</div>`
                : `<div class="prop-group" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="prop-req" ${reqChecked} onchange="window.handleFieldUpdate('required', this.checked)" />
            <label for="prop-req" style="font-size:13px; font-weight:600; cursor:pointer;">${escapeHtmlLogic(
                fbStr('fb_prop_required_q', null, 'Resposta obrigatória?')
            )}</label>
        </div>`
        }

        ${f.type !== 'section_break' &&
        !['hidden', 'calculated', 'transit_start', 'transit_end', 'materials_consumption', 'materials_receipt', 'technician_finance', 'signature', 'signature_summary', 'vision_checklist', 'vision_ai_analysis', 'leitura', 'voice_note', 'image_annotation', 'lookup_select', 'repeatable_matrix', 'opinion_scale'].includes(f.type) ? `
        <div class="prop-group" style="background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:8px; margin-top:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="prop-multiple" ${f.multiple ? 'checked' : ''} onchange="window.handleFieldUpdate('multiple', this.checked)" />
                <label for="prop-multiple" style="font-size:13px; font-weight:700; cursor:pointer; color:#581c87;">${escapeHtmlLogic(
                    fbStr('fb_prop_repeat_field_title', null, 'Várias respostas (lista)')
                )}</label>
            </div>
            <div style="font-size:10px; color:#6b21a8; margin-bottom:10px; line-height:1.35;">${fbStr(
                'fb_prop_repeat_field_help',
                null,
                'O app grava um <b>array</b> na execução para este campo (texto, opções, fotos, assinaturas, etc.). Compatível com formulários antigos (valor único continua a ser string ou valor único).'
            )}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">${escapeHtmlLogic(
                        fbStr('fb_prop_min_items_field', null, 'Mín. itens (vazio = padrão)')
                    )}</label>
                    <input class="prop-input" type="number" min="0" placeholder="${phInst2}" value="${f.minItems !== undefined && f.minItems !== null && f.minItems !== '' ? String(f.minItems) : ''}" onchange="window.handleFieldUpdate('minItems', this.value)" />
                </div>
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">${escapeHtmlLogic(
                        fbStr('fb_prop_max_items_field', null, 'Máx. itens (vazio = ilimitado)')
                    )}</label>
                    <input class="prop-input" type="number" min="1" placeholder="${phInst5}" value="${f.maxItems !== undefined && f.maxItems !== null && f.maxItems !== '' ? String(f.maxItems) : ''}" onchange="window.handleFieldUpdate('maxItems', this.value)" />
                </div>
            </div>
        </div>
        ` : ''}

        ${['photo', 'photo_stamped', 'facial_recognition', 'vision_checklist', 'vision_ai_analysis', 'file_upload', 'image_annotation'].includes(f.type) ? `
        <div class="prop-group" style="display:flex; align-items:flex-start; gap:10px; margin-top:12px; background:#ecfdf5; border:1px solid #a7f3d0; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-allow-media-desc" ${f.allowMediaDescription ? 'checked' : ''} onchange="window.handleFieldUpdate('allowMediaDescription', this.checked)" style="transform:scale(1.2);margin-top:2px;flex-shrink:0" />
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <label for="prop-allow-media-desc" style="font-size:13px; font-weight:700; color:#047857; cursor:pointer;">${escapeHtmlLogic(
                    fbStr('fb_prop_media_comment_title', null, 'Comentário opcional por foto / arquivo')
                )}</label>
                <div style="font-size:10px; color:#065f46; margin-top:4px; line-height:1.35;">${escapeHtmlLogic(
                    fbStr(
                        'fb_prop_media_comment_help',
                        null,
                        'Diferente do comentário geral do campo: aqui o técnico pode comentar cada foto, captura ou anexo (câmera, galeria ou arquivo). Tudo opcional.'
                    )
                )}</div>
            </div>
        </div>
        ` : ''}

        ${f.type !== 'section_break' && f.type !== 'hidden' && f.type !== 'leitura' ? `
        <div class="prop-group" style="display:flex; align-items:flex-start; gap:10px; margin-top:4px; background:#f0f9ff; border:1px solid #bae6fd; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-allow-comment" ${f.allowTechnicianComment ? 'checked' : ''} onchange="window.handleFieldUpdate('allowTechnicianComment', this.checked)" style="transform:scale(1.2);margin-top:2px;flex-shrink:0" />
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <label for="prop-allow-comment" style="font-size:13px; font-weight:700; color:#0369a1; cursor:pointer;">${escapeHtmlLogic(
                    fbStr('fb_prop_tech_comment_title', null, 'Comentário do técnico (opcional no app)')
                )}</label>
                <div style="font-size:10px; color:#0c4a6e; margin-top:4px; line-height:1.35;">${escapeHtmlLogic(
                    fbStr(
                        'fb_prop_tech_comment_help',
                        null,
                        'Mostra uma caixa de texto livre abaixo da resposta no app. Complementa as instruções ao técnico (não as substitui).'
                    )
                )}</div>
            </div>
        </div>
        ` : ''}

        ${['geofence_check', 'location_pick', 'photo', 'photo_stamped', 'facial_recognition', 'vision_checklist', 'vision_ai_analysis', 'voice_note', 'signature', 'signature_summary', 'barcode_scan', 'lookup_select'].includes(f.type) ? `
        <div class="prop-group" style="display:flex; align-items:center; gap:10px; margin-top:12px; background:#fefce8; border:1px solid #fef08a; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-online" ${f.requireOnlineValidation ? 'checked' : ''} onchange="window.handleFieldUpdate('requireOnlineValidation', this.checked)" style="transform:scale(1.2)" />
            <div style="display:flex; flex-direction:column;">
                <label for="prop-online" style="font-size:12px; font-weight:800; color:#ca8a04; cursor:pointer;"><ion-icon name="shield-checkmark" style="vertical-align:-2px"></ion-icon> ${escapeHtmlLogic(
                    fbStr('fb_prop_online_validation_title', null, 'Exigir validação apenas online?')
                )}</label>
                <div style="font-size:10px; color:#a16207; margin-top:2px; line-height:1.2;">${onlineValHint}</div>
            </div>
        </div>
        ` : ''}
        
        ${extraProps}
    `;

    if (window.fieldPropertiesModalOpen) {
        syncFieldPropertiesModalSubtitle();
    }

    setTimeout(function () {
        if (f.type === 'leitura') {
            if (typeof window.initFieldReadingEditor === 'function') window.initFieldReadingEditor(f);
        } else if (typeof window.initFieldHelpEditor === 'function') {
            window.initFieldHelpEditor(f);
        }
    }, 0);
}

window.renderProperties = renderProperties;

// Expose pra UI HTML
window.handleFieldUpdate = function(key, val) {
    if (selectedFieldId && key === 'required') {
        const sf = fields.find((x) => x.id === selectedFieldId);
        if (sf && sf.type === 'leitura') return;
    }
    updateField(key, val);
};

window.updateVisionStructuredPrompt = function (text) {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'vision_ai_analysis') return;
    const raw = String(text || '').trim();
    const s = raw.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
    const fallback = fbStr(
        'fb_prop_vision_default_structured_prompt',
        null,
        'A evidência visual confirma o item verificado?',
    );
    const finalText = s || fallback;
    f.visionStructuredPrompt = finalText;
    f.visionQuestions = [{ id: 'q1', text: finalText }];
    renderCanvas();
    if (window.fieldPropertiesModalOpen) renderProperties();
};

window.updateVisionDetectionQuestions = function (text) {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'vision_checklist') return;
    const raw = String(text || '');
    const lines = raw
        .split(/\n/)
        .map((ln) => String(ln || '').replace(/\r/g, '').trim())
        .filter((ln) => ln.length > 0);
    const fallback = fbStr(
        'fb_prop_vision_default_structured_prompt',
        null,
        'A evidência visual confirma o item verificado?',
    );

    if (lines.length <= 1) {
        const finalText = (lines[0] || raw.trim() || fallback).slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
        f.visionStructuredPrompt = finalText;
        f.visionQuestions = [{ id: 'q1', text: finalText }];
    } else {
        const taken = lines
            .slice(0, MAX_VISION_SIMNAO_QUESTIONS)
            .map((ln) => ln.slice(0, MAX_VISION_MULTI_SIMNAO_TEXT_CHARS).trim())
            .filter((ln) => ln.length > 0);
        if (taken.length <= 1) {
            const finalText = (taken[0] || raw.trim() || fallback).slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
            f.visionStructuredPrompt = finalText;
            f.visionQuestions = [{ id: 'q1', text: finalText }];
        } else {
            f.visionStructuredPrompt = '';
            f.visionQuestions = taken.map((t, i) => ({ id: `q${i + 1}`, text: t }));
        }
    }
    renderCanvas();
    if (window.fieldPropertiesModalOpen) renderProperties();
};

function closeVisionAiPromptExamplesModal() {
    const el = document.getElementById('vision-ai-prompt-examples-modal');
    if (!el) return;
    const fn = el._visionExEsc;
    if (typeof fn === 'function') document.removeEventListener('keydown', fn);
    el.remove();
}

/** Modal com modelos de prompt (só «Visão de IA — análise»). */
window.openVisionAiStructuredPromptExamplesModal = function () {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'vision_ai_analysis') return;
    closeVisionAiPromptExamplesModal();

    const overlay = document.createElement('div');
    overlay.id = 'vision-ai-prompt-examples-modal';
    overlay.style.cssText =
        'display:flex;position:fixed;inset:0;background:rgba(15,23,42,0.88);z-index:100001;justify-content:center;align-items:center;padding:max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));box-sizing:border-box;backdrop-filter:blur(4px)';

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'vision-ai-prompt-ex-h');
    dialog.style.cssText =
        'width:min(760px,100%);max-height:min(90vh,920px);background:var(--color-surface, #fff);border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.45);display:flex;flex-direction:column;overflow:hidden;border:1px solid #e2e8f0';

    const head = document.createElement('div');
    head.style.cssText =
        'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg, #fef2f2 0%, #fff 100%)';

    const headText = document.createElement('div');
    const h2 = document.createElement('div');
    h2.id = 'vision-ai-prompt-ex-h';
    h2.style.cssText = 'font-size:16px;font-weight:800;color:#7f1d1d;letter-spacing:-0.02em;line-height:1.25';
    h2.textContent = fbStr('fb_vision_prompt_ex_modal_title', null, 'Exemplos de prompt estruturado');
    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:11px;color:#64748b;margin-top:6px;line-height:1.45';
    intro.innerHTML = fbStr(
        'fb_vision_prompt_ex_modal_intro',
        null,
        'Escolha um modelo para preencher o campo. Ajuste depois ao seu checklist. Ative «Classificação 0–10» nas propriedades se quiser que a API preencha <code>rating0To10</code> coerente com a rubrica.',
    );
    headText.appendChild(h2);
    headText.appendChild(intro);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-ghost btn-sm';
    closeBtn.style.cssText = 'flex-shrink:0;font-weight:700;color:#64748b';
    closeBtn.textContent = fbStr('fb_vision_prompt_ex_close', null, 'Fechar');
    closeBtn.onclick = closeVisionAiPromptExamplesModal;

    head.appendChild(headText);
    head.appendChild(closeBtn);

    const cat =
        typeof window.getVisionAiExampleCatalog === 'function'
            ? window.getVisionAiExampleCatalog()
            : null;
    if (!cat || !Array.isArray(cat.items) || !cat.items.length) {
        fbAlert(
            'fb_vision_prompt_ex_catalog_missing',
            null,
            'Catálogo de exemplos não carregado. Recarregue a página do Forms Builder.',
        );
        return;
    }

    const toolbar = document.createElement('div');
    toolbar.style.cssText =
        'padding:10px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#f8fafc';
    const areaLab = document.createElement('label');
    areaLab.setAttribute('for', 'vision-ai-ex-area-select');
    areaLab.style.cssText = 'font-size:11px;font-weight:800;color:#334155;white-space:nowrap';
    areaLab.textContent = fbStr('fb_vision_prompt_ex_area_lbl', null, 'Área / setor');
    const sel = document.createElement('select');
    sel.id = 'vision-ai-ex-area-select';
    sel.className = 'prop-input';
    sel.style.cssText = 'max-width:min(320px,100%);font-size:12px;flex:1;min-width:160px';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = cat.areaLabel('all');
    sel.appendChild(optAll);
    for (let ai = 0; ai < cat.areaOrder.length; ai++) {
        const aid = cat.areaOrder[ai];
        const o = document.createElement('option');
        o.value = aid;
        o.textContent = cat.areaLabel(aid);
        sel.appendChild(o);
    }
    toolbar.appendChild(areaLab);
    toolbar.appendChild(sel);

    const scroll = document.createElement('div');
    scroll.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px 16px;display:flex;flex-direction:column;gap:12px';

    const emptyMsg = document.createElement('div');
    emptyMsg.id = 'vision-ai-ex-empty';
    emptyMsg.style.cssText =
        'display:none;padding:14px;border-radius:10px;border:1px dashed #cbd5e1;background:#fff;font-size:12px;color:#64748b;text-align:center';
    emptyMsg.textContent = fbStr('fb_vision_prompt_ex_empty_filter', null, 'Nenhum modelo nesta área. Escolha «Todas as áreas» ou outro setor.');
    scroll.appendChild(emptyMsg);

    function applyVisionExFilter() {
        const v = String(sel.value || 'all');
        const cards = scroll.querySelectorAll('[data-vision-ex-card="1"]');
        let n = 0;
        for (let ci = 0; ci < cards.length; ci++) {
            const card = cards[ci];
            const a = card.getAttribute('data-area-id') || '';
            const show = v === 'all' || a === v;
            card.style.display = show ? '' : 'none';
            if (show) n++;
        }
        emptyMsg.style.display = n ? 'none' : 'block';
    }
    sel.onchange = applyVisionExFilter;

    const applyLbl = fbStr('fb_vision_prompt_ex_apply', null, 'Aplicar ao campo');
    for (let i = 0; i < cat.items.length; i++) {
        const ex = cat.items[i];
        const card = document.createElement('div');
        card.setAttribute('data-vision-ex-card', '1');
        card.setAttribute('data-area-id', String(ex.areaId || ''));
        card.style.cssText =
            'border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8fafc;display:flex;flex-direction:column;gap:8px';

        const titleRow = document.createElement('div');
        titleRow.style.cssText =
            'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap';
        const t = document.createElement('div');
        t.style.cssText = 'font-size:13px;font-weight:800;color:#0f172a;line-height:1.3';
        t.textContent = ex.title;

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-primary btn-sm';
        applyBtn.style.cssText = 'flex-shrink:0;font-weight:700';
        applyBtn.textContent = applyLbl;
        const bodySnap = ex.body;
        applyBtn.onclick = function () {
            window.updateVisionStructuredPrompt(bodySnap);
            closeVisionAiPromptExamplesModal();
        };

        titleRow.appendChild(t);
        titleRow.appendChild(applyBtn);

        const pre = document.createElement('pre');
        pre.style.cssText =
            'margin:0;font-size:10px;line-height:1.42;color:#334155;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow-y:auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,sans-serif';
        pre.textContent = ex.body;

        card.appendChild(titleRow);
        card.appendChild(pre);
        scroll.appendChild(card);
    }

    dialog.appendChild(head);
    dialog.appendChild(toolbar);
    dialog.appendChild(scroll);
    applyVisionExFilter();
    overlay.appendChild(dialog);

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeVisionAiPromptExamplesModal();
    });

    const onEsc = function (ev) {
        if (ev.key === 'Escape') closeVisionAiPromptExamplesModal();
    };
    overlay._visionExEsc = onEsc;
    document.addEventListener('keydown', onEsc);

    document.body.appendChild(overlay);
};

/** @deprecated — mantido por compatibilidade com HTML antigo em cache */
window.updateVisionQuestionsFromLines = window.updateVisionDetectionQuestions;

/** Inclui/remove um campo no resumo para assinatura (mantém ordem do canvas). */
window.applyRepeatableMatrixColumnsJson = function (text) {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'repeatable_matrix') return;
    let parsed;
    try {
        parsed = JSON.parse(String(text || '').trim());
    } catch (e) {
        fbAlert('fb_alert_matrix_json', null, 'JSON inválido nas colunas.');
        return;
    }
    if (!Array.isArray(parsed)) {
        fbAlert('fb_alert_matrix_array', null, 'As colunas devem ser um array JSON.');
        return;
    }
    const next = [];
    for (let i = 0; i < parsed.length && next.length < 8; i++) {
        const x = parsed[i];
        if (!x || typeof x !== 'object') continue;
        const id = String(x.id || `c${next.length + 1}`)
            .replace(/[^\w-]/g, '_')
            .slice(0, 48);
        const label = String(x.label || x.title || id)
            .trim()
            .slice(0, 120);
        const ct = String(x.cellType || 'text').toLowerCase();
        const cellType = ct === 'number' || ct === 'yes_no' ? ct : 'text';
        if (label) next.push({ id, label, cellType });
    }
    if (!next.length) {
        fbAlert(
            'fb_alert_matrix_none',
            null,
            'Nenhuma coluna válida. Ex.: [{"id":"c1","label":"Item","cellType":"text"}]'
        );
        return;
    }
    f.matrixColumns = next;
    renderCanvas();
    renderProperties();
};

/** Campos que podem entrar no bloco «resumo para assinatura» (mesma regra que a lista de checkboxes). */
function getFieldsEligibleForSignatureSummary(excludeFieldId) {
    return fields.filter(
        (o) =>
            o &&
            o.id !== excludeFieldId &&
            o.type !== 'section_break' &&
            o.type !== 'signature_summary' &&
            o.type !== 'hidden' &&
            o.type !== 'vision_checklist' &&
            o.type !== 'vision_ai_analysis' &&
            o.type !== 'leitura' &&
            o.type !== 'voice_note',
    );
}

window.signatureSummarySelectAllSources = function () {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'signature_summary') return;
    f.summarySourceFieldIds = getFieldsEligibleForSignatureSummary(f.id).map((o) => o.id);
    renderCanvas();
    renderProperties();
};

window.signatureSummaryClearAllSources = function () {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'signature_summary') return;
    f.summarySourceFieldIds = [];
    renderCanvas();
    renderProperties();
};

window.toggleSignatureSummarySource = function (sourceId, checked) {
    if (!selectedFieldId) return;
    const f = fields.find((x) => x.id === selectedFieldId);
    if (!f || f.type !== 'signature_summary') return;
    let arr = Array.isArray(f.summarySourceFieldIds) ? f.summarySourceFieldIds.slice() : [];
    if (checked) {
        if (!arr.includes(sourceId)) arr.push(sourceId);
    } else {
        arr = arr.filter((x) => x !== sourceId);
    }
    const order = new Map(fields.map((x, i) => [x.id, i]));
    arr.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    f.summarySourceFieldIds = arr;
    renderCanvas();
    renderProperties();
};

window.refreshConditionalUI = function(valueId) {
    renderProperties();
};

let globalFormSettings = {
    requireGlobalGeofence: false,
    globalGeofenceRadius: 200,
    rules: [],
    /** full | wizard | hybrid — experiência no app móvel */
    appFillMode: 'full',
    /** direct = abre na 1.ª etapa; hub = lista de etapas na tela */
    appSectionStart: 'direct',
    /** free | sequential — só com appSectionStart hub */
    appHubSectionOrder: 'free',
    /** Opcional: minutos previstos só do formulário (sem deslocamento); múltiplos de 5; ≥5 */
    expectedFormDurationMinutes: undefined,
};

function normalizeAppFillMode(v) {
    return v === 'wizard' || v === 'hybrid' ? v : 'full';
}

function normalizeAppSectionStart(v) {
    return v === 'hub' ? 'hub' : 'direct';
}

function normalizeAppHubSectionOrder(v) {
    return v === 'sequential' ? 'sequential' : 'free';
}

function __fbStripHintDash(h) {
    return String(h ?? '')
        .trim()
        .replace(/^—\s*/, '')
        .replace(/^-\s*/, '');
}

/** Resumo curto no botão «Layout» (faixa do builder) — uma linha: «Layout - … - …». */
window.updateFbAppLayoutButtonSummary = function () {
    const el = document.getElementById('fb-app-layout-summary');
    if (!el) return;
    const fb = typeof window.fbT === 'function' ? window.fbT : null;
    const eyebrow = fb ? fb('fb_app_start_eyebrow') : 'Layout';
    const sep = ' - ';
    if (!globalFormSettings) {
        el.textContent = eyebrow + sep + '—';
        return;
    }
    const start = normalizeAppSectionStart(globalFormSettings.appSectionStart);
    const ord = normalizeAppHubSectionOrder(globalFormSettings.appHubSectionOrder);
    if (start === 'hub') {
        const hubMain = fb ? fb('fb_app_start_hub') : 'Menu de etapas';
        const ordLbl =
            ord === 'sequential' ? (fb ? fb('fb_app_hub_seq') : 'Ordem fixa') : fb ? fb('fb_app_hub_free') : 'Livre';
        el.textContent = eyebrow + sep + hubMain + sep + ordLbl;
    } else {
        const a = fb ? fb('fb_app_start_direct') : '1ª etapa';
        const hint = fb ? fb('fb_app_start_direct_hint') : '— clássico';
        const b = __fbStripHintDash(hint);
        el.textContent = b ? eyebrow + sep + a + sep + b : eyebrow + sep + a;
    }
};

window.syncAppSectionNavRadios = function () {
    if (!globalFormSettings) return;
    const start = normalizeAppSectionStart(globalFormSettings.appSectionStart);
    const ord = normalizeAppHubSectionOrder(globalFormSettings.appHubSectionOrder);
    document.querySelectorAll('input[name="appSectionStart"]').forEach((r) => {
        r.checked = r.value === start;
    });
    const wrap = document.getElementById('app-hub-order-wrap');
    if (wrap) {
        wrap.classList.toggle('app-hub-order-muted', start !== 'hub');
        wrap.style.opacity = '';
    }
    document.querySelectorAll('input[name="appHubSectionOrder"]').forEach((r) => {
        r.checked = r.value === ord;
        r.disabled = start !== 'hub';
    });
    if (typeof window.updateFbAppLayoutButtonSummary === 'function') {
        window.updateFbAppLayoutButtonSummary();
    }
};

window.readAppSectionNavFromRadios = function () {
    const s = document.querySelector('input[name="appSectionStart"]:checked');
    if (s && globalFormSettings) {
        globalFormSettings.appSectionStart = normalizeAppSectionStart(s.value);
    }
    const o = document.querySelector('input[name="appHubSectionOrder"]:checked');
    if (o && globalFormSettings) {
        globalFormSettings.appHubSectionOrder = normalizeAppHubSectionOrder(o.value);
    }
};

window.__mobilePreviewFillSim = null;
window.__mobilePreviewSimPage = 0;
window.__mobilePreviewSimWizardIx = 0;

window.setMobilePreviewFillSim = function (mode) {
    window.__mobilePreviewFillSim = normalizeAppFillMode(mode);
    window.__mobilePreviewSimPage = 0;
    window.__mobilePreviewSimWizardIx = 0;
    if (typeof renderMobilePreview === 'function') renderMobilePreview();
};

function computeFillModeFromSchemaFields(flds) {
    const breaks = (flds || []).filter((f) => f.type === 'section_break');
    const allInherit = breaks.every((f) => !f.sectionFillMode || f.sectionFillMode === 'inherit');
    if (allInherit) {
        return normalizeAppFillMode(globalFormSettings && globalFormSettings.appFillMode);
    }
    return breaks.some((f) => f.sectionFillMode === 'wizard') ? 'hybrid' : 'full';
}

function effectivePreviewFillMode() {
    const sim = window.__mobilePreviewFillSim;
    if (sim === 'wizard' || sim === 'hybrid' || sim === 'full') return sim;
    return computeFillModeFromSchemaFields(fields);
}

/** Mesma lógica que o app: páginas por section_break */
function splitBuilderFieldsIntoSectionPages(flds) {
    const rawPages = [];
    let cur = [];
    let pageTitle = 'Página 1';
    let pageId = 'page_1';
    let pageVisible = true;
    (flds || []).forEach((f) => {
        if (f.type === 'section_break') {
            if (cur.length > 0 || rawPages.length > 0) {
                rawPages.push({
                    fields: cur,
                    pageTitle,
                    id: pageId,
                    isVisible: pageVisible,
                });
            }
            cur = [];
            pageTitle = f.label || `Página ${rawPages.length + 1}`;
            pageId = f.id || 'sec';
            pageVisible = true;
        } else {
            cur.push(f);
        }
    });
    rawPages.push({ fields: cur, pageTitle, id: pageId, isVisible: pageVisible });
    return rawPages.filter((p) => p.isVisible);
}

window.shiftMobilePreviewHybridPage = function (delta) {
    const pages = window.__mobilePreviewHybridPages || [];
    if (!pages.length) return;
    let ix = (window.__mobilePreviewSimPage || 0) + delta;
    ix = Math.max(0, Math.min(pages.length - 1, ix));
    window.__mobilePreviewSimPage = ix;
    if (typeof renderMobilePreview === 'function') renderMobilePreview();
};

window.shiftMobilePreviewWizardIx = function (delta) {
    const n = window.__mobilePreviewWizardCount || 0;
    if (!n) return;
    let ix = (window.__mobilePreviewSimWizardIx || 0) + delta;
    ix = Math.max(0, Math.min(n - 1, ix));
    window.__mobilePreviewSimWizardIx = ix;
    if (typeof renderMobilePreview === 'function') renderMobilePreview();
};

window.closeGlobalGeofenceModal = function () {
    const m = document.getElementById('global-geofence-modal');
    if (m) m.style.display = 'none';
};

window.applyGlobalGeofenceModal = function () {
    const cb = document.getElementById('global-geofence-enabled');
    const radEl = document.getElementById('global-geofence-radius');
    globalFormSettings.requireGlobalGeofence = !!(cb && cb.checked);
    let r = parseInt(radEl && radEl.value, 10);
    if (!Number.isFinite(r) || r < 10) r = globalFormSettings.globalGeofenceRadius || 200;
    if (r > 50000) r = 50000;
    globalFormSettings.globalGeofenceRadius = r;
    if (radEl) radEl.value = String(r);
    window.closeGlobalGeofenceModal();
    if (typeof renderMobilePreview === 'function') renderMobilePreview();
};

window.configureGlobalSettings = function () {
    const m = document.getElementById('global-geofence-modal');
    const cb = document.getElementById('global-geofence-enabled');
    const radEl = document.getElementById('global-geofence-radius');
    if (!m || !cb || !radEl) {
        console.warn('[checklists-builder] Modal Cerca Global ausente no HTML.');
        return;
    }
    cb.checked = !!globalFormSettings.requireGlobalGeofence;
    radEl.value = String(
        Number.isFinite(Number(globalFormSettings.globalGeofenceRadius))
            ? globalFormSettings.globalGeofenceRadius
            : 200
    );
    m.style.display = 'flex';
};

window.closeExpectedFormDurationModal = function () {
    const m = document.getElementById('expected-form-duration-modal');
    if (m) m.style.display = 'none';
};

window.applyExpectedFormDurationModal = function () {
    const durEl = document.getElementById('expected-form-duration-minutes');
    if (durEl) {
        const raw = String(durEl.value || '').trim();
        if (raw === '') {
            delete globalFormSettings.expectedFormDurationMinutes;
        } else {
            let dm = parseInt(raw, 10);
            if (!Number.isFinite(dm) || dm < 5) dm = 5;
            dm = Math.floor(dm / 5) * 5;
            globalFormSettings.expectedFormDurationMinutes = dm;
        }
    }
    window.closeExpectedFormDurationModal();
    if (typeof renderMobilePreview === 'function') renderMobilePreview();
};

window.openExpectedFormDurationModal = function () {
    const m = document.getElementById('expected-form-duration-modal');
    const durEl = document.getElementById('expected-form-duration-minutes');
    if (!m || !durEl) {
        console.warn('[checklists-builder] Modal de tempo do formulário ausente no HTML.');
        return;
    }
    const v = globalFormSettings.expectedFormDurationMinutes;
    durEl.value =
        v != null && Number.isFinite(Number(v)) && Number(v) >= 5 ? String(Math.floor(Number(v))) : '';
    m.style.display = 'flex';
};

window.openAppLayoutModal = function () {
    const m = document.getElementById('fb-app-layout-modal');
    if (!m) {
        console.warn('[checklists-builder] Modal de layout (app) ausente no HTML.');
        return;
    }
    try {
        const det = m.querySelector('details.formbuilder-app-nav-help');
        if (det) det.removeAttribute('open');
    } catch (eLayHelp) {
        /* ignore */
    }
    if (typeof window.syncAppSectionNavRadios === 'function') window.syncAppSectionNavRadios();
    m.style.display = 'flex';
    try {
        const r = m.querySelector('input[name="appSectionStart"]:checked');
        if (r) r.focus();
    } catch (eOpenLay) {
        /* ignore */
    }
};

window.closeAppLayoutModal = function () {
    const m = document.getElementById('fb-app-layout-modal');
    if (m) m.style.display = 'none';
    if (typeof window.readAppSectionNavFromRadios === 'function') window.readAppSectionNavFromRadios();
    if (typeof window.updateFbAppLayoutButtonSummary === 'function') window.updateFbAppLayoutButtonSummary();
    try {
        const b = document.getElementById('fb-app-layout-open-btn');
        if (b) b.focus();
    } catch (eCloseLay) {
        /* ignore */
    }
};

(function __fbBindAppLayoutModalEscape() {
    document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        const m = document.getElementById('fb-app-layout-modal');
        if (!m || m.style.display !== 'flex') return;
        ev.preventDefault();
        if (typeof window.closeAppLayoutModal === 'function') window.closeAppLayoutModal();
    });
})();

// Global: JSON EXPORTER & IMPORTER
window.exportJSON = function() {
    if (!fields.some((f) => f.type !== 'section_break')) {
        fbAlert(
            'fb_alert_export_needs_field',
            null,
            'Adicione pelo menos um campo de pergunta ao canvas (a primeira secção já existe).'
        );
        return;
    }
    const output = {
        settings: globalFormSettings,
        schema: fields
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(output, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", (currentFormTitle || "builder") + "_schema.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.importJSON = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.readAsText(file, "UTF-8");
        reader.onload = function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                if(parsed.schema) {
                    flushQuillToBoundField();
                    fields = ensureSchemaInstructionFlags(parsed.schema);
                    ensureCanvasSchemaHasSection();
                    fixTransitDisplacementViolations(fields);
                    globalFormSettings = Object.assign(
                        {
                            requireGlobalGeofence: false,
                            globalGeofenceRadius: 200,
                            rules: [],
                            appFillMode: 'full',
                            appSectionStart: 'direct',
                            appHubSectionOrder: 'free',
                            expectedFormDurationMinutes: undefined,
                        },
                        parsed.settings || {}
                    );
                    if (!globalFormSettings.rules) globalFormSettings.rules = [];
                    globalFormSettings.appFillMode = normalizeAppFillMode(globalFormSettings.appFillMode);
                    globalFormSettings.appSectionStart = normalizeAppSectionStart(globalFormSettings.appSectionStart);
                    globalFormSettings.appHubSectionOrder = normalizeAppHubSectionOrder(
                        globalFormSettings.appHubSectionOrder
                    );
                    window.syncAppSectionNavRadios && window.syncAppSectionNavRadios();
                    selectedFieldId = null;
                    renderCanvas();
                    renderProperties();
                    if (typeof window.syncBuilderPersistBaseline === 'function') {
                        window.syncBuilderPersistBaseline();
                    }
                    fbAlert(
                        'fb_alert_import_ok',
                        null,
                        'Formulário importado com sucesso. Clique em «Salvar formulário» para persistir no catálogo local e na API.'
                    );
                } else {
                    fbAlert('fb_alert_import_bad', null, 'O arquivo não é compatível com o BrSpark Builder.');
                }
            } catch(err) {
                fbAlert(
                    'fb_alert_import_corrupt',
                    { detail: err && err.message ? err.message : String(err) },
                    'Arquivo corrompido: ' + (err && err.message ? err.message : err)
                );
            }
        }
    };
    input.click();
};

/** Alinhado com admin-panel/backend/src/lib/templateTitleUnique.js */
function normalizeTemplateTitleBuilder(s) {
    return String(s ?? '')
        .trim()
        .replace(/\s+/g, ' ');
}

function templateTitleCompareKeyBuilder(s) {
    return normalizeTemplateTitleBuilder(s).toLowerCase();
}

/** @returns {{ id: string, title: string } | null} */
function templateTitleDuplicateInLocalDb(title, folderId, excludeId) {
    const key = templateTitleCompareKeyBuilder(title);
    if (!key) return null;
    const fid =
        folderId === null || folderId === undefined || folderId === '' ? null : String(folderId);
    const db = parseLocalChecklistsDb();
    for (const eid of Object.keys(db)) {
        if (excludeId && eid === excludeId) continue;
        const entry = db[eid];
        if (!entry || entry.title == null) continue;
        const ef =
            entry.folderId === null || entry.folderId === undefined || entry.folderId === ''
                ? null
                : String(entry.folderId);
        if (ef !== fid) continue;
        if (templateTitleCompareKeyBuilder(entry.title) === key) return { id: eid, title: entry.title };
    }
    return null;
}

/** `metadata` do modelo: ícone + biblioteca (quando não é Ionicons). */
function buildChecklistTemplateMetadata() {
    const icon = String(currentFormIcon || '').trim();
    const meta = { icon: icon || '' };
    if (icon) {
        const lib = String(currentFormIconLibrary || 'Ionicons').trim() || 'Ionicons';
        if (lib !== 'Ionicons') meta.iconLibrary = lib;
    }
    return meta;
}

window.saveChecklist = async function() {
    const btn = document.getElementById('fb-save-schema-btn');
    if (!btn) {
        console.error('[checklists-builder] Botão #fb-save-schema-btn não encontrado.');
        return;
    }
    const setSync = function (mode) {
        try {
            if (typeof window.setFbSyncStatus === 'function') window.setFbSyncStatus(mode);
        } catch (e) {
            /* ignore */
        }
    };
    ensureBuilderCanvasEl();
    const oldText = btn.innerHTML;
    const fbSaving = window.fbT ? window.fbT('fb_save_saving') : 'Salvando…';
    btn.innerHTML =
        '<ion-icon name="hourglass-outline" style="vertical-align:-2px"></ion-icon> <span>' +
        fbSaving +
        '</span>';
    btn.disabled = true;
    setSync('saving');

    flushQuillToBoundField();
    window.readAppSectionNavFromRadios && window.readAppSectionNavFromRadios();
    fields = ensureSchemaInstructionFlags(fields);
    ensureCanvasSchemaHasSection();
    /** Alinha `fields` ao DOM antes do snapshot (Sortable move o DOM no fim do arrasto). */
    rebuildFieldsOrderFromCanvas();

    currentFormTitle = document.getElementById('tpl-title').value;
    currentFormDesc = document.getElementById('tpl-desc').value;
    currentFormIcon = document.getElementById('tpl-icon').value;
    const tplLibEl = document.getElementById('tpl-icon-library');
    if (tplLibEl && String(tplLibEl.value || '').trim()) {
        currentFormIconLibrary = String(tplLibEl.value).trim();
    } else if (!String(currentFormIcon || '').trim()) {
        currentFormIconLibrary = 'Ionicons';
    }

    try {
        if(!currentFormId || currentFormId === 'temp_new') {
            if (isGenericDefaultFormTitle(currentFormTitle)) {
                currentFormTitle = 'FSM ' + new Date().toLocaleString();
            }
            currentFormId = 'chk_' + Date.now().toString(36);
        }

        if (!normalizeTemplateTitleBuilder(currentFormTitle)) {
            fbAlert('fb_val_empty_title', null, 'O título do formulário não pode estar vazio.');
            setSync('idle');
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        const lightVal = validateChecklistLightBeforeSave();
        if (lightVal && lightVal.length) {
            alert(lightVal.join('\n'));
            setSync('idle');
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        const dupLocal = templateTitleDuplicateInLocalDb(
            currentFormTitle,
            currentFormFolderId ?? null,
            currentFormId
        );
        if (dupLocal) {
            fbAlert(
                'fb_alert_dup_title_folder',
                null,
                'Já existe um formulário com este nome nesta pasta (catálogo local). Escolha outro título ou pasta.'
            );
            setSync('idle');
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        const transitSaveErr = transitDisplacementSchemaErrorMessage(fields);
        if (transitSaveErr) {
            alert(transitSaveErr);
            setSync('idle');
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        // Snapshot serializável (evita referências compartilhadas e garante helpHtml no JSON)
        const schemaSnapshot = JSON.parse(JSON.stringify(fields));
        
        // 1. BACKUP OFFLINE-FIRST SEMPRE FUNCIONA (GARANTIDO)
        const db = parseLocalChecklistsDb();
        db[currentFormId] = {
            id: currentFormId,
            title: currentFormTitle,
            description: currentFormDesc,
            settings: globalFormSettings,
            metadata: buildChecklistTemplateMetadata(),
            schema: schemaSnapshot,
            folderId: currentFormFolderId ?? null,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem('brspark_checklists_db', JSON.stringify(db));

        if (typeof window.syncBuilderPersistBaseline === 'function') window.syncBuilderPersistBaseline();
        setSync('local');
        const fbLocalOk = window.fbT ? window.fbT('fb_save_local_ok') : 'Guardado localmente';
        btn.innerHTML =
            '<ion-icon name="checkmark-circle-outline" style="vertical-align:-2px"></ion-icon> <span>' +
            fbLocalOk +
            '</span>';
        // NÃO chamar loadSavedFormsList aqui: ele faz GET e substitui o localStorage pela nuvem
        // ANTES do POST terminar → apagava instruções/helpHtml recém gravados.
        if (window.renderFormsGridFromLocal) window.renderFormsGridFromLocal(db);
        
        // 2. Enviar para API; só depois sincronizar lista com GET (dados já persistidos)
        try {
            const payload = {
                id: currentFormId,
                title: currentFormTitle,
                description: currentFormDesc,
                metadata: buildChecklistTemplateMetadata(),
                settings: globalFormSettings,
                schemaData: schemaSnapshot,
                folderId: currentFormFolderId ?? null
            };
            const res = await fetch(`${brsparkApiBase()}/checklists/templates`, {
                method: 'POST',
                headers: adminJsonHeaders(),
                body: JSON.stringify(payload),
            });
            const raw = await res.text();
            if (res.ok) {
                const fbCloudOk = window.fbT ? window.fbT('fb_save_cloud_ok') : 'Na nuvem e na app';
                btn.innerHTML =
                    '<ion-icon name="cloud-done-outline" style="vertical-align:-2px"></ion-icon> <span>' +
                    fbCloudOk +
                    '</span>';
                try {
                    const saved = JSON.parse(raw);
                    if (saved && saved.id) {
                        const dbLocal = parseLocalChecklistsDb();
                        const apiSch = Array.isArray(saved.schemaData) ? saved.schemaData : [];
                        const mergedSch = mergeSchemaKeepRichHelp(schemaSnapshot, apiSch);
                        dbLocal[saved.id] = {
                            id: saved.id,
                            title: saved.title,
                            description: saved.description || '',
                            settings: saved.settings || {},
                            metadata: saved.metadata || {},
                            schema: mergedSch.length ? mergedSch : schemaSnapshot,
                            folderId: saved.folderId ?? currentFormFolderId ?? null,
                            updatedAt: saved.updatedAt || new Date().toISOString(),
                        };
                        localStorage.setItem('brspark_checklists_db', JSON.stringify(dbLocal));
                        if (window.renderFormsGridFromLocal) window.renderFormsGridFromLocal(dbLocal);
                    }
                } catch (mergeErr) {
                    console.warn('[saveChecklist] merge resposta API', mergeErr);
                }
                if (window.loadSavedFormsList) await window.loadSavedFormsList();
                setSync('cloud');
            } else {
                let msg = raw;
                try {
                    const j = JSON.parse(raw);
                    msg = j.error || raw;
                } catch (_) {}
                console.warn('[saveChecklist] API recusou:', res.status, msg);
                setSync('error');
                if (res.status === 409) {
                    alert(
                        String(
                            msg ||
                                fbStr(
                                    'fb_alert_dup_title_api',
                                    null,
                                    'Já existe um formulário activo com este nome nesta pasta.'
                                )
                        )
                    );
                } else {
                    fbAlert(
                        'fb_alert_api_save_fail',
                        {
                            status: String(res.status),
                            detail: String(msg || 'erro desconhecido'),
                        },
                        'Guardado só neste navegador. A API não gravou (' +
                            res.status +
                            '): ' +
                            (msg || 'erro desconhecido') +
                            '\n\nConfirme que o backend está no ar e que o URL da API está correcto.'
                    );
                }
            }
        } catch (apiError) {
            console.warn('Salvamento na API falhou (rede). Rascunho está no navegador.', apiError);
            setSync('error');
            fbAlert(
                'fb_alert_api_network',
                { detail: apiError && apiError.message ? apiError.message : '' },
                'Não foi possível contactar a API. O formulário ficou guardado só neste navegador.\n\n' +
                    (apiError && apiError.message ? apiError.message : '')
            );
        }

        setTimeout(function () {
            btn.innerHTML = oldText;
            btn.disabled = false;
            setSync('idle');
        }, 2200);
    } catch (err) {
        console.error('Falha fatal ao salvar form:', err);
        setSync('error');
        fbAlert(
            'fb_alert_save_fatal',
            { detail: err && err.message ? err.message : String(err) },
            'Erro ao salvar: ' + (err && err.message ? err.message : err)
        );
        btn.innerHTML = oldText;
        btn.disabled = false;
        setSync('idle');
    }
};

// Global: jsPDF Fallback Generator
window.previewPDF = function() {
    if (fields.length === 0) {
        fbAlert('fb_alert_pdf_needs_fields', null, 'Adicione perguntas antes de gerar o PDF.');
        return;
    }

    const jspdfRoot = typeof window !== 'undefined' ? window.jspdf : undefined;
    const JsPdfCtor = jspdfRoot && typeof jspdfRoot.jsPDF === 'function' ? jspdfRoot.jsPDF : null;
    if (!JsPdfCtor) {
        fbAlert(
            'fb_alert_jspdf_missing',
            null,
            'A biblioteca jsPDF não carregou (rede ou CDN). Não é possível gerar o PDF de pré-visualização — recarregue a página ou confira o script em checklists.html.',
        );
        return;
    }

    const doc = new JsPdfCtor();
    
    // Cabeçalho
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // zinc-800
    doc.text("Guia de Operação - Rascunho BrSpark", 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // zinc-500
    doc.text("Documento gerado dinamicamente no Browser do Gestor (Frontend jsPDF)", 20, 28);
    doc.line(20, 32, 190, 32); 
    
    doc.setTextColor(0);
    let currentY = 45;
    
    fields.forEach((f, idx) => {
         // Quebra de pagina preventiva
         if(currentY > 260) {
             doc.addPage();
             currentY = 20;
         }
         
         // Base Text
         doc.setFontSize(12);
         doc.setFont("helvetica", "bold");
         doc.text(`${idx + 1}. [${f.type.toUpperCase()}] ${f.label} ${f.required ? '(*)' : ''}`, 20, currentY);
         
         // Injeta sinal de Condicional em vermelho
         if(f.dependsOnId) {
             doc.setFontSize(9);
             doc.setFont("helvetica", "italic");
             doc.setTextColor(217, 119, 6); // Amber Alert
             doc.text(`> Só será impresso se o campo (${f.dependsOnId}) for respondido como "${f.dependsOnValue}".`, 20, currentY + 6);
             doc.setTextColor(0);
             currentY += 8;
         } else {
             currentY += 2;
         }
         
         // Logica de Campo do Laudo (caixa, linha...)
         if(f.type === 'photo') {
             // Caixote Gigante simulando a Foto Anexada do S3
             doc.setDrawColor(203, 213, 225);
             doc.rect(20, currentY + 4, 80, 50);
             doc.setFontSize(8);
             doc.text("[ Placeholder onde a imagem do S3 é impressa no Backend Node.js ]", 25, currentY + 30);
             currentY += 60;
         }
         else if(f.type === 'vision_checklist' || f.type === 'vision_ai_analysis') {
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.setTextColor(3, 105, 161);
             doc.text('Mídia + respostas sim/não com confiança (ver execução / relatório completo).', 20, currentY + 10);
             doc.setTextColor(0);
             currentY += 22;
         }
         else if(f.type === 'image_annotation') {
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.setTextColor(154, 52, 18);
             doc.text('Foto com anotações (JSON no relatório).', 20, currentY + 10);
             doc.setTextColor(0);
             currentY += 18;
         }
         else if(f.type === 'lookup_select') {
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.setTextColor(37, 99, 235);
             doc.text('Lista dinâmica (valor selecionado no relatório).', 20, currentY + 10);
             doc.setTextColor(0);
             currentY += 18;
         }
         else if(f.type === 'repeatable_matrix') {
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.setTextColor(22, 101, 52);
             doc.text('Matriz repetível (tabela no relatório).', 20, currentY + 10);
             doc.setTextColor(0);
             currentY += 18;
         }
         else if(f.type === 'opinion_scale') {
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.setTextColor(91, 33, 182);
             doc.text('Escala NPS ou Likert (valor numérico no relatório).', 20, currentY + 10);
             doc.setTextColor(0);
             currentY += 18;
         }
         else if(f.type === 'signature' || f.type === 'signature_summary') {
             // Linha de Assinatura com SVG futuro
             doc.setDrawColor(0);
             doc.line(20, currentY + 20, 120, currentY + 20);
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.text(
                 f.type === 'signature_summary'
                     ? 'Resumo + assinatura (ver app / PDF completo)'
                     : 'Assinatura do Técnico / Cliente Responsável',
                 20,
                 currentY + 26,
             );
             currentY += 40;
         } 
         else if(f.type === 'checkbox') {
             doc.rect(20, currentY + 6, 4, 4); doc.text("Sim", 28, currentY + 10);
             doc.rect(40, currentY + 6, 4, 4); doc.text("Não", 48, currentY + 10);
             currentY += 20;
         }
         else if(f.type === 'location_pick') {
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.setTextColor(3, 105, 161);
             doc.text("GPS do dispositivo + posição do alfinete no mapa (JSON no relatório).", 20, currentY + 8);
             doc.setTextColor(0);
             currentY += 18;
         }
         else {
             /** default line (texto/numero) */
             doc.setDrawColor(203, 213, 225);
             doc.line(20, currentY + 10, 190, currentY + 10);
             currentY += 20;
         }
    });
    
    // Rodape
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Nota: O Sistema final de PDF em Nuvem da BrSpark também compila a geolocalização exata.", 20, 285);
    
    // Download Trigger
    doc.save("roteiro_rascunho_brspark.pdf");
};

// --- MULTI-FORM HYBRID STORAGE MANAGEMENT + PASTAS (Finder no admin) --- //

window._formsDbCache = {};

async function refreshTemplateFolders() {
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/template-folders`);
        if (res.ok) {
            builderFolders = await res.json();
            try {
                localStorage.setItem('brspark_checklist_folders', JSON.stringify(builderFolders));
            } catch (e) { /* ignore */ }
        }
    } catch (e) {
        console.warn('[folders] API indisponível, a usar cache local', e);
        try {
            const raw = localStorage.getItem('brspark_checklist_folders');
            if (raw) builderFolders = JSON.parse(raw);
        } catch (e2) { /* ignore */ }
    }
}

function folderPathChain(folderId) {
    const byId = new Map(builderFolders.map((f) => [f.id, f]));
    const chain = [];
    let cur = folderId;
    const guard = new Set();
    while (cur && !guard.has(cur)) {
        guard.add(cur);
        const f = byId.get(cur);
        if (!f) break;
        chain.unshift(f);
        cur = f.parentId;
    }
    return chain;
}

function renderFolderTreeSidebar() {
    const container = document.getElementById('forms-folder-tree');
    if (!container) return;
    container.innerHTML = '';

    const mkBtn = (label, isActive, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText =
            'width:100%;text-align:left;padding:8px 10px;margin-bottom:4px;border-radius:8px;border:1px solid #e2e8f0;background:' +
            (isActive ? '#e0f2fe' : '#fff') +
            ';cursor:pointer;font-size:13px;color:#0f172a;';
        b.onmouseover = () => {
            if (!isActive) b.style.background = '#f8fafc';
        };
        b.onmouseout = () => {
            b.style.background = isActive ? '#e0f2fe' : '#fff';
        };
        b.onclick = onClick;
        return b;
    };

    container.appendChild(
        mkBtn('📂 Início (raiz)', builderBrowseFolderId === null, () => {
            builderBrowseFolderId = null;
            window.renderFormsGridFromLocal(window._formsDbCache || {});
        })
    );

    const childrenOf = (parentKey) =>
        builderFolders
            .filter((f) => (f.parentId || null) === parentKey)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));

    const walk = (parentKey, depth) => {
        for (const f of childrenOf(parentKey)) {
            const indent = '\u00A0\u00A0'.repeat(depth);
            container.appendChild(
                mkBtn(`${indent}📁 ${f.name}`, builderBrowseFolderId === f.id, () => {
                    builderBrowseFolderId = f.id;
                    window.renderFormsGridFromLocal(window._formsDbCache || {});
                })
            );
            walk(f.id, depth + 1);
        }
    };
    walk(null, 0);
}

function renderFolderBreadcrumb() {
    const el = document.getElementById('forms-folder-breadcrumb');
    if (!el) return;
    const parts = [];
    parts.push(
        `<a href="#" style="color:#2563eb;text-decoration:none;font-weight:600;" onclick="event.preventDefault();window.enterBrowseFolder(null);return false;">Início</a>`
    );
    const chain = folderPathChain(builderBrowseFolderId);
    chain.forEach((f, i) => {
        parts.push('<span style="color:#94a3b8"> / </span>');
        const isLast = i === chain.length - 1;
        if (isLast) {
            parts.push(`<span style="font-weight:600;color:#0f172a;">${escapeHtml(f.name)}</span>`);
        } else {
            parts.push(
                `<a href="#" style="color:#2563eb;text-decoration:none;" onclick="event.preventDefault();window.enterBrowseFolder('${escapeHtmlAttr(f.id)}');return false;">${escapeHtml(f.name)}</a>`
            );
        }
    });
    el.innerHTML = parts.join('');
}

window.enterBrowseFolder = function (id) {
    builderBrowseFolderId = id || null;
    window.renderFormsGridFromLocal(window._formsDbCache || {});
};

/** Modal próprio: window.prompt() costuma falhar ou ser suprimido dentro de overlays / alguns browsers. */
window.openNewFolderModal = function () {
    const m = document.getElementById('new-folder-modal');
    const inp = document.getElementById('new-folder-name-input');
    if (!m || !inp) {
        fbAlert('fb_alert_folder_ui', null, 'Recarregue a página (interface «Nova pasta» não carregou).');
        return;
    }
    inp.value = '';
    m.style.display = 'flex';
    const onKey = function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            window.submitNewTemplateFolder();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            window.cancelNewFolderModal();
        }
    };
    if (inp._nfKeyHandler) {
        inp.removeEventListener('keydown', inp._nfKeyHandler);
    }
    inp._nfKeyHandler = onKey;
    inp.addEventListener('keydown', onKey);
    setTimeout(function () {
        inp.focus();
    }, 50);
};

window.cancelNewFolderModal = function () {
    const m = document.getElementById('new-folder-modal');
    const inp = document.getElementById('new-folder-name-input');
    if (m) m.style.display = 'none';
    if (inp && inp._nfKeyHandler) {
        inp.removeEventListener('keydown', inp._nfKeyHandler);
        inp._nfKeyHandler = null;
    }
};

window.submitNewTemplateFolder = async function () {
    const inp = document.getElementById('new-folder-name-input');
    const name = inp && inp.value ? String(inp.value).trim() : '';
    if (!name) {
        fbAlert('fb_alert_folder_name', null, 'Indique um nome para a pasta.');
        if (inp) inp.focus();
        return;
    }
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/template-folders`, {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: JSON.stringify({ name, parentId: builderBrowseFolderId }),
        });
        const raw = await res.text();
        if (!res.ok) {
            let msg = raw;
            try {
                msg = JSON.parse(raw).error || raw;
            } catch (_) {}
            fbAlert('fb_alert_folder_create_fail', { detail: String(msg) }, 'Não foi possível criar a pasta: ' + msg);
            return;
        }
        window.cancelNewFolderModal();
        await refreshTemplateFolders();
        window.renderFormsGridFromLocal(window._formsDbCache || {});
    } catch (e) {
        fbAlert(
            'fb_alert_folder_create_net',
            null,
            'Erro de rede ao criar pasta. Abra o Form Builder pela URL do servidor Node (ex.: http://localhost:3001/checklists.html), não pelo Live Server.'
        );
        console.warn(e);
    }
};

window.promptCreateTemplateFolder = function () {
    window.openNewFolderModal();
};

window.promptRenameTemplateFolder = async function (folderId) {
    const f = builderFolders.find((x) => x.id === folderId);
    if (!f) return;
    const name = prompt('Novo nome da pasta:', f.name);
    if (!name || !String(name).trim()) return;
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/template-folders/${encodeURIComponent(folderId)}`, {
            method: 'PATCH',
            headers: adminJsonHeaders(),
            body: JSON.stringify({ name: String(name).trim() }),
        });
        const raw = await res.text();
        if (!res.ok) {
            let msg = raw;
            try {
                msg = JSON.parse(raw).error || raw;
            } catch (_) {}
            fbAlert('fb_alert_folder_rename_fail', { detail: String(msg) }, 'Não foi possível renomear: ' + msg);
            return;
        }
        await refreshTemplateFolders();
        window.renderFormsGridFromLocal(window._formsDbCache || {});
    } catch (e) {
        fbAlert('fb_alert_folder_rename_net', null, 'Erro de rede ao renomear.');
        console.warn(e);
    }
};

window.promptDeleteTemplateFolder = async function (folderId) {
    const f = builderFolders.find((x) => x.id === folderId);
    if (!f) return;
    if (!confirm(`Excluir a pasta "${f.name}" e todas as subpastas? Os formulários ficam na raiz (sem pasta).`)) return;
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/template-folders/${encodeURIComponent(folderId)}`, {
            method: 'DELETE',
            headers: adminJsonHeaders(),
        });
        if (!res.ok) {
            const raw = await res.text();
            fbAlert(
                'fb_alert_folder_delete_fail',
                { detail: String(raw) },
                'Não foi possível eliminar: ' + raw
            );
            return;
        }
        if (builderBrowseFolderId === folderId) {
            builderBrowseFolderId = f.parentId || null;
        }
        await refreshTemplateFolders();
        await window.loadSavedFormsList();
    } catch (e) {
        fbAlert('fb_alert_folder_delete_net', null, 'Erro de rede ao eliminar pasta.');
        console.warn(e);
    }
};

window.createNewChecklistInBrowseFolder = function () {
    document.getElementById('forms-list-modal').style.display = 'none';
    window.__newFormFolderId = builderBrowseFolderId;
    window.createNewChecklist(true);
};

function buildMoveFolderOptionsHtml(currentFolderId) {
    const byId = new Map(builderFolders.map((x) => [x.id, x]));
    const depthOf = (id) => {
        let d = 0;
        let cur = id;
        const g = new Set();
        while (cur && !g.has(cur)) {
            g.add(cur);
            d++;
            const row = byId.get(cur);
            if (!row) break;
            cur = row.parentId;
            if (d > 64) break;
        }
        return d;
    };
    const sorted = [...builderFolders].sort(
        (a, b) => depthOf(a.id) - depthOf(b.id) || String(a.name).localeCompare(String(b.name))
    );
    let html = `<option value="" ${!currentFolderId ? 'selected' : ''}>Raiz</option>`;
    for (const fo of sorted) {
        const depth = depthOf(fo.id) - 1;
        const pad = '\u2014 '.repeat(Math.max(0, depth));
        const sel = currentFolderId === fo.id ? ' selected' : '';
        html += `<option value="${escapeHtmlAttr(fo.id)}"${sel}>${escapeHtml(pad + fo.name)}</option>`;
    }
    return html;
}

window.onMoveFormFolderChange = async function (formId, selectEl) {
    const v = selectEl.value;
    const folderId = v === '' ? null : v;
    let prevSelectVal = '';
    try {
        const dbPrev = parseLocalChecklistsDb();
        const pf = dbPrev[formId] ? dbPrev[formId].folderId : null;
        prevSelectVal = pf === null || pf === undefined || pf === '' ? '' : String(pf);
    } catch (_) {}
    try {
        const res = await fetch(
            `${brsparkApiBase()}/checklists/templates/${encodeURIComponent(formId)}/folder`,
            {
                method: 'PATCH',
                headers: adminJsonHeaders(),
                body: JSON.stringify({ folderId }),
            }
        );
        const raw = await res.text();
        if (!res.ok) {
            let msg = raw;
            try {
                msg = JSON.parse(raw).error || raw;
            } catch (_) {}
            const prefix = res.status === 409 ? '' : 'Não foi possível mover: ';
            fbAlert(
                'fb_alert_folder_move_fail',
                { detail: prefix + String(msg) },
                prefix + msg
            );
            selectEl.value = prevSelectVal;
            return;
        }
        const db = parseLocalChecklistsDb();
        if (db[formId]) {
            db[formId].folderId = folderId;
            localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
        }
        window._formsDbCache = db;
        window.renderFormsGridFromLocal(db);
    } catch (e) {
        fbAlert('fb_alert_folder_move_net', null, 'Erro de rede ao mover formulário.');
        console.warn(e);
    }
};

window.openFormsModal = function () {
    builderBrowseFolderId = null;
    window.loadSavedFormsList();
    document.getElementById('forms-list-modal').style.display = 'flex';
};

window.filterFormsList = function () {
    const inp = document.getElementById('form-search');
    const q = (inp && inp.value ? inp.value : '').toLowerCase();
    const cards = document.querySelectorAll('#forms-grid .form-card-item, #forms-grid .folder-browser-item');
    cards.forEach((card) => {
        const title = (card.getAttribute('data-title') || '').toLowerCase();
        if (title.includes(q)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
};

window.duplicateChecklist = async function(id) {
    const db = parseLocalChecklistsDb();
    const form = db[id];
    if(!form) return;
    
    // Create deep copy
    const newForm = JSON.parse(JSON.stringify(form));
    newForm.id = 'chk_' + Date.now().toString(36) + Math.random().toString(36).substring(2,5);
    newForm.title = newForm.title + ' (Cópia)';
    newForm.updatedAt = new Date().toISOString();
    if (newForm.folderId === undefined) newForm.folderId = form.folderId ?? null;
    
    // Save to local DB first
    db[newForm.id] = newForm;
    localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
    
    // Synchronize with backend API immediately
    try {
        const payload = {
            id: newForm.id,
            title: newForm.title,
            description: newForm.description,
            metadata: newForm.metadata,
            settings: newForm.settings,
            schemaData: newForm.schema,
            folderId: newForm.folderId ?? null
        };
        const token = sessionStorage.getItem('brspark_admin_token') || '';
        const res = await fetch(`${brsparkApiBase()}/checklists/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const raw = await res.text();
        if (!res.ok) {
            const db2 = parseLocalChecklistsDb();
            delete db2[newForm.id];
            localStorage.setItem('brspark_checklists_db', JSON.stringify(db2));
            let msg = raw;
            try {
                msg = JSON.parse(raw).error || raw;
            } catch (_) {}
            if (res.status === 409) {
                alert(
                    String(
                        msg ||
                            fbStr(
                                'fb_alert_dup_title_api',
                                null,
                                'Já existe um formulário activo com este nome nesta pasta.'
                            )
                    )
                );
            } else {
                fbAlert(
                    'fb_alert_clone_fail_api',
                    { detail: String(msg || res.status) },
                    'Não foi possível clonar na API: ' + (msg || res.status)
                );
            }
            window.renderFormsGridFromLocal(db2);
            return;
        }
    } catch(e) {
        console.warn('Erro ao clonar formulário na API', e);
        const db2 = parseLocalChecklistsDb();
        delete db2[newForm.id];
        localStorage.setItem('brspark_checklists_db', JSON.stringify(db2));
        fbAlert('fb_alert_clone_net', null, 'Erro de rede ao clonar. A cópia local foi anulada.');
        window.renderFormsGridFromLocal(db2);
        return;
    }
    
    fbAlert('fb_alert_clone_ok', { title: String(form.title) }, "Formulário '" + form.title + "' clonado com sucesso.");
    window.renderFormsGridFromLocal(parseLocalChecklistsDb());
};

window.deleteChecklist = function(id) {
    const modal = document.getElementById('custom-confirm-modal');
    const btnYes = document.getElementById('custom-confirm-yes');
    const btnNo = document.getElementById('custom-confirm-cancel');
    
    if(!modal) {
        console.error('Custom delete modal not found in HTML!');
        return;
    }
    
    modal.style.display = 'flex';
    
    btnNo.onclick = () => { modal.style.display = 'none'; };
    btnYes.onclick = async () => {
        modal.style.display = 'none';
        
        try {
            const token = sessionStorage.getItem('brspark_admin_token') || '';
            await fetch(`${brsparkApiBase()}/checklists/templates/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch(e) {
            console.warn('Erro ao deletar na API.', e);
        }
        
        // Always remove locally regardless of API response
        const db = parseLocalChecklistsDb();
        delete db[id];
        localStorage.setItem('brspark_checklists_db', JSON.stringify(db));

        if(currentFormId === id) window.createNewChecklist();
        
        // Render from memory directly, don't trigger a new fetch right away
        renderFormsGridFromLocal(db);
    };
};

window.selectFormFromModal = function(id) {
    document.getElementById('forms-list-modal').style.display = 'none';
    window.loadChecklist(id);
};

window.loadSavedFormsList = async function () {
    const prev = parseLocalChecklistsDb();
    await refreshTemplateFolders();
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/templates`);
        if (res.ok) {
            const apiForms = await res.json();
            const db = { ...prev };
            apiForms.forEach((form) => {
                const prevEntry = prev[form.id];
                let schema = form.schemaData;
                if (prevEntry && Array.isArray(prevEntry.schema) && Array.isArray(schema)) {
                    schema = mergeSchemaKeepRichHelp(prevEntry.schema, schema);
                }
                db[form.id] = {
                    id: form.id,
                    title: form.title,
                    description: form.description || '',
                    settings: form.settings,
                    schema: ensureSchemaInstructionFlags(schema),
                    metadata: form.metadata,
                    folderId: form.folderId ?? null,
                    updatedAt: form.updatedAt,
                };
            });
            localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
        }
    } catch (e) {
        console.warn('Sem conexão com API Node.js. Carregando formulários locais do Cache...', e);
    }

    const db = parseLocalChecklistsDb();
    window.renderFormsGridFromLocal(db);
};

window.renderFormsGridFromLocal = function (db) {
    const grid = document.getElementById('forms-grid');
    if (!grid) return;

    window._formsDbCache = db || {};
    renderFolderTreeSidebar();
    renderFolderBreadcrumb();

    const browseKey = builderBrowseFolderId || null;
    const subfolders = builderFolders
        .filter((f) => (f.parentId || null) === browseKey)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));

    const sortedForms = Object.values(db)
        .filter((form) => (form.folderId || null) === browseKey)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    grid.innerHTML = '';

    subfolders.forEach((folder) => {
        const fid = escapeHtmlAttr(folder.id);
        const fname = escapeHtml(folder.name);
        grid.innerHTML += `
            <div class="folder-browser-item" data-title="${escapeHtmlAttr(folder.name)}" style="min-width:0;max-width:100%;display:flex; align-items:stretch; gap:0; border-radius:12px; overflow:hidden; border:1px solid #c4b5fd; background:linear-gradient(135deg,#faf5ff 0%,#fff 100%); transition:border-color 0.2s;"
                 onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='#c4b5fd'">
               <div onclick="window.enterBrowseFolder('${fid}')"
                    style="flex:1; min-width:0; padding:16px; cursor:pointer; display:flex; align-items:center; gap:12px; border:none; background:transparent;">
                  <div style="width:48px; height:48px; border-radius:12px; background:#ede9fe; display:flex; justify-content:center; align-items:center; font-size:26px; flex-shrink:0">📁</div>
                  <div style="flex:1; min-width:0;">
                     <h4 style="margin:0; font-size:15px; color:#4c1d95; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word;">${fname}</h4>
                     <p style="margin:4px 0 0 0; font-size:12px; color:#7c3aed; font-weight:600;">Pasta</p>
                  </div>
               </div>
               <button type="button"
                  onclick="event.stopPropagation(); window.promptRenameTemplateFolder('${fid}')"
                  style="background:#f5f3ff; border:none; border-left:1px solid #ddd6fe; width:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#6d28d9; font-size:18px; flex-shrink:0;"
                  title="Renomear pasta">
                  <ion-icon name="create-outline"></ion-icon>
               </button>
               <button type="button"
                  onclick="event.stopPropagation(); window.promptDeleteTemplateFolder('${fid}')"
                  style="background:#fff0f0; border:none; border-left:1px solid #fee2e2; width:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#ef4444; font-size:20px; flex-shrink:0;"
                  title="Excluir pasta">
                  <ion-icon name="trash-outline"></ion-icon>
               </button>
            </div>
        `;
    });

    sortedForms.forEach((form) => {
        const count = (form.schema || []).length;
        const iconHtml = form.metadata?.icon
            ? typeof window.renderWebIcon === 'function'
                ? window.renderWebIcon(
                      form.metadata.iconLibrary || 'Ionicons',
                      form.metadata.icon,
                      '#64748b',
                      26,
                      true
                  )
                : `<ion-icon name="${escapeHtmlAttr(form.metadata.icon)}"></ion-icon>`
            : '📋';
        const fid = escapeHtmlAttr(form.id);
        const ftitle = escapeHtml(form.title);
        const moveSelectId = 'move-folder-' + form.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const moveOpts = buildMoveFolderOptionsHtml(form.folderId || null);
        grid.innerHTML += `
            <div class="form-card-item" data-title="${escapeHtmlAttr(form.title)}" style="min-width:0;max-width:100%;display:flex; flex-direction:column; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0; background:#fff; transition:border-color 0.2s;"
                 onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#e2e8f0'">
               <div style="display:flex; align-items:stretch; flex:1; min-width:0;">
                 <div onclick="window.selectFormFromModal('${fid}')"
                      style="flex:1; min-width:0; padding:12px 12px 12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; border:none; background:transparent;">
                    <div style="width:48px; height:48px; border-radius:12px; background:#f1f5f9; display:flex; justify-content:center; align-items:center; font-size:24px; color:#64748b; flex-shrink:0">
                       ${iconHtml}
                    </div>
                    <div style="flex:1; min-width:0;">
                       <h4 style="margin:0; font-size:15px; color:#1e293b; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word;">${ftitle}</h4>
                       <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8; font-weight:600;">${count} campos</p>
                    </div>
                 </div>
                 <button type="button"
                    onclick="event.stopPropagation(); window.duplicateChecklist('${fid}')"
                    style="background:#f0fdf4; border:none; border-left:1px solid #dcfce3; width:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#22c55e; font-size:20px; flex-shrink:0; transition:background 0.15s;"
                    onmouseover="this.style.background='#dcfce3'" onmouseout="this.style.background='#f0fdf4'"
                    title="Duplicar formulário">
                    <ion-icon name="copy-outline"></ion-icon>
                 </button>
                 <button type="button"
                    onclick="event.stopPropagation(); window.deleteChecklist('${fid}')"
                    style="background:#fff0f0; border:none; border-left:1px solid #fee2e2; width:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#ef4444; font-size:20px; flex-shrink:0; transition:background 0.15s;"
                    onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff0f0'"
                    title="Excluir formulário">
                    <ion-icon name="trash-outline"></ion-icon>
                 </button>
               </div>
               <div style="padding:8px 12px 12px 12px; border-top:1px solid #f1f5f9; display:flex; align-items:center; gap:8px; font-size:12px; color:#64748b;">
                 <span style="white-space:nowrap;">Mover para</span>
                 <select id="${moveSelectId}" class="prop-input" style="flex:1; font-size:12px; padding:6px 8px; margin:0;"
                    onclick="event.stopPropagation();"
                    onchange="window.onMoveFormFolderChange('${fid}', this)">
                   ${moveOpts}
                 </select>
               </div>
            </div>
        `;
    });

    if (subfolders.length === 0 && sortedForms.length === 0) {
        const emptyMsg = fbStr(
            'fb_alert_forms_empty',
            null,
            'Nenhuma pasta nem formulário neste nível. Use «Nova pasta» ou «Novo formulário aqui».'
        );
        grid.innerHTML =
            '<p style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:32px;font-size:14px;">' +
            escapeHtml(emptyMsg) +
            '</p>';
    }

    if (window.filterFormsList) window.filterFormsList();
};

window.loadChecklist = function(id) {
    if(!id) {
        window.createNewChecklist();
        return;
    }
    flushQuillToBoundField();
    const db = parseLocalChecklistsDb();
    const form = db[id];
    if(form) {
        currentFormId = form.id;
        currentFormTitle = form.title;
        currentFormDesc = form.description || '';
        currentFormIcon = form.metadata?.icon || '';
        currentFormIconLibrary =
            String(form.metadata?.iconLibrary || '').trim() || 'Ionicons';
        currentFormFolderId = form.folderId ?? null;
        globalFormSettings = Object.assign(
            {
                requireGlobalGeofence: false,
                globalGeofenceRadius: 200,
                rules: [],
                appFillMode: 'full',
                appSectionStart: 'direct',
                appHubSectionOrder: 'free',
                expectedFormDurationMinutes: undefined,
            },
            form.settings || {}
        );
        if (!globalFormSettings.rules) globalFormSettings.rules = [];
        globalFormSettings.appFillMode = normalizeAppFillMode(globalFormSettings.appFillMode);
        globalFormSettings.appSectionStart = normalizeAppSectionStart(globalFormSettings.appSectionStart);
        globalFormSettings.appHubSectionOrder = normalizeAppHubSectionOrder(
            globalFormSettings.appHubSectionOrder
        );
        window.syncAppSectionNavRadios && window.syncAppSectionNavRadios();
        
        // Fix: Restore inputs correctly
        document.getElementById('tpl-title').value = currentFormTitle;
        document.getElementById('tpl-desc').value = currentFormDesc;
        syncBuilderTaskIconDom();
        fields = ensureSchemaInstructionFlags(JSON.parse(JSON.stringify(form.schema || [])));
        ensureCanvasSchemaHasSection();
        fixTransitDisplacementViolations(fields);
        selectedFieldId = null;
        renderCanvas();
        renderProperties();
        if (typeof window.syncBuilderPersistBaseline === 'function') window.syncBuilderPersistBaseline();
    }
};

window.createNewChecklist = function (fromBrowseFolder) {
    if (!fromBrowseFolder) {
        window.__newFormFolderId = undefined;
    }
    const modal = document.getElementById('new-checklist-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('new-form-name-input').value = fbStr('mdl_new_form_title', null, 'Novo formulário');
        setTimeout(() => document.getElementById('new-form-name-input').focus(), 100);
    }
};

window.confirmCreateNewChecklist = function () {
    const title =
        document.getElementById('new-form-name-input').value.trim() ||
        fbStr('mdl_new_form_title', null, 'Novo formulário');
    document.getElementById('new-checklist-modal').style.display = 'none';

    if (window.__newFormFolderId !== undefined) {
        currentFormFolderId = window.__newFormFolderId;
        window.__newFormFolderId = undefined;
    } else {
        currentFormFolderId = null;
    }

    flushQuillToBoundField();
    currentFormId = null;
    currentFormTitle = title;
    fields = [createDefaultSectionField([])];
    selectedFieldId = null;
    globalFormSettings = {
        requireGlobalGeofence: false,
        globalGeofenceRadius: 200,
        rules: [],
        appFillMode: 'full',
        appSectionStart: 'direct',
        appHubSectionOrder: 'free',
    };
    window.syncAppSectionNavRadios && window.syncAppSectionNavRadios();
    
    // Update the title input so saveChecklist reads the correct name
    document.getElementById('tpl-title').value = title;
    document.getElementById('tpl-desc').value = '';
    currentFormIcon = '';
    currentFormIconLibrary = 'Ionicons';
    const tiNew = document.getElementById('tpl-icon');
    if (tiNew) tiNew.value = '';
    const tlNew = document.getElementById('tpl-icon-library');
    if (tlNew) tlNew.value = 'Ionicons';
    syncBuilderTaskIconDom();

    renderCanvas();
    renderProperties();
    if (typeof window.syncBuilderPersistBaseline === 'function') window.syncBuilderPersistBaseline();

    const select = document.getElementById('saved-forms-select');
    if (select) {
        let tempOpt = select.querySelector('option[value="temp_new"]');
        if(!tempOpt) {
           tempOpt = document.createElement('option');
           tempOpt.value = 'temp_new';
           select.appendChild(tempOpt);
        }
        tempOpt.textContent = `📝 Rascunho: ${title}`;
        select.value = 'temp_new';
    }
    
    fbAlert(
        'fb_alert_new_panel',
        { title: String(title) },
        'Painel preparado para «' +
            title +
            '». Já existe uma primeira secção no canvas — arraste perguntas para dentro dela (ou adicione mais secções).'
    );
};

// --- MOBILE SIMULATOR RENDER LOGIC --- //
window.toggleMobilePreview = function() {
    const mod = document.getElementById('mobile-preview-overlay');
    if(!mod) return;
    if(mod.style.display === 'none') {
        mod.style.display = 'flex';
        window.__mobilePreviewFillSim = null;
        const tb = document.getElementById('mobile-preview-fill-toolbar');
        if (tb) tb.style.display = fields.length ? 'flex' : 'none';
        renderMobilePreview();
    } else {
        mod.style.display = 'none';
    }
};

/** Ícone do campo no simulador (paridade com o app: só ícone personalizado). */
function mobilePreviewFieldIconHtml(f) {
    if (!f) return '';
    const ic = String(f.icon || '').trim();
    if (!ic || typeof window.renderWebIcon !== 'function') return '';
    try {
        return window.renderWebIcon(
            f.iconLibrary || 'Ionicons',
            ic,
            f.iconColor || '#0F172A',
            24,
            true
        );
    } catch (e) {
        return '';
    }
}

/** Preview mobile do Form Builder: simulação DOM (ver aviso #mobile-preview-engine-notice em checklists.html). O motor real do app é RN em app/checklist/[id].tsx — não embutido aqui. */
function renderMobilePreview() {
    currentFormTitle = document.getElementById('tpl-title').value;
    currentFormDesc = document.getElementById('tpl-desc').value;
    currentFormIcon = document.getElementById('tpl-icon').value;
    const pvLib = document.getElementById('tpl-icon-library');
    if (pvLib && String(pvLib.value || '').trim()) {
        currentFormIconLibrary = String(pvLib.value).trim();
    }

    const titleEl = document.getElementById('mobile-preview-title');
    const contentEl = document.getElementById('mobile-preview-content');
    if(!titleEl || !contentEl) return;

    const rawFormIcon = String(currentFormIcon || '').trim();
    if (rawFormIcon) {
        const pvLibUse = String(currentFormIconLibrary || 'Ionicons').trim() || 'Ionicons';
        let glyph =
            '<ion-icon name="' +
            escapeHtmlAttr(rawFormIcon) +
            '" style="font-size:22px;flex-shrink:0;vertical-align:middle;"></ion-icon>';
        if (typeof window.renderWebIcon === 'function') {
            try {
                glyph = window.renderWebIcon(pvLibUse, rawFormIcon, lastIconPickerColor || '#1d4ed8', 22, true);
            } catch (ePv) {
                /* mantém ion-icon */
            }
        }
        titleEl.innerHTML =
            '<span style="display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%;">' +
            glyph +
            '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            escapeHtmlLogic(currentFormTitle || 'Preview mobile') +
            '</span></span>';
    } else {
        titleEl.textContent = currentFormTitle || 'Preview mobile';
    }
    
    if(fields.length === 0) {
        contentEl.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8; font-size:14px; margin-top:40px;">Arraste campos no lado esquerdo do seu PC para vê-los nascer instântaneamente aqui!</div>';
        const hh = document.getElementById('mobile-preview-fill-hint');
        if (hh) hh.textContent = '';
        return;
    }

    const mode = effectivePreviewFillMode();
    const hintElToolbar = document.getElementById('mobile-preview-fill-hint');
    if (hintElToolbar) {
        const derived = computeFillModeFromSchemaFields(fields);
        const sim = window.__mobilePreviewFillSim;
        hintElToolbar.textContent = sim
            ? 'Simulação: ' + (sim === 'wizard' ? 'Um-a-um' : sim === 'hybrid' ? 'Híbrido' : 'Lista')
            : 'Preview: ' + (derived === 'wizard' ? 'Um-a-um (global legado)' : derived === 'hybrid' ? 'Por seção (alguma em modo assistente)' : 'Lista / scroll');
    }

    const sectionPages = splitBuilderFieldsIntoSectionPages(fields);
    window.__mobilePreviewHybridPages = sectionPages;
    const answerable = fields.filter((f) => f.type !== 'section_break' && f.type !== 'hidden');
    window.__mobilePreviewWizardCount = answerable.length;

    let previewFields = fields;
    let modeBanner = '';

    if (mode === 'full') {
        previewFields = fields.filter((f) => f.type !== 'section_break');
        modeBanner = `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:10px 12px;font-size:11px;color:#1e40af;margin-bottom:8px;font-weight:700;">Lista completa — todos os campos numa só tela com scroll.</div>`;
    } else if (mode === 'wizard') {
        const n = answerable.length;
        let ix = Math.min(window.__mobilePreviewSimWizardIx || 0, Math.max(0, n - 1));
        window.__mobilePreviewSimWizardIx = ix;
        previewFields = n ? [answerable[ix]] : [];
        modeBanner = `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;font-size:11px;color:#92400e;margin-bottom:8px;line-height:1.45;">
            <b>Assistente:</b> campo ${n ? ix + 1 : 0} de ${n}
            <span style="display:inline-block;margin-left:8px;vertical-align:middle;">
            <button type="button" onclick="window.shiftMobilePreviewWizardIx(-1)" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid #d97706;background:#fff;">◀</button>
            <button type="button" onclick="window.shiftMobilePreviewWizardIx(1)" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid #d97706;background:#fff;margin-left:4px;">▶</button>
            </span></div>`;
    } else {
        const hy = sectionPages;
        let pix = Math.min(window.__mobilePreviewSimPage || 0, Math.max(0, hy.length - 1));
        window.__mobilePreviewSimPage = pix;
        const pg = hy[pix] || { fields: [], pageTitle: 'Etapa' };
        previewFields = pg.fields || [];
        modeBanner = `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 12px;font-size:11px;color:#166534;margin-bottom:8px;line-height:1.45;">
            <b>Híbrido:</b> "${pg.pageTitle || 'Etapa'}" — etapa ${hy.length ? pix + 1 : 0} de ${hy.length}
            <span style="display:inline-block;margin-left:8px;vertical-align:middle;">
            <button type="button" onclick="window.shiftMobilePreviewHybridPage(-1)" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid #166534;background:#fff;">◀</button>
            <button type="button" onclick="window.shiftMobilePreviewHybridPage(1)" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid #166534;background:#fff;margin-left:4px;">▶</button>
            </span></div>`;
    }

    let html = modeBanner;
    
    if(globalFormSettings.requireGlobalGeofence) {
        html += `<div style="background:#ecfdf5; border:1px solid #10b981; padding:12px; border-radius:12px; font-size:12px; color:#047857; margin-bottom:8px;">
        <b style="display:block; font-size:13px; margin-bottom:4px;">🔒 Cerca Eletrônica Global:</b> O App só abrirá esta tela se o técnico estiver a menos de ${globalFormSettings.globalGeofenceRadius} metros da coordenada GPS da Manutenção.</div>`;
    }
    
    previewFields.forEach((f, idx) => {
        const fi = fields
            .filter((x) => x.type !== 'section_break' && x.type !== 'leitura')
            .findIndex((x) => x.id === f.id);
        const num = f.type === 'leitura' ? null : fi >= 0 ? fi + 1 : idx + 1;
        let relatedRules = globalFormSettings.rules ? globalFormSettings.rules.filter(r => r.actions && r.actions.some(a => a.targetId === f.id)) : [];
        let isCond = relatedRules.length > 0;
        let wrapperStyle = `background:#ffffff; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column; gap:10px;`;
        if(isCond) wrapperStyle += ` border: 2px dashed #c084fc; opacity:0.9; `;

        let hasCustomIcon = !!(f.icon && String(f.icon).trim());
        const iconHtml = hasCustomIcon ? mobilePreviewFieldIconHtml(f) : '';
        if (hasCustomIcon && !iconHtml) hasCustomIcon = false;
        const iconCol = hasCustomIcon
            ? `<div style="width:44px;height:44px;flex-shrink:0;border-radius:10px;background:#F8FAFC;border:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center;margin-right:12px;margin-top:2px;">${iconHtml}</div>`
            : '';
        const labelText =
            hasCustomIcon || f.type === 'leitura'
                ? String(f.label || '')
                : `${num}. ${String(f.label || '')}`;
        const labelHtml = `<div style="font-size:15px;font-weight:800;color:#0F172A;line-height:1.3;">${escapeHtmlLogic(labelText)}${
            f.required && f.type !== 'leitura' ? '<span style="color:#EF4444"> *</span>' : ''
        }</div>`;
        let condBadge = isCond ? `<div style="font-size:10px; background:#f3e8ff; color:#7e22ce; font-weight:700; padding:4px 8px; border-radius:6px; align-self:flex-start;"><ion-icon name="color-wand-outline"></ion-icon> Ativado por ${relatedRules.length} Regra(s)</div>` : '';
        const helpPlain = (f.description || '').replace(/<[^>]+>/g, '').trim();
        const helpHtmlStr = f.helpHtml || '';
        const helpRich = helpHtmlStr.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        const helpHasImg = /<img\b[^>]*\bsrc\s*=\s*["'][^"']+["']/i.test(helpHtmlStr);
        const hasHelpContent = helpRich.length > 0 || helpPlain.length > 0 || helpHasImg;
        const showHelpInApp = f.type !== 'leitura' && f.showFieldInstructions !== false && hasHelpContent;
        const helpMock = showHelpInApp
          ? `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;margin-bottom:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:11px;font-weight:700;color:#1e40af;"><ion-icon name="document-text-outline" style="font-size:14px;"></ion-icon> Instruções</div>`
          : '';
        
        let inputMock = '';
        if(f.type === 'text') inputMock = `<input type="text" placeholder="Sua resposta..." disabled style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#0f172a;">`;
        if(f.type === 'email') inputMock = `<input type="email" placeholder="usuario@email.com" disabled style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#0f172a;">`;
        if(f.type === 'phone') inputMock = `<input type="tel" placeholder="(11) 99999-9999" disabled style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#0f172a;">`;
        if(f.type === 'number') inputMock = `<input type="number" placeholder="123" disabled style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#0f172a;">`;
        if(f.type === 'date') inputMock = `<input type="date" disabled style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#0f172a;">`;
        if(f.type === 'checkbox') inputMock = `<div style="display:flex; gap:12px;"><label style="background:#f1f5f9; padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600; color:#475569"><input type="radio" disabled checked> Sim</label><label style="background:#f1f5f9; padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600; color:#475569"><input type="radio" disabled> Não</label></div>`;
        if(f.type === 'yes_no') inputMock = `<div style="display:flex; gap:12px;"><label style="background:#f1f5f9; padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600; color:#475569"><input type="radio" disabled checked> Sim</label><label style="background:#f1f5f9; padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600; color:#475569"><input type="radio" disabled> Não</label></div>`;

        if(f.type === 'dropdown') inputMock = `<div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#475569; display:flex; justify-content:space-between; align-items:center;"><span>Selecione uma opção...</span><ion-icon name="chevron-down"></ion-icon></div>`;
        if(f.type === 'multiselect') inputMock = `<div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:15px; color:#475569; display:flex; justify-content:space-between; align-items:center;"><span>Selecione uma ou mais opções...</span><ion-icon name="chevron-down"></ion-icon></div>`;
        if(f.type === 'rating') inputMock = `<div style="display:flex; gap:8px; font-size:26px; color:#cbd5e1; justify-content:center"><ion-icon name="star"></ion-icon><ion-icon name="star"></ion-icon><ion-icon name="star"></ion-icon><ion-icon name="star-outline"></ion-icon><ion-icon name="star-outline"></ion-icon></div>`;
        if(f.type === 'calculated') inputMock = `<div style="background:#f5f3ff; border:1px solid #c4b5fd; border-radius:8px; padding:12px; font-size:14px; color:#7c3aed; font-family:monospace; text-align:right">R$ 0,00 [Cálculo Auto]</div>`;
        if(f.type === 'hidden') inputMock = `<div style="background:#f1f5f9; border:1px dashed #94a3b8; border-radius:8px; padding:12px; font-size:12px; color:#64748b; text-align:center;"><ion-icon name="eye-off"></ion-icon> Este campo ficará invisível no Celular</div>`;
        if (f.type === 'leitura') {
            const raw = String(f.contentHtml || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 280);
            inputMock = raw
                ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px;font-size:13px;color:#312e81;line-height:1.45;max-height:120px;overflow:hidden;">${escapeHtmlLogic(raw)}</div>`
                : `<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:12px;font-size:12px;color:#94a3b8;font-style:italic;">Configure o texto no painel à direita.</div>`;
        }
        if (f.type === 'voice_note') {
            inputMock = `<div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;">
              <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#5b21b6;"><ion-icon name="mic" style="font-size:20px;color:#7c3aed"></ion-icon> Gravar · Parar e transcrever</div>
              <div style="font-size:11px;color:#6b21a8;line-height:1.4;">OpenAI Whisper no servidor (integração OpenAI).</div>
              <div style="font-size:11px;color:#64748b;width:100%;padding:8px;background:#fff;border-radius:8px;border:1px solid #e9d5ff;">Transcrição aparece aqui no app…</div>
            </div>`;
        }
        
        if(f.type === 'file_upload') inputMock = `<button disabled style="background:#f1f5f9; border:2px dashed #cbd5e1; color:#64748b; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="document-attach" style="font-size:20px"></ion-icon> Anexar Arquivo</button>`;
        if(f.type === 'photo') inputMock = `<div style="background:#f1f5f9; border:2px dashed #cbd5e1; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b; font-size:13px;"><ion-icon name="camera" style="font-size:28px; margin-bottom:4px"></ion-icon> Tocar para Fotografar</div>`;
        if(f.type === 'photo_stamped') inputMock = `<div style="background:#fffbeb; border:2px dashed #f59e0b; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#b45309; text-align:center; padding:10px;"><ion-icon name="scan" style="font-size:28px; margin-bottom:4px"></ion-icon> <b>Câmera Ao Vivo (Anti-Fraude)</b><span style="font-size:10px; line-height:1.2; margin-top:2px;">O App inserirá GPS e Hora. Galeria bloqueada.</span></div>`;
        if(f.type === 'facial_recognition') inputMock = `<div style="background:#fff1f2; border:2px dashed #e11d48; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#9f1239; text-align:center; padding:10px;"><ion-icon name="person" style="font-size:28px; margin-bottom:4px"></ion-icon> <b>Reconhecimento Facial</b><span style="font-size:10px; line-height:1.2; margin-top:2px;">Será comparado com o rosto cadastrado do técnico.</span></div>`;
        if(f.type === 'vision_checklist' || f.type === 'vision_ai_analysis') {
            const _cm =
                f.visionCaptureMode === 'photo_only'
                    ? 'Só foto'
                    : f.visionCaptureMode === 'video_only'
                      ? 'Só vídeo (até 10 s)'
                      : 'Foto ou vídeo (vídeo até 10 s)';
            if (f.type === 'vision_ai_analysis') {
                inputMock = `<div style="background:#fef2f2; border:2px dashed #dc2626; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#991b1b; text-align:center; padding:10px;"><ion-icon name="sparkles" style="font-size:28px; margin-bottom:4px;color:#dc2626"></ion-icon> <b style="color:#dc2626">Visão IA Análise</b><span style="font-size:10px; line-height:1.2; margin-top:2px;">Câmera: ${_cm} · Gemini · ${f.visionRating0To10Enabled ? 'com nota 0–10' : 'resposta + confiança'}.</span></div>`;
            } else {
                inputMock = `<div style="background:#f0f9ff; border:2px dashed #0284c7; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#0369a1; text-align:center; padding:10px;"><ion-icon name="videocam" style="font-size:28px; margin-bottom:4px"></ion-icon> <b>Visão de IA Detecção</b><span style="font-size:10px; line-height:1.2; margin-top:2px;">Câmera: ${_cm} · sim/não · servidor.</span></div>`;
            }
        }
        
        if(f.type === 'lookup_select') {
            const src = f.lookupSource === 'inline_json' ? 'inline_json' : 'preset';
            inputMock = `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:12px;font-size:13px;color:#1e40af;"><b>Lista dinâmica</b> — ${src === 'preset' ? 'preset «' + escapeHtmlLogic(String(f.lookupPreset||'equipamentos_demo')) + '»' : 'opções em JSON no modelo'}.</div>`;
        }
        if(f.type === 'repeatable_matrix') inputMock = `<div style="background:#ecfdf5;border:1px solid #86efac;border-radius:10px;padding:12px;font-size:12px;color:#166534;"><b>Matriz</b> — linhas editáveis no app (até ${escapeHtmlLogic(String(f.matrixMaxRows||'?'))}).</div>`;
        if(f.type === 'opinion_scale') {
            const m = f.opinionScaleMode === 'likert' ? 'Likert (5)' : 'NPS 0–10';
            inputMock = `<div style="background:#faf5ff;border:1px solid #d8b4fe;border-radius:10px;padding:12px;font-size:13px;color:#5b21b6;"><b>${escapeHtmlLogic(m)}</b> — escolha única.</div>`;
        }
        if(f.type === 'image_annotation') inputMock = `<div style="background:#fff7ed;border:2px dashed #fb923c;border-radius:10px;height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9a3412;text-align:center;padding:10px;"><ion-icon name="brush" style="font-size:28px;margin-bottom:4px"></ion-icon><b>Foto com anotações</b><span style="font-size:10px;line-height:1.2;margin-top:2px;">Câmera ou galeria + desenho.</span></div>`;
        if(f.type === 'barcode_scan') inputMock = `<div style="background:#f0f9ff; border:2px solid #38bdf8; border-radius:10px; padding:16px; display:flex; align-items:center; justify-content:center; gap:8px; color:#0284c7; font-weight:800; font-size:14px;"><ion-icon name="barcode" style="font-size:24px; color:#0284c7"></ion-icon> ESCANEAR CÓDIGO</div>`;
        if(f.type === 'materials_consumption') inputMock = `<div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:14px; font-size:13px; color:#0369a1;"><ion-icon name="cube" style="vertical-align:-3px; margin-right:6px"></ion-icon><b>Consumo de materiais</b> — estoque técnico do app (independente de bens); baixa ao concluir.</div>`;
        if(f.type === 'materials_receipt') inputMock = `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px; font-size:13px; color:#15803d;"><ion-icon name="arrow-down-circle" style="vertical-align:-3px; margin-right:6px"></ion-icon><b>Entrada de materiais</b> — estoque técnico; aumenta o saldo ao concluir.</div>`;
        if(f.type === 'technician_finance') inputMock = `<div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:14px; font-size:13px; color:#0f766e;"><ion-icon name="cash" style="vertical-align:-3px; margin-right:6px"></ion-icon><b>Custos do técnico</b> — despesas/receitas ligadas ao atendimento; livro separado dos bens.</div>`;
        if(f.type === 'signature') inputMock = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; height:80px; display:flex; align-items:flex-end; padding:12px; color:#94a3b8; font-size:12px;"><ion-icon name="pencil" style="margin-right:6px"></ion-icon>Deslize o dedo aqui para Assinar...</div>`;
        if(f.type === 'signature_summary') inputMock = `<div style="display:flex;flex-direction:column;gap:10px;width:100%"><div style="background:#ecfeff;border:1px solid #67e8f9;border-radius:10px;padding:12px;font-size:11px;color:#155e75;line-height:1.45"><b>Resumo</b> — valores só leitura dos campos marcados no painel; depois <b>assinatura</b> no final do bloco.</div><div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; height:72px; display:flex; align-items:flex-end; padding:10px; color:#94a3b8; font-size:11px;"><ion-icon name="pencil" style="margin-right:6px"></ion-icon>Zona de assinatura</div></div>`;
        
        if(f.type === 'transit_start') inputMock = `<div style="display:flex;flex-direction:column;gap:10px;width:100%"><button disabled style="background:#3b82f6; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="rocket" style="font-size:20px"></ion-icon> INICIAR DESLOCAMENTO</button><div style="border:1px solid #fed7aa;border-radius:10px;background:linear-gradient(180deg,#fff7ed,#fff);padding:10px 12px;font-size:11px;color:#9a3412;line-height:1.45"><strong>OS tipo Rota (KML):</strong> no app, mapa com linha <span style="color:#ea580c;font-weight:800">laranja</span> (trajeto planejado) e <span style="color:#2563eb;font-weight:800">azul</span> (GPS). Métricas de <strong>cobertura de patrulha</strong> e desvio em relação à tolerância definida no despacho.</div><div style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;padding:8px"><svg viewBox="0 0 200 90" width="100%" height="72" style="display:block" aria-hidden="true"><path d="M10 60 Q50 20 95 45 T180 30" fill="none" stroke="#ea580c" stroke-width="3" stroke-dasharray="6 4"/><path d="M12 58 L45 52 L78 48 L120 38 L165 32" fill="none" stroke="#2563eb" stroke-width="2.5"/><circle cx="12" cy="58" r="4" fill="#16a34a"/><circle cx="165" cy="32" r="4" fill="#dc2626"/></svg><div style="font-size:9px;color:#64748b;text-align:center;margin-top:4px">Legenda: planeado · percorrido · início / fim</div></div></div>`;
        if(f.type === 'transit_end') inputMock = `<div style="display:flex;flex-direction:column;gap:10px;width:100%"><button disabled style="background:#f43f5e; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="flag" style="font-size:20px"></ion-icon> FINALIZAR DESLOCAMENTO</button><div style="font-size:10px;color:#64748b;line-height:1.45;border-left:3px solid #ea580c;padding-left:10px">Se a OS foi despachada como <strong>Rota</strong>, o PDF pode incluir <strong>mapa estático</strong> (trajeto + GPS), <strong>cobertura %</strong>, desvio máximo e comparação com a tolerância do corredor.</div></div>`;
        if(f.type === 'geofence_check') inputMock = `<button disabled style="background:#0f172a; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="location" style="font-size:20px"></ion-icon> VALIDAR GEOLOCALIZAÇÃO<br>Raio: ${escapeHtmlLogic(String(f.geofenceRadius != null ? f.geofenceRadius : '?'))}m</button>`;
        if(f.type === 'location_pick') inputMock = `<div style="border:1px solid #bae6fd; border-radius:10px; overflow:hidden; background:#f0f9ff;"><div style="height:120px; background:linear-gradient(135deg,#e0f2fe,#f0f9ff); display:flex; align-items:center; justify-content:center; color:#0369a1; font-size:12px; font-weight:700; flex-direction:column; gap:6px;"><ion-icon name="map" style="font-size:32px"></ion-icon>Mapa + alfinete</div><div style="padding:10px; font-size:11px; color:#0c4a6e; font-weight:600;">GPS real + posição ajustada no mapa</div></div>`;

        if (!inputMock) {
            inputMock =
                '<div style="border:1px dashed #cbd5e1;border-radius:8px;padding:12px;font-size:13px;color:#64748b;background:#f8fafc;">Pré-visualização simplificada — tipo <strong>' +
                escapeHtmlLogic(f.type) +
                '</strong>.</div>';
        }

        const stackInner = `${labelHtml}${helpMock}${inputMock}`;
        const mainBlock = iconCol
            ? `<div style="display:flex;flex-direction:row;align-items:flex-start;width:100%;">${iconCol}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;">${stackInner}</div></div>`
            : `<div style="display:flex;flex-direction:column;gap:10px;width:100%;">${stackInner}</div>`;

        html += `<div style="${wrapperStyle}">${condBadge}${mainBlock}</div>`;
    });
    
    html += `<button disabled style="background:var(--primary); color:white; font-weight:800; border:none; padding:18px; border-radius:12px; font-size:16px; margin-top:10px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">✅ SALVAR FORMULÁRIO EM OFFLINE-FIRST</button>`;
    
    contentEl.innerHTML = html;
}

// Boot Local DB listener
setTimeout(() => window.loadSavedFormsList(), 100);  // let dom settle
setTimeout(function () {
    try {
        syncBuilderTaskIconDom();
    } catch (eBootIcon) {
        /* DOM ainda não tem o gatilho do ícone */
    }
}, 180);

window.bindAppSectionNavRadios = function () {
    if (window.bindAppSectionNavRadios.__done) return;
    const startNodes = document.querySelectorAll('input[name="appSectionStart"]');
    if (!startNodes.length) return;
    window.bindAppSectionNavRadios.__done = true;
    startNodes.forEach((r) => {
        r.addEventListener('change', function () {
            if (this.checked && globalFormSettings) {
                globalFormSettings.appSectionStart = normalizeAppSectionStart(this.value);
                window.syncAppSectionNavRadios && window.syncAppSectionNavRadios();
                if (typeof window.scheduleBuilderDirtyRecompute === 'function') {
                    window.scheduleBuilderDirtyRecompute();
                }
            }
        });
    });
    document.querySelectorAll('input[name="appHubSectionOrder"]').forEach((r) => {
        r.addEventListener('change', function () {
            if (this.checked && globalFormSettings) {
                globalFormSettings.appHubSectionOrder = normalizeAppHubSectionOrder(this.value);
                window.syncAppSectionNavRadios && window.syncAppSectionNavRadios();
                if (typeof window.scheduleBuilderDirtyRecompute === 'function') {
                    window.scheduleBuilderDirtyRecompute();
                }
            }
        });
    });
};

(function bindNewFolderButton() {
    const b = document.getElementById('btn-new-template-folder');
    if (!b || b.dataset.brsparkBound) return;
    b.dataset.brsparkBound = '1';
    b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        window.openNewFolderModal();
    });
})();

// ==========================================
// 🚀 AUTOMATIONS & RULES ENGINE (IF/THEN)
// ==========================================

/** Monitor virtual: tempo total do formulário (app grava __form_started_at / metadata). */
const FORM_CLOCK_COND_ID = '__brspark_form_clock__';

/** Paridade com `src/lib/businessRuleCondition.ts` — operadores por tipo de monitor. Segunda coluna = chave i18n (`fb_logic_op_*`). */
const NORMAL_LOGIC_OPS = [
    ['==', 'fb_logic_op_eq'],
    ['!=', 'fb_logic_op_ne'],
    ['contains', 'fb_logic_op_contains'],
    ['not_contains', 'fb_logic_op_not_contains'],
    ['starts_with', 'fb_logic_op_starts_with'],
    ['ends_with', 'fb_logic_op_ends_with'],
    ['not_starts_with', 'fb_logic_op_not_starts_with'],
    ['not_ends_with', 'fb_logic_op_not_ends_with'],
    ['is_empty', 'fb_logic_op_is_empty'],
    ['not_empty', 'fb_logic_op_not_empty'],
    ['is_true', 'fb_logic_op_is_true'],
    ['is_false', 'fb_logic_op_is_false'],
    ['>', 'fb_logic_op_gt'],
    ['<', 'fb_logic_op_lt'],
    ['>=', 'fb_logic_op_gte'],
    ['<=', 'fb_logic_op_lte'],
    ['between', 'fb_logic_op_between'],
    ['not_between', 'fb_logic_op_not_between'],
    ['one_of', 'fb_logic_op_one_of'],
    ['none_of', 'fb_logic_op_none_of'],
    ['includes_any', 'fb_logic_op_includes_any'],
    ['includes_all', 'fb_logic_op_includes_all'],
    ['excludes_all', 'fb_logic_op_excludes_all'],
    ['matches_regex', 'fb_logic_op_matches_regex'],
    ['length_eq', 'fb_logic_op_length_eq'],
    ['length_neq', 'fb_logic_op_length_neq'],
    ['length_gt', 'fb_logic_op_length_gt'],
    ['length_gte', 'fb_logic_op_length_gte'],
    ['length_lt', 'fb_logic_op_length_lt'],
    ['length_lte', 'fb_logic_op_length_lte'],
    ['count_eq', 'fb_logic_op_count_eq'],
    ['count_neq', 'fb_logic_op_count_neq'],
    ['count_gt', 'fb_logic_op_count_gt'],
    ['count_gte', 'fb_logic_op_count_gte'],
    ['count_lt', 'fb_logic_op_count_lt'],
    ['count_lte', 'fb_logic_op_count_lte'],
    ['date_before', 'fb_logic_op_date_before'],
    ['date_after', 'fb_logic_op_date_after'],
    ['date_on_or_before', 'fb_logic_op_date_on_or_before'],
    ['date_on_or_after', 'fb_logic_op_date_on_or_after'],
];

const FORM_CLOCK_LOGIC_OPS = [
    ['form_elapsed_sec_gte', 'fb_logic_op_form_elapsed_gte'],
    ['form_elapsed_sec_lte', 'fb_logic_op_form_elapsed_lte'],
    ['form_elapsed_sec_gt', 'fb_logic_op_form_elapsed_gt'],
    ['form_elapsed_sec_lt', 'fb_logic_op_form_elapsed_lt'],
    ['form_elapsed_sec_eq', 'fb_logic_op_form_elapsed_eq'],
    ['form_elapsed_sec_between', 'fb_logic_op_form_elapsed_between'],
];

const SECTION_LOGIC_OPS = [
    ['section_has_started', 'fb_logic_op_section_started'],
    ['section_not_started', 'fb_logic_op_section_not_started'],
    ['section_has_ended', 'fb_logic_op_section_ended'],
    ['section_not_ended', 'fb_logic_op_section_not_ended'],
    ['section_in_progress', 'fb_logic_op_section_in_progress'],
    ['section_elapsed_sec_gte', 'fb_logic_op_section_elapsed_gte'],
    ['section_elapsed_sec_lte', 'fb_logic_op_section_elapsed_lte'],
    ['section_elapsed_sec_gt', 'fb_logic_op_section_elapsed_gt'],
    ['section_elapsed_sec_lt', 'fb_logic_op_section_elapsed_lt'],
    ['section_elapsed_sec_eq', 'fb_logic_op_section_elapsed_eq'],
    ['section_elapsed_sec_between', 'fb_logic_op_section_elapsed_between'],
];

const NORMAL_LOGIC_OP_VALUES = NORMAL_LOGIC_OPS.map((r) => r[0]);
const FORM_CLOCK_LOGIC_OP_VALUES = FORM_CLOCK_LOGIC_OPS.map((r) => r[0]);
const SECTION_LOGIC_OP_VALUES = SECTION_LOGIC_OPS.map((r) => r[0]);

function escapeHtmlLogic(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Texto do query builder de regras (modal de lógica). */
function logicStr(key, ptFallback) {
    return fbStr(key, null, ptFallback);
}

/** Rótulo guardado no JSON → texto no idioma atual (ex.: «Etapa 1» → «Step 1» em en-US). Vazio permanece vazio. */
function translateStoredFieldLabelForDisplay(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    return translateStepLabelForCanvasDisplay(t);
}

/** Rótulo no select de alvo / monitor — destaca separadores de etapa (section_break). */
function logicFieldSelectLabel(fld) {
    if (!fld) return '';
    const secPrefix = logicStr('fb_logic_field_section_prefix', '[Seção/Etapa]');
    const unnamed = logicStr('fb_logic_field_unnamed', '(sem nome)');
    if (fld.type === 'section_break') {
        const stepShown = translateStoredFieldLabelForDisplay(fld.label) || unnamed;
        return `${secPrefix} ${stepShown} — ${fld.id}`;
    }
    const shown = translateStoredFieldLabelForDisplay(fld.label) || String(fld.id || '');
    return `${shown} (${fld.id})`;
}

function logicConditionNeedsNumericInput(operator) {
    return (
        operator === 'section_elapsed_sec_gte' ||
        operator === 'section_elapsed_sec_lte' ||
        operator === 'section_elapsed_sec_gt' ||
        operator === 'section_elapsed_sec_lt' ||
        operator === 'section_elapsed_sec_eq' ||
        operator === 'section_elapsed_sec_between' ||
        operator === 'form_elapsed_sec_gte' ||
        operator === 'form_elapsed_sec_lte' ||
        operator === 'form_elapsed_sec_gt' ||
        operator === 'form_elapsed_sec_lt' ||
        operator === 'form_elapsed_sec_eq' ||
        operator === 'form_elapsed_sec_between'
    );
}

function logicConditionNeedsNoValueField(operator) {
    return (
        operator === 'is_empty' ||
        operator === 'not_empty' ||
        operator === 'is_true' ||
        operator === 'is_false' ||
        operator === 'section_has_started' ||
        operator === 'section_not_started' ||
        operator === 'section_has_ended' ||
        operator === 'section_not_ended' ||
        operator === 'section_in_progress'
    );
}

function logicConditionSingleNumberInput(operator) {
    return (
        operator === '>' ||
        operator === '<' ||
        operator === '>=' ||
        operator === '<=' ||
        operator === 'length_eq' ||
        operator === 'length_neq' ||
        operator === 'length_gt' ||
        operator === 'length_gte' ||
        operator === 'length_lt' ||
        operator === 'length_lte' ||
        operator === 'count_eq' ||
        operator === 'count_neq' ||
        operator === 'count_gt' ||
        operator === 'count_gte' ||
        operator === 'count_lt' ||
        operator === 'count_lte'
    );
}

function defaultValueForRuleOperator(op) {
    if (
        op === 'between' ||
        op === 'not_between' ||
        op === 'form_elapsed_sec_between' ||
        op === 'section_elapsed_sec_between'
    ) {
        return '0|3600';
    }
    if (logicConditionNeedsNumericInput(op)) return '60';
    return '';
}

function logicValuePlaceholder(op) {
    const keys = {
        between: 'fb_logic_ph_between',
        not_between: 'fb_logic_ph_not_between',
        one_of: 'fb_logic_ph_one_of',
        none_of: 'fb_logic_ph_none_of',
        includes_any: 'fb_logic_ph_includes_any',
        includes_all: 'fb_logic_ph_includes_all',
        excludes_all: 'fb_logic_ph_excludes_all',
        matches_regex: 'fb_logic_ph_matches_regex',
        '>': 'fb_logic_ph_num_ref',
        '<': 'fb_logic_ph_num_ref',
        '>=': 'fb_logic_ph_num_ref',
        '<=': 'fb_logic_ph_num_ref',
        length_eq: 'fb_logic_ph_len',
        length_neq: 'fb_logic_ph_len',
        length_gt: 'fb_logic_ph_len',
        length_gte: 'fb_logic_ph_len',
        length_lt: 'fb_logic_ph_len',
        length_lte: 'fb_logic_ph_len',
        count_eq: 'fb_logic_ph_count_list',
        count_neq: 'fb_logic_ph_count',
        count_gt: 'fb_logic_ph_count',
        count_gte: 'fb_logic_ph_count',
        count_lt: 'fb_logic_ph_count',
        count_lte: 'fb_logic_ph_count',
        date_before: 'fb_logic_ph_date_ref',
        date_after: 'fb_logic_ph_date_ref_short',
        date_on_or_before: 'fb_logic_ph_date_ref_short',
        date_on_or_after: 'fb_logic_ph_date_ref_short',
    };
    const pt = {
        between: 'Mínimo|Máximo (ex.: 10|500)',
        not_between: 'Mínimo|Máximo — fora do intervalo',
        one_of: 'Valor1, Valor2 (igualdade, ignora maiúsculas)',
        none_of: 'Valor1, Valor2…',
        includes_any: 'Trecho1, Trecho2…',
        includes_all: 'Trecho1, Trecho2… (todos devem aparecer)',
        excludes_all: 'Trecho1, Trecho2… (nenhum pode aparecer)',
        matches_regex: 'Regex JS (máx. 500 caracteres)',
        '>': 'Número de referência',
        '<': 'Número de referência',
        '>=': 'Número de referência',
        '<=': 'Número de referência',
        length_eq: 'Número de caracteres',
        length_neq: 'Número de caracteres',
        length_gt: 'Número de caracteres',
        length_gte: 'Número de caracteres',
        length_lt: 'Número de caracteres',
        length_lte: 'Número de caracteres',
        count_eq: 'Quantidade de itens na resposta (listas)',
        count_neq: 'Quantidade',
        count_gt: 'Quantidade',
        count_gte: 'Quantidade',
        count_lt: 'Quantidade',
        count_lte: 'Quantidade',
        date_before: 'Data/hora de referência (ex.: 2025-12-31 ou ISO 8601)',
        date_after: 'Data/hora de referência',
        date_on_or_before: 'Data/hora de referência',
        date_on_or_after: 'Data/hora de referência',
    };
    const k = keys[op];
    if (!k) return logicStr('fb_logic_ph_default', 'Valor esperado');
    return logicStr(k, pt[op] || 'Valor esperado');
}

/** Ajusta operador/valor quando o monitor deixa de ser campo “normal”. */
function normalizeRuleOperatorForMonitor(rule) {
    const mid = rule.condFieldId || currentLogicFieldId;
    const fld = fields.find((f) => f.id === mid);
    const isFormClock = mid === FORM_CLOCK_COND_ID;
    const isSection = fld && fld.type === 'section_break';

    let valid = NORMAL_LOGIC_OP_VALUES;
    if (isFormClock) valid = FORM_CLOCK_LOGIC_OP_VALUES;
    else if (isSection) valid = SECTION_LOGIC_OP_VALUES;

    if (!valid.includes(rule.operator)) {
        rule.operator = valid[0];
        rule.value = defaultValueForRuleOperator(rule.operator);
    }
}

function buildLogicConditionUI(rule, ruleIndex, monitorFieldId) {
    const fld = fields.find((f) => f.id === monitorFieldId);
    const isFormClock = monitorFieldId === FORM_CLOCK_COND_ID;
    const isSection = fld && fld.type === 'section_break';
    const op = rule.operator || '==';

    let opList = NORMAL_LOGIC_OPS;
    if (isFormClock) opList = FORM_CLOCK_LOGIC_OPS;
    else if (isSection) opList = SECTION_LOGIC_OPS;

    const visionRatingHint =
        fld &&
        fld.type === 'vision_ai_analysis' &&
        fld.visionRating0To10Enabled &&
        !isFormClock &&
        !isSection
            ? `<div style="font-size:10px;color:#92400e;line-height:1.45;margin-bottom:10px;padding:9px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">${logicStr(
                  'fb_logic_vision_hint_html',
                  '<strong>Classificação 0–10 ativa neste campo:</strong> os operadores <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>, «Entre dois números» e «Fora do intervalo» comparam o valor <code>rating0To10</code> (0 a 10) devolvido pela análise Gemini. Use <b>Está preenchido</b> se só precisar de análise concluída. Se a resposta não tiver nota, <b>!=</b> com um número é verdadeiro; <b>==</b> e as outras comparações numéricas falham.',
              )}</div>`
            : '';

    const opSelect = `
            ${visionRatingHint}
            <select class="prop-input" onchange="window.updateLogicRule(${ruleIndex}, 'operator', this.value)" style="margin-bottom:12px;">
                ${opList
                    .map(([val, i18nKey]) => {
                        const label = logicStr(i18nKey, String(val));
                        return `<option value="${escapeHtmlLogic(val)}" ${op === val ? 'selected' : ''}>${escapeHtmlLogic(
                            label,
                        )}</option>`;
                    })
                    .join('')}
            </select>`;

    let valInput = '';
    if (logicConditionNeedsNumericInput(op)) {
        const useBetween = op.endsWith('_between');
        const phSec = escapeHtmlAttr(
            useBetween
                ? logicStr('fb_logic_ph_sec_between', 'min|max em segundos (ex.: 30|600)')
                : logicStr('fb_logic_ph_sec_single', 'Segundos (ex.: 120)'),
        );
        valInput = `
            <input type="${useBetween ? 'text' : 'number'}" ${useBetween ? '' : 'min="0" step="1"'} class="prop-input" placeholder="${phSec}" value="${escapeHtmlLogic(rule.value || '')}" onchange="window.updateLogicRule(${ruleIndex}, 'value', this.value)" style="margin-bottom:12px;" />`;
    } else if (!isFormClock && !isSection && logicConditionSingleNumberInput(op)) {
        valInput = `
            <input type="number" step="any" class="prop-input" placeholder="${escapeHtmlLogic(
                logicValuePlaceholder(op),
            )}" value="${escapeHtmlLogic(rule.value || '')}" onchange="window.updateLogicRule(${ruleIndex}, 'value', this.value)" style="margin-bottom:12px;" />`;
    } else if (!isFormClock && !isSection && !logicConditionNeedsNoValueField(op)) {
        valInput = `
            <input type="text" class="prop-input" placeholder="${escapeHtmlLogic(
                logicValuePlaceholder(op),
            )}" value="${escapeHtmlLogic(rule.value || '')}" onchange="window.updateLogicRule(${ruleIndex}, 'value', this.value)" style="margin-bottom:12px;" />`;
    }

    return { opSelect, valInput };
}

/** Opções do alvo da ação ENTÃO: em SHOW/HIDE inclui seções; ações sobre valor não listam section_break. */
function buildLogicActionTargetOptions(actType, selectedTargetId) {
    const allowSection = actType === 'SHOW' || actType === 'HIDE';
    let list = fields.filter((fld) => {
        if (fld.type === 'section_break') return allowSection;
        if (!allowSection && fld.type === 'hidden') return false;
        return true;
    });
    if (allowSection) {
        list = [...list].sort((a, b) => {
            const sa = a.type === 'section_break' ? 0 : 1;
            const sb = b.type === 'section_break' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return logicFieldSelectLabel(a).localeCompare(logicFieldSelectLabel(b), undefined, { sensitivity: 'base' });
        });
    }
    const body = list
        .map(
            (fld) =>
                `<option value="${escapeHtmlLogic(fld.id)}" ${selectedTargetId === fld.id ? 'selected' : ''}>${escapeHtmlLogic(logicFieldSelectLabel(fld))}</option>`
        )
        .join('');
    return (
        `<option value="">${escapeHtmlLogic(logicStr('fb_logic_target_pick', '[Selecionar alvo]'))}</option>` + body
    );
}

/** Opções do select «tipo de ação» (ENTÃO), com rótulos traduzidos. */
function buildLogicActionTypeOptionsHtml(selectedType) {
    const rows = [
        ['SHOW', 'fb_logic_act_show', 'Exibir o campo'],
        ['HIDE', 'fb_logic_act_hide', 'Ocultar o campo'],
        ['REQUIRE', 'fb_logic_act_require', 'Tornar obrigatório'],
        ['OPTIONAL', 'fb_logic_act_optional', 'Tornar opcional'],
        ['SET_VALUE', 'fb_logic_act_set_value', 'Definir valor'],
        ['API_VALIDATION', 'fb_logic_act_api_val', 'Validar na API externa'],
        ['API_FETCH', 'fb_logic_act_api_fetch', 'Buscar na API e preencher campo'],
    ];
    return rows
        .map(
            ([val, key, pt]) =>
                `<option value="${val}" ${selectedType === val ? 'selected' : ''}>${escapeHtmlLogic(
                    logicStr(key, pt),
                )}</option>`,
        )
        .join('');
}

// --- NEW CONTEXTUAL LOGIC BUILDER ---
let currentLogicFieldId = null;

window.handleLogicModalLabelInput = function (val) {
    const field = fields.find((f) => f.id === currentLogicFieldId);
    if (!field) return;
    field.label = val;
    if (selectedFieldId === field.id) {
        const si = document.getElementById('prop-label-input');
        if (si) si.value = val;
    }
    if (typeof window.renderMobilePreview === 'function') window.renderMobilePreview();
};

window.handleLogicModalLabelBlur = function () {
    renderCanvas();
};

window.hideLogicModal = function () {
    const inp = document.getElementById('logic-modal-field-label');
    const field = currentLogicFieldId && fields.find((f) => f.id === currentLogicFieldId);
    if (inp && field) field.label = inp.value;
    if (field && selectedFieldId === field.id) {
        const si = document.getElementById('prop-label-input');
        if (si) si.value = field.label;
    }
    const m = document.getElementById('logic-modal');
    if (m) m.style.display = 'none';
    currentLogicFieldId = null;
    renderCanvas();
};

window.openLogicModal = function(evt, fieldId) {
    if(evt) evt.stopPropagation();
    if (typeof window.closeFieldPropertiesModal === 'function') window.closeFieldPropertiesModal();
    currentLogicFieldId = fieldId;
    
    const field = fields.find(f => f.id === fieldId);
    if(!field) return;

    if (typeof window.applyChecklistsModalsI18n === 'function') window.applyChecklistsModalsI18n();

    const sub = document.getElementById('logic-modal-subtitle');
    sub.textContent = '';
    sub.style.display = 'flex';
    sub.style.flexDirection = 'column';
    sub.style.alignItems = 'flex-start';
    sub.style.gap = '8px';
    sub.style.maxWidth = 'min(560px, 92vw)';

    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.flexWrap = 'wrap';
    row1.style.alignItems = 'center';
    row1.style.gap = '8px';
    const fb = typeof window.fbT === 'function' ? window.fbT : (k) => k;
    row1.appendChild(document.createTextNode(fb('mdl_logic_rules_in_block')));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'logic-modal-field-label';
    inp.className = 'prop-input';
    inp.value =
        field.label != null && String(field.label).trim() !== ''
            ? translateStoredFieldLabelForDisplay(field.label)
            : String(field.label || '');
    inp.setAttribute('aria-label', fb('mdl_logic_field_label_aria'));
    inp.style.cssText =
        'flex:1; min-width:200px; max-width:min(380px,65vw); font-weight:700; font-size:13px; padding:8px 10px; margin:0;';
    inp.addEventListener('input', () => window.handleLogicModalLabelInput(inp.value));
    inp.addEventListener('blur', () => window.handleLogicModalLabelBlur());
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
        }
    });
    row1.appendChild(inp);
    const idStrong = document.createElement('strong');
    idStrong.style.opacity = '0.95';
    idStrong.style.fontWeight = '600';
    idStrong.textContent = ' (' + field.id + ')';
    row1.appendChild(idStrong);
    sub.appendChild(row1);
    const tail = document.createElement('span');
    tail.style.fontSize = '12px';
    tail.style.lineHeight = '1.45';
    tail.style.opacity = '0.92';
    tail.innerHTML = fb('mdl_logic_sub_help_html');
    sub.appendChild(tail);
    
    // Initialize rules array if it doesn't exist
    if(!field.rules) field.rules = [];
    
    renderLogicRules();
    document.getElementById('logic-modal').style.display = 'flex';
    setTimeout(() => {
        try {
            inp.focus();
            inp.select();
        } catch (e) { /* ignore */ }
    }, 50);
};

function renderLogicRules() {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(!field) return;

    (field.rules || []).forEach((r) => normalizeRuleOperatorForMonitor(r));

    const container = document.getElementById('logic-rules-container');
    const emptyState = document.getElementById('logic-empty-state');
    
    if(!field.rules || field.rules.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    field.rules.forEach((rule, ruleIndex) => {
        const div = document.createElement('div');
        div.style.background = 'white';
        div.style.border = '1px solid #e2e8f0';
        div.style.borderRadius = '8px';
        div.style.padding = '16px';
        div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';

        const monitorFieldId = rule.condFieldId || currentLogicFieldId;
        const condSourceOptions =
            `<option value="${FORM_CLOCK_COND_ID}" ${monitorFieldId === FORM_CLOCK_COND_ID ? 'selected' : ''}>${escapeHtmlLogic(
                logicStr('fb_logic_form_clock_option', '[Formulário] Cronómetro geral (tempo total)'),
            )}</option>` +
            fields
                .map(
                    (ff) =>
                        `<option value="${escapeHtmlLogic(ff.id)}" ${monitorFieldId === ff.id ? 'selected' : ''}>${escapeHtmlLogic(logicFieldSelectLabel(ff))}</option>`
                )
                .join('');
        const condFieldSelect = `
            <div style="margin-bottom:12px;">
                <label style="display:block; font-size:10px; font-weight:800; color:#64748b; margin-bottom:4px;">${escapeHtmlLogic(
                    logicStr('fb_logic_monitor_label', 'Campo monitorado (dispara o SE)'),
                )}</label>
                <select class="prop-input" onchange="window.updateLogicRule(${ruleIndex}, 'condFieldId', this.value)" style="margin-bottom:0;">
                    ${condSourceOptions}
                </select>
            </div>
        `;

        const { opSelect, valInput } = buildLogicConditionUI(rule, ruleIndex, monitorFieldId);
        
        // Actions
        let actionsHTML = '';
        rule.actions.forEach((act, actionIndex) => {
            const fieldOptions = buildLogicActionTargetOptions(act.type || 'SHOW', act.targetId);
            const fieldOptsFetch = buildLogicActionTargetOptions('SET_VALUE', act.targetId);

            if (act.type === 'API_FETCH') {
                const phUrl = escapeHtmlAttr(logicStr('fb_logic_api_ph_url', 'https://… (GET: inclua query na URL)'));
                const phPath = escapeHtmlAttr(logicStr('fb_logic_api_ph_path', 'Ex.: current.temp_c (vazio = corpo inteiro como texto)'));
                const phErr = escapeHtmlAttr(logicStr('fb_logic_api_ph_errmsg', 'Ex.: Serviço indisponível.'));
                actionsHTML += `
                <div style="display:flex; flex-direction:column; gap:8px; align-items:stretch; background:#ecfdf5; padding:12px; border-radius:6px; margin-bottom:8px; border:1px solid #86efac;">
                    <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
                        <select class="prop-input" style="flex:1" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'type', this.value)">
                            ${buildLogicActionTypeOptionsHtml('API_FETCH')}
                        </select>
                        <div style="cursor:pointer; color:var(--red); font-size:20px;" onclick="window.removeLogicAction(${ruleIndex}, ${actionIndex})">&times;</div>
                    </div>
                    <label style="font-size:10px; color:#166534; font-weight:bold;">${escapeHtmlLogic(
                        logicStr('fb_logic_api_lbl_target', 'Campo destino (recebe o texto extraído)'),
                    )}</label>
                    <select class="prop-input" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'targetId', this.value)">${fieldOptsFetch}</select>
                    <label style="font-size:10px; color:#166534; font-weight:bold;">${escapeHtmlLogic(
                        logicStr('fb_logic_api_lbl_method', 'Método HTTP'),
                    )}</label>
                    <select class="prop-input" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiMethod', this.value)">
                        <option value="POST" ${(act.apiMethod || 'POST') === 'POST' ? 'selected' : ''}>${escapeHtmlLogic(
                            logicStr('fb_logic_api_method_post', 'POST (JSON com formulário, tarefa e respostas)'),
                        )}</option>
                        <option value="GET" ${String(act.apiMethod || '').toUpperCase() === 'GET' ? 'selected' : ''}>${escapeHtmlLogic(
                            logicStr('fb_logic_api_method_get', 'GET (URL completa; sem corpo)'),
                        )}</option>
                    </select>
                    <label style="font-size:10px; color:#166534; font-weight:bold;">${escapeHtmlLogic(
                        logicStr('fb_logic_api_lbl_url', 'URL do endpoint'),
                    )}</label>
                    <input type="text" class="prop-input" placeholder="${phUrl}" value="${escapeHtmlLogic(act.apiUrl || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiUrl', this.value)" />
                    <label style="font-size:10px; color:#166534; font-weight:bold;">${escapeHtmlLogic(
                        logicStr('fb_logic_api_lbl_path', 'Caminho no JSON da resposta (opcional)'),
                    )}</label>
                    <input type="text" class="prop-input" placeholder="${phPath}" value="${escapeHtmlLogic(act.apiResponsePath || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiResponsePath', this.value)" />
                    <label style="font-size:10px; color:#166534; font-weight:bold;">${escapeHtmlLogic(
                        logicStr('fb_logic_api_lbl_errmsg', 'Mensagem se falhar a chamada'),
                    )}</label>
                    <input type="text" class="prop-input" placeholder="${phErr}" value="${escapeHtmlLogic(act.apiErrorMsg || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiErrorMsg', this.value)" />
                    <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                        <input type="checkbox" id="api_fetch_off_${ruleIndex}_${actionIndex}" ${act.apiAllowOffline ? 'checked' : ''} onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiAllowOffline', this.checked)" />
                        <label for="api_fetch_off_${ruleIndex}_${actionIndex}" style="font-size:12px; color:#166534; cursor:pointer;">${escapeHtmlLogic(
                            logicStr('fb_logic_api_fetch_offline', 'Se offline, não buscar nem alterar o campo'),
                        )}</label>
                    </div>
                </div>`;
            } else if (act.type === 'API_VALIDATION') {
                const phUrlVal = escapeHtmlAttr(logicStr('fb_logic_api_ph_url_val', 'Ex.: https://api.fornecedor.com/valida'));
                const phExp = escapeHtmlAttr(logicStr('fb_logic_api_ph_expected', 'Ex.: "status":"VALID"'));
                const phBlock = escapeHtmlAttr(logicStr('fb_logic_api_ph_block_msg', 'Ex.: CPF inválido no Serasa.'));
                actionsHTML += `
                <div style="display:flex; flex-direction:column; gap:8px; align-items:stretch; background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:8px; border:1px solid #bae6fd;">
                    <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
                        <select class="prop-input" style="flex:1" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'type', this.value)">
                            ${buildLogicActionTypeOptionsHtml('API_VALIDATION')}
                        </select>
                        <div style="cursor:pointer; color:var(--red); font-size:20px;" onclick="window.removeLogicAction(${ruleIndex}, ${actionIndex})">&times;</div>
                    </div>
                    <label style="font-size:10px; color:#0284c7; font-weight:bold;">${escapeHtmlLogic(
                        logicStr(
                            'fb_logic_api_lbl_url_val',
                            'URL do endpoint (o app fará POST injetando o payload XML/JSON)',
                        ),
                    )}</label>
                    <input type="text" class="prop-input" placeholder="${phUrlVal}" value="${escapeHtmlAttr(act.apiUrl || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiUrl', this.value)" />
                    <label style="font-size:10px; color:#0284c7; font-weight:bold;">${escapeHtmlLogic(
                        logicStr(
                            'fb_logic_api_lbl_expected',
                            'Condição de retorno de sucesso (string/regex esperada no corpo)',
                        ),
                    )}</label>
                    <input type="text" class="prop-input" placeholder="${phExp}" value="${escapeHtmlAttr(act.apiExpectedReturn || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiExpectedReturn', this.value)" />
                    <label style="font-size:10px; color:#0284c7; font-weight:bold;">${escapeHtmlLogic(
                        logicStr('fb_logic_api_lbl_block_msg', 'Mensagem personalizada em caso de bloqueio/erro'),
                    )}</label>
                    <input type="text" class="prop-input" placeholder="${phBlock}" value="${escapeHtmlAttr(act.apiErrorMsg || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiErrorMsg', this.value)" />
                    <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                        <input type="checkbox" id="api_off_${ruleIndex}_${actionIndex}" ${act.apiAllowOffline ? 'checked' : ''} onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiAllowOffline', this.checked)" />
                        <label for="api_off_${ruleIndex}_${actionIndex}" style="font-size:12px; color:#0369a1; cursor:pointer;">${escapeHtmlLogic(
                            logicStr('fb_logic_api_allow_offline', 'Permitir que o técnico pule a regra se estiver offline'),
                        )}</label>
                    </div>
                </div>`;
            } else {
                const phNewVal = escapeHtmlAttr(logicStr('fb_logic_new_value_ph', 'Novo valor'));
                actionsHTML += `
                    <div style="display:flex; gap:8px; align-items:center; background:#f8fafc; padding:8px; border-radius:6px; margin-bottom:8px; border:1px solid #e2e8f0;">
                        <div style="color:var(--accent); font-weight:800; font-size:12px; margin-right:8px;">${escapeHtmlLogic(
                            logicStr('fb_logic_then', 'ENTÃO'),
                        )}</div>
                        <select class="prop-input" style="flex:1" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'type', this.value)">
                            ${buildLogicActionTypeOptionsHtml(act.type || 'SHOW')}
                        </select>
                        <select class="prop-input" style="flex:1">
                            ${fieldOptions}
                        </select>
                        ${
                            act.type === 'SET_VALUE'
                                ? `<input type="text" class="prop-input" style="flex:1" placeholder="${phNewVal}" value="${escapeHtmlAttr(act.value || '')}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'value', this.value)" />`
                                : ''
                        }
                        <div style="cursor:pointer; color:var(--red); font-size:20px;" onclick="window.removeLogicAction(${ruleIndex}, ${actionIndex})">&times;</div>
                    </div>
                `;
            }
        });
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:flex; flex-direction:column; gap:8px; flex:1; min-width:0;">
                    ${condFieldSelect}
                    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
                    <div style="background:#f1f5f9; padding:6px 12px; border-radius:6px; color:#334155; font-weight:800; font-size:12px; align-self:flex-start;">${escapeHtmlLogic(
                        logicStr('fb_logic_if', 'SE'),
                    )}</div>
                    <div style="flex:1; min-width:120px;">${opSelect}</div>
                    <div style="flex:1; min-width:120px;">${valInput}</div>
                    </div>
                </div>
                <div style="cursor:pointer; color:var(--red); padding:4px 8px; font-weight:700; font-size:12px; border:1px solid var(--red); border-radius:4px; margin-left:12px;" onclick="window.removeLogicRule(${ruleIndex})">${escapeHtmlLogic(
                    logicStr('fb_logic_del_rule', 'Excluir regra'),
                )}</div>
            </div>
            
            <div style="border-top:1px dashed #cbd5e1; padding-top:12px;">
                ${actionsHTML}
                <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="window.addLogicAction(${ruleIndex})">${escapeHtmlLogic(
                    logicStr('fb_logic_add_action', '+ Adicionar ação (ENTÃO)'),
                )}</button>
            </div>
        `;
        
        container.appendChild(div);
        
        // bind dynamically selected inputs
        const actionRows = div.querySelectorAll('div[style*="background:#f8fafc"]');
        actionRows.forEach((row, aIndex) => {
            const selects = row.querySelectorAll('select');
            if(selects[1]) {
                selects[1].onchange = (e) => window.updateLogicAction(ruleIndex, aIndex, 'targetId', e.target.value);
            }
        });
    });
}

window.renderLogicRules = renderLogicRules;

window.addLogicRule = function() {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(field) {
        field.rules.push({ operator: '==', value: '', actions: [] });
        renderLogicRules();
    }
};

window.removeLogicRule = function(rIndex) {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(field) {
        field.rules.splice(rIndex, 1);
        renderLogicRules();
    }
};

window.updateLogicRule = function(rIndex, key, val) {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(field && field.rules[rIndex]) {
        if (key === 'condFieldId') {
            if (val === currentLogicFieldId) {
                delete field.rules[rIndex].condFieldId;
            } else {
                field.rules[rIndex].condFieldId = val;
            }
            normalizeRuleOperatorForMonitor(field.rules[rIndex]);
            renderLogicRules();
            return;
        }
        field.rules[rIndex][key] = val;
        if(key === 'operator') renderLogicRules();
    }
};

window.addLogicAction = function(rIndex) {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(field && field.rules[rIndex]) {
        field.rules[rIndex].actions.push({ type: 'SHOW', targetId: '', value: '' });
        renderLogicRules();
    }
};

window.removeLogicAction = function(rIndex, aIndex) {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(field && field.rules[rIndex]) {
        field.rules[rIndex].actions.splice(aIndex, 1);
        renderLogicRules();
    }
};

window.updateLogicAction = function(rIndex, aIndex, key, val) {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(field && field.rules[rIndex] && field.rules[rIndex].actions[aIndex]) {
        field.rules[rIndex].actions[aIndex][key] = val;
        if (key === 'type') {
            const act = field.rules[rIndex].actions[aIndex];
            if (val === 'API_FETCH') {
                if (!act.apiMethod) act.apiMethod = 'POST';
                if (act.apiUrl == null) act.apiUrl = '';
                if (act.apiResponsePath == null) act.apiResponsePath = '';
                if (act.apiErrorMsg == null) act.apiErrorMsg = '';
            }
            if (val !== 'SHOW' && val !== 'HIDE' && act.targetId) {
                const tgt = fields.find((x) => x.id === act.targetId);
                if (tgt && tgt.type === 'section_break') act.targetId = '';
            }
            renderLogicRules();
        }
    }
};

window.saveFieldLogic = function() {
    window.hideLogicModal();
};

function brsparkAdminBearerToken() {
    try {
        return sessionStorage.getItem('brspark_admin_token') || '';
    } catch (e) {
        return '';
    }
}

function collectCopilotFormContext() {
    const g = function (id) {
        return document.getElementById(id);
    };
    const out = {
        objective: g('copilot-ctx-objective') ? String(g('copilot-ctx-objective').value || '').trim().slice(0, 800) : '',
        sector: '',
        formKind: 'formulario',
    };
    const fc = window.__brsparkCopilotFocusedField;
    if (fc && fc.id) {
        const still = fields.find(function (x) {
            return x.id === fc.id;
        });
        if (still) {
            out.focusedCanvasField = {
                id: still.id,
                label: still.label != null ? String(still.label).trim().slice(0, 240) : '',
                type: still.type != null ? String(still.type).trim().slice(0, 64) : '',
                icon: still.icon != null ? String(still.icon).trim().slice(0, 120) : '',
                iconLibrary:
                    still.iconLibrary != null ? String(still.iconLibrary).trim().slice(0, 40) : '',
            };
        } else {
            window.__brsparkCopilotFocusedField = null;
            if (typeof window.refreshCopilotCanvasFocusChip === 'function') {
                window.refreshCopilotCanvasFocusChip();
            }
        }
    }
    return out;
}

if (typeof window.__brsparkCopilotFocusedField === 'undefined') window.__brsparkCopilotFocusedField = null;

window.refreshCopilotCanvasFocusChip = function () {
    const chip = document.getElementById('copilot-focus-chip');
    const clr = document.getElementById('copilot-clear-focus-btn');
    const f = window.__brsparkCopilotFocusedField;
    if (!chip) return;
    if (!f || !f.id) {
        chip.style.display = 'none';
        chip.textContent = '';
        if (clr) clr.style.display = 'none';
        return;
    }
    const lab = f.label != null ? String(f.label) : '';
    const typ = f.type != null ? String(f.type) : '';
    chip.style.display = 'block';
    chip.textContent =
        (lab.trim() || '(sem rótulo)') + ' · tipo: ' + (typ || '—') + ' · id: ' + String(f.id);
    if (clr) clr.style.display = 'inline-flex';
};

window.brsparkCopilotPinFieldFromCanvas = function (id, opts) {
    opts = opts || {};
    const f = fields.find(function (x) {
        return x.id === id;
    });
    if (!f) return;
    if (!opts.skipSelect) {
        window.selectField(id);
    }
    window.__brsparkCopilotFocusedField = {
        id: f.id,
        label: f.label != null ? String(f.label) : '',
        type: f.type != null ? String(f.type) : '',
    };
    window.refreshCopilotCanvasFocusChip();
    if (!opts.skipOpenPanel) {
        const p = document.getElementById('ai-copilot-panel');
        if (p && !p.classList.contains('is-open')) {
            window.toggleAiCopilotPanel();
        }
    }
};

window.brsparkCopilotSyncFocusFromCanvasSelection = function () {
    if (!selectedFieldId) {
        fbAlert('fb_alert_select_field', null, 'Selecione um campo no canvas (clique num cartão).');
        return;
    }
    window.brsparkCopilotPinFieldFromCanvas(selectedFieldId, { skipSelect: true, skipOpenPanel: true });
};

window.brsparkCopilotClearFocusedField = function () {
    window.__brsparkCopilotFocusedField = null;
    window.refreshCopilotCanvasFocusChip();
};

function syncBuilderTaskIconDom() {
    const ti = document.getElementById('tpl-icon');
    const libHidden = document.getElementById('tpl-icon-library');
    const trigger = document.getElementById('tpl-form-icon-trigger');
    const raw = currentFormIcon != null ? String(currentFormIcon) : '';
    const ic = raw.trim();
    if (ti) ti.value = ic;
    if (!trigger) return;
    const has = !!ic;
    const libForTpl = has ? String(currentFormIconLibrary || 'Ionicons').trim() || 'Ionicons' : 'Ionicons';
    if (libHidden) libHidden.value = libForTpl;
    if (!has) currentFormIconLibrary = 'Ionicons';
    trigger.style.background = has ? '#eff6ff' : '#f8fafc';
    trigger.style.border = has ? '1px solid #3b82f6' : '1px dashed #cbd5e1';
    if (has) {
        try {
            trigger.innerHTML = window.renderWebIcon(libForTpl, ic, lastIconPickerColor, 22);
        } catch (eR) {
            trigger.innerHTML =
                '<ion-icon name="' +
                escapeHtmlAttr(ic) +
                '" style="font-size:22px;color:' +
                escapeHtmlAttr(lastIconPickerColor || '#1d4ed8') +
                ';"></ion-icon>';
        }
    } else {
        trigger.innerHTML =
            '<ion-icon name="images-outline" style="font-size:22px;color:#94a3b8;"></ion-icon>';
    }
    if (typeof window.scheduleBuilderDirtyRecompute === 'function') window.scheduleBuilderDirtyRecompute();
}

function mergeGlobalFormSettingsFromCopilot(incoming) {
    const base = Object.assign(
        {
            requireGlobalGeofence: false,
            globalGeofenceRadius: 200,
            rules: [],
            appFillMode: 'full',
            appSectionStart: 'direct',
            appHubSectionOrder: 'free',
            expectedFormDurationMinutes: undefined,
        },
        incoming && typeof incoming === 'object' ? incoming : {},
    );
    if (!base.rules) base.rules = [];
    base.appFillMode = normalizeAppFillMode(base.appFillMode);
    base.appSectionStart = normalizeAppSectionStart(base.appSectionStart);
    base.appHubSectionOrder = normalizeAppHubSectionOrder(base.appHubSectionOrder);
    return base;
}

function pushCopilotUndoSnapshot() {
    window.__brsparkSchemaUndoStack = window.__brsparkSchemaUndoStack || [];
    try {
        window.__brsparkSchemaUndoStack.push(
            JSON.stringify({
                v: 4,
                fields: JSON.parse(JSON.stringify(fields)),
                settings: JSON.parse(JSON.stringify(globalFormSettings || {})),
                taskIcon: typeof currentFormIcon === 'string' ? currentFormIcon : '',
                taskIconLibrary:
                    typeof currentFormIconLibrary === 'string' ? currentFormIconLibrary : 'Ionicons',
                formTitle: typeof currentFormTitle === 'string' ? currentFormTitle : '',
            }),
        );
    } catch (eSnap) {
        try {
            window.__brsparkSchemaUndoStack.push(JSON.stringify(fields));
        } catch (e2) {
            /* ignore */
        }
    }
}

function parseCopilotUndoEntry(raw) {
    try {
        const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (o && (o.v === 3 || o.v === 4) && Array.isArray(o.fields)) {
            return {
                fields: o.fields,
                settings: o.settings && typeof o.settings === 'object' ? o.settings : {},
                taskIcon: o.taskIcon != null ? String(o.taskIcon) : '',
                taskIconLibrary:
                    o.taskIconLibrary != null ? String(o.taskIconLibrary) : 'Ionicons',
                formTitle: o.v === 4 && o.formTitle != null ? String(o.formTitle) : null,
            };
        }
        if (o && o.v === 2 && Array.isArray(o.fields)) {
            return {
                fields: o.fields,
                settings: o.settings && typeof o.settings === 'object' ? o.settings : {},
                taskIconSkip: true,
            };
        }
        if (Array.isArray(o)) return { fields: o, settings: null, taskIconSkip: true };
    } catch (eP) {
        /* ignore */
    }
    return null;
}

/* ---------- Copiloto IA (chat + patch + lógica) ---------- */
if (typeof window.__brsparkCopilotMessages === 'undefined') window.__brsparkCopilotMessages = [];
if (typeof window.__brsparkSchemaUndoStack === 'undefined') window.__brsparkSchemaUndoStack = [];
if (typeof window.__brsparkCopilotSpreadsheetSummary === 'undefined') window.__brsparkCopilotSpreadsheetSummary = '';
if (typeof window.__brsparkCopilotSpreadsheetFileName === 'undefined') window.__brsparkCopilotSpreadsheetFileName = '';
/** @type {{ fileName: string, summary: string }[]} resumos por arquivo (referência acumulada no copiloto) */
if (typeof window.__brsparkCopilotReferenceSummaries === 'undefined') window.__brsparkCopilotReferenceSummaries = [];
if (typeof window.__brsparkCopilotThinkingCount === 'undefined') window.__brsparkCopilotThinkingCount = 0;
if (typeof window.__brsparkCopilotClarifyOptions === 'undefined') window.__brsparkCopilotClarifyOptions = [];
/** @type {Record<string, { cid: string, label: string }[]>} seleções por id de pergunta (copiloto — multi-opção). */
if (typeof window.__brsparkCopilotClarifySelections === 'undefined') window.__brsparkCopilotClarifySelections = {};

function beginCopilotThinking(label) {
    window.__brsparkCopilotThinkingCount = (window.__brsparkCopilotThinkingCount || 0) + 1;
    if (label && String(label).trim()) {
        window.__brsparkCopilotThinkingLabel = String(label).trim();
    }
    refreshCopilotThinkingDom();
}

function endCopilotThinking() {
    window.__brsparkCopilotThinkingCount = Math.max(0, (window.__brsparkCopilotThinkingCount || 0) - 1);
    if (!window.__brsparkCopilotThinkingCount) {
        delete window.__brsparkCopilotThinkingLabel;
    }
    refreshCopilotThinkingDom();
}

/** Atualiza só o rótulo da faixa «a pensar» (para SSE sem empilhar beginCopilotThinking). */
function copilotSetThinkingMessage(msg) {
    if ((window.__brsparkCopilotThinkingCount || 0) <= 0) return;
    const t = String(msg || '').trim();
    window.__brsparkCopilotThinkingLabel = t || 'A IA está pensando…';
    refreshCopilotThinkingDom();
}

function refreshCopilotThinkingDom() {
    const n = window.__brsparkCopilotThinkingCount || 0;
    const on = n > 0;
    const strip = document.getElementById('ai-copilot-thinking');
    if (strip) {
        strip.classList.toggle('is-visible', on);
        strip.setAttribute('aria-busy', on ? 'true' : 'false');
    }
    const lab = document.getElementById('ai-copilot-thinking-label');
    if (lab) {
        lab.textContent = window.__brsparkCopilotThinkingLabel || 'A IA está pensando…';
    }
    const dis = on;
    const send = document.getElementById('ai-copilot-send-fab');
    if (send) send.disabled = dis;
    const clearB = document.getElementById('ai-copilot-clear-btn');
    if (clearB) clearB.disabled = dis;
    const inp = document.getElementById('ai-copilot-input');
    if (inp) inp.disabled = dis;
    const sug = document.getElementById('ai-copilot-suggest-logic-btn');
    if (sug) sug.disabled = dis;
    const clarifyBtns = document.querySelectorAll('.ai-copilot-clarify-choice');
    clarifyBtns.forEach(function (b) {
        b.disabled = dis;
    });
    const clarifySend = document.getElementById('ai-copilot-clarify-send-btn');
    if (clarifySend) clarifySend.disabled = dis;
    const pick = document.getElementById('copilot-excel-pick-btn');
    if (pick) pick.disabled = dis || !!window.__brsparkCopilotExcelBusy;
    const clrSheet = document.getElementById('copilot-excel-clear-btn');
    if (clrSheet) clrSheet.disabled = dis;
    const panel = document.getElementById('ai-copilot-panel');
    if (panel) panel.setAttribute('aria-busy', on ? 'true' : 'false');
    const scrollHost = document.querySelector('#ai-copilot-panel .ai-copilot-chat-scroll');
    if (scrollHost && on) {
        try {
            scrollHost.scrollTop = scrollHost.scrollHeight;
        } catch (eScroll) {
            /* ignore */
        }
    }
    const pinSel = document.getElementById('copilot-pin-selection-btn');
    if (pinSel) pinSel.disabled = dis;
    const fol = document.getElementById('copilot-follow-canvas');
    if (fol) fol.disabled = dis;
    const cfc = document.getElementById('copilot-clear-focus-btn');
    if (cfc) cfc.disabled = dis;
    updateCopilotExcelUi();
}

function buildCopilotSpreadsheetSummaryFromAnalyze(data, fileName) {
    const parts = [];
    parts.push(
        '### Análise do arquivo anexado ao Copiloto (Excel, Word, PDF, imagem OCR, JSON BrSpark, JSON Google Forms / outros sistemas)',
    );
    parts.push('Arquivo: ' + String(fileName || '—'));
    if (data && data.title) parts.push('Título sugerido pela IA: ' + String(data.title).trim());
    if (data && data.description) parts.push('Descrição sugerida: ' + String(data.description).trim());
    const blocks = data && Array.isArray(data.blocks) ? data.blocks : [];
    parts.push('Estrutura extraída (' + blocks.length + ' blocos):');
    blocks.forEach(function (b) {
        if (!b || typeof b !== 'object') return;
        const kind = b.kind === 'section_break' ? 'Etapa' : 'Campo';
        let line = '- ' + kind + ': ' + String(b.label || '').trim();
        if (b.context) line += ' — ' + String(b.context).slice(0, 160);
        if (b.kind !== 'section_break' && b.suggestedType) line += ' [tipo sugerido: ' + String(b.suggestedType) + ']';
        parts.push(line);
    });
    if (data && data.truncated) parts.push('Aviso: conteúdo da planilha foi truncado no servidor antes da análise.');
    const w = data && data.warnings;
    if (Array.isArray(w) && w.length) parts.push('Avisos da análise: ' + w.filter(Boolean).join(' | '));
    let s = parts.join('\n');
    if (s.length > 11800) s = s.slice(0, 11800) + '\n…[resumo truncado para o limite do copiloto]';
    return s;
}

var BRSPARK_COPILOT_REF_MAX_TOTAL = 22000;
var BRSPARK_COPILOT_REF_MAX_FILES = 10;

function brsparkCopilotReferenceFileNameOk(lowerName) {
    var n = String(lowerName || '').toLowerCase();
    return (
        n.endsWith('.xlsx') ||
        n.endsWith('.xlsm') ||
        n.endsWith('.docx') ||
        n.endsWith('.pdf') ||
        n.endsWith('.png') ||
        n.endsWith('.jpg') ||
        n.endsWith('.jpeg') ||
        n.endsWith('.webp') ||
        n.endsWith('.json')
    );
}

function rebuildCopilotSpreadsheetSummaryFromRefs() {
    var arr = window.__brsparkCopilotReferenceSummaries || [];
    if (!arr.length) {
        window.__brsparkCopilotSpreadsheetSummary = '';
        window.__brsparkCopilotSpreadsheetFileName = '';
        return;
    }
    var joined = arr
        .map(function (x) {
            return x && x.summary ? String(x.summary) : '';
        })
        .filter(Boolean)
        .join('\n\n---\n\n');
    var summary = joined;
    if (summary.length > BRSPARK_COPILOT_REF_MAX_TOTAL) {
        summary = summary.slice(0, BRSPARK_COPILOT_REF_MAX_TOTAL) + '\n…[resumo total dos arquivos truncado]';
    }
    window.__brsparkCopilotSpreadsheetSummary = summary;
    window.__brsparkCopilotSpreadsheetFileName = arr
        .map(function (x) {
            return x && x.fileName ? String(x.fileName) : 'arquivo';
        })
        .join(' · ');
}

function copilotSetContextDetailsOpen(shouldOpen) {
    const d = document.getElementById('copilot-context-details');
    if (d) d.open = !!shouldOpen;
}

function copilotSetLogicDetailsOpen(shouldOpen) {
    const d = document.getElementById('copilot-logic-details');
    if (d) d.open = !!shouldOpen;
}

window.brsparkCopilotPickExcelFile = function () {
    copilotSetContextDetailsOpen(true);
    const fi = document.getElementById('copilot-excel-file');
    if (fi) fi.click();
};

function updateCopilotExcelUi() {
    const btn = document.getElementById('copilot-excel-clear-btn');
    const pick = document.getElementById('copilot-excel-pick-btn');
    const has = !!(window.__brsparkCopilotSpreadsheetSummary && String(window.__brsparkCopilotSpreadsheetSummary).trim());
    if (btn) btn.style.display = has ? 'inline-flex' : 'none';
    if (pick) {
        pick.disabled = !!(window.__brsparkCopilotExcelBusy || (window.__brsparkCopilotThinkingCount || 0) > 0);
    }
}

function renderCopilotMessages() {
    const root = document.getElementById('ai-copilot-messages');
    if (!root) return;
    root.innerHTML = '';
    const msgs = window.__brsparkCopilotMessages || [];
    const visible = msgs.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && !m.hiddenFromUi;
    });
    if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'ai-copilot-empty';
        const t1 = document.createElement('strong');
        t1.textContent = 'Conversa com o Copiloto';
        empty.appendChild(t1);
        const t2 = document.createElement('span');
        t2.textContent =
            'Em formulário novo, descreva o caso (área, quem preenche, objetivo). O Copiloto age como especialista do domínio e propõe um **primeiro rascunho amplo** (seções, muitos campos — em geral opcionais — e listas com opções), além de recursos quando fizer sentido (foto com carimbo, código de barras, GPS, etc.). Pode focar um campo no canvas para refinar. Use «Desfazer última alteração» se precisar. Opcional: anexe arquivos em «Avançado».';
        empty.appendChild(t2);
        root.appendChild(empty);
        return;
    }
    visible.forEach(function (m) {
        if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
        const row = document.createElement('div');
        row.className = 'ai-copilot-msg-row ' + (m.role === 'user' ? 'user' : 'assistant');
        const meta = document.createElement('div');
        meta.className = 'ai-copilot-msg-meta';
        meta.textContent = m.role === 'user' ? 'Você' : 'Copiloto';
        const div = document.createElement('div');
        div.className = 'ai-copilot-bubble ' + (m.role === 'user' ? 'user' : 'assistant');
        div.textContent = String(m.content || '');
        row.appendChild(meta);
        row.appendChild(div);
        root.appendChild(row);
    });
    const scrollHost = document.querySelector('#ai-copilot-panel .ai-copilot-chat-scroll');
    if (scrollHost) {
        try {
            scrollHost.scrollTop = scrollHost.scrollHeight;
        } catch (eSc) {
            /* ignore */
        }
    }
}

function brsparkCopilotCountOperationalFields() {
    if (!Array.isArray(fields)) return 0;
    var n = 0;
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (!f || !f.type) continue;
        if (String(f.type) !== 'section_break') n += 1;
    }
    return n;
}

/**
 * Primeira mensagem automática quando o copiloto abre com canvas vazio e conversa limpa (entrevista de requisitos).
 */
async function brsparkCopilotMaybeAutoDiscoveryInterview() {
    try {
        const p = document.getElementById('ai-copilot-panel');
        if (!p || !p.classList.contains('is-open')) return;
        if ((window.__brsparkCopilotThinkingCount || 0) > 0) return;
        if (window.__brsparkCopilotExcelBusy) return;
        if (window.__brsparkCopilotSpreadsheetSummary && String(window.__brsparkCopilotSpreadsheetSummary).trim()) return;
        if (window.__brsparkCopilotReferenceSummaries && window.__brsparkCopilotReferenceSummaries.length) return;
        var msgs = window.__brsparkCopilotMessages || [];
        if (msgs.length) return;
        if (brsparkCopilotCountOperationalFields() > 0) return;
        if (!brsparkAdminBearerToken()) return;
        var seed =
            'Quero criar um formulário novo. Cumprimente em breve; em seguida, peça só o mínimo de contexto necessário e, **assim que souber o tipo de formulário e o público**, entregue **logo** um primeiro rascunho **denso** no schemaPatch (várias section_break, muitos campos típicos do setor, maioria opcional, opções preenchidas em escolhas). Use clarifyOptions só para bifurcações inevitáveis — não substitua um rascunho completo por perguntas genéricas.';
        await brsparkCopilotPostChatRound(seed, { hideUserBubble: true });
        var inpAfter = document.getElementById('ai-copilot-input');
        if (inpAfter) {
            try {
                inpAfter.focus();
            } catch (eFa) {
                /* ignore */
            }
        }
    } catch (e) {
        console.warn('[checklists-builder] auto discovery:', e && e.message ? e.message : e);
    }
}

/** Sincroniza rótulos ARIA e texto do botão do menu lateral do copiloto. */
function brsparkCopilotSyncSideMenuUi() {
    const p = document.getElementById('ai-copilot-panel');
    const btn = document.getElementById('ai-copilot-menu-toggle-btn');
    const menu = document.getElementById('ai-copilot-side-menu');
    if (!p || !btn) return;
    const collapsed = p.classList.contains('ai-copilot-menu-collapsed');
    const menuOpen = !collapsed;
    btn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    const label = btn.querySelector('.ai-copilot-menu-toggle-label');
    if (label) label.textContent = menuOpen ? 'Ocultar opções' : 'Opções';
    if (menu) menu.setAttribute('aria-hidden', menuOpen ? 'false' : 'true');
}

/**
 * Abre ou fecha a coluna «Opções e contexto».
 * @param {boolean} [force] true = abrir; false = fechar; omitido = alternar.
 */
window.brsparkCopilotToggleSideMenu = function (force) {
    const p = document.getElementById('ai-copilot-panel');
    if (!p) return;
    if (force === true) {
        p.classList.remove('ai-copilot-menu-collapsed');
    } else if (force === false) {
        p.classList.add('ai-copilot-menu-collapsed');
    } else {
        p.classList.toggle('ai-copilot-menu-collapsed');
    }
    brsparkCopilotSyncSideMenuUi();
};

function brsparkCopilotSetSideMenuOpen(open) {
    const p = document.getElementById('ai-copilot-panel');
    if (!p) return;
    p.classList.toggle('ai-copilot-menu-collapsed', !open);
    brsparkCopilotSyncSideMenuUi();
}

window.toggleAiCopilotPanel = function () {
    const p = document.getElementById('ai-copilot-panel');
    if (!p) return;
    const open = !p.classList.contains('is-open');
    p.classList.toggle('is-open', open);
    p.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
        if (typeof window.ensureBrsparkCopilotPanelsOnBody === 'function') {
            window.ensureBrsparkCopilotPanelsOnBody();
        }
        brsparkCopilotBindPanelDrag();
        requestAnimationFrame(function () {
            brsparkCopilotApplySavedPanelPosition();
        });
        brsparkCopilotSyncSideMenuUi();
        renderCopilotMessages();
        updateCopilotExcelUi();
        refreshCopilotThinkingDom();
        window.refreshCopilotCanvasFocusChip();
        if (window.__brsparkCopilotClarifyOptions && window.__brsparkCopilotClarifyOptions.length) {
            brsparkCopilotSetSideMenuOpen(true);
        }
        const inpFocus = document.getElementById('ai-copilot-input');
        if (inpFocus) {
            try {
                requestAnimationFrame(function () {
                    inpFocus.focus();
                });
            } catch (eF) {
                /* ignore */
            }
        }
        setTimeout(function () {
            void brsparkCopilotMaybeAutoDiscoveryInterview();
        }, 0);
    }
};

window.brsparkCopilotInputKeydown = function (e) {
    if (!e || e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    window.brsparkCopilotSend();
};

window.brsparkCopilotClear = function () {
    var prevModal = document.getElementById('copilot-schema-preview-modal');
    if (prevModal && prevModal.classList.contains('is-open') && typeof window.brsparkCopilotCloseSchemaPreview === 'function') {
        window.brsparkCopilotCloseSchemaPreview(false);
    }
    window.__brsparkCopilotMessages = [];
    renderCopilotMessages();
    window.__brsparkCopilotLast = null;
    window.__brsparkCopilotLogicLast = null;
    window.__brsparkCopilotSpreadsheetSummary = '';
    window.__brsparkCopilotSpreadsheetFileName = '';
    window.__brsparkCopilotReferenceSummaries = [];
    window.__brsparkCopilotThinkingCount = 0;
    delete window.__brsparkCopilotThinkingLabel;
    refreshCopilotThinkingDom();
    const fi = document.getElementById('copilot-excel-file');
    if (fi) fi.value = '';
    const st = document.getElementById('copilot-excel-status');
    if (st) st.textContent = '';
    updateCopilotExcelUi();
    window.__brsparkCopilotClarifyOptions = [];
    renderCopilotClarifyCards();
    const ch = document.getElementById('ai-copilot-clarify-hint');
    if (ch) ch.style.display = 'none';
    const ragFoot = document.getElementById('copilot-rag-footnote');
    if (ragFoot) ragFoot.textContent = '';
};

window.brsparkCopilotClearSpreadsheet = function () {
    window.__brsparkCopilotSpreadsheetSummary = '';
    window.__brsparkCopilotSpreadsheetFileName = '';
    window.__brsparkCopilotReferenceSummaries = [];
    const fi = document.getElementById('copilot-excel-file');
    if (fi) fi.value = '';
    const st = document.getElementById('copilot-excel-status');
    if (st) st.textContent = 'Arquivos de referência removidos do contexto.';
    updateCopilotExcelUi();
};

function renderCopilotClarifyCards() {
    const host = document.getElementById('ai-copilot-clarify');
    if (!host) return;
    host.innerHTML = '';
    window.__brsparkCopilotClarifySelections = {};
    const list = window.__brsparkCopilotClarifyOptions || [];
    if (!list.length) return;
    list.forEach(function (block) {
        if (!block || !block.question) return;
        const wrap = document.createElement('div');
        wrap.className = 'ai-copilot-clarify-block';
        const q = document.createElement('p');
        q.className = 'ai-copilot-clarify-q';
        q.textContent = block.question;
        wrap.appendChild(q);
        const row = document.createElement('div');
        row.className = 'ai-copilot-clarify-choices';
        const qid = String(block.id || '');
        (block.choices || []).forEach(function (ch) {
            if (!ch || !ch.label) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-outline btn-sm ai-copilot-clarify-choice';
            b.textContent = ch.label;
            b.setAttribute('aria-pressed', 'false');
            const cid = String(ch.id || '');
            const lab = String(ch.label || '');
            b.addEventListener('click', function () {
                window.brsparkCopilotToggleClarifyChoice(qid, cid, lab, b);
            });
            row.appendChild(b);
        });
        wrap.appendChild(row);
        host.appendChild(wrap);
    });
    const foot = document.createElement('div');
    foot.className = 'ai-copilot-clarify-footer';
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.id = 'ai-copilot-clarify-send-btn';
    sendBtn.className = 'btn btn-primary btn-sm';
    sendBtn.textContent = 'Enviar escolhas';
    sendBtn.addEventListener('click', function () {
        window.brsparkCopilotSendClarifySelections();
    });
    foot.appendChild(sendBtn);
    host.appendChild(foot);
}

/** Alterna opção nas perguntas de clarificação (várias por pergunta). */
window.brsparkCopilotToggleClarifyChoice = function (questionId, choiceId, choiceLabel, btnEl) {
    const qid = String(questionId || '').trim();
    const cid = String(choiceId || '').trim();
    const lab = String(choiceLabel || '').trim();
    if (!qid || !cid || !lab) return;
    window.__brsparkCopilotClarifySelections = window.__brsparkCopilotClarifySelections || {};
    if (!window.__brsparkCopilotClarifySelections[qid]) window.__brsparkCopilotClarifySelections[qid] = [];
    const arr = window.__brsparkCopilotClarifySelections[qid];
    const ix = arr.findIndex(function (x) {
        return x && x.cid === cid;
    });
    if (ix >= 0) {
        arr.splice(ix, 1);
        if (btnEl) {
            btnEl.classList.remove('is-selected');
            btnEl.setAttribute('aria-pressed', 'false');
        }
    } else {
        arr.push({ cid: cid, label: lab });
        if (btnEl) {
            btnEl.classList.add('is-selected');
            btnEl.setAttribute('aria-pressed', 'true');
        }
    }
};

/** Monta mensagem com todas as perguntas respondidas e envia o chat. */
window.brsparkCopilotSendClarifySelections = function () {
    window.__brsparkCopilotClarifySelections = window.__brsparkCopilotClarifySelections || {};
    const list = window.__brsparkCopilotClarifyOptions || [];
    const lines = [];
    list.forEach(function (block) {
        if (!block) return;
        const qid = String(block.id || '').trim();
        if (!qid) return;
        const sel = window.__brsparkCopilotClarifySelections[qid];
        if (!sel || !sel.length) return;
        const labels = sel
            .map(function (s) {
                return s && s.label ? String(s.label).trim() : '';
            })
            .filter(Boolean);
        if (!labels.length) return;
        lines.push('[Pergunta ' + qid + '] ' + labels.join(', '));
    });
    if (!lines.length) {
        fbAlert(
            'fb_alert_clarify_options',
            null,
            'Marque pelo menos uma opção em alguma pergunta, ou escreva na caixa de texto.'
        );
        return;
    }
    const inp = document.getElementById('ai-copilot-input');
    if (inp) inp.value = lines.join('\n');
    window.brsparkCopilotSend();
};

window.ensureBrsparkCopilotPanelsOnBody = function () {
    ['ai-copilot-panel', 'copilot-schema-preview-modal'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.parentNode !== document.body) {
            document.body.appendChild(el);
        }
    });
};

var __brsparkCopilotDragState = null;
var __brsparkCopilotDragBindDone = false;
var __brsparkCopilotResizeTimer = null;
var BRSPARK_COPILOT_POS_KEY = 'brsparkCopilotPanelPos';

function brsparkCopilotFloatingDragEnabled() {
    try {
        return typeof window.matchMedia === 'function' && !window.matchMedia('(max-width: 700px)').matches;
    } catch (eM) {
        return true;
    }
}

function brsparkCopilotClearPanelPositionStyles() {
    var panel = document.getElementById('ai-copilot-panel');
    if (!panel) return;
    ['left', 'top', 'right', 'bottom'].forEach(function (k) {
        panel.style.removeProperty(k);
    });
}

function brsparkCopilotClampPanelToViewport() {
    var panel = document.getElementById('ai-copilot-panel');
    if (!panel || !panel.classList.contains('is-open')) return;
    if (!brsparkCopilotFloatingDragEnabled()) return;
    var margin = 8;
    var r = panel.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var nl = r.left;
    var nt = r.top;
    if (nl < margin) nl = margin;
    if (nt < margin) nt = margin;
    if (nl + r.width > vw - margin) nl = Math.max(margin, vw - r.width - margin);
    if (nt + r.height > vh - margin) nt = Math.max(margin, vh - r.height - margin);
    panel.style.left = Math.round(nl) + 'px';
    panel.style.top = Math.round(nt) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function brsparkCopilotResetPanelPosition() {
    var panel = document.getElementById('ai-copilot-panel');
    if (!panel) return;
    try {
        sessionStorage.removeItem(BRSPARK_COPILOT_POS_KEY);
    } catch (eR) {
        /* ignore */
    }
    brsparkCopilotClearPanelPositionStyles();
    if (brsparkCopilotFloatingDragEnabled()) {
        requestAnimationFrame(function () {
            brsparkCopilotClampPanelToViewport();
        });
    }
}

function brsparkCopilotApplySavedPanelPosition() {
    var panel = document.getElementById('ai-copilot-panel');
    if (!panel || !panel.classList.contains('is-open')) return;
    if (!brsparkCopilotFloatingDragEnabled()) return;
    var raw;
    try {
        raw = sessionStorage.getItem(BRSPARK_COPILOT_POS_KEY);
    } catch (eS) {
        return;
    }
    if (!raw) return;
    var o;
    try {
        o = JSON.parse(raw);
    } catch (eJ) {
        return;
    }
    if (typeof o.left !== 'number' || typeof o.top !== 'number') return;
    if (!isFinite(o.left) || !isFinite(o.top)) return;
    panel.style.left = Math.round(o.left) + 'px';
    panel.style.top = Math.round(o.top) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    brsparkCopilotClampPanelToViewport();
}

function brsparkCopilotSavePanelPosition() {
    var panel = document.getElementById('ai-copilot-panel');
    if (!panel) return;
    var r = panel.getBoundingClientRect();
    try {
        sessionStorage.setItem(
            BRSPARK_COPILOT_POS_KEY,
            JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) })
        );
    } catch (eW) {
        /* ignore */
    }
}

function brsparkCopilotOnPanelDragMove(e) {
    var st = __brsparkCopilotDragState;
    if (!st || !st.panel) return;
    var dx = e.clientX - st.startX;
    var dy = e.clientY - st.startY;
    var nl = st.startLeft + dx;
    var nt = st.startTop + dy;
    st.panel.style.left = Math.round(nl) + 'px';
    st.panel.style.top = Math.round(nt) + 'px';
    st.panel.style.right = 'auto';
    st.panel.style.bottom = 'auto';
    brsparkCopilotClampPanelToViewport();
}

function brsparkCopilotOnPanelDragEnd() {
    var st = __brsparkCopilotDragState;
    if (!st) return;
    __brsparkCopilotDragState = null;
    var panel = st.panel;
    if (panel) {
        panel.classList.remove('is-dragging-copilot');
        panel.removeEventListener('pointermove', brsparkCopilotOnPanelDragMove);
        panel.removeEventListener('pointerup', brsparkCopilotOnPanelDragEnd);
        panel.removeEventListener('pointercancel', brsparkCopilotOnPanelDragEnd);
        try {
            if (st.pid != null) panel.releasePointerCapture(st.pid);
        } catch (eC) {
            /* ignore */
        }
        brsparkCopilotSavePanelPosition();
    }
}

function brsparkCopilotOnPanelDragStart(e) {
    if (!brsparkCopilotFloatingDragEnabled()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var head = e.currentTarget;
    if (!head) return;
    var panel = document.getElementById('ai-copilot-panel');
    if (!panel || !panel.classList.contains('is-open')) return;
    if (e.target.closest && e.target.closest('button')) return;
    if (e.target.closest && e.target.closest('input, textarea, a, select')) return;
    var r = panel.getBoundingClientRect();
    __brsparkCopilotDragState = {
        panel: panel,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: r.left,
        startTop: r.top,
        pid: e.pointerId,
    };
    panel.classList.add('is-dragging-copilot');
    if (!panel.style.left) {
        panel.style.left = Math.round(r.left) + 'px';
        panel.style.top = Math.round(r.top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }
    panel.addEventListener('pointermove', brsparkCopilotOnPanelDragMove);
    panel.addEventListener('pointerup', brsparkCopilotOnPanelDragEnd);
    panel.addEventListener('pointercancel', brsparkCopilotOnPanelDragEnd);
    try {
        panel.setPointerCapture(e.pointerId);
    } catch (eCap) {
        /* ignore */
    }
    e.preventDefault();
}

function brsparkCopilotBindPanelDrag() {
    if (__brsparkCopilotDragBindDone) return;
    var panel = document.getElementById('ai-copilot-panel');
    var head = panel && panel.querySelector('.ai-copilot-head');
    if (!panel || !head) return;
    __brsparkCopilotDragBindDone = true;
    head.addEventListener('pointerdown', brsparkCopilotOnPanelDragStart);
    head.addEventListener('dblclick', function (e) {
        if (!brsparkCopilotFloatingDragEnabled()) return;
        if (e.target.closest && e.target.closest('button')) return;
        e.preventDefault();
        brsparkCopilotResetPanelPosition();
    });
    window.addEventListener(
        'resize',
        function () {
            clearTimeout(__brsparkCopilotResizeTimer);
            __brsparkCopilotResizeTimer = setTimeout(function () {
                var p = document.getElementById('ai-copilot-panel');
                if (!p || !p.classList.contains('is-open')) return;
                if (brsparkCopilotFloatingDragEnabled()) {
                    brsparkCopilotClampPanelToViewport();
                } else {
                    brsparkCopilotClearPanelPositionStyles();
                }
            }, 120);
        },
        { passive: true }
    );
}

function brsparkCopilotDeepClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        return obj;
    }
}

/** [type, rótulo curto pt] — alinhado ao catálogo do builder / formAiFieldCatalog. */
var COPILOT_PREVIEW_FIELD_TYPE_LABELS = [
    ['section_break', 'Etapa (section_break)'],
    ['leitura', 'Leitura (só texto)'],
    ['voice_note', 'Nota de voz'],
    ['text', 'Texto'],
    ['number', 'Número'],
    ['phone', 'Telefone'],
    ['email', 'E-mail'],
    ['date', 'Data / hora'],
    ['checkbox', 'Checkbox'],
    ['yes_no', 'Sim / Não'],
    ['dropdown', 'Lista (uma)'],
    ['multiselect', 'Lista (várias)'],
    ['rating', 'Classificação'],
    ['file_upload', 'Anexo'],
    ['photo', 'Foto'],
    ['signature', 'Assinatura'],
    ['signature_summary', 'Resumo + assinatura'],
    ['materials_consumption', 'Consumo de materiais'],
    ['materials_receipt', 'Recebimento de materiais'],
    ['technician_finance', 'Financeiro técnico'],
    ['location_pick', 'Local no mapa'],
    ['hidden', 'Oculto'],
    ['photo_stamped', 'Foto carimbo GPS'],
    ['barcode_scan', 'Código de barras'],
    ['facial_recognition', 'Biometria facial'],
    ['vision_checklist', 'Visão de IA Detecção'],
    ['vision_ai_analysis', 'Visão de IA Análise'],
    ['image_annotation', 'Foto com anotações'],
    ['lookup_select', 'Lista dinâmica'],
    ['repeatable_matrix', 'Matriz repetível'],
    ['opinion_scale', 'Escala NPS / Likert'],
    ['transit_start', 'Início deslocamento'],
    ['transit_end', 'Fim deslocamento'],
    ['geofence_check', 'Cerca / geofence'],
    ['calculated', 'Calculado'],
];

var COPILOT_PREVIEW_ALLOWED_TYPES = (function () {
    var s = {};
    COPILOT_PREVIEW_FIELD_TYPE_LABELS.forEach(function (p) {
        s[p[0]] = true;
    });
    return s;
})();

function brsparkCopilotPreviewTypeLabel(type) {
    var t = String(type || '').trim();
    for (var i = 0; i < COPILOT_PREVIEW_FIELD_TYPE_LABELS.length; i++) {
        if (COPILOT_PREVIEW_FIELD_TYPE_LABELS[i][0] === t) return COPILOT_PREVIEW_FIELD_TYPE_LABELS[i][1];
    }
    return t || '—';
}

/** Recria o objeto do campo com defaults do novo tipo, preservando id e metadados editados na revisão. */
function brsparkCopilotRehydrateFieldForTypeChange(oldField, newType, st) {
    var nt = String(newType || '').trim();
    if (!nt || !COPILOT_PREVIEW_ALLOWED_TYPES[nt]) return brsparkCopilotDeepClone(oldField);
    var lab = oldField.label != null ? String(oldField.label) : 'Campo';
    var nf = createNewFieldFromToolboxType(nt, lab);
    nf.id = String(oldField.id);
    if (st && st.description !== undefined && st.description !== null) {
        nf.description = String(st.description).trim().slice(0, 500);
    } else if (oldField.description != null) {
        nf.description = String(oldField.description);
    }
    if (st) nf.required = !!st.required;
    if (oldField.icon) nf.icon = oldField.icon;
    if (oldField.iconLibrary) nf.iconLibrary = oldField.iconLibrary;
    if (oldField.iconColor) nf.iconColor = oldField.iconColor;
    nf.rules = [];
    return nf;
}

function brsparkCopilotAppendPreviewTypeSelect(typCell, currentType) {
    var sel = document.createElement('select');
    sel.className = 'copilot-prev-type';
    sel.title = 'Tipo de campo no app';
    var cur = String(currentType || '').trim();
    var found = false;
    COPILOT_PREVIEW_FIELD_TYPE_LABELS.forEach(function (pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        if (pair[0] === cur) {
            opt.selected = true;
            found = true;
        }
        sel.appendChild(opt);
    });
    if (cur && !found) {
        var ox = document.createElement('option');
        ox.value = cur;
        ox.textContent = brsparkCopilotPreviewTypeLabel(cur) + ' (' + cur + ')';
        ox.selected = true;
        sel.insertBefore(ox, sel.firstChild);
    }
    if (cur === 'section_break') {
        sel.disabled = true;
        sel.title = 'Tipo de etapa fixo nesta revisão.';
    }
    typCell.appendChild(sel);
}

function brsparkCopilotCollectNewFieldPreviewRows(prevFields, proposedSchema) {
    var prevIds = new Set();
    (prevFields || []).forEach(function (f) {
        if (f && f.id) prevIds.add(String(f.id));
    });
    var rows = [];
    (proposedSchema || []).forEach(function (f) {
        if (!f || !f.id) return;
        if (prevIds.has(String(f.id))) return;
        rows.push({
            id: String(f.id),
            label: f.label != null ? String(f.label) : '',
            type: f.type != null ? String(f.type) : '',
            description: f.description != null ? String(f.description) : '',
            required: !!(f.required === true || f.required === 'true'),
        });
    });
    return rows;
}

function brsparkCopilotNeedsSchemaPreviewTable(data) {
    if (!data || !Array.isArray(data.schemaData)) return false;
    var rows = brsparkCopilotCollectNewFieldPreviewRows(fields, data.schemaData);
    if (!rows.length) return false;
    if (brsparkCopilotCountOperationalFields() === 0) return true;
    if (rows.length >= 2) return true;
    return false;
}

function brsparkCopilotMergePreviewIntoSchemaData(proposed, rowMap) {
    var prevIds = new Set();
    fields.forEach(function (f) {
        if (f && f.id) prevIds.add(String(f.id));
    });
    var out = [];
    (proposed || []).forEach(function (f) {
        if (!f || !f.id) return;
        var id = String(f.id);
        var copy = brsparkCopilotDeepClone(f);
        if (!prevIds.has(id)) {
            var st = rowMap[id];
            if (!st || !st.include) return;
            if (copy.type === 'section_break') {
                if (st.description !== undefined && st.description !== null) {
                    copy.description = String(st.description).trim().slice(0, 500);
                }
                out.push(copy);
                return;
            }
            var wantType = st.type && String(st.type).trim() && COPILOT_PREVIEW_ALLOWED_TYPES[String(st.type).trim()]
                ? String(st.type).trim()
                : copy.type;
            if (wantType !== copy.type) {
                copy = brsparkCopilotRehydrateFieldForTypeChange(copy, wantType, st);
            } else {
                copy.required = !!st.required;
                if (st.description !== undefined && st.description !== null) {
                    copy.description = String(st.description).trim().slice(0, 500);
                }
            }
        }
        out.push(copy);
    });
    return out;
}

function brsparkCopilotReadPreviewRowMapFromDom() {
    var map = {};
    var trs = document.querySelectorAll('#copilot-schema-preview-tbody tr[data-field-id]');
    trs.forEach(function (tr) {
        var id = tr.getAttribute('data-field-id');
        if (!id) return;
        var inc = tr.querySelector('.copilot-prev-include');
        var req = tr.querySelector('.copilot-prev-required');
        var desc = tr.querySelector('.copilot-prev-desc');
        var typ = tr.querySelector('.copilot-prev-type');
        var aiNote = tr.querySelector('.copilot-prev-ai-note');
        var typeVal = typ && !typ.disabled ? String(typ.value || '').trim() : '';
        map[id] = {
            include: !!(inc && (inc.checked || inc.disabled)),
            required: !!(req && req.checked),
            description: desc ? String(desc.value || '') : '',
            type: typeVal,
            aiNote: aiNote ? String(aiNote.value || '').trim() : '',
        };
    });
    return map;
}

function brsparkCopilotOpenSchemaPreviewModal(data) {
    window.ensureBrsparkCopilotPanelsOnBody();
    var rows = brsparkCopilotCollectNewFieldPreviewRows(fields, data.schemaData);
    var tbody = document.getElementById('copilot-schema-preview-tbody');
    var modal = document.getElementById('copilot-schema-preview-modal');
    var genTa = document.getElementById('copilot-schema-preview-general-note');
    if (!tbody || !modal) return;
    tbody.innerHTML = '';
    if (genTa) genTa.value = '';
    rows.forEach(function (r) {
        var isSec = r.type === 'section_break';
        var tr = document.createElement('tr');
        tr.setAttribute('data-field-id', r.id);
        var incCell = document.createElement('td');
        if (isSec) {
            incCell.innerHTML =
                '<input type="checkbox" class="copilot-prev-include" checked disabled title="Etapa — sempre incluída" />';
        } else {
            incCell.innerHTML = '<input type="checkbox" class="copilot-prev-include" checked />';
        }
        var labCell = document.createElement('td');
        labCell.textContent = r.label || '(sem rótulo)';
        var typCell = document.createElement('td');
        brsparkCopilotAppendPreviewTypeSelect(typCell, r.type || '');
        var descCell = document.createElement('td');
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'copilot-preview-desc copilot-prev-desc';
        inp.value = r.description || '';
        inp.placeholder = 'Descrição (opcional)';
        descCell.appendChild(inp);
        var aiCell = document.createElement('td');
        var aiTa = document.createElement('textarea');
        aiTa.className = 'copilot-prev-ai-note';
        aiTa.rows = 2;
        aiTa.placeholder = 'Instruções para a IA sobre este campo (opcional)';
        aiCell.appendChild(aiTa);
        var reqCell = document.createElement('td');
        if (isSec) {
            reqCell.innerHTML = '<span style="color:#94a3b8">—</span>';
        } else {
            var c = document.createElement('input');
            c.type = 'checkbox';
            c.className = 'copilot-prev-required';
            if (r.required) c.checked = true;
            reqCell.appendChild(c);
        }
        tr.appendChild(incCell);
        tr.appendChild(labCell);
        tr.appendChild(typCell);
        tr.appendChild(descCell);
        tr.appendChild(aiCell);
        tr.appendChild(reqCell);
        tbody.appendChild(tr);
    });
    window.__brsparkCopilotPreviewPayload = brsparkCopilotDeepClone(data);
    window.__brsparkCopilotDeferredLogicSuggestions = Array.isArray(data.logicSuggestions)
        ? data.logicSuggestions.slice()
        : [];
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
}

function brsparkCopilotCancelPendingCopilotProposal() {
    var d = window.__brsparkCopilotLast;
    if (d) {
        d.schemaPatch = null;
        d.logicSuggestions = [];
        try {
            d.schemaData = JSON.parse(JSON.stringify(fields));
        } catch (e) {
            d.schemaData = fields.slice();
        }
        d.settingsPatch = null;
        d.templateMetadataPatch = null;
        d.templateTitlePatch = null;
        delete d.templateTitleResolved;
        try {
            d.templateSettings = JSON.parse(JSON.stringify(globalFormSettings || {}));
        } catch (e2) {
            /* ignore */
        }
    }
    window.__brsparkCopilotLogicLast = [];
    window.__brsparkCopilotDeferredLogicSuggestions = [];
    delete window.__brsparkCopilotPreviewPayload;
}

window.brsparkCopilotPreviewMarkAllOptional = function () {
    document.querySelectorAll('#copilot-schema-preview-tbody .copilot-prev-required').forEach(function (el) {
        if (!el.disabled) el.checked = false;
    });
};

/** Fecha só o diálogo visual — não cancela a proposta em memória (para reprocessar via IA). */
window.brsparkCopilotHideSchemaPreviewModal = function () {
    var modal = document.getElementById('copilot-schema-preview-modal');
    if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }
};

function brsparkCopilotBuildReprocessInstructionMessage(rowMap, proposedSchema, generalNote) {
    var rows = brsparkCopilotCollectNewFieldPreviewRows(fields, proposedSchema);
    var lines = [];
    rows.forEach(function (r) {
        var st = rowMap[r.id];
        if (!st || !st.include) return;
        var bits = [];
        bits.push('tipo: `' + (st.type && COPILOT_PREVIEW_ALLOWED_TYPES[st.type] ? st.type : r.type) + '`');
        if (st.description) bits.push('descrição: «' + String(st.description).trim().slice(0, 280) + '»');
        bits.push('obrigatório: ' + (st.required ? 'sim' : 'não'));
        if (st.aiNote) bits.push('instruções: «' + String(st.aiNote).trim().slice(0, 600) + '»');
        lines.push('- **' + (r.label || r.id) + '** (`' + r.id + '`): ' + bits.join('; ') + '.');
    });
    var gn = String(generalNote || '').trim();
    var merged = brsparkCopilotMergePreviewIntoSchemaData(proposedSchema, rowMap);
    var jsonPart = '';
    try {
        jsonPart = JSON.stringify(merged);
        if (jsonPart.length > 12000) jsonPart = jsonPart.slice(0, 12000) + '\n…[truncado]';
    } catch (eJ) {
        jsonPart = '{}';
    }
    return (
        'Ainda **não** apliquei esta proposta no canvas. Com base nas instruções abaixo e no JSON (proposta já com tipo/descrição/obrigatoriedade da revisão), **devolva** um `schemaPatch` adequado (e `settingsPatch` / `logicSuggestions` / metadados se fizer sentido). **Preserve os `id`** dos campos quando possível.\n\n' +
        (gn ? '### Comentários gerais\n' + gn + '\n\n' : '') +
        (lines.length ? '### Por campo (só os marcados para incluir)\n' + lines.join('\n') + '\n\n' : '') +
        '### JSON da proposta após a revisão deste modal\n```json\n' +
        jsonPart +
        '\n```'
    );
}

window.brsparkCopilotReprocessSchemaPreview = async function () {
    var base = window.__brsparkCopilotPreviewPayload || window.__brsparkCopilotLast;
    if (!base || !Array.isArray(base.schemaData)) {
        fbAlert('fb_alert_copilot_reprocess', null, 'Sem proposta carregada para reprocessar.');
        return;
    }
    var rowMap = brsparkCopilotReadPreviewRowMapFromDom();
    var genEl = document.getElementById('copilot-schema-preview-general-note');
    var generalNote = genEl ? String(genEl.value || '') : '';
    var hasAny =
        generalNote.trim() ||
        Object.keys(rowMap).some(function (kid) {
            var st = rowMap[kid];
            return st && String(st.aiNote || '').trim();
        });
    if (!hasAny) {
        if (
            !confirm(
                'Não há comentários gerais nem instruções por campo. Mesmo assim enviar a proposta atual à IA para um novo rascunho?',
            )
        ) {
            return;
        }
    }
    var msg = brsparkCopilotBuildReprocessInstructionMessage(rowMap, base.schemaData, generalNote);
    window.brsparkCopilotHideSchemaPreviewModal();
    delete window.__brsparkCopilotPreviewPayload;
    await brsparkCopilotPostChatRound(msg);
};

window.brsparkCopilotCloseSchemaPreview = function (apply) {
    var modal = document.getElementById('copilot-schema-preview-modal');
    if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }
    if (!apply) {
        brsparkCopilotCancelPendingCopilotProposal();
        var ub = document.getElementById('ai-copilot-undo-btn');
        if (ub) ub.disabled = !(window.__brsparkSchemaUndoStack && window.__brsparkSchemaUndoStack.length);
        return;
    }
    var base = window.__brsparkCopilotPreviewPayload || window.__brsparkCopilotLast;
    if (!base) return;
    var rowMap = brsparkCopilotReadPreviewRowMapFromDom();
    var merged = brsparkCopilotMergePreviewIntoSchemaData(base.schemaData, rowMap);
    var data = brsparkCopilotDeepClone(base);
    data.schemaData = merged;
    data.schemaPatch = null;
    data.logicSuggestions = window.__brsparkCopilotDeferredLogicSuggestions || [];
    window.__brsparkCopilotLast = data;
    window.__brsparkCopilotLogicLast = data.logicSuggestions || [];
    delete window.__brsparkCopilotPreviewPayload;
    window.__brsparkCopilotDeferredLogicSuggestions = [];

    pushCopilotUndoSnapshot();
    window.brsparkCopilotApplyPatch({ skipUndoPush: true });
    if (window.__brsparkCopilotLogicLast && window.__brsparkCopilotLogicLast.length) {
        window.brsparkCopilotApplyLogic({ skipUndoPush: true });
    }
    var ub = document.getElementById('ai-copilot-undo-btn');
    if (ub) ub.disabled = !(window.__brsparkSchemaUndoStack && window.__brsparkSchemaUndoStack.length);
};

function brsparkCopilotCountOperationalInSchema(schema) {
    if (!Array.isArray(schema)) return 0;
    var n = 0;
    for (var i = 0; i < schema.length; i++) {
        var f = schema[i];
        if (f && f.type && String(f.type) !== 'section_break') n += 1;
    }
    return n;
}

function brsparkCopilotDeriveFallbackTaskTitle(schema, ctx) {
    var firstSec = null;
    for (var i = 0; i < (schema || []).length; i++) {
        var f = schema[i];
        if (f && f.type === 'section_break' && String(f.label || '').trim()) {
            firstSec = f;
            break;
        }
    }
    if (firstSec) return String(firstSec.label).trim().slice(0, 200);
    if (ctx && String(ctx.objective || '').trim()) return String(ctx.objective).trim().slice(0, 200);
    for (var j = 0; j < (schema || []).length; j++) {
        var g = schema[j];
        if (g && g.type && String(g.type) !== 'section_break' && String(g.label || '').trim()) {
            return String(g.label).trim().slice(0, 200);
        }
    }
    return 'Formulário';
}

function brsparkCopilotGuessTaskIconFromSchema(schema, ctx) {
    var parts = [];
    if (ctx && ctx.objective) parts.push(String(ctx.objective));
    (schema || []).forEach(function (f) {
        if (!f) return;
        if (f.label) parts.push(String(f.label));
        if (f.description) parts.push(String(f.description));
    });
    var blob = parts.join(' ').toLowerCase();
    var rules = [
        [/cirurg|pré-?op|pré op|paciente|clínico|médico|enferm|saúde|hospital|lgpd|consentimento/, 'medkit-outline'],
        [/vistor|inspe|auditor|nr-|nr\d|qualidade|checklist/, 'clipboard-outline'],
        [/veícul|frota|motor|carro|transport/, 'car-outline'],
        [/segurança|epi|incêndio|risco|nr-12/, 'shield-checkmark-outline'],
        [/manuten|os |ordem de serviço|técnico/, 'construct-outline'],
        [/estoque|material|almox/, 'cube-outline'],
        [/financeiro|pagamento|receita|despesa/, 'cash-outline'],
        [/assinatura|contrato|jurídico/, 'document-text-outline'],
        [/foto|imagem|câmera/, 'camera-outline'],
        [/localização|gps|mapa|rota/, 'location-outline'],
    ];
    for (var r = 0; r < rules.length; r++) {
        if (rules[r][0].test(blob)) return rules[r][1];
    }
    var types = {};
    (schema || []).forEach(function (f) {
        if (f && f.type) types[String(f.type)] = true;
    });
    if (types.signature || types.signature_summary) return 'create-outline';
    if (types.photo || types.photo_stamped) return 'images-outline';
    if (types.geofence_check || types.location_pick) return 'location-outline';
    if (types.vision_ai_analysis) return 'sparkles-outline';
    if (types.vision_checklist) return 'videocam-outline';
    if (types.opinion_scale) return 'analytics-outline';
    if (types.repeatable_matrix) return 'grid-outline';
    if (types.lookup_select) return 'cloud-download-outline';
    if (types.image_annotation) return 'brush-outline';
    return 'document-text-outline';
}

/** Garante título e ícone do modelo quando a IA não os enviou (ou enviou título genérico). */
function brsparkCopilotEnsureTaskBrandingFromResponse(data) {
    if (!data || typeof data !== 'object') return;
    var schema = Array.isArray(data.schemaData) ? data.schemaData : null;
    if (!schema || !schema.length) return;
    if (brsparkCopilotCountOperationalInSchema(schema) < 1) return;
    var ctx = collectCopilotFormContext();
    var genericTitle = function (t) {
        return isGenericDefaultFormTitle(t);
    };
    var tr = data.templateTitleResolved != null ? String(data.templateTitleResolved).trim() : '';
    if (!tr || genericTitle(tr)) {
        data.templateTitleResolved = brsparkCopilotDeriveFallbackTaskTitle(schema, ctx);
    }
    if (!data.templateMetadata || typeof data.templateMetadata !== 'object' || Array.isArray(data.templateMetadata)) {
        data.templateMetadata = {};
    } else {
        data.templateMetadata = Object.assign({}, data.templateMetadata);
    }
    var ic = String(data.templateMetadata.icon || '').trim();
    if (!ic) {
        data.templateMetadata.icon = brsparkCopilotGuessTaskIconFromSchema(schema, ctx);
        data.templateMetadata.iconLibrary = 'Ionicons';
    }
}

function brsparkCopilotApplyChatResponse(data) {
    window.__brsparkCopilotClarifyOptions = Array.isArray(data.clarifyOptions) ? data.clarifyOptions : [];
    renderCopilotClarifyCards();

    const hasClarify = window.__brsparkCopilotClarifyOptions.length > 0;
    if (!hasClarify) {
        brsparkCopilotEnsureTaskBrandingFromResponse(data);
    }

    window.__brsparkCopilotMessages.push({ role: 'assistant', content: data.replyText || '(sem texto)' });
    window.__brsparkCopilotLast = data;
    renderCopilotMessages();
    const ch = document.getElementById('ai-copilot-clarify-hint');
    if (ch) ch.style.display = hasClarify ? 'block' : 'none';
    if (hasClarify) {
        brsparkCopilotSetSideMenuOpen(true);
    }

    const hasPatch =
        !hasClarify &&
        data.schemaPatch &&
        data.schemaPatch.operations &&
        data.schemaPatch.operations.length > 0;
    let schemaChanged = false;
    if (!hasClarify && Array.isArray(data.schemaData)) {
        try {
            schemaChanged = JSON.stringify(data.schemaData) !== JSON.stringify(fields);
        } catch (e3) {
            schemaChanged = true;
        }
    }
    let settingsChanged = false;
    if (!hasClarify && data.templateSettings && typeof data.templateSettings === 'object') {
        try {
            settingsChanged = JSON.stringify(data.templateSettings) !== JSON.stringify(globalFormSettings);
        } catch (eSet) {
            settingsChanged = true;
        }
    }
    let metadataChanged = false;
    if (
        !hasClarify &&
        data.templateMetadata &&
        typeof data.templateMetadata === 'object' &&
        Object.prototype.hasOwnProperty.call(data.templateMetadata, 'icon')
    ) {
        try {
            const prevSig =
                String(currentFormIcon || '').trim() +
                '\n' +
                String(currentFormIconLibrary || 'Ionicons').trim();
            const nextSig =
                String(data.templateMetadata.icon || '').trim() +
                '\n' +
                String(data.templateMetadata.iconLibrary || 'Ionicons').trim();
            metadataChanged = prevSig !== nextSig;
        } catch (eMeta) {
            metadataChanged = true;
        }
    }
    let titleChanged = false;
    if (
        !hasClarify &&
        data.templateTitleResolved &&
        String(data.templateTitleResolved).trim() &&
        String(data.templateTitleResolved).trim() !== String(currentFormTitle || '').trim()
    ) {
        titleChanged = true;
    }
    const changed = schemaChanged || settingsChanged || metadataChanged || titleChanged;

    var useSchemaPreview =
        !hasClarify && schemaChanged && brsparkCopilotNeedsSchemaPreviewTable(data);
    if (hasClarify) {
        window.__brsparkCopilotLogicLast = [];
    } else if (useSchemaPreview) {
        window.__brsparkCopilotLogicLast = [];
    } else {
        window.__brsparkCopilotLogicLast = Array.isArray(data.logicSuggestions) ? data.logicSuggestions : [];
    }
    const hasLog = !hasClarify && !useSchemaPreview && window.__brsparkCopilotLogicLast.length > 0;

    if (!hasClarify && useSchemaPreview) {
        brsparkCopilotOpenSchemaPreviewModal(data);
    } else if (!hasClarify && (changed || hasLog)) {
        pushCopilotUndoSnapshot();
        if (changed) window.brsparkCopilotApplyPatch({ skipUndoPush: true });
        if (hasLog) window.brsparkCopilotApplyLogic({ skipUndoPush: true });
    }
    const ub = document.getElementById('ai-copilot-undo-btn');
    if (ub) ub.disabled = !(window.__brsparkSchemaUndoStack && window.__brsparkSchemaUndoStack.length);

    const foot = document.getElementById('copilot-rag-footnote');
    if (foot) {
        const parts = [];
        if (data.ragMeta) {
            const m = data.ragMeta;
            if (m.revisionCount > 0) {
                parts.push(
                    'Preenchimentos deste modelo: a IA usou ' +
                        m.revisionCount +
                        ' exemplo(s) concluído(s) (RAG de execução).'
                );
            } else if (m.skipped === 'no_completed_revisions') {
                parts.push('Preenchimentos: ainda não há revisões concluídas na base para este modelo.');
            } else if (m.skipped === 'template_not_found') {
                parts.push('Preenchimentos: modelo não encontrado na base — guarde o formulário na API.');
            } else if (m.skipped === 'invalid_template_id') {
                /* omit */
            } else if (m.skipped === 'no_template_id') {
                parts.push('Preenchimentos: guarde o modelo na nuvem para incluir histórico de execução (RAG).');
            }
        }
        if (data.ragLibraryMeta) {
            const lib = data.ragLibraryMeta;
            const n = typeof lib.usedCount === 'number' ? lib.usedCount : 0;
            if (n > 0) {
                const mode =
                    lib.ranking === 'embedding'
                        ? 'RAG semântico (embeddings)'
                        : lib.ranking === 'lexical'
                          ? 'RAG léxico'
                          : 'RAG da biblioteca';
                parts.push(
                    'Biblioteca de modelos: a IA consultou ' + n + ' formulário(s) semelhante(s) do painel (' + mode + ').'
                );
            } else if (lib.skipped === 'skipped_by_client') {
                /* omit */
            } else if (lib.skipped === 'no_templates') {
                parts.push('Biblioteca: não há outros modelos ativos para usar como referência.');
            } else if (lib.skipped === 'query_error') {
                parts.push('Biblioteca: não foi possível carregar modelos de referência (erro no servidor).');
            }
        }
        if (data.documentationFetch) {
            const d = data.documentationFetch;
            if (d.attempted && d.ok && typeof d.chars === 'number' && d.chars > 0) {
                parts.push(
                    'Documentação: conteúdo carregado da URL indicada (aprox. ' + d.chars + ' caracteres).'
                );
            } else if (d.attempted && !d.ok && d.error) {
                parts.push('Documentação: não foi possível carregar a URL — ' + d.error);
            }
        }
        foot.textContent = parts.join(' ');
    }
}

/**
 * @param {string} userText
 * @param {{ hideUserBubble?: boolean }} [opts] — se hideUserBubble, a mensagem entra no histórico enviado à API mas não aparece como bolha «Você».
 */
async function brsparkCopilotPostChatRound(userText, opts) {
    const token = brsparkAdminBearerToken();
    if (!token) {
        fbAlert('fb_alert_login', null, 'Faça login no painel admin (token ausente).');
        return;
    }
    const trimmed = String(userText || '').trim();
    if (!trimmed) return;
    window.__brsparkCopilotMessages = window.__brsparkCopilotMessages || [];
    var userEntry = { role: 'user', content: trimmed };
    if (opts && opts.hideUserBubble) userEntry.hiddenFromUi = true;
    window.__brsparkCopilotMessages.push(userEntry);
    window.__brsparkCopilotClarifyOptions = [];
    renderCopilotClarifyCards();
    const ch = document.getElementById('ai-copilot-clarify-hint');
    if (ch) ch.style.display = 'none';
    renderCopilotMessages();

    const summary = String(window.__brsparkCopilotSpreadsheetSummary || '').slice(0, 12000);

    const tid =
        typeof currentFormId === 'string' &&
        currentFormId &&
        currentFormId !== 'temp_new' &&
        currentFormId.trim().length > 0
            ? currentFormId.trim()
            : '';
    const chatPayload = {
        messages: window.__brsparkCopilotMessages,
        schemaData: fields,
        formContext: collectCopilotFormContext(),
        spreadsheetSummary: summary,
        templateSettings: JSON.parse(JSON.stringify(globalFormSettings || {})),
        templateMetadata: buildChecklistTemplateMetadata(),
        templateDraftTitle: typeof currentFormTitle === 'string' ? currentFormTitle : '',
        templateFolderId:
            currentFormFolderId === undefined || currentFormFolderId === null || currentFormFolderId === ''
                ? null
                : String(currentFormFolderId),
    };
    if (tid) chatPayload.templateId = tid;

    const docUrlEl = document.getElementById('copilot-ctx-doc-url');
    const documentationUrl = docUrlEl ? String(docUrlEl.value || '').trim() : '';
    if (documentationUrl) chatPayload.documentationUrl = documentationUrl.slice(0, 2048);

    beginCopilotThinking('A IA está pensando…');
    try {
        const useStream = window.__brsparkCopilotUseStream !== false;
        const chatUrl =
            brsparkApiBase() +
            '/checklists/ai/session/chat' +
            (useStream ? '-stream' : '');

        const res = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatPayload),
        });

        let data = {};

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const isEventStream = contentType.indexOf('text/event-stream') >= 0;

        if (
            useStream &&
            isEventStream &&
            res.ok &&
            res.body &&
            typeof res.body.getReader === 'function'
        ) {
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            let finalPayload = null;
            let streamErr = null;
            while (true) {
                const step = await reader.read();
                if (step.done) break;
                buf += dec.decode(step.value, { stream: true });
                const blocks = buf.split('\n\n');
                buf = blocks.pop() || '';
                for (let bi = 0; bi < blocks.length; bi++) {
                    const block = blocks[bi];
                    const lines = String(block || '')
                        .split('\n')
                        .map(function (l) {
                            return l.trim();
                        })
                        .filter(Boolean);
                    for (let li = 0; li < lines.length; li++) {
                        const line = lines[li];
                        if (line.indexOf('data:') !== 0) continue;
                        const raw = line.slice(5).trim();
                        let ev = null;
                        try {
                            ev = JSON.parse(raw);
                        } catch (eParse) {
                            continue;
                        }
                        if (!ev || typeof ev !== 'object') continue;
                        if (ev.type === 'progress' && ev.message) {
                            copilotSetThinkingMessage(ev.message);
                        } else if (ev.type === 'result' && ev.payload) {
                            finalPayload = ev.payload;
                        } else if (ev.type === 'error') {
                            streamErr = new Error(ev.error || 'Falha no copiloto IA.');
                            if (ev.code === 'NO_OPENAI_KEY') streamErr.code = 'NO_OPENAI_KEY';
                        }
                    }
                }
            }
            if (buf.trim()) {
                const tail = buf.trim().split('\n\n');
                for (let ti = 0; ti < tail.length; ti++) {
                    const line = String(tail[ti] || '')
                        .split('\n')
                        .map(function (l) {
                            return l.trim();
                        })
                        .find(function (l) {
                            return l.indexOf('data:') === 0;
                        });
                    if (!line) continue;
                    try {
                        const ev = JSON.parse(line.slice(5).trim());
                        if (ev.type === 'result' && ev.payload) finalPayload = ev.payload;
                        if (ev.type === 'error') streamErr = new Error(ev.error || 'Falha no copiloto IA.');
                    } catch (eT) {
                        /* ignore */
                    }
                }
            }
            if (streamErr) throw streamErr;
            if (!finalPayload) throw new Error('Resposta em fluxo incompleta do servidor.');
            data = finalPayload;
        } else {
            try {
                data = await res.json();
            } catch (e2) {
                data = {};
            }
            if (!res.ok) {
                throw new Error(data.error || res.statusText || 'Pedido falhou');
            }
        }

        brsparkCopilotApplyChatResponse(data);
    } catch (e) {
        console.error(e);
        const ragFootErr = document.getElementById('copilot-rag-footnote');
        if (ragFootErr) ragFootErr.textContent = '';
        window.__brsparkCopilotMessages.push({
            role: 'assistant',
            content: 'Erro: ' + (e.message || e),
        });
        renderCopilotMessages();
    } finally {
        endCopilotThinking();
    }
}

window.brsparkCopilotSend = async function () {
    const token = brsparkAdminBearerToken();
    if (!token) {
        fbAlert('fb_alert_login', null, 'Faça login no painel admin (token ausente).');
        return;
    }
    const inp = document.getElementById('ai-copilot-input');
    let text = inp ? String(inp.value || '').trim() : '';
    if (!text) {
        if (window.__brsparkCopilotSpreadsheetSummary && String(window.__brsparkCopilotSpreadsheetSummary).trim()) {
            text =
                'Com base na planilha em contexto e no formulário atual no canvas, sugira próximos passos e melhorias úteis.';
        } else {
            fbAlert(
                'fb_alert_copilot_write_or_attach',
                null,
                'Escreva uma mensagem ou envie arquivos de referência (Excel, Word, PDF, imagem ou JSON) no Copiloto para obter sugestões automáticas.'
            );
            return;
        }
    }
    if (inp) inp.value = '';
    await brsparkCopilotPostChatRound(text);
    const inpAfter = document.getElementById('ai-copilot-input');
    if (inpAfter) {
        try {
            inpAfter.focus();
        } catch (eFa) {
            /* ignore */
        }
    }
};

window.brsparkCopilotAnalyzeExcelFile = async function (inputEl) {
    const token = brsparkAdminBearerToken();
    if (!token) {
        fbAlert('fb_alert_login', null, 'Faça login no painel admin (token ausente).');
        if (inputEl) inputEl.value = '';
        return;
    }
    const rawList = inputEl && inputEl.files ? Array.prototype.slice.call(inputEl.files, 0) : [];
    if (!rawList.length) return;

    var bad = [];
    var files = [];
    for (var bi = 0; bi < rawList.length; bi++) {
        var f = rawList[bi];
        var nm = String(f && f.name ? f.name : '').toLowerCase();
        if (!brsparkCopilotReferenceFileNameOk(nm)) bad.push(f && f.name ? f.name : '(sem nome)');
        else files.push(f);
    }
    if (bad.length) {
        fbAlert(
            'fb_alert_copilot_bad_ext',
            { list: bad.join(', ') },
            'Extensão não suportada em: ' +
                bad.join(', ') +
                '. Use .xlsx, .xlsm, .docx, .pdf, .png, .jpg, .jpeg, .webp ou .json.'
        );
        if (!files.length) {
            inputEl.value = '';
            return;
        }
    }
    if (files.length > BRSPARK_COPILOT_REF_MAX_FILES) {
        fbAlert(
            'fb_alert_copilot_max_files',
            { max: String(BRSPARK_COPILOT_REF_MAX_FILES) },
            'No máximo ' +
                BRSPARK_COPILOT_REF_MAX_FILES +
                ' arquivos por vez. Serão analisados só os primeiros ' +
                BRSPARK_COPILOT_REF_MAX_FILES +
                '.'
        );
        files = files.slice(0, BRSPARK_COPILOT_REF_MAX_FILES);
    }

    copilotSetContextDetailsOpen(true);

    const statusEl = document.getElementById('copilot-excel-status');
    beginCopilotThinking(
        files.length > 1
            ? 'Lendo e analisando ' + files.length + ' arquivos com IA…'
            : 'Lendo e analisando o arquivo com IA…',
    );
    window.__brsparkCopilotExcelBusy = true;
    updateCopilotExcelUi();
    if (statusEl) {
        statusEl.textContent =
            files.length > 1
                ? 'Analisando ' + files.length + ' arquivos com IA…'
                : 'Lendo e analisando o arquivo com IA…';
    }

    const hintEl = document.getElementById('copilot-excel-hint');
    const hint = hintEl ? String(hintEl.value || '').trim() : '';
    const opts = Object.assign({}, collectCopilotFormContext(), { hint: hint });

    window.__brsparkCopilotReferenceSummaries = window.__brsparkCopilotReferenceSummaries || [];
    const newPieces = [];
    const errors = [];

    try {
        for (var i = 0; i < files.length; i++) {
            const file = files[i];
            const label = file && file.name ? file.name : 'arquivo';
            try {
                copilotSetThinkingMessage(
                    files.length > 1
                        ? 'Analisando com IA — arquivo ' + (i + 1) + ' de ' + files.length + '…'
                        : 'Lendo e analisando o arquivo com IA…',
                );
                if (statusEl) {
                    statusEl.textContent =
                        files.length > 1
                            ? 'Analisando «' + label + '» (' + (i + 1) + '/' + files.length + ')…'
                            : 'Lendo e analisando «' + label + '»…';
                }
                const fd = new FormData();
                fd.append('file', file);
                fd.append('options', JSON.stringify(opts));
                const res = await fetch(brsparkApiBase() + '/checklists/ai/analyze-from-file', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token },
                    body: fd,
                });
                let data = {};
                try {
                    data = await res.json();
                } catch (e2) {
                    data = {};
                }
                if (!res.ok) {
                    throw new Error(data.error || res.statusText || 'Falha ao analisar o arquivo');
                }
                const blocks = Array.isArray(data.blocks) ? data.blocks : [];
                if (!blocks.length) {
                    throw new Error('A análise não devolveu etapas ou campos. Tente outro arquivo ou ajuste as dicas.');
                }
                const summary = buildCopilotSpreadsheetSummaryFromAnalyze(data, label);
                newPieces.push({ fileName: label, summary: summary });
            } catch (eOne) {
                console.error(eOne);
                errors.push('«' + label + '»: ' + (eOne.message || eOne));
            }
        }

        if (newPieces.length) {
            for (var j = 0; j < newPieces.length; j++) {
                window.__brsparkCopilotReferenceSummaries.push(newPieces[j]);
            }
            rebuildCopilotSpreadsheetSummaryFromRefs();
            if (statusEl) {
                var names = newPieces
                    .map(function (p) {
                        return p.fileName;
                    })
                    .join(', ');
                statusEl.textContent =
                    newPieces.length === files.length
                        ? newPieces.length +
                          ' arquivo(s) carregado(s) («' +
                          names +
                          '»). Iniciando a conversa…'
                        : newPieces.length +
                          ' de ' +
                          files.length +
                          ' arquivo(s) OK («' +
                          names +
                          '»). Iniciando a conversa…';
                if (errors.length) {
                    statusEl.textContent += ' Aviso: ' + errors.join(' ');
                }
            }
            updateCopilotExcelUi();
            var nOk = newPieces.length;
            var msgRound =
                nOk === 1
                    ? 'Acabei de enviar um arquivo para análise (o resumo está no contexto do sistema). Apresente um resumo curto da estrutura em tópicos, sugira um nome único e um ícone Ionicons para o modelo no painel, e três passos práticos para montar o formulário no canvas.'
                    : 'Acabei de enviar ' +
                      nOk +
                      ' arquivos de referência para análise (os resumos estão no contexto do sistema). Apresente um resumo curto de cada origem em tópicos, indique convergências ou conflitos entre eles, sugira um nome único e um ícone Ionicons para o modelo no painel, e três passos práticos para montar o formulário no canvas.';
            await brsparkCopilotPostChatRound(msgRound);
        } else {
            if (statusEl) statusEl.textContent = errors.length ? 'Erro: ' + errors.join(' | ') : 'Nenhum arquivo analisado.';
            if (errors.length) {
                fbAlert(
                    'fb_alert_copilot_analyze_none_ok',
                    { detail: errors.join('\n') },
                    'Nenhum arquivo foi analisado com sucesso.\n\n' + errors.join('\n')
                );
            } else {
                fbAlert('fb_alert_copilot_analyze_none', null, 'Nenhum arquivo foi analisado.');
            }
        }
    } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = 'Erro: ' + (e.message || e);
        fbAlert(
            'fb_alert_err_detail',
            { detail: e && e.message ? e.message : String(e) },
            e && e.message ? e.message : String(e)
        );
    } finally {
        window.__brsparkCopilotExcelBusy = false;
        endCopilotThinking();
        updateCopilotExcelUi();
        if (inputEl) inputEl.value = '';
    }
};

window.brsparkCopilotApplyPatch = function (opts) {
    opts = opts || {};
    const data = window.__brsparkCopilotLast;
    if (!data) return;
    const hasSchema = Array.isArray(data.schemaData);
    const hasSettings = data.templateSettings && typeof data.templateSettings === 'object';
    const hasMeta =
        data.templateMetadata && typeof data.templateMetadata === 'object' && !Array.isArray(data.templateMetadata);
    const hasTaskTitle = data.templateTitleResolved != null && String(data.templateTitleResolved).trim() !== '';
    const hasTaskIcon =
        hasMeta &&
        Object.prototype.hasOwnProperty.call(data.templateMetadata, 'icon') &&
        String(data.templateMetadata.icon || '').trim() !== '';
    if (!hasSchema && !hasSettings && !hasMeta && !hasTaskTitle && !hasTaskIcon) return;
    if (!opts.skipUndoPush) pushCopilotUndoSnapshot();
    if (hasSchema) {
        fields = ensureSchemaInstructionFlags(JSON.parse(JSON.stringify(data.schemaData)));
        ensureCanvasSchemaHasSection();
        fixTransitDisplacementViolations(fields);
    }
    if (hasSettings) {
        globalFormSettings = mergeGlobalFormSettingsFromCopilot(data.templateSettings);
        if (window.syncAppSectionNavRadios) window.syncAppSectionNavRadios();
    }
    if (hasMeta && Object.prototype.hasOwnProperty.call(data.templateMetadata, 'icon')) {
        currentFormIcon =
            data.templateMetadata.icon != null ? String(data.templateMetadata.icon).trim() : '';
        currentFormIconLibrary =
            data.templateMetadata.iconLibrary != null
                ? String(data.templateMetadata.iconLibrary).trim() || 'Ionicons'
                : 'Ionicons';
        syncBuilderTaskIconDom();
    }
    if (hasTaskTitle) {
        var nt = String(data.templateTitleResolved).trim();
        if (nt !== String(currentFormTitle || '').trim()) {
            currentFormTitle = nt;
            var ttEl = document.getElementById('tpl-title');
            if (ttEl) ttEl.value = currentFormTitle;
        }
    }
    renderCanvas();
    renderProperties();
    const ub = document.getElementById('ai-copilot-undo-btn');
    if (ub) ub.disabled = !(window.__brsparkSchemaUndoStack && window.__brsparkSchemaUndoStack.length);
};

window.brsparkCopilotUndo = function () {
    const st = window.__brsparkSchemaUndoStack;
    if (!st || !st.length) return;
    const entry = parseCopilotUndoEntry(st.pop());
    if (!entry) return;
    fields = entry.fields;
    if (entry.settings) {
        globalFormSettings = mergeGlobalFormSettingsFromCopilot(entry.settings);
        if (window.syncAppSectionNavRadios) window.syncAppSectionNavRadios();
    }
    if (!entry.taskIconSkip) {
        currentFormIcon = entry.taskIcon != null ? String(entry.taskIcon) : '';
        currentFormIconLibrary =
            entry.taskIconLibrary != null ? String(entry.taskIconLibrary) : 'Ionicons';
        syncBuilderTaskIconDom();
    }
    if (entry.formTitle != null) {
        currentFormTitle = String(entry.formTitle);
        const tt = document.getElementById('tpl-title');
        if (tt) tt.value = currentFormTitle;
    }
    renderCanvas();
    renderProperties();
    const ub = document.getElementById('ai-copilot-undo-btn');
    if (ub) ub.disabled = st.length === 0;
};

window.brsparkCopilotSuggestLogic = async function () {
    const token = brsparkAdminBearerToken();
    if (!token) {
        fbAlert('fb_alert_login', null, 'Faça login no painel admin (token ausente).');
        return;
    }
    const g = document.getElementById('ai-copilot-logic-goal');
    const goal = g ? String(g.value || '').trim() : '';
    if (!goal) {
        fbAlert('fb_alert_logic_goal', null, 'Descreva o que a lógica deve fazer.');
        return;
    }
    beginCopilotThinking('A IA está elaborando sugestões de regras…');
    try {
        const res = await fetch(brsparkApiBase() + '/checklists/ai/suggest-logic', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(
                (function () {
                    const payload = {
                        schemaData: fields,
                        userGoal: goal,
                        formContext: collectCopilotFormContext(),
                    };
                    const docUrlEl = document.getElementById('copilot-ctx-doc-url');
                    const documentationUrl = docUrlEl ? String(docUrlEl.value || '').trim() : '';
                    if (documentationUrl) payload.documentationUrl = documentationUrl.slice(0, 2048);
                    return payload;
                })()
            ),
        });
        let data = {};
        try {
            data = await res.json();
        } catch (e2) {
            data = {};
        }
        if (!res.ok) throw new Error(data.error || res.statusText || 'Pedido falhou');

        window.__brsparkCopilotMessages = window.__brsparkCopilotMessages || [];
        let chunk =
            (data.replyText ? data.replyText + '\n\n' : '') +
            (data.logicSuggestions && data.logicSuggestions.length
                ? 'Sugestões: ' + data.logicSuggestions.length + ' regra(s) mapeada(s) para os campos.'
                : 'Sem regras mapeáveis — verifique os rótulos.');
        if (Array.isArray(data.warnings) && data.warnings.length) {
            chunk += '\n\n' + data.warnings.join(' ');
        }
        window.__brsparkCopilotMessages.push({ role: 'assistant', content: chunk.trim() });
        renderCopilotMessages();

        window.__brsparkCopilotLogicLast = data.logicSuggestions || [];
        const hasLog = window.__brsparkCopilotLogicLast.length > 0;
        if (hasLog) {
            pushCopilotUndoSnapshot();
            window.brsparkCopilotApplyLogic({ skipUndoPush: true });
        }
        const ub = document.getElementById('ai-copilot-undo-btn');
        if (ub) ub.disabled = !(window.__brsparkSchemaUndoStack && window.__brsparkSchemaUndoStack.length);

        const footSug = document.getElementById('copilot-rag-footnote');
        if (footSug && data.documentationFetch) {
            const d = data.documentationFetch;
            const bits = [];
            if (d.attempted && d.ok && typeof d.chars === 'number' && d.chars > 0) {
                bits.push(
                    'Documentação: conteúdo carregado da URL indicada (aprox. ' + d.chars + ' caracteres).'
                );
            } else if (d.attempted && !d.ok && d.error) {
                bits.push('Documentação: não foi possível carregar a URL — ' + d.error);
            }
            if (bits.length) footSug.textContent = bits.join(' ');
        }
    } catch (e) {
        console.error(e);
        fbAlert(
            'fb_alert_err_detail',
            { detail: e && e.message ? e.message : String(e) },
            e && e.message ? e.message : String(e)
        );
    } finally {
        endCopilotThinking();
    }
};

window.brsparkCopilotApplyLogic = function (opts) {
    opts = opts || {};
    const list = window.__brsparkCopilotLogicLast;
    if (!list || !list.length) return;
    if (!opts.skipUndoPush) pushCopilotUndoSnapshot();
    list.forEach(function (s) {
        const mon = fields.find(function (f) {
            return f.id === s.monitorFieldId;
        });
        if (!mon) return;
        if (!mon.rules) mon.rules = [];
        const actionType = String(s.actionType || 'SHOW').toUpperCase();
        let action;
        if (actionType === 'API_FETCH') {
            action = {
                type: 'API_FETCH',
                targetId: s.targetFieldId || '',
                apiUrl: s.apiUrl != null ? String(s.apiUrl) : '',
                apiMethod: String(s.apiMethod || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
                apiResponsePath: s.apiResponsePath != null ? String(s.apiResponsePath) : '',
                apiErrorMsg: s.apiErrorMsg != null ? String(s.apiErrorMsg) : '',
                apiAllowOffline: !!(s.apiAllowOffline === true || String(s.apiAllowOffline).toLowerCase() === 'true'),
            };
        } else {
            action = { type: s.actionType || 'SHOW', targetId: s.targetFieldId, value: '' };
        }
        mon.rules.push({
            condFieldId: s.monitorFieldId,
            operator: s.operator || '==',
            value: s.value != null ? String(s.value) : '',
            actions: [action],
        });
    });
    window.__brsparkCopilotLogicLast = [];
    renderCanvas();
    renderProperties();
    const ub = document.getElementById('ai-copilot-undo-btn');
    if (ub) ub.disabled = !(window.__brsparkSchemaUndoStack && window.__brsparkSchemaUndoStack.length);
};

/**
 * O HTML inicial do #canvas só tinha .canvas-empty; o Sortable vive em .canvas-section-body
 * criado por renderCanvas(). Sem esta chamada ao carregar, não há lista receptora até
 * "Criar novo" ou "Abrir formulário".
 */
try {
    renderCanvas();
} catch (e) {
    console.warn('[checklists-builder] renderCanvas inicial:', e);
}
