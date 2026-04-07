/**
 * checklists-builder.js
 * Lógica do Criador de Checklists Drag & Drop com Vanilla JS e SortableJS
 */

function brsparkApiBase() {
  if (typeof window !== 'undefined' && window.__BRSPARK_API_BASE__) {
    let b = String(window.__BRSPARK_API_BASE__).replace(/\/+$/, '');
    // Evita pedidos a …/api/api/checklists/… (404 «Route not found» no Express)
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

function ensureSchemaInstructionFlags(schema) {
  if (!Array.isArray(schema)) return schema;
  return schema.map((x) => ensureShowFieldInstructionsFlag(x));
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
        const hint =
          res.status === 401
            ? ' Faça login no painel (ex.: index.html na mesma máquina) e abra o Form Builder pela URL do servidor Node (ex.: http://localhost:3001/checklists.html), não pelo Live Server.'
            : '';
        alert((data.error || 'Upload recusado.') + hint);
        return;
      }
      const url = data.url;
      if (!url) {
        alert('Servidor não devolveu a URL da imagem.');
        return;
      }
      const quill = window.fieldHelpQuill;
      if (!quill) {
        alert('Editor não está pronto. Clique de novo no campo e tente inserir a imagem.');
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
          alert('Não foi possível inserir a imagem no editor. Atualize a página e tente de novo.');
          return;
        }
      }

      const after = Math.min(quill.getLength(), index + 2);
      quill.setSelection(after, 0, 'silent');
    } catch (err) {
      console.error(err);
      alert('Falha ao enviar imagem: ' + (err.message || err));
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
    alert('Não foi possível abrir o seletor de ficheiros. Tente outro browser ou permissões de ficheiros.');
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
    placeholder: 'Texto e imagens que o técnico consulta no app (botão «Instruções»).',
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

// 1. Initialize State
let fields = [];
let selectedFieldId = null;
let currentFormId = null;
let currentFormTitle = 'Novo Checklist';
let currentFormDesc = '';
let currentFormIcon = '';
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
    telemovel: 'phone',
    chamada: 'call',
    email: 'mail',
    correio: 'mail',
    envelope: 'mail',
    localizacao: 'location',
    localização: 'location',
    mapa: 'map',
    gps: 'location',
    pessoa: 'person',
    utilizador: 'user',
    usuario: 'user',
    camera: 'camera',
    câmara: 'camera',
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
    ficheiro: 'file',
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

window.renderWebIcon = function(lib, name, hexColor, sizePx) {
    const s = sizePx || 24;
    const style = `text-align:center; font-size:${s}px; margin-bottom:6px; color:${hexColor||'inherit'}`;
    
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

/** Rascunho do modal «Editar etapa» (nome + ícone da secção). */
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
            '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;color:#94a3b8;font-size:12px;font-weight:600;"><ion-icon name="albums-outline" style="font-size:40px;color:#cbd5e1;"></ion-icon>Predefinição (álbuns)</div>';
    }
};

window.openSectionStepEditModal = function (sectionId) {
    const sf = fields.find((x) => x.id === sectionId && x.type === 'section_break');
    if (!sf) return;
    const m = document.getElementById('section-step-edit-modal');
    const inp = document.getElementById('section-step-edit-title');
    if (!m || !inp) return;
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
    if (selectedFieldId === sf.id) renderProperties();
    if (typeof window.renderMobilePreview === 'function') window.renderMobilePreview();
};

const elToolbox = document.getElementById('toolbox');
const elCanvas = document.getElementById('canvas');
const elPropsBody = document.getElementById('properties-body');

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
    'barcode_scan': '<ion-icon name="barcode-outline"></ion-icon>',
    'signature': '<ion-icon name="create-outline"></ion-icon>'
};

/** Estado de secções colapsadas no canvas (id do grupo: __preamble__ ou id do section_break). */
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
    secDrag.setAttribute('title', 'Arrastar para reordenar as secções');
    secDrag.setAttribute('aria-label', 'Arrastar para reordenar as secções');
    secDrag.innerHTML =
        '<ion-icon name="reorder-two-outline" style="font-size:20px;vertical-align:-2px;"></ion-icon>';
    return secDrag;
}

/**
 * Reordena `fields` conforme a ordem dos `.canvas-section-group` dentro do stack.
 */
function applySectionGroupOrderFromDom(stackEl) {
    const stack = stackEl || (elCanvas && elCanvas.querySelector('.canvas-section-groups-stack'));
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
    renderCanvas();
}

function initCanvasGroupsSortable() {
    const stack = elCanvas && elCanvas.querySelector('.canvas-section-groups-stack');
    if (!stack) return;
    destroyCanvasGroupsSortable();
    const n = stack.querySelectorAll(':scope > .canvas-section-group').length;
    if (n < 2) return;

    window._brsparkCanvasGroupsSortable = new Sortable(stack, {
        animation: 150,
        handle: '.canvas-section-head__section-drag',
        draggable: '.canvas-section-group',
        direction: 'vertical',
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

function rebuildFieldsOrderFromCanvas() {
    const next = [];
    elCanvas.querySelectorAll('.canvas-section-body').forEach((b) => {
        b.querySelectorAll(':scope > .canvas-item').forEach((item) => {
            const id = item.dataset.id;
            if (!id) return;
            const f = fields.find((x) => x.id === id);
            if (f) next.push(f);
        });
    });
    if (next.length !== fields.length) {
        const seen = new Set(next.map((x) => x.id));
        fields.forEach((f) => {
            if (!seen.has(f.id)) next.push(f);
        });
    }
    const prevSig = fields.map((f) => f.id).join('\0');
    const nextSig = next.map((f) => f.id).join('\0');
    if (prevSig === nextSig) return;
    fields.splice(0, fields.length, ...next);
    if (fields.length === 0) {
        fields.push(createDefaultSectionField());
    } else {
        normalizeFieldsRequireSections(fields);
    }
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

/** Índice no array `fields` onde inserir, a partir do body alvo e posição local (0 = topo). */
function computeGlobalFieldInsertIndex(targetBody, localIndex) {
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

const BRSPARK_FIELD_MIME = 'application/x-brspark-field-type';
const BRSPARK_FIELD_PLAIN = 'text/plain';
const BRSPARK_FIELD_PREFIX = 'brspark-field:';

/** Safari / alguns browsers não expõem MIME custom em dragover — usamos payload até ao drop. */
function setPaletteDragPayload(type, rawText) {
    window.__brsparkPaletteDragPayload = { type, rawText: rawText || type };
}

function clearPaletteDragPayload() {
    try {
        delete window.__brsparkPaletteDragPayload;
    } catch (e) {
        window.__brsparkPaletteDragPayload = null;
    }
}

function bindToolboxNativeDragSources() {
    if (!elToolbox) return;
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
    if (!elCanvas || window.__brsparkNativeCanvasDrop) return;
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
            const globalIx = computeGlobalFieldInsertIndex(body, localIx);
            const newField = createNewFieldFromToolboxType(type, rawText);
            fields.splice(Math.max(0, Math.min(globalIx, fields.length)), 0, newField);
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
function absorbStrayPaletteItemsIntoFields() {
    if (!elCanvas) return false;
    const node = elCanvas.querySelector('.canvas-section-body > [data-type]:not(.canvas-item)');
    if (!node) return false;
    const t = node.getAttribute('data-type');
    if (!t || t === 'section_break') return false;
    const b = node.parentElement;
    if (!b || !b.classList.contains('canvas-section-body')) return false;
    const rawText = node.textContent.trim();
    const evtStub = { newIndex: Array.prototype.indexOf.call(b.children, node) };
    const insertAt = computeToolboxInsertIndex(b, node, evtStub);
    const newField = createNewFieldFromToolboxType(t, rawText);
    fields.splice(Math.max(0, Math.min(insertAt, fields.length)), 0, newField);
    if (node.parentNode) node.parentNode.removeChild(node);
    return true;
}

function canvasHasStrayPaletteNodes() {
    if (!elCanvas) return false;
    return !!elCanvas.querySelector('.canvas-section-body > [data-type]:not(.canvas-item)');
}

function createNewFieldFromToolboxType(type, rawText) {
    return {
        id: 'field_' + Math.floor(Math.random() * 99999),
        type: type,
        label: `${rawText}`,
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
    };
}

function createDefaultSectionField() {
    return createNewFieldFromToolboxType('section_break', 'Etapa 1');
}

/**
 * Garante que não existem campos «órfãos» antes da primeira secção e que o schema começa sempre por um section_break.
 * Corrige também arrastos que colocam o cartão da secção na posição errada.
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
        fieldArr.splice(0, fieldArr.length, createDefaultSectionField(), ...leading);
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
        fieldArr.splice(0, fieldArr.length, createDefaultSectionField(), ...leading, ...rest);
        return;
    }
    const rebuilt = [];
    if (leading.length > 0) {
        rebuilt.push(createDefaultSectionField(), ...leading);
    }
    segments.forEach((seg) => {
        rebuilt.push(seg.section, ...seg.items);
    });
    fieldArr.splice(0, fieldArr.length, ...rebuilt);
}

function ensureCanvasSchemaHasSection() {
    if (fields.length === 0) {
        fields.push(createDefaultSectionField());
    }
    normalizeFieldsRequireSections(fields);
}

/**
 * Executado logo após o Sortable concluir o drop (setTimeout 0).
 * A palette usa arrasto nativo (HTML5) — aqui só reordenação entre .canvas-item.
 */
function processCanvasSortEnd(evt) {
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
    const multiFieldExcluded = new Set(['section_break', 'hidden', 'calculated', 'transit_start', 'transit_end']);
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
                    <button type="button" title="Propriedades do campo" onclick="window.selectField('${f.id}')"><ion-icon name="settings-outline"></ion-icon></button>
                    <button type="button" class="${f.required ? 'is-req-active' : ''}" title="${f.required ? 'Obrigatório — clique para opcional' : 'Opcional — clique para obrigatório'}" onclick="window.toggleInlineRequired(event, '${f.id}')"><ion-icon name="${f.required ? 'checkmark-circle-outline' : 'ellipse-outline'}"></ion-icon></button>
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
    if (!elCanvas) return;
    elCanvas.querySelectorAll('.canvas-section-body > .canvas-item').forEach((el) => {
        el.style.removeProperty('width');
        el.style.removeProperty('min-width');
        el.style.removeProperty('max-width');
        el.style.removeProperty('height');
    });
}

function initCanvasSectionSortables() {
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

// 2. Palette → canvas: arrasto nativo (evita clones Sortable / cartões “comprimidos”).
installNativePaletteDropOnCanvas();
bindToolboxNativeDragSources();

// 3. Funções de Renderização Interativa (Declarative-style in Vanilla JS)
function renderCanvas() {
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
        chev.setAttribute('aria-label', 'Colapsar ou expandir');
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
                '<ion-icon name="document-text-outline" style="vertical-align:-3px;margin-right:6px;color:#64748b;"></ion-icon> Antes da primeira secção';
            badge.textContent = answerableCount + (answerableCount === 1 ? ' campo' : ' campos');
            if (canReorderSections) head.appendChild(makeSectionHeadDragGrip());
            head.appendChild(chev);
            head.appendChild(titleEl);
            head.appendChild(badge);
        } else {
            const sf = group.sectionField;
            const stepTarget = document.createElement('div');
            stepTarget.className = 'canvas-section-head__step-edit-target';
            stepTarget.title = 'Clique para editar o nome e o ícone desta etapa';
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
            labSp.textContent = 'Secção · ';
            labSp.style.flexShrink = '0';
            labSp.style.color = '#64748b';
            labSp.style.fontWeight = '600';
            labSp.style.fontSize = '12px';
            const nameSp = document.createElement('span');
            nameSp.className = 'canvas-section-head__step-name';
            nameSp.textContent = (sf.label || 'NOVA ETAPA').trim() || 'NOVA ETAPA';
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
            let badgeTxt = innerCount + (innerCount === 1 ? ' pergunta' : ' perguntas');
            if (sf.multiple) badgeTxt += ' · lista';
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
                mkBtn('Propriedades da secção', 'settings-outline', false, () => {
                    window.selectField(sf.id);
                })
            );
            const reqSec = document.createElement('button');
            reqSec.type = 'button';
            reqSec.title = sf.required
                ? 'Etapa obrigatória — clique para opcional'
                : 'Etapa opcional — clique para tornar obrigatória';
            if (sf.required) reqSec.classList.add('is-req-active');
            reqSec.innerHTML =
                '<ion-icon name="' + (sf.required ? 'checkmark-circle-outline' : 'ellipse-outline') + '"></ion-icon>';
            reqSec.addEventListener('click', (e) => {
                e.stopPropagation();
                window.toggleInlineRequired(e, sf.id);
            });
            toolbar.appendChild(reqSec);
            toolbar.appendChild(
                mkBtn('Lógica e regras', 'options-outline', false, () => {
                    window.openLogicModal(null, sf.id);
                })
            );
            toolbar.appendChild(
                mkBtn('Duplicar secção', 'copy-outline', false, () => {
                    window.cloneSection(sf.id);
                })
            );
            toolbar.appendChild(
                mkBtn('Eliminar secção', 'trash-outline', true, () => {
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
    addBtn.innerHTML = '<ion-icon name="add-circle-outline" style="vertical-align:-2px;margin-right:4px;"></ion-icon> Nova secção';
    addBtn.addEventListener('click', () => window.builderAddSectionAfterLast());
    addSecBar.appendChild(addBtn);
    elCanvas.appendChild(addSecBar);

    initCanvasSectionSortables();
    initCanvasGroupsSortable();
    normalizeCanvasItemLayoutForSortable();

    if (typeof renderMobilePreview === 'function') {
        renderMobilePreview();
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
    if(f) {
        f.required = !f.required;
        window.renderCanvas(); // Redraws the tag to show updated visual state
        if (selectedFieldId === id) {
            window.renderProperties(); // Update the sidebar checkbox
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
    if (opts.skipPropertiesIfSame && prevSelected === id) {
        return;
    }
    renderProperties();
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
            renderProperties();
        }
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
    fields.splice(j, 0, ...clone);
    selectedFieldId = clone[0].id;
    renderCanvas();
    renderProperties();
};

window.deleteSection = function (sectionId) {
    if (
        !confirm(
            'Eliminar esta secção e todas as perguntas dentro dela? O formulário mantém sempre pelo menos uma secção (será criada uma nova vazia se necessário).'
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
        fields.push(createDefaultSectionField());
    } else {
        normalizeFieldsRequireSections(fields);
    }
    renderCanvas();
    renderProperties();
};

window.builderAddSectionAfterLast = function () {
    flushQuillToBoundField();
    const n = fields.filter((f) => f.type === 'section_break').length + 1;
    const nf = createNewFieldFromToolboxType('section_break', 'Etapa ' + n);
    fields.push(nf);
    selectedFieldId = nf.id;
    renderCanvas();
    renderProperties();
};

// Ações na Janela / Global Scope
window.deleteField = function(id) {
    const fDel = fields.find((x) => x.id === id);
    if (fDel && fDel.type === 'section_break') {
        return window.deleteSection(id);
    }
    flushQuillToBoundField();
    fields = fields.filter(f => f.id !== id);
    if (fields.length === 0) {
        fields.push(createDefaultSectionField());
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
    flushQuillToBoundField();
    const f = fields[fIndex];
    const newId = 'field_' + Math.floor(Math.random() * 99999);
    const clone = JSON.parse(JSON.stringify(f)); // Deep copy simple
    clone.id = newId;
    fields.splice(fIndex + 1, 0, clone); // Insere logo abaixo
    
    // Auto-seleciona ao clonar
    selectedFieldId = newId;
    renderCanvas();
    renderProperties();
};

function updateField(key, val, opts) {
    if(!selectedFieldId) return;
    const f = fields.find(x => x.id === selectedFieldId);
    if(f) {
        f[key] = val;
        if (!opts || !opts.skipCanvas) renderCanvas();
    }
}

function renderProperties() {
    if(!selectedFieldId) {
        flushQuillToBoundField();
        if (typeof window.destroyFieldHelpEditor === 'function') window.destroyFieldHelpEditor();
        elPropsBody.innerHTML = '<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">Clique numa pergunta no canvas ou use o ícone de definições no cabeçalho de uma secção.</div>';
        return;
    }

    // Gravar instruções Quill no campo ANTES de apagar o DOM do editor (senão perde-se helpHtml ao trocar de campo / re-renderizar)
    flushQuillToBoundField();
    if (typeof window.destroyFieldHelpEditor === 'function') window.destroyFieldHelpEditor();

    const f = fields.find(x => x.id === selectedFieldId);
    if (!f) {
        selectedFieldId = null;
        elPropsBody.innerHTML = '<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">Clique numa pergunta no canvas ou use o ícone de definições no cabeçalho de uma secção.</div>';
        return;
    }
    
    // Bloquear circular dependency
    let depOptions = '<option value="">(Nenhuma Condição - Sempre visível)</option>';
    fields.forEach(other => {
        if(other.id !== f.id) {
            let sel = f.dependsOnId === other.id ? 'selected' : '';
            depOptions += `<option value="${other.id}" ${sel}>${other.label} (ID: ${other.id})</option>`;
        }
    });

    const reqChecked = f.required ? 'checked' : '';

    let extraProps = '';
    // Global Extra Prop: Field Icon
    extraProps += `
    `;

    if(f.type === 'text' || f.type === 'number' || f.type === 'phone') {
        extraProps += `
        <div class="prop-group" style="background:#f0fdf4; border:1px solid #22c55e; padding:12px; border-radius:8px; margin-top:16px;">
            <label class="prop-label" style="color:#15803d;"><ion-icon name="color-wand"></ion-icon> Máscara Dinâmica (Opcional)</label>
            <input class="prop-input" type="text" placeholder="Ex: ###.###.###-## para CPF" value="${f.textMask || ''}" onchange="window.handleFieldUpdate('textMask', this.value)" />
            <div style="font-size:10px; color:#15803d; margin-top:4px; line-height:1.2">Use '#' para representar números ou letras que o App tentará formatar ao vivo. Deixe em branco para livre.</div>
        </div>`;
    }

    if(f.type === 'geofence_check') {
        extraProps = `
        <div style="background:#ecfdf5; border:1px solid #10b981; padding:14px; border-radius:10px; margin-top:16px; display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:12px; font-weight:800; color:#047857; display:flex; align-items:center; gap:6px;">
                <ion-icon name="location" style="font-size:16px;"></ion-icon> Configurações da Cerca Eletrônica
            </div>
            
            <!-- Tipo de Zona -->
            <div>
                <label class="prop-label" style="color:#047857; font-size:10px;">Tipo de Zona</label>
                <select class="prop-input" onchange="window.handleFieldUpdate('geofenceType', this.value)" style="font-size:12px;">
                    <option value="radius" ${(f.geofenceType||'radius') === 'radius' ? 'selected' : ''}>📍 Ponto + Raio (Haversine)</option>
                    <option value="polygon" ${f.geofenceType === 'polygon' ? 'selected' : ''}>🔷 Polígono (Definido na OS)</option>
                </select>
                <div style="font-size:10px; color:#059669; margin-top:3px; line-height:1.3">
                    ${(f.geofenceType||'radius') === 'radius' 
                        ? 'O app calculará a distância entre o GPS do técnico e o ponto central da OS.' 
                        : 'O app verificará se o técnico está dentro do polígono definido na OS.'}
                </div>
            </div>

            <!-- Raio (só se radius) -->
            <div id="geofence-radius-block">
                <label class="prop-label" style="color:#047857; font-size:10px;">Raio de Aceitação (Metros)</label>
                <input class="prop-input" type="number" min="10" max="10000" value="${f.geofenceRadius || 150}" onkeyup="window.handleFieldUpdate('geofenceRadius', this.value)" />
                <div style="font-size:10px; color:#059669; margin-top:3px;">
                    A OS pode sobrescrever este raio. Este é o padrão do formulário.
                </div>
            </div>

            <!-- Modo de Falha -->
            <div>
                <label class="prop-label" style="color:#047857; font-size:10px;">Modo de Falha</label>
                <select class="prop-input" onchange="window.handleFieldUpdate('geofenceFailMode', this.value)" style="font-size:12px;">
                    <option value="block" ${(f.geofenceFailMode||'block') === 'block' ? 'selected' : ''}>🚫 Bloquear — Impede avanço do checklist</option>
                    <option value="warn" ${f.geofenceFailMode === 'warn' ? 'selected' : ''}>⚠️ Apenas Alertar — Registra desvio e continua</option>
                </select>
            </div>

            <!-- Mensagem customizada -->
            <div>
                <label class="prop-label" style="color:#047857; font-size:10px;">Mensagem de Erro Customizada (Opcional)</label>
                <input class="prop-input" type="text" placeholder="Ex: Você está fora da área de serviço autorizada." value="${f.geofenceErrorMsg || ''}" oninput="window.handleFieldUpdate('geofenceErrorMsg', this.value)" />
            </div>
        </div>`;
    } else if (f.type === 'location_pick') {
        extraProps = `
        <div class="prop-group" style="background:#f0f9ff; border:1px solid #0ea5e9; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#0369a1; margin-bottom:4px"><ion-icon name="map-outline"></ion-icon> Localização (GPS + mapa)</div>
            <div style="font-size:10px; color:#0c4a6e; line-height:1.35;">No app, o técnico obtém o GPS do dispositivo e pode mover o alfinete no mapa. A resposta guarda as duas posições em JSON (relatório e exportações).</div>
        </div>`;
    } else if (f.type === 'photo_stamped') {
         extraProps = `
        <div class="prop-group" style="background:#fffbeb; border:1px solid #f59e0b; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#b45309; margin-bottom:4px">⚠️ MODO ANTI-FRAUDE OBRIGATÓRIO</div>
            <div style="font-size:10px; color:#b45309; line-height:1.2;">A Galeria do celular ficará bloqueada. Câmera Ao Vivo exigida.</div>
        </div>`;
    } else if (f.type === 'facial_recognition') {
         extraProps = `
        <div class="prop-group" style="background:#fff1f2; border:1px solid #e11d48; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#9f1239; margin-bottom:4px">🧑‍💻 BIOMETRIA & IA OBRIGATÓRIA</div>
            <div style="font-size:10px; color:#9f1239; line-height:1.2; margin-bottom:12px;">A foto tirada será comparada com a foto de perfil do técnico usando o motor de IA selecionado nas Integrações do sistema.</div>
            
            <label class="prop-label" style="color:#e11d48; font-size:10px;">Provedor de Visão Computacional</label>
            <select class="prop-input" onchange="window.onChangeVisionProvider(this)" data-prev="${f.visionProvider || 'COMPREFACE'}" style="font-size:12px; border-color:#fda4af; margin-bottom:8px;">
                <option value="COMPREFACE" ${(f.visionProvider||'COMPREFACE') === 'COMPREFACE' ? 'selected' : ''}>🏢 Forçar Exadel CompreFace (Local) - PADRÃO</option>
                <option value="AUTO" ${(f.visionProvider||'COMPREFACE') === 'AUTO' ? 'selected' : ''}>🤖 Automático (Custo da IA Global)</option>
                <option value="AWS" ${f.visionProvider === 'AWS' ? 'selected' : ''}>☁️ Forçar AWS Rekognition (Custos Adicionais/API)</option>
            </select>

            <label class="prop-label" style="color:#e11d48; font-size:10px;">Motor de Câmera</label>
            <select class="prop-input" onchange="window.handleFieldUpdate('cameraMode', this.value)" style="font-size:12px; border-color:#fda4af;">
                <option value="native" ${(f.cameraMode||'native') === 'native' ? 'selected' : ''}>📷 Câmera do Sistema (Padrão/Alta Resolução)</option>
                <option value="scanner" ${f.cameraMode === 'scanner' ? 'selected' : ''}>📱 Scanner Seguro (Máscara Redonda In-App)</option>
            </select>
        </div>`;
    } else if (f.type === 'file_upload') {
        extraProps = `
        <div class="prop-group" style="background:#fffbeb; border:1px solid #fcd34d; padding:12px; border-radius:8px; margin-top:16px;">
            <div style="font-size:11px; font-weight:800; color:#b45309; margin-bottom:4px"><ion-icon name="document-attach-outline"></ion-icon> Anexar Arquivo (app)</div>
            <div style="font-size:10px; color:#92400e; line-height:1.35;">Máximo <b>50 MB</b> por ficheiro. O app bloqueia executáveis, scripts e outros tipos habitualmente perigosos; documentos e ficheiros correntes (PDF, Office, imagens, ZIP, etc.) são aceites.</div>
        </div>`;
    } else if (f.type === 'dropdown' || f.type === 'multiselect') {
        extraProps = `
        <div class="prop-group" style="background:#eef2ff; border:1px solid #6366f1; padding:12px; border-radius:8px; margin-top:16px;">
            <label class="prop-label" style="color:#4f46e5;"><ion-icon name="list"></ion-icon> Opções da Lista (Separe por vírgula)</label>
            <textarea class="prop-input" style="height:60px; font-size:12px;" onkeyup="window.handleFieldUpdate('options', this.value)">${f.options || ''}</textarea>
        </div>`;
    } else if (f.type === 'calculated') {
        extraProps = `
        <div class="prop-group" style="background:#f5f3ff; border:1px solid #8b5cf6; padding:12px; border-radius:8px; margin-top:16px;">
            <label class="prop-label" style="color:#7c3aed;"><ion-icon name="calculator"></ion-icon> Expressão Matemática do Sistema</label>
            <input class="prop-input" type="text" placeholder="Ex: field_123 + field_456" value="${f.calcFormula || ''}" onkeyup="window.handleFieldUpdate('calcFormula', this.value)" />
            <div style="font-size:10px; color:#7c3aed; margin-top:4px; line-height:1.2;">Variáveis: Use o ID sublinhado de outros blocos (Ex: field_111 * field_222) ou use "Math.sqrt(field_111)" para fórmulas puras.</div>
        </div>`;
    }

    elPropsBody.innerHTML = `
        <div class="prop-group">
            <label class="prop-label">${f.type === 'section_break' ? 'Nome da Seção / Etapa (Aparece no App Mobile)' : 'Rótulo da Pergunta no Painel (Técnico vê no App)' }</label>
            <input id="prop-label-input" class="prop-input" type="text" value="${f.label}" onkeyup="window.handleFieldUpdate('label', this.value)" />
        </div>
        <div class="prop-group">
            <label class="prop-label">ID Interno (Slug do Campo)</label>
            <input class="prop-input" type="text" value="${f.id}" disabled style="background:#f1f5f9; cursor:not-allowed;" title="Copie isso para usar em Fórmulas"/>
        </div>
        ${f.type === 'section_break' ? (() => {
            const rawSfm = f.sectionFillMode === 'wizard' ? 'wizard' : f.sectionFillMode === 'list' ? 'list' : 'inherit';
            const pick = rawSfm === 'wizard' ? 'wizard' : 'list';
            return `
        <div class="prop-group" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:12px; border-radius:8px; margin-top:4px;">
            <label class="prop-label">Como o técnico vê esta etapa (app)</label>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                <label class="app-fill-mode-card" style="cursor:pointer; border:2px solid var(--border, #e2e8f0); border-radius:10px; padding:10px 12px; display:flex; gap:10px; align-items:flex-start; background:#fff;">
                    <input type="radio" name="propSectionFillMode" value="list" ${pick === 'list' ? 'checked' : ''} style="margin-top:3px; accent-color:var(--primary);" onchange="if(this.checked) window.handleFieldUpdate('sectionFillMode', 'list')" />
                    <span>
                        <span style="display:block; font-weight:800; font-size:12px; color:var(--text1, #0f172a);"><ion-icon name="list-outline" style="font-size:14px; vertical-align:-2px;"></ion-icon> Lista com scroll</span>
                        <span style="display:block; font-size:11px; color:var(--text3, #64748b); line-height:1.35; margin-top:4px;">Todos os campos desta secção visíveis com scroll.</span>
                    </span>
                </label>
                <label class="app-fill-mode-card" style="cursor:pointer; border:2px solid var(--border, #e2e8f0); border-radius:10px; padding:10px 12px; display:flex; gap:10px; align-items:flex-start; background:#fff;">
                    <input type="radio" name="propSectionFillMode" value="wizard" ${pick === 'wizard' ? 'checked' : ''} style="margin-top:3px; accent-color:var(--primary);" onchange="if(this.checked) window.handleFieldUpdate('sectionFillMode', 'wizard')" />
                    <span>
                        <span style="display:block; font-weight:800; font-size:12px; color:var(--text1, #0f172a);"><ion-icon name="git-commit-outline" style="font-size:14px; vertical-align:-2px;"></ion-icon> Um campo de cada vez</span>
                        <span style="display:block; font-size:11px; color:var(--text3, #64748b); line-height:1.35; margin-top:4px;">Assistente: Seguinte / Voltar só dentro desta secção.</span>
                    </span>
                </label>
            </div>
            ${rawSfm === 'inherit' ? '<div style="font-size:10px; color:#b45309; margin-top:8px; line-height:1.35;">Legado: «seguir global» — o app usa ainda <code>appFillMode</code> no JSON até escolher uma opção acima.</div>' : ''}
        </div>
        <div class="prop-group" style="background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:8px; margin-top:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="prop-section-repeat" ${f.multiple ? 'checked' : ''} onchange="window.handleFieldUpdate('multiple', this.checked)" />
                <label for="prop-section-repeat" style="font-size:13px; font-weight:700; cursor:pointer; color:#581c87;">Repetir esta secção (lista)</label>
            </div>
            <div style="font-size:10px; color:#6b21a8; margin-bottom:10px; line-height:1.35;">O técnico pode preencher <b>várias instâncias</b> seguidas dos mesmos campos (ex.: vários equipamentos). Cada linha grava um objeto no array <b>__section_repeat_&lt;id&gt;</b> na execução. Use mín./máx. para limitar quantas instâncias.</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">Mín. instâncias (vazio = 0)</label>
                    <input class="prop-input" type="number" min="0" placeholder="ex.: 1" value="${f.minItems !== undefined && f.minItems !== null && f.minItems !== '' ? String(f.minItems) : ''}" onchange="window.handleFieldUpdate('minItems', this.value)" />
                </div>
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">Máx. instâncias (vazio = ilimitado)</label>
                    <input class="prop-input" type="number" min="1" placeholder="ex.: 5" value="${f.maxItems !== undefined && f.maxItems !== null && f.maxItems !== '' ? String(f.maxItems) : ''}" onchange="window.handleFieldUpdate('maxItems', this.value)" />
                </div>
            </div>
        </div>`;
        })() : ''}
        <div class="prop-group">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
                <label class="prop-label" style="margin:0; flex:1; min-width:160px;">Instruções ao técnico (rich text, opcional)</label>
                ${f.type !== 'section_break' ? `
                <label title="Mostrar instruções no telemóvel do técnico" style="display:inline-flex; align-items:center; cursor:pointer; user-select:none;">
                    <input type="checkbox" id="prop-show-field-instructions" aria-label="Mostrar instruções no app móvel" ${f.showFieldInstructions === true ? 'checked' : ''} onchange="window.handleFieldUpdate('showFieldInstructions', this.checked)" style="width:15px; height:15px; accent-color:var(--primary); cursor:pointer; flex-shrink:0;" />
                </label>
                ` : ''}
            </div>
            <div id="field-help-editor-host" style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              <div id="field-help-editor"></div>
            </div>
        </div>
        
        ${f.type !== 'section_break' && f.type !== 'photo' && f.type !== 'photo_stamped' && f.type !== 'facial_recognition' && f.type !== 'file_upload' && f.type !== 'signature' && f.type !== 'geofence_check' && f.type !== 'location_pick' && f.type !== 'transit_start' && f.type !== 'transit_end' ? `
        <div class="prop-group">
            <label class="prop-label">Auto-Preenchimento / Valor Padrão (Opcional)</label>
            <input class="prop-input" type="text" value="${f.defaultValue || ''}" placeholder="Use tags como {{user.name}}, {{date}}" onkeyup="window.handleFieldUpdate('defaultValue', this.value)" />
        </div>
        ` : ''}

        <div class="prop-group" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="prop-req" ${reqChecked} onchange="window.handleFieldUpdate('required', this.checked)" />
            <label for="prop-req" style="font-size:13px; font-weight:600; cursor:pointer;">Resposta Obrigatória?</label>
        </div>

        ${f.type !== 'section_break' &&
        !['hidden', 'calculated', 'transit_start', 'transit_end'].includes(f.type) ? `
        <div class="prop-group" style="background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:8px; margin-top:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="prop-multiple" ${f.multiple ? 'checked' : ''} onchange="window.handleFieldUpdate('multiple', this.checked)" />
                <label for="prop-multiple" style="font-size:13px; font-weight:700; cursor:pointer; color:#581c87;">Várias respostas (lista)</label>
            </div>
            <div style="font-size:10px; color:#6b21a8; margin-bottom:10px; line-height:1.35;">O app grava um <b>array</b> na execução para este campo (texto, opções, fotos, assinaturas, etc.). Compatível com checklists antigos (valor único continua a ser string ou valor único).</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">Mín. itens (vazio = padrão)</label>
                    <input class="prop-input" type="number" min="0" placeholder="ex.: 2" value="${f.minItems !== undefined && f.minItems !== null && f.minItems !== '' ? String(f.minItems) : ''}" onchange="window.handleFieldUpdate('minItems', this.value)" />
                </div>
                <div style="flex:1; min-width:110px;">
                    <label class="prop-label" style="font-size:10px; color:#581c87;">Máx. itens (vazio = ilimitado)</label>
                    <input class="prop-input" type="number" min="1" placeholder="ex.: 5" value="${f.maxItems !== undefined && f.maxItems !== null && f.maxItems !== '' ? String(f.maxItems) : ''}" onchange="window.handleFieldUpdate('maxItems', this.value)" />
                </div>
            </div>
        </div>
        ` : ''}

        ${['photo', 'photo_stamped', 'facial_recognition', 'file_upload'].includes(f.type) ? `
        <div class="prop-group" style="display:flex; align-items:flex-start; gap:10px; margin-top:12px; background:#ecfdf5; border:1px solid #a7f3d0; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-allow-media-desc" ${f.allowMediaDescription ? 'checked' : ''} onchange="window.handleFieldUpdate('allowMediaDescription', this.checked)" style="transform:scale(1.2);margin-top:2px;flex-shrink:0" />
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <label for="prop-allow-media-desc" style="font-size:13px; font-weight:700; color:#047857; cursor:pointer;">Comentário opcional por foto / ficheiro</label>
                <div style="font-size:10px; color:#065f46; margin-top:4px; line-height:1.35;">Diferente do comentário geral do campo: aqui o técnico pode comentar cada foto, captura ou anexo (câmara, galeria ou ficheiro). Tudo opcional.</div>
            </div>
        </div>
        ` : ''}

        ${f.type !== 'section_break' && f.type !== 'hidden' ? `
        <div class="prop-group" style="display:flex; align-items:flex-start; gap:10px; margin-top:4px; background:#f0f9ff; border:1px solid #bae6fd; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-allow-comment" ${f.allowTechnicianComment ? 'checked' : ''} onchange="window.handleFieldUpdate('allowTechnicianComment', this.checked)" style="transform:scale(1.2);margin-top:2px;flex-shrink:0" />
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <label for="prop-allow-comment" style="font-size:13px; font-weight:700; color:#0369a1; cursor:pointer;">Comentário do técnico (opcional no app)</label>
                <div style="font-size:10px; color:#0c4a6e; margin-top:4px; line-height:1.35;">Mostra uma caixa de texto livre abaixo da resposta no app. Complementa as instruções ao técnico (não as substitui).</div>
            </div>
        </div>
        ` : ''}

        ${['geofence_check', 'location_pick', 'photo', 'photo_stamped', 'facial_recognition', 'signature', 'barcode_scan'].includes(f.type) ? `
        <div class="prop-group" style="display:flex; align-items:center; gap:10px; margin-top:12px; background:#fefce8; border:1px solid #fef08a; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-online" ${f.requireOnlineValidation ? 'checked' : ''} onchange="window.handleFieldUpdate('requireOnlineValidation', this.checked)" style="transform:scale(1.2)" />
            <div style="display:flex; flex-direction:column;">
                <label for="prop-online" style="font-size:12px; font-weight:800; color:#ca8a04; cursor:pointer;"><ion-icon name="shield-checkmark" style="vertical-align:-2px"></ion-icon> Exigir Validação Apenas Online?</label>
                <div style="font-size:10px; color:#a16207; margin-top:2px; line-height:1.2;">Se ativado, bloqueia o preenchimento caso o dispositivo esteja sem internet no momento. Caso contrário, permite modo Assíncrono (validado depois).</div>
            </div>
        </div>
        ` : ''}
        
        ${extraProps}
    `;

    setTimeout(function () {
        if (typeof window.initFieldHelpEditor === 'function') window.initFieldHelpEditor(f);
    }, 0);
}

// Expose pra UI HTML
window.handleFieldUpdate = function(key, val) {
    updateField(key, val);
};

window.onChangeVisionProvider = function(selectElem) {
    const val = selectElem.value;
    const prev = selectElem.getAttribute('data-prev');
    if (val === 'AWS') {
        const confirmed = confirm("ATENÇÃO: A escolha do provedor AWS Rekognition gerará cobranças adicionais de consumo de API diretamente na nuvem da AWS.\n\nTem certeza que deseja forçar o uso da AWS de forma manual?");
        if (!confirmed) {
            selectElem.value = prev;
            return;
        }
    }
    selectElem.setAttribute('data-prev', val);
    window.handleFieldUpdate('visionProvider', val);
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
    /** direct = abre na 1.ª etapa; hub = lista de etapas no ecrã */
    appSectionStart: 'direct',
    /** free | sequential — só com appSectionStart hub */
    appHubSectionOrder: 'free',
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

window.syncAppSectionNavRadios = function () {
    if (!globalFormSettings) return;
    const start = normalizeAppSectionStart(globalFormSettings.appSectionStart);
    const ord = normalizeAppHubSectionOrder(globalFormSettings.appHubSectionOrder);
    document.querySelectorAll('input[name="appSectionStart"]').forEach((r) => {
        r.checked = r.value === start;
    });
    const wrap = document.getElementById('app-hub-order-wrap');
    if (wrap) wrap.style.opacity = start === 'hub' ? '1' : '0.45';
    document.querySelectorAll('input[name="appHubSectionOrder"]').forEach((r) => {
        r.checked = r.value === ord;
        r.disabled = start !== 'hub';
    });
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
        console.warn('[checklists-builder] Modal Cerca Global em falta no HTML.');
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

// Global: JSON EXPORTER & IMPORTER
window.exportJSON = function() {
    if (!fields.some((f) => f.type !== 'section_break')) {
        return alert('Adicione pelo menos um campo de pergunta ao canvas (a primeira secção já existe).');
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
                    globalFormSettings = Object.assign(
                        {
                            requireGlobalGeofence: false,
                            globalGeofenceRadius: 200,
                            rules: [],
                            appFillMode: 'full',
                            appSectionStart: 'direct',
                            appHubSectionOrder: 'free',
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
                    alert("✅ Formulário importado com sucesso! Clique em 'Salvar Schema' para persistir isso localmente no banco.");
                } else {
                    alert("O arquivo não é compatível com o BrSpark Builder.");
                }
            } catch(err) {
                alert("Arquivo Corrompido: " + err.message);
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
    let db;
    try {
        db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
    } catch (e) {
        return null;
    }
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

window.saveChecklist = async function() {
    const btn = document.querySelector('.topbar-actions .btn-primary');
    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳ Salvando...';
    btn.disabled = true;

    flushQuillToBoundField();
    window.readAppSectionNavFromRadios && window.readAppSectionNavFromRadios();
    fields = ensureSchemaInstructionFlags(fields);
    ensureCanvasSchemaHasSection();

    currentFormTitle = document.getElementById('tpl-title').value;
    currentFormDesc = document.getElementById('tpl-desc').value;
    currentFormIcon = document.getElementById('tpl-icon').value;

    try {
        if(!currentFormId || currentFormId === 'temp_new') {
            if (!currentFormTitle || currentFormTitle === 'Novo Checklist') {
                currentFormTitle = 'FSM ' + new Date().toLocaleString('pt-BR');
            }
            currentFormId = 'chk_' + Date.now().toString(36);
        }

        if (!normalizeTemplateTitleBuilder(currentFormTitle)) {
            alert('O título do formulário não pode estar vazio.');
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
            alert(
                'Já existe um formulário com este nome nesta pasta (catálogo local). Escolha outro título ou pasta.'
            );
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        // Snapshot serializável (evita referências partilhadas e garante helpHtml no JSON)
        const schemaSnapshot = JSON.parse(JSON.stringify(fields));
        
        // 1. BACKUP OFFLINE-FIRST SEMPRE FUNCIONA (GARANTIDO)
        const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
        db[currentFormId] = {
            id: currentFormId,
            title: currentFormTitle,
            description: currentFormDesc,
            settings: globalFormSettings,
            metadata: { icon: currentFormIcon },
            schema: schemaSnapshot,
            folderId: currentFormFolderId ?? null,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
        
        btn.innerHTML = '✅ Salvo localmente';
        // NÃO chamar loadSavedFormsList aqui: ele faz GET e substitui o localStorage pela nuvem
        // ANTES do POST terminar → apagava instruções/helpHtml recém gravados.
        if (window.renderFormsGridFromLocal) window.renderFormsGridFromLocal(db);
        
        // 2. Enviar para API; só depois sincronizar lista com GET (dados já persistidos)
        try {
            const payload = {
                id: currentFormId,
                title: currentFormTitle,
                description: currentFormDesc,
                metadata: { icon: currentFormIcon },
                settings: globalFormSettings,
                schemaData: schemaSnapshot,
                folderId: currentFormFolderId ?? null
            };
            const token = sessionStorage.getItem('brspark_admin_token') || '';
            const res = await fetch(`${brsparkApiBase()}/checklists/templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: 'Bearer ' + token } : {}),
                },
                body: JSON.stringify(payload)
            });
            const raw = await res.text();
            if (res.ok) {
                btn.innerHTML = '✅ Na nuvem e no app';
                try {
                    const saved = JSON.parse(raw);
                    if (saved && saved.id) {
                        const dbLocal = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
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
            } else {
                let msg = raw;
                try {
                    const j = JSON.parse(raw);
                    msg = j.error || raw;
                } catch (_) {}
                console.warn('[saveChecklist] API recusou:', res.status, msg);
                if (res.status === 409) {
                    alert(msg || 'Já existe um formulário ativo com este nome nesta pasta.');
                } else {
                    alert(
                        'Guardado só neste navegador. A API não gravou (' +
                        res.status +
                        '): ' +
                        (msg || 'erro desconhecido') +
                        '\n\nConfirme que o backend está no ar e a URL da API está certa.'
                    );
                }
            }
        } catch (apiError) {
            console.warn('Salvamento na API falhou (rede). Rascunho está no navegador.', apiError);
            alert(
                'Não foi possível contactar a API. O formulário ficou guardado só neste navegador.\n\n' +
                (apiError && apiError.message ? apiError.message : '')
            );
        }
        
        setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 2200);
        
    } catch (err) {
        console.error("Falha fatal ao salvar form:", err);
        alert("Ops! Erro ao construir os arquivos: " + err.message);
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

// Global: jsPDF Fallback Generator
window.previewPDF = function() {
    if(fields.length === 0) return alert("Adicione perguntas antes de gerar o PDF.");
    
    // window.jspdf vem da CDN chamada no header do HTML
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
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
         else if(f.type === 'signature') {
             // Linha de Assinatura com SVG futuro
             doc.setDrawColor(0);
             doc.line(20, currentY + 20, 120, currentY + 20);
             doc.setFontSize(9).setFont("helvetica", "normal");
             doc.text("Assinatura do Técnico / Cliente Responsável", 20, currentY + 26);
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
        alert('Recarregue a página (interface «Nova pasta» em falta).');
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
        alert('Indique um nome para a pasta.');
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
            alert('Não foi possível criar a pasta: ' + msg);
            return;
        }
        window.cancelNewFolderModal();
        await refreshTemplateFolders();
        window.renderFormsGridFromLocal(window._formsDbCache || {});
    } catch (e) {
        alert(
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
            alert('Não foi possível renomear: ' + msg);
            return;
        }
        await refreshTemplateFolders();
        window.renderFormsGridFromLocal(window._formsDbCache || {});
    } catch (e) {
        alert('Erro de rede ao renomear.');
        console.warn(e);
    }
};

window.promptDeleteTemplateFolder = async function (folderId) {
    const f = builderFolders.find((x) => x.id === folderId);
    if (!f) return;
    if (!confirm(`Eliminar a pasta "${f.name}" e todas as subpastas? Os formulários ficam na raiz (sem pasta).`)) return;
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/template-folders/${encodeURIComponent(folderId)}`, {
            method: 'DELETE',
            headers: adminJsonHeaders(),
        });
        if (!res.ok) {
            const raw = await res.text();
            alert('Não foi possível eliminar: ' + raw);
            return;
        }
        if (builderBrowseFolderId === folderId) {
            builderBrowseFolderId = f.parentId || null;
        }
        await refreshTemplateFolders();
        await window.loadSavedFormsList();
    } catch (e) {
        alert('Erro de rede ao eliminar pasta.');
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
        const dbPrev = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
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
            alert(prefix + msg);
            selectEl.value = prevSelectVal;
            return;
        }
        const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
        if (db[formId]) {
            db[formId].folderId = folderId;
            localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
        }
        window._formsDbCache = db;
        window.renderFormsGridFromLocal(db);
    } catch (e) {
        alert('Erro de rede ao mover formulário.');
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
    const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
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
            const db2 = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
            delete db2[newForm.id];
            localStorage.setItem('brspark_checklists_db', JSON.stringify(db2));
            let msg = raw;
            try {
                msg = JSON.parse(raw).error || raw;
            } catch (_) {}
            alert(
                res.status === 409
                    ? msg
                    : 'Não foi possível clonar na API: ' + (msg || res.status)
            );
            window.renderFormsGridFromLocal(db2);
            return;
        }
    } catch(e) {
        console.warn('Erro ao clonar checklist na API', e);
        const db2 = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
        delete db2[newForm.id];
        localStorage.setItem('brspark_checklists_db', JSON.stringify(db2));
        alert('Erro de rede ao clonar. A cópia local foi anulada.');
        window.renderFormsGridFromLocal(db2);
        return;
    }
    
    alert(`Formulário '${form.title}' clonado com sucesso!`);
    window.renderFormsGridFromLocal(JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}'));
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
        const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
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
    let prev = {};
    try {
        prev = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
    } catch (e) {
        prev = {};
    }
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

    const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
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
            <div class="folder-browser-item" data-title="${escapeHtmlAttr(folder.name)}" style="display:flex; align-items:stretch; gap:0; border-radius:12px; overflow:hidden; border:1px solid #c4b5fd; background:linear-gradient(135deg,#faf5ff 0%,#fff 100%); transition:border-color 0.2s;"
                 onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='#c4b5fd'">
               <div onclick="window.enterBrowseFolder('${fid}')"
                    style="flex:1; padding:16px; cursor:pointer; display:flex; align-items:center; gap:16px; border:none; background:transparent;">
                  <div style="width:48px; height:48px; border-radius:12px; background:#ede9fe; display:flex; justify-content:center; align-items:center; font-size:26px; flex-shrink:0">📁</div>
                  <div style="flex:1;">
                     <h4 style="margin:0; font-size:15px; color:#4c1d95;">${fname}</h4>
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
                  title="Eliminar pasta">
                  <ion-icon name="trash-outline"></ion-icon>
               </button>
            </div>
        `;
    });

    sortedForms.forEach((form) => {
        const count = (form.schema || []).length;
        const iconHtml = form.metadata?.icon ? `<ion-icon name="${escapeHtmlAttr(form.metadata.icon)}"></ion-icon>` : '📋';
        const fid = escapeHtmlAttr(form.id);
        const ftitle = escapeHtml(form.title);
        const moveSelectId = 'move-folder-' + form.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const moveOpts = buildMoveFolderOptionsHtml(form.folderId || null);
        grid.innerHTML += `
            <div class="form-card-item" data-title="${escapeHtmlAttr(form.title)}" style="display:flex; flex-direction:column; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0; background:#fff; transition:border-color 0.2s;"
                 onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#e2e8f0'">
               <div style="display:flex; align-items:stretch; flex:1;">
                 <div onclick="window.selectFormFromModal('${fid}')"
                      style="flex:1; padding:16px; cursor:pointer; display:flex; align-items:center; gap:16px; border:none; background:transparent;">
                    <div style="width:48px; height:48px; border-radius:12px; background:#f1f5f9; display:flex; justify-content:center; align-items:center; font-size:24px; color:#64748b; flex-shrink:0">
                       ${iconHtml}
                    </div>
                    <div style="flex:1; min-width:0;">
                       <h4 style="margin:0; font-size:15px; color:#1e293b;">${ftitle}</h4>
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
        grid.innerHTML =
            '<p style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:32px;font-size:14px;">Nenhuma pasta nem formulário neste nível. Use «Nova pasta» ou «Novo formulário aqui».</p>';
    }

    if (window.filterFormsList) window.filterFormsList();
};

window.loadChecklist = function(id) {
    if(!id) {
        window.createNewChecklist();
        return;
    }
    flushQuillToBoundField();
    const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
    const form = db[id];
    if(form) {
        currentFormId = form.id;
        currentFormTitle = form.title;
        currentFormDesc = form.description || '';
        currentFormIcon = form.metadata?.icon || '';
        currentFormFolderId = form.folderId ?? null;
        globalFormSettings = Object.assign(
            {
                requireGlobalGeofence: false,
                globalGeofenceRadius: 200,
                rules: [],
                appFillMode: 'full',
                appSectionStart: 'direct',
                appHubSectionOrder: 'free',
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
        document.getElementById('tpl-icon').value = currentFormIcon;
        document.getElementById('tpl-icon-preview').innerHTML = currentFormIcon ? `<ion-icon name="${currentFormIcon}" style="font-size:18px;margin-right:6px;vertical-align:-3px;"></ion-icon> ${currentFormIcon}` : 'Escolher Ícone da Tarefa';
        fields = ensureSchemaInstructionFlags(JSON.parse(JSON.stringify(form.schema || [])));
        ensureCanvasSchemaHasSection();
        selectedFieldId = null;
        renderCanvas();
        renderProperties();
    }
};

window.createNewChecklist = function (fromBrowseFolder) {
    if (!fromBrowseFolder) {
        window.__newFormFolderId = undefined;
    }
    const modal = document.getElementById('new-checklist-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('new-form-name-input').value = 'Novo Checklist';
        setTimeout(() => document.getElementById('new-form-name-input').focus(), 100);
    }
};

window.confirmCreateNewChecklist = function () {
    const title = document.getElementById('new-form-name-input').value.trim() || 'Novo Checklist';
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
    fields = [createDefaultSectionField()];
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

    renderCanvas();
    renderProperties();
    
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
    
    alert(`Painel preparado para: "${title}". Já existe uma primeira secção no canvas — arraste perguntas para dentro dela (ou adicione mais secções).`);
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

function renderMobilePreview() {
    currentFormTitle = document.getElementById('tpl-title').value;
    currentFormDesc = document.getElementById('tpl-desc').value;
    currentFormIcon = document.getElementById('tpl-icon').value;

    const titleEl = document.getElementById('mobile-preview-title');
    const contentEl = document.getElementById('mobile-preview-content');
    if(!titleEl || !contentEl) return;
    
    titleEl.textContent = currentFormTitle || 'Preview Mobile';
    
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
            : 'Preview: ' + (derived === 'wizard' ? 'Um-a-um (global legado)' : derived === 'hybrid' ? 'Por secção (alguma em modo assistente)' : 'Lista / scroll');
    }

    const sectionPages = splitBuilderFieldsIntoSectionPages(fields);
    window.__mobilePreviewHybridPages = sectionPages;
    const answerable = fields.filter((f) => f.type !== 'section_break' && f.type !== 'hidden');
    window.__mobilePreviewWizardCount = answerable.length;

    let previewFields = fields;
    let modeBanner = '';

    if (mode === 'full') {
        previewFields = fields.filter((f) => f.type !== 'section_break');
        modeBanner = `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:10px 12px;font-size:11px;color:#1e40af;margin-bottom:8px;font-weight:700;">Lista completa — todos os campos num só ecrã com scroll.</div>`;
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
            <b>Híbrido:</b> «${pg.pageTitle || 'Etapa'}» — etapa ${hy.length ? pix + 1 : 0} de ${hy.length}
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
        const fi = fields.filter((x) => x.type !== 'section_break').findIndex((x) => x.id === f.id);
        const num = fi >= 0 ? fi + 1 : idx + 1;
        let relatedRules = globalFormSettings.rules ? globalFormSettings.rules.filter(r => r.actions && r.actions.some(a => a.targetId === f.id)) : [];
        let isCond = relatedRules.length > 0;
        let wrapperStyle = `background:white; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column; gap:8px;`;
        if(isCond) wrapperStyle += ` border: 2px dashed #c084fc; opacity:0.9; `;
        
        let labelTag = `<label style="font-size:14.5px; font-weight:700; color:#1e293b; line-height:1.2;">${num}. ${f.label}${f.required ? '<span style="color:#ef4444; margin-left:4px; font-size:16px;">*</span>' : ''}</label>`;
        let condBadge = isCond ? `<div style="font-size:10px; background:#f3e8ff; color:#7e22ce; font-weight:700; padding:4px 8px; border-radius:6px; align-self:flex-start;"><ion-icon name="color-wand-outline"></ion-icon> Ativado por ${relatedRules.length} Regra(s)</div>` : '';
        const helpPlain = (f.description || '').replace(/<[^>]+>/g, '').trim();
        const helpHtmlStr = f.helpHtml || '';
        const helpRich = helpHtmlStr.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        const helpHasImg = /<img\b[^>]*\bsrc\s*=\s*["'][^"']+["']/i.test(helpHtmlStr);
        const hasHelpContent = helpRich.length > 0 || helpPlain.length > 0 || helpHasImg;
        const showHelpInApp = f.showFieldInstructions !== false && hasHelpContent;
        const helpMock = showHelpInApp
          ? `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;margin-bottom:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:11px;font-weight:700;color:#1e40af;"><ion-icon name="document-text-outline" style="font-size:14px;"></ion-icon> Instruções</div>`
          : '';
        
        let inputMock = '';
        if(f.type === 'text') inputMock = `<input type="text" placeholder="Sua resposta..." disabled style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:14px;">`;
        if(f.type === 'email') inputMock = `<input type="email" placeholder="usuario@email.com" disabled style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:14px;">`;
        if(f.type === 'phone') inputMock = `<input type="tel" placeholder="(11) 99999-9999" disabled style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:14px;">`;
        if(f.type === 'number') inputMock = `<input type="number" placeholder="123" disabled style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:14px;">`;
        if(f.type === 'date') inputMock = `<input type="date" disabled style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:14px;">`;
        if(f.type === 'checkbox') inputMock = `<div style="display:flex; gap:12px;"><label style="background:#f1f5f9; padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600; color:#475569"><input type="radio" disabled checked> Sim</label><label style="background:#f1f5f9; padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600; color:#475569"><input type="radio" disabled> Não</label></div>`;
        
        if(f.type === 'dropdown') inputMock = `<div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f8fafc; font-size:14px; color:#475569; display:flex; justify-content:space-between"><span>Selecione uma opção...</span><ion-icon name="chevron-down"></ion-icon></div>`;
        if(f.type === 'rating') inputMock = `<div style="display:flex; gap:8px; font-size:26px; color:#cbd5e1; justify-content:center"><ion-icon name="star"></ion-icon><ion-icon name="star"></ion-icon><ion-icon name="star"></ion-icon><ion-icon name="star-outline"></ion-icon><ion-icon name="star-outline"></ion-icon></div>`;
        if(f.type === 'calculated') inputMock = `<div style="background:#f5f3ff; border:1px solid #c4b5fd; border-radius:8px; padding:12px; font-size:14px; color:#7c3aed; font-family:monospace; text-align:right">R$ 0,00 [Cálculo Auto]</div>`;
        if(f.type === 'hidden') inputMock = `<div style="background:#f1f5f9; border:1px dashed #94a3b8; border-radius:8px; padding:12px; font-size:12px; color:#64748b; text-align:center;"><ion-icon name="eye-off"></ion-icon> Este campo ficará invisível no Celular</div>`;
        
        if(f.type === 'file_upload') inputMock = `<button disabled style="background:#f1f5f9; border:2px dashed #cbd5e1; color:#64748b; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="document-attach" style="font-size:20px"></ion-icon> Anexar Arquivo</button>`;
        if(f.type === 'photo') inputMock = `<div style="background:#f1f5f9; border:2px dashed #cbd5e1; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b; font-size:13px;"><ion-icon name="camera" style="font-size:28px; margin-bottom:4px"></ion-icon> Tocar para Fotografar</div>`;
        if(f.type === 'photo_stamped') inputMock = `<div style="background:#fffbeb; border:2px dashed #f59e0b; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#b45309; text-align:center; padding:10px;"><ion-icon name="scan" style="font-size:28px; margin-bottom:4px"></ion-icon> <b>Câmera Ao Vivo (Anti-Fraude)</b><span style="font-size:10px; line-height:1.2; margin-top:2px;">O App inserirá GPS e Hora. Galeria bloqueada.</span></div>`;
        if(f.type === 'facial_recognition') inputMock = `<div style="background:#fff1f2; border:2px dashed #e11d48; border-radius:10px; height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#9f1239; text-align:center; padding:10px;"><ion-icon name="person" style="font-size:28px; margin-bottom:4px"></ion-icon> <b>Reconhecimento Facial</b><span style="font-size:10px; line-height:1.2; margin-top:2px;">Será comparado com o rosto cadastrado do técnico.</span></div>`;
        
        if(f.type === 'barcode_scan') inputMock = `<div style="background:#f0f9ff; border:2px solid #38bdf8; border-radius:10px; padding:16px; display:flex; align-items:center; justify-content:center; gap:8px; color:#0284c7; font-weight:800; font-size:14px;"><ion-icon name="barcode" style="font-size:24px; color:#0284c7"></ion-icon> ESCANEAR CÓDIGO</div>`;
        if(f.type === 'signature') inputMock = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; height:80px; display:flex; align-items:flex-end; padding:12px; color:#94a3b8; font-size:12px;"><ion-icon name="pencil" style="margin-right:6px"></ion-icon>Deslize o dedo aqui para Assinar...</div>`;
        
        if(f.type === 'transit_start') inputMock = `<button disabled style="background:#3b82f6; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="rocket" style="font-size:20px"></ion-icon> INICIAR DESLOCAMENTO</button>`;
        if(f.type === 'transit_end') inputMock = `<button disabled style="background:#f43f5e; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="flag" style="font-size:20px"></ion-icon> FINALIZAR DESLOCAMENTO</button>`;
        if(f.type === 'geofence_check') inputMock = `<button disabled style="background:#0f172a; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="location" style="font-size:20px"></ion-icon> VALIDAR GEOLOCALIZAÇÃO<br>Raio: ${f.geofenceRadius}m</button>`;
        if(f.type === 'location_pick') inputMock = `<div style="border:1px solid #bae6fd; border-radius:10px; overflow:hidden; background:#f0f9ff;"><div style="height:120px; background:linear-gradient(135deg,#e0f2fe,#f0f9ff); display:flex; align-items:center; justify-content:center; color:#0369a1; font-size:12px; font-weight:700; flex-direction:column; gap:6px;"><ion-icon name="map" style="font-size:32px"></ion-icon>Mapa + alfinete</div><div style="padding:10px; font-size:11px; color:#0c4a6e; font-weight:600;">GPS real + posição ajustada no mapa</div></div>`;
        
        html += `<div style="${wrapperStyle}">${condBadge}${labelTag}${helpMock}${inputMock}</div>`;
    });
    
    html += `<button disabled style="background:var(--primary); color:white; font-weight:800; border:none; padding:18px; border-radius:12px; font-size:16px; margin-top:10px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">✅ SALVAR CHECKLIST EM OFFLINE-FIRST</button>`;
    
    contentEl.innerHTML = html;
}

// Boot Local DB listener
setTimeout(() => window.loadSavedFormsList(), 100);  // let dom settle

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
            }
        });
    });
    document.querySelectorAll('input[name="appHubSectionOrder"]').forEach((r) => {
        r.addEventListener('change', function () {
            if (this.checked && globalFormSettings) {
                globalFormSettings.appHubSectionOrder = normalizeAppHubSectionOrder(this.value);
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

window.sendTestForm = function() {
    if(fields.length === 0) {
        alert("O formulário atual está vazio. Arraste blocos primeiro!");
        return;
    }
    // Reset email field to avoid concatenation bug
    const emailInput = document.getElementById('test-dispatch-email');
    if (emailInput) emailInput.value = '';
    document.getElementById('test-dispatch-modal').style.display = 'flex';
    setTimeout(() => emailInput && emailInput.focus(), 100);
};

window.confirmTestDispatch = async function() {
    try {
        const email = document.getElementById('test-dispatch-email').value;
        if(!email) {
            alert("Informe o e-mail do técnico.");
            return;
        }

        document.getElementById('test-dispatch-modal').style.display = 'none';

        // Garante que a form tenha ID salvo primeiro
        if(!currentFormId || currentFormId === 'temp_new') {
            await window.saveChecklist(); 
        }

        // Se mesmo após forçar salvamento não tiver ID, reportar falha nativa
        if(!currentFormId) {
            console.error("Falha ao gerar ID de formulário em Runtime.");
            alert("Falha interna ao gerar ID do Formulário.");
            return;
        }

        // Se o currentFormId já estava ali antes, força uma atualização do schema pro banco ser 100% fiel
        await window.saveChecklist();

        const payload = {
            id: "os_" + Math.floor(Math.random() * 99999),
            title: `Checklist Novo (${new Date().toLocaleTimeString('pt-BR')})`,
            description: "Enviado de forma manual para vistoria.",
            category: "TASK",
            startDate: new Date().toISOString(),
            endDate: new Date().toISOString(),
            isAllDay: true,
            source: "CHECKLIST",
            refId: currentFormId,
            metadata: { icon: currentFormIcon || document.getElementById('tpl-icon').value },
            ownerEmail: email
        };

        const res = await fetch(`${brsparkApiBase()}/checklists/dispatch`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if(!res.ok) throw new Error("Servidor Node.js (Backend) não respondeu OK.");

        console.log("🚀 PAYLOAD ENVIADO AO BACKEND:", payload);
        alert(`Envio Concluído!\n\nO servidor despachou a OS [${payload.id}] contendo o Formulário [${currentFormId}] para [${email}].\n\nAbra o App na aba Agenda para verificar!`);

    } catch(err) {
        console.error("Erro no envio local de teste:", err);
        alert("Ocorreu um problema ao despachar para o Servidor Local: " + err.message);
    }
};

// ==========================================
// 🚀 AUTOMATIONS & RULES ENGINE (IF/THEN)
// ==========================================

/** Monitor virtual: tempo total do formulário (app grava __form_started_at / metadata). */
const FORM_CLOCK_COND_ID = '__brspark_form_clock__';

function escapeHtmlLogic(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Rótulo no select de alvo / monitor — destaca separadores de etapa (section_break). */
function logicFieldSelectLabel(fld) {
    if (!fld) return '';
    if (fld.type === 'section_break') {
        return `[Seção/Etapa] ${fld.label || '(sem nome)'} — ${fld.id}`;
    }
    return `${fld.label || fld.id} (${fld.id})`;
}

function logicConditionNeedsSeconds(operator) {
    return (
        operator === 'section_elapsed_sec_gte' ||
        operator === 'section_elapsed_sec_lte' ||
        operator === 'form_elapsed_sec_gte' ||
        operator === 'form_elapsed_sec_lte'
    );
}

/** Ajusta operador/valor quando o monitor deixa de ser campo “normal”. */
function normalizeRuleOperatorForMonitor(rule) {
    const mid = rule.condFieldId || currentLogicFieldId;
    const fld = fields.find((f) => f.id === mid);
    const isFormClock = mid === FORM_CLOCK_COND_ID;
    const isSection = fld && fld.type === 'section_break';

    let valid = ['==', '!=', 'contains', 'not_empty', 'is_empty'];
    if (isFormClock) valid = ['form_elapsed_sec_gte', 'form_elapsed_sec_lte'];
    else if (isSection) {
        valid = [
            'section_has_started',
            'section_not_started',
            'section_has_ended',
            'section_not_ended',
            'section_in_progress',
            'section_elapsed_sec_gte',
            'section_elapsed_sec_lte',
        ];
    }

    if (!valid.includes(rule.operator)) {
        rule.operator = valid[0];
        rule.value = logicConditionNeedsSeconds(rule.operator) ? '60' : '';
    }
}

function buildLogicConditionUI(rule, ruleIndex, monitorFieldId) {
    const fld = fields.find((f) => f.id === monitorFieldId);
    const isFormClock = monitorFieldId === FORM_CLOCK_COND_ID;
    const isSection = fld && fld.type === 'section_break';
    const op = rule.operator || '==';

    let opSelect = '';
    if (isFormClock) {
        opSelect = `
            <select class="prop-input" onchange="window.updateLogicRule(${ruleIndex}, 'operator', this.value)" style="margin-bottom:12px;">
                <option value="form_elapsed_sec_gte" ${op === 'form_elapsed_sec_gte' ? 'selected' : ''}>Tempo total no formulário ≥ (segundos)</option>
                <option value="form_elapsed_sec_lte" ${op === 'form_elapsed_sec_lte' ? 'selected' : ''}>Tempo total no formulário ≤ (segundos)</option>
            </select>`;
    } else if (isSection) {
        opSelect = `
            <select class="prop-input" onchange="window.updateLogicRule(${ruleIndex}, 'operator', this.value)" style="margin-bottom:12px;">
                <option value="section_has_started" ${op === 'section_has_started' ? 'selected' : ''}>Técnico já entrou nesta etapa</option>
                <option value="section_not_started" ${op === 'section_not_started' ? 'selected' : ''}>Ainda não entrou nesta etapa</option>
                <option value="section_has_ended" ${op === 'section_has_ended' ? 'selected' : ''}>Etapa já foi concluída (avançou ou enviou)</option>
                <option value="section_not_ended" ${op === 'section_not_ended' ? 'selected' : ''}>Etapa ainda não foi concluída</option>
                <option value="section_in_progress" ${op === 'section_in_progress' ? 'selected' : ''}>Em curso (entrou e não concluiu)</option>
                <option value="section_elapsed_sec_gte" ${op === 'section_elapsed_sec_gte' ? 'selected' : ''}>Tempo gasto na etapa ≥ (segundos)</option>
                <option value="section_elapsed_sec_lte" ${op === 'section_elapsed_sec_lte' ? 'selected' : ''}>Tempo gasto na etapa ≤ (segundos)</option>
            </select>`;
    } else {
        opSelect = `
            <select class="prop-input" onchange="window.updateLogicRule(${ruleIndex}, 'operator', this.value)" style="margin-bottom:12px;">
                <option value="==" ${op === '==' ? 'selected' : ''}>Igual a (==)</option>
                <option value="!=" ${op === '!=' ? 'selected' : ''}>Diferente de (!=)</option>
                <option value="contains" ${op === 'contains' ? 'selected' : ''}>Contém texto</option>
                <option value="not_empty" ${op === 'not_empty' ? 'selected' : ''}>Estiver Preenchido (Qualquer valor)</option>
                <option value="is_empty" ${op === 'is_empty' ? 'selected' : ''}>Estiver Vazio</option>
            </select>`;
    }

    let valInput = '';
    if (logicConditionNeedsSeconds(op)) {
        valInput = `
            <input type="number" min="0" step="1" class="prop-input" placeholder="Segundos (ex: 120)" value="${escapeHtmlLogic(rule.value || '')}" onchange="window.updateLogicRule(${ruleIndex}, 'value', this.value)" style="margin-bottom:12px;" />`;
    } else if (!isFormClock && !isSection && op !== 'is_empty' && op !== 'not_empty') {
        valInput = `
            <input type="text" class="prop-input" placeholder="Valor esperado" value="${escapeHtmlLogic(rule.value || '')}" onchange="window.updateLogicRule(${ruleIndex}, 'value', this.value)" style="margin-bottom:12px;" />`;
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
            return logicFieldSelectLabel(a).localeCompare(logicFieldSelectLabel(b), 'pt');
        });
    }
    const body = list
        .map(
            (fld) =>
                `<option value="${escapeHtmlLogic(fld.id)}" ${selectedTargetId === fld.id ? 'selected' : ''}>${escapeHtmlLogic(logicFieldSelectLabel(fld))}</option>`
        )
        .join('');
    return '<option value="">[Selec. Alvo]</option>' + body;
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
    currentLogicFieldId = fieldId;
    
    const field = fields.find(f => f.id === fieldId);
    if(!field) return;
    
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
    row1.appendChild(document.createTextNode('Regras neste bloco:'));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'logic-modal-field-label';
    inp.className = 'prop-input';
    inp.value = field.label || '';
    inp.setAttribute('aria-label', 'Nome do campo ou etapa');
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
    tail.innerHTML =
        'Use <em>Campo monitorado</em> para disparar a condição a partir de outro campo ou de uma <em>seção/etapa</em>.';
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
            `<option value="${FORM_CLOCK_COND_ID}" ${monitorFieldId === FORM_CLOCK_COND_ID ? 'selected' : ''}>[Formulário] Cronómetro geral (tempo total)</option>` +
            fields
                .map(
                    (ff) =>
                        `<option value="${escapeHtmlLogic(ff.id)}" ${monitorFieldId === ff.id ? 'selected' : ''}>${escapeHtmlLogic(logicFieldSelectLabel(ff))}</option>`
                )
                .join('');
        const condFieldSelect = `
            <div style="margin-bottom:12px;">
                <label style="display:block; font-size:10px; font-weight:800; color:#64748b; margin-bottom:4px;">Campo monitorado (dispara o SE)</label>
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
            
            if (act.type === 'API_VALIDATION') {
                actionsHTML += `
                <div style="display:flex; flex-direction:column; gap:8px; align-items:stretch; background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:8px; border:1px solid #bae6fd;">
                    <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
                        <select class="prop-input" style="flex:1" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'type', this.value)">
                            <option value="SHOW">Exibir o Campo</option>
                            <option value="HIDE">Ocultar o Campo</option>
                            <option value="REQUIRE">Tornar Obrigatório</option>
                            <option value="OPTIONAL">Tornar Opcional</option>
                            <option value="SET_VALUE">Definir Valor</option>
                            <option value="API_VALIDATION" selected>Validar na API Externa</option>
                        </select>
                        <div style="cursor:pointer; color:var(--red); font-size:20px;" onclick="window.removeLogicAction(${ruleIndex}, ${actionIndex})">&times;</div>
                    </div>
                    <label style="font-size:10px; color:#0284c7; font-weight:bold;">URL do Endpoint (O app fará POST injetando o Payload XML/JSON)</label>
                    <input type="text" class="prop-input" placeholder="Ex: https://api.fornecedor.com/valida" value="${act.apiUrl || ''}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiUrl', this.value)" />
                    <label style="font-size:10px; color:#0284c7; font-weight:bold;">Condição de Retorno de Sucesso (String/Regex Esperada no Body)</label>
                    <input type="text" class="prop-input" placeholder="Ex: \"status\":\"VALID\"" value="${act.apiExpectedReturn || ''}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiExpectedReturn', this.value)" />
                    <label style="font-size:10px; color:#0284c7; font-weight:bold;">Mensagem Personalizada em caso de Bloqueio/Erro</label>
                    <input type="text" class="prop-input" placeholder="Ex: CPF Inválido no SERASA." value="${act.apiErrorMsg || ''}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiErrorMsg', this.value)" />
                    <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                        <input type="checkbox" id="api_off_${ruleIndex}_${actionIndex}" ${act.apiAllowOffline ? 'checked' : ''} onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'apiAllowOffline', this.checked)" />
                        <label for="api_off_${ruleIndex}_${actionIndex}" style="font-size:12px; color:#0369a1; cursor:pointer;">Permitir que o técnico pule a regra se estiver OFFLINE</label>
                    </div>
                </div>`;
            } else {
                actionsHTML += `
                    <div style="display:flex; gap:8px; align-items:center; background:#f8fafc; padding:8px; border-radius:6px; margin-bottom:8px; border:1px solid #e2e8f0;">
                        <div style="color:var(--accent); font-weight:800; font-size:12px; margin-right:8px;">ENTÃO</div>
                        <select class="prop-input" style="flex:1" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'type', this.value)">
                            <option value="SHOW" ${act.type==='SHOW'?'selected':''}>Exibir o Campo</option>
                            <option value="HIDE" ${act.type==='HIDE'?'selected':''}>Ocultar o Campo</option>
                            <option value="REQUIRE" ${act.type==='REQUIRE'?'selected':''}>Tornar Obrigatório</option>
                            <option value="OPTIONAL" ${act.type==='OPTIONAL'?'selected':''}>Tornar Opcional</option>
                            <option value="SET_VALUE" ${act.type==='SET_VALUE'?'selected':''}>Definir Valor</option>
                            <option value="API_VALIDATION" ${act.type==='API_VALIDATION'?'selected':''}>Validar na API Externa</option>
                        </select>
                        <select class="prop-input" style="flex:1">
                            ${fieldOptions}
                        </select>
                        ${act.type === 'SET_VALUE' ? `<input type="text" class="prop-input" style="flex:1" placeholder="Novo valor" value="${act.value || ''}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'value', this.value)" />` : ''}
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
                    <div style="background:#f1f5f9; padding:6px 12px; border-radius:6px; color:#334155; font-weight:800; font-size:12px; align-self:flex-start;">SE</div>
                    <div style="flex:1; min-width:120px;">${opSelect}</div>
                    <div style="flex:1; min-width:120px;">${valInput}</div>
                    </div>
                </div>
                <div style="cursor:pointer; color:var(--red); padding:4px 8px; font-weight:700; font-size:12px; border:1px solid var(--red); border-radius:4px; margin-left:12px;" onclick="window.removeLogicRule(${ruleIndex})">Excluir Regra</div>
            </div>
            
            <div style="border-top:1px dashed #cbd5e1; padding-top:12px;">
                ${actionsHTML}
                <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="window.addLogicAction(${ruleIndex})">+ Adicionar Ação (ENTÃO)</button>
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

// ─── Assistente IA: Excel .xlsx → analisar → confirmar tipos → schemaData ─────────
window.__brsparkAiDraft = null;
/** @type {{ items: object[], title: string, description: string, hint: string, sourceFileName?: string, analyzedAt?: string, truncated?: boolean } | null} */
window.__brsparkAiSession = null;

function escapeHtmlAi(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function brsparkAdminBearerToken() {
    try {
        return sessionStorage.getItem('brspark_admin_token') || '';
    } catch (e) {
        return '';
    }
}

/**
 * @param {boolean} on
 * @param {'analyze'|'build'|''} [phase]
 */
function setAiFormLoading(on, phase) {
    const el = document.getElementById('ai-form-loading');
    if (el) {
        el.classList.toggle('is-visible', !!on);
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    const sub = document.getElementById('ai-form-loading-sub');
    if (sub) {
        if (phase === 'build') {
            sub.textContent = 'A montar o formulário com as opções que escolheu.';
        } else if (phase === 'analyze') {
            sub.textContent = 'A ler o Excel e a pedir sugestões à IA. Isto pode levar até um minuto.';
        } else {
            sub.textContent = 'A ler o Excel e a pedir sugestões à IA. Isto pode levar até um minuto.';
        }
    }
    const titleEl = document.querySelector('#ai-form-loading .ai-form-loading-title');
    if (titleEl) {
        titleEl.textContent =
            phase === 'build' ? 'A gerar o formulário…' : on ? 'A analisar a planilha…' : 'A gerar o formulário…';
    }
    [
        'ai-form-file',
        'ai-form-hint',
        'ai-form-generate-btn',
        'ai-form-back-btn',
        'ai-form-final-btn',
        'ai-form-new-btn',
        'ai-form-replace-btn',
        'ai-form-append-btn',
        'ai-form-session-title',
        'ai-form-session-desc',
    ].forEach((id) => {
        const n = document.getElementById(id);
        if (n) n.disabled = !!on;
    });
}

function aiFormSetWizardStep(step) {
    const upload = document.getElementById('ai-form-upload-section');
    const validate = document.getElementById('ai-form-validate-section');
    const panel = document.getElementById('ai-form-modal-panel');
    const previewWrap = document.getElementById('ai-form-preview-wrap');
    const postBuild = document.getElementById('ai-form-post-build');
    if (upload) upload.style.display = step === 'upload' ? 'block' : 'none';
    if (validate) validate.style.display = step === 'validate' ? 'block' : 'none';
    if (panel) {
        panel.classList.toggle('ai-form-panel-wide', step === 'validate');
    }
    if (previewWrap) {
        previewWrap.style.display = step === 'validate' ? 'none' : 'block';
    }
    if (postBuild) postBuild.style.display = step === 'done' ? 'block' : 'none';
}

function clearAiFormHistoryDom() {
    const hs = document.getElementById('ai-form-history-static');
    if (hs) hs.innerHTML = '';
    const hp = document.getElementById('ai-form-history-proposals');
    if (hp) hp.innerHTML = '';
    const hl = document.getElementById('ai-form-history-live');
    if (hl) hl.innerHTML = '';
    const hist = document.getElementById('ai-form-history');
    if (hist) hist.open = false;
}

function renderAiFormHistorySession(sess) {
    if (!sess) return;
    const staticEl = document.getElementById('ai-form-history-static');
    const propEl = document.getElementById('ai-form-history-proposals');
    if (!staticEl || !propEl) return;

    const when = sess.analyzedAt
        ? new Date(sess.analyzedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
    let meta =
        '<strong>Ficheiro:</strong> ' +
        escapeHtmlAi(sess.sourceFileName || '(sem nome)') +
        '<br><strong>Analisado:</strong> ' +
        escapeHtmlAi(when);
    if (sess.hint) {
        meta += '<br><strong>Instruções que enviou:</strong> ' + escapeHtmlAi(sess.hint);
    }
    if (sess.truncated) {
        meta +=
            '<br><span style="color:#b45309;">Aviso: o conteúdo da planilha foi truncado por tamanho.</span>';
    }
    staticEl.innerHTML = meta;

    propEl.innerHTML = '';
    (sess.items || []).forEach(function (item) {
        const li = document.createElement('li');
        const kind =
            item.kind === 'section_break'
                ? 'Etapa'
                : 'Campo';
        const opts = (item.options || [])
            .map(function (o) {
                return (o.shortLabel || o.type || '').trim();
            })
            .filter(Boolean)
            .join(', ');
        li.innerHTML =
            '<strong>' +
            escapeHtmlAi(kind) +
            ':</strong> ' +
            escapeHtmlAi(item.label || '') +
            (item.context ? ' <em style="color:#64748b;">(' + escapeHtmlAi(item.context) + ')</em>' : '') +
            '<br><span style="color:#64748b;">Opções sugeridas pela IA:</span> ' +
            escapeHtmlAi(opts || '—');
        propEl.appendChild(li);
    });

    const hist = document.getElementById('ai-form-history');
    if (hist) hist.open = true;
    updateAiFormHistoryLive();
}

function updateAiFormHistoryLive() {
    const liveEl = document.getElementById('ai-form-history-live');
    if (!liveEl) return;
    liveEl.innerHTML = '';
    document.querySelectorAll('#ai-form-items .ai-item-card').forEach(function (card) {
        const li = document.createElement('li');
        const kind = (card.querySelector('.ai-item-kind') && card.querySelector('.ai-item-kind').textContent) || '';
        const label =
            (card.querySelector('.ai-item-label') && card.querySelector('.ai-item-label').textContent) || '';
        const active = card.querySelector('.ai-opt-btn.is-active');
        const choice = active ? active.textContent.trim() : '—';
        let extra = '';
        const req = card.querySelector('.ai-required-cb');
        if (req && kind.indexOf('Campo') !== -1 && req.checked) {
            extra = ' <span style="color:#b45309;">· obrigatório</span>';
        }
        li.innerHTML =
            '<strong>' +
            escapeHtmlAi(kind) +
            ':</strong> ' +
            escapeHtmlAi(label) +
            ' → <span style="color:#5b21b6;">' +
            escapeHtmlAi(choice) +
            '</span>' +
            extra;
        liveEl.appendChild(li);
    });
    if (!liveEl.children.length) {
        const li = document.createElement('li');
        li.style.color = '#94a3b8';
        li.textContent = '(ainda sem cartões)';
        liveEl.appendChild(li);
    }
}

function ensureAiHistoryLiveUpdates() {
    const v = document.getElementById('ai-form-validate-section');
    if (!v || v._aiHistChangeBound) return;
    v._aiHistChangeBound = true;
    v.addEventListener('change', function (ev) {
        if (ev.target && ev.target.classList && ev.target.classList.contains('ai-required-cb')) {
            updateAiFormHistoryLive();
        }
    });
}

function updateAiCardOptionsVisibility(card) {
    if (!card) return;
    const active = card.querySelector('.ai-opt-btn.is-active');
    const typ = active ? active.getAttribute('data-option-type') : '';
    const wrap = card.querySelector('.ai-suggest-options-wrap');
    if (wrap) {
        wrap.style.display = typ === 'dropdown' || typ === 'multiselect' ? 'block' : 'none';
    }
}

function ensureAiItemsDelegation() {
    const root = document.getElementById('ai-form-items');
    if (!root || root._aiDelegBound) return;
    root._aiDelegBound = true;
    root.addEventListener('click', function (ev) {
        const btn = ev.target.closest('.ai-opt-btn');
        if (!btn || !root.contains(btn)) return;
        const card = btn.closest('.ai-item-card');
        if (!card) return;
        card.querySelectorAll('.ai-opt-btn').forEach(function (b) {
            b.classList.toggle('is-active', b === btn);
        });
        card.dataset.selectedOption = btn.getAttribute('data-option-key') || '';
        updateAiCardOptionsVisibility(card);
        updateAiFormHistoryLive();
    });
}

function renderAiFormValidateCards(items) {
    ensureAiItemsDelegation();
    const root = document.getElementById('ai-form-items');
    if (!root) return;
    root.innerHTML = '';
    (items || []).forEach(function (item) {
        const card = document.createElement('div');
        card.className = 'ai-item-card';
        card.dataset.itemKey = item.key;
        card.dataset.selectedOption = item.recommendedOptionKey || '';

        const kindEl = document.createElement('div');
        kindEl.className = 'ai-item-kind';
        kindEl.textContent = item.kind === 'section_break' ? 'Etapa / secção' : 'Campo';
        card.appendChild(kindEl);

        const lab = document.createElement('p');
        lab.className = 'ai-item-label';
        lab.textContent = item.label || '';
        card.appendChild(lab);

        if (item.context) {
            const ctx = document.createElement('p');
            ctx.className = 'ai-item-context';
            ctx.textContent = item.context;
            card.appendChild(ctx);
        }

        const row = document.createElement('div');
        row.className = 'ai-opt-row';
        let hasActive = false;
        (item.options || []).forEach(function (opt) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ai-opt-btn';
            if (opt.key === item.recommendedOptionKey) {
                b.classList.add('is-active');
                hasActive = true;
            }
            b.setAttribute('data-item-key', item.key);
            b.setAttribute('data-option-key', opt.key);
            b.setAttribute('data-option-type', opt.type || '');
            let bt = opt.shortLabel || opt.type || '';
            if (opt.hint) bt += ' — ' + opt.hint;
            b.textContent = bt;
            row.appendChild(b);
        });
        if (!hasActive && row.firstElementChild) {
            row.firstElementChild.classList.add('is-active');
            card.dataset.selectedOption = row.firstElementChild.getAttribute('data-option-key') || '';
        }
        card.appendChild(row);

        if (item.kind !== 'section_break') {
            const reqRow = document.createElement('div');
            reqRow.className = 'ai-required-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'ai-required-cb';
            cb.id = 'ai-req-' + item.key.replace(/[^a-z0-9_-]/gi, '_');
            const lbl = document.createElement('label');
            lbl.setAttribute('for', cb.id);
            lbl.textContent = 'Obrigatório';
            reqRow.appendChild(cb);
            reqRow.appendChild(lbl);
            card.appendChild(reqRow);
        }

        const optWrap = document.createElement('div');
        optWrap.className = 'ai-suggest-options-wrap';
        optWrap.style.display = 'none';
        const labOpt = document.createElement('label');
        labOpt.textContent = 'Opções da lista (vírgulas), se aplicável';
        const ta = document.createElement('textarea');
        ta.className = 'ai-suggest-options';
        ta.placeholder = 'Ex.: Sim, Não, N/A';
        if (item.suggestedOptions) ta.value = item.suggestedOptions;
        optWrap.appendChild(labOpt);
        optWrap.appendChild(ta);
        card.appendChild(optWrap);

        root.appendChild(card);
        updateAiCardOptionsVisibility(card);
    });
    updateAiFormHistoryLive();
}

function collectAiFormSelections() {
    const selections = {};
    document.querySelectorAll('#ai-form-items .ai-item-card').forEach(function (card) {
        const key = card.dataset.itemKey;
        if (!key) return;
        const optionKey =
            card.dataset.selectedOption ||
            (function () {
                const a = card.querySelector('.ai-opt-btn.is-active');
                return a ? a.getAttribute('data-option-key') : '';
            })();
        const sel = { optionKey: optionKey || '' };
        const req = card.querySelector('.ai-required-cb');
        if (req && req.checked) sel.required = true;
        const ta = card.querySelector('.ai-suggest-options');
        if (ta && ta.value.trim()) sel.options = ta.value.trim();
        selections[key] = sel;
    });
    return selections;
}

function collectAiFormExcelOptions(hintText) {
    const g = function (id) {
        return document.getElementById(id);
    };
    const kindEl = g('ai-form-kind');
    return {
        hint: hintText || '',
        objective: g('ai-form-objective') ? String(g('ai-form-objective').value || '').trim() : '',
        sector: g('ai-form-sector') ? String(g('ai-form-sector').value || '').trim() : '',
        formKind: kindEl ? String(kindEl.value || 'checklist') : 'checklist',
        requireStampedPhotos: !!(g('ai-ctx-stamped') && g('ai-ctx-stamped').checked),
        allowBarcode: !!(g('ai-ctx-barcode') && g('ai-ctx-barcode').checked),
        requireGps: !!(g('ai-ctx-gps') && g('ai-ctx-gps').checked),
        allowGeofence: !!(g('ai-ctx-geofence') && g('ai-ctx-geofence').checked),
        allowTransit: !!(g('ai-ctx-transit') && g('ai-ctx-transit').checked),
        allowFacial: !!(g('ai-ctx-facial') && g('ai-ctx-facial').checked),
        allowSignature: !!(g('ai-ctx-signature') && g('ai-ctx-signature').checked),
        allowCalculated: !!(g('ai-ctx-calc') && g('ai-ctx-calc').checked),
    };
}

function collectCopilotFormContext() {
    const g = function (id) {
        return document.getElementById(id);
    };
    return {
        objective: g('copilot-ctx-objective') ? String(g('copilot-ctx-objective').value || '').trim().slice(0, 800) : '',
        sector: '',
        formKind: 'checklist',
        requireStampedPhotos: !!(g('copilot-ctx-stamped') && g('copilot-ctx-stamped').checked),
        allowBarcode: !!(g('copilot-ctx-barcode') && g('copilot-ctx-barcode').checked),
        requireGps: !!(g('copilot-ctx-gps') && g('copilot-ctx-gps').checked),
        allowGeofence: !!(g('copilot-ctx-geofence') && g('copilot-ctx-geofence').checked),
        allowTransit: !!(g('copilot-ctx-transit') && g('copilot-ctx-transit').checked),
    };
}

window.brsparkAiFormWizardReset = function () {
    window.__brsparkAiSession = null;
    window.__brsparkAiDraft = null;
    const itemsRoot = document.getElementById('ai-form-items');
    if (itemsRoot) itemsRoot.innerHTML = '';
    const status = document.getElementById('ai-form-status');
    if (status) status.textContent = '';
    const preview = document.getElementById('ai-form-preview');
    if (preview) {
        preview.innerHTML =
            '<span class="ai-preview-muted" style="font-size:12px;">Analise primeiro um ficheiro .xlsx e confirme os cartões acima.</span>';
    }
    const fi = document.getElementById('ai-form-file');
    if (fi) fi.value = '';
    const postBuild = document.getElementById('ai-form-post-build');
    if (postBuild) postBuild.style.display = 'none';
    const st = document.getElementById('ai-form-session-title');
    const sd = document.getElementById('ai-form-session-desc');
    if (st) st.value = '';
    if (sd) sd.value = '';
    const obj = document.getElementById('ai-form-objective');
    if (obj) obj.value = '';
    const sec = document.getElementById('ai-form-sector');
    if (sec) sec.value = '';
    const kind = document.getElementById('ai-form-kind');
    if (kind) kind.value = 'checklist';
    ['ai-ctx-stamped', 'ai-ctx-barcode', 'ai-ctx-gps', 'ai-ctx-geofence', 'ai-ctx-transit', 'ai-ctx-facial', 'ai-ctx-signature', 'ai-ctx-calc'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    clearAiFormHistoryDom();
    aiFormSetWizardStep('upload');
};

window.openAiFormModal = function () {
    const m = document.getElementById('ai-form-modal');
    if (!m) return;
    window.brsparkAiFormWizardReset();
    const hintEl = document.getElementById('ai-form-hint');
    if (hintEl) hintEl.value = '';
    const genBtn = document.getElementById('ai-form-generate-btn');
    if (genBtn) {
        genBtn.disabled = false;
        genBtn.textContent = 'Analisar planilha';
    }
    setAiFormLoading(false);
    ensureAiHistoryLiveUpdates();
    m.style.display = 'flex';
};

window.closeAiFormModal = function () {
    setAiFormLoading(false);
    const m = document.getElementById('ai-form-modal');
    if (m) m.style.display = 'none';
};

window.brsparkAiFormAnalyze = async function () {
    const token = brsparkAdminBearerToken();
    if (!token) {
        alert('Inicie sessão no painel admin (token em falta).');
        return;
    }
    const fi = document.getElementById('ai-form-file');
    if (!fi || !fi.files || !fi.files[0]) {
        alert('Escolha um ficheiro .xlsx.');
        return;
    }
    const file = fi.files[0];
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm')) {
        alert('Nesta versão só são aceites ficheiros Excel .xlsx.');
        return;
    }
    const hintEl = document.getElementById('ai-form-hint');
    const hint = hintEl ? String(hintEl.value || '').trim() : '';
    const status = document.getElementById('ai-form-status');
    const preview = document.getElementById('ai-form-preview');
    const btn = document.getElementById('ai-form-generate-btn');
    if (status) status.textContent = '';
    setAiFormLoading(true, 'analyze');
    if (btn) btn.textContent = 'A analisar…';
    try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('options', JSON.stringify(collectAiFormExcelOptions(hint)));
        const res = await fetch(`${brsparkApiBase()}/checklists/ai/analyze-from-file`, {
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
            throw new Error(data.error || res.statusText || 'Pedido falhou');
        }
        const items = data.items || [];
        if (!items.length) {
            throw new Error('A IA não devolveu campos para confirmar. Tente outro ficheiro ou instruções.');
        }
        window.__brsparkAiSession = {
            items: items,
            title: data.title || '',
            description: data.description || '',
            hint: hint,
            sourceFileName: (data.source && data.source.name) || file.name || '',
            analyzedAt: new Date().toISOString(),
            truncated: !!data.truncated,
        };
        window.__brsparkAiDraft = null;
        const stIn = document.getElementById('ai-form-session-title');
        const sdIn = document.getElementById('ai-form-session-desc');
        if (stIn) stIn.value = window.__brsparkAiSession.title || '';
        if (sdIn) sdIn.value = window.__brsparkAiSession.description || '';
        renderAiFormValidateCards(items);
        renderAiFormHistorySession(window.__brsparkAiSession);
        aiFormSetWizardStep('validate');
        if (status) {
            const w = Array.isArray(data.warnings) ? data.warnings.filter(Boolean).join(' ') : '';
            status.textContent =
                (data.truncated ? 'Aviso: conteúdo truncado. ' : '') +
                (w || 'Confirme os tipos abaixo e clique em «Gerar formulário».');
        }
        if (preview) {
            preview.innerHTML =
                '<span class="ai-preview-muted" style="font-size:12px;">Após gerar, a pré-visualização aparece aqui.</span>';
        }
    } catch (e) {
        console.error(e);
        if (status) status.textContent = 'Erro: ' + (e.message || e);
        window.__brsparkAiSession = null;
        aiFormSetWizardStep('upload');
    } finally {
        setAiFormLoading(false);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Analisar planilha';
        }
    }
};

window.brsparkAiFormFinalBuild = async function () {
    const token = brsparkAdminBearerToken();
    if (!token) {
        alert('Inicie sessão no painel admin (token em falta).');
        return;
    }
    const sess = window.__brsparkAiSession;
    if (!sess || !Array.isArray(sess.items) || sess.items.length === 0) {
        alert('Analise primeiro uma planilha.');
        return;
    }
    const status = document.getElementById('ai-form-status');
    const preview = document.getElementById('ai-form-preview');
    const selections = collectAiFormSelections();
    const titleIn = document.getElementById('ai-form-session-title');
    const descIn = document.getElementById('ai-form-session-desc');
    const titleOut = titleIn ? String(titleIn.value || '').trim() : sess.title;
    const descOut = descIn ? String(descIn.value || '').trim() : sess.description;
    if (window.__brsparkAiSession) {
        window.__brsparkAiSession.title = titleOut;
        window.__brsparkAiSession.description = descOut;
    }
    setAiFormLoading(true, 'build');
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/ai/build-form`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: titleOut,
                description: descOut,
                items: sess.items,
                selections: selections,
            }),
        });
        let data = {};
        try {
            data = await res.json();
        } catch (e2) {
            data = {};
        }
        if (!res.ok) {
            throw new Error(data.error || res.statusText || 'Pedido falhou');
        }
        window.__brsparkAiDraft = data;
        aiFormSetWizardStep('done');
        if (status) {
            const w = Array.isArray(data.warnings) ? data.warnings.filter(Boolean).join(' ') : '';
            status.textContent = w || 'Formulário gerado. Pode substituir ou anexar ao canvas.';
        }
        if (preview) {
            const rows = (data.schemaData || []).map(function (f) {
                const typ = (f.type || '?').replace(/</g, '&lt;');
                const lab = String(f.label || f.id || '').replace(/</g, '&lt;');
                return (
                    '<div style="font-size:12px;padding:6px 0;border-bottom:1px solid #e2e8f0;color:#334155;"><strong style="color:#6d28d9;">' +
                    typ +
                    '</strong> — ' +
                    lab +
                    '</div>'
                );
            });
            const tit = String(data.title || '').replace(/</g, '&lt;');
            preview.innerHTML =
                '<div style="margin-bottom:10px;color:#0f172a;"><strong>Título:</strong> ' +
                tit +
                '</div>' +
                '<div style="margin-bottom:10px;color:#334155;"><strong>Campos:</strong> ' +
                (data.schemaData || []).length +
                '</div>' +
                '<div style="max-height:220px;overflow-y:auto;">' +
                (rows.join('') || '<em style="color:#64748b;">Vazio</em>') +
                '</div>';
        }
    } catch (e) {
        console.error(e);
        if (status) status.textContent = 'Erro: ' + (e.message || e);
    } finally {
        setAiFormLoading(false);
    }
};

/** @deprecated Use brsparkAiFormAnalyze — mantido por compatibilidade */
window.brsparkAiFormGenerate = window.brsparkAiFormAnalyze;

function applyAiDraftToCanvas(mode) {
    const d = window.__brsparkAiDraft;
    if (!d || !Array.isArray(d.schemaData) || d.schemaData.length === 0) {
        alert('Gere primeiro um rascunho válido.');
        return;
    }
    const snapshot = ensureSchemaInstructionFlags(JSON.parse(JSON.stringify(d.schemaData)));
    if (mode === 'replace') {
        if (
            !confirm(
                'Substituir todo o canvas pelo rascunho da IA? Guarde o trabalho atual se precisar de o manter.'
            )
        ) {
            return;
        }
        fields = snapshot;
        const ti = document.getElementById('tpl-title');
        const de = document.getElementById('tpl-desc');
        if (ti && d.title) ti.value = d.title;
        if (de && d.description != null) de.value = d.description;
        selectedFieldId = null;
    } else {
        fields = fields.concat(snapshot);
    }
    ensureCanvasSchemaHasSection();
    renderCanvas();
    window.closeAiFormModal();
}

window.applyAiFormDraftReplace = function () {
    applyAiDraftToCanvas('replace');
};

window.applyAiFormDraftAppend = function () {
    applyAiDraftToCanvas('append');
};

/**
 * O HTML inicial do #canvas só tinha .canvas-empty; o Sortable vive em .canvas-section-body
 * criado por renderCanvas(). Sem esta chamada ao carregar, não há lista receptora até
 * «Criar novo» ou «Abrir formulário».
 */
try {
    renderCanvas();
} catch (e) {
    console.warn('[checklists-builder] renderCanvas inicial:', e);
}
