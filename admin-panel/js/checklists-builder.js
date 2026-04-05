/**
 * checklists-builder.js
 * Lógica do Criador de Checklists Drag & Drop com Vanilla JS e SortableJS
 */

function brsparkApiBase() {
  if (typeof window !== 'undefined' && window.__BRSPARK_API_BASE__) {
    return window.__BRSPARK_API_BASE__;
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
  return apiSchema.map((apiField) => {
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

window.initFieldHelpEditor = function (field) {
  flushQuillToBoundField();
  window.destroyFieldHelpEditor();
  if (typeof Quill === 'undefined') {
    console.warn('[builder] Quill não disponível (CDN).');
    return;
  }
  const host = document.getElementById('field-help-editor');
  if (!host) return;
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
let currentIconColor = '#0F172A';

window.openIconPicker = function(cb) {
    iconPickerCallback = cb;
    document.getElementById('icon-picker-modal').style.display = 'flex';
    document.getElementById('icon-search').value = '';
    
    const libSelect = document.getElementById('icon-lib-select');
    if (libSelect && libSelect.options.length === 0) {
        Object.keys(window.ICON_LIBRARIES || {}).forEach(lib => {
            libSelect.innerHTML += `<option value="${lib}">${lib}</option>`;
        });
        libSelect.value = 'Ionicons';
    }
    document.getElementById('icon-color').value = '#0F172A';
    currentIconColor = '#0F172A';
    
    window.switchIconLibrary();
};

window.switchIconLibrary = function() {
    currentIconLib = document.getElementById('icon-lib-select').value || 'Ionicons';
    window.filterIcons('');
};

window.updateIconGridColors = function() {
    currentIconColor = document.getElementById('icon-color').value || '#0F172A';
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

window.filterIcons = function(query) {
    const grid = document.getElementById('icon-grid');
    grid.innerHTML = '';
    const q = query.toLowerCase();
    
    const libs = window.ICON_LIBRARIES || {};
    const icons = libs[currentIconLib] || [];
    const filtered = icons.filter(ic => ic.toLowerCase().includes(q)).slice(0, 150); // limit for perf
    
    filtered.forEach(ic => {
        const div = document.createElement('div');
        div.className = 'icon-btn-picker';
        div.style.cssText = "display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 8px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; background:#f8fafc; transition:0.2s;";
        
        let visual = window.renderWebIcon(currentIconLib, ic, currentIconColor, 24);
        
        div.innerHTML = `${visual}<span style="font-size:9px; color:#64748b; text-align:center;">${ic.substring(0,20)}</span>`;
        div.onclick = () => window.confirmIconSelection(ic);
        div.onmouseover = () => { div.style.borderColor = "var(--primary)"; div.style.backgroundColor = "#eff6ff"; };
        div.onmouseout = () => { div.style.borderColor = "#e2e8f0"; div.style.backgroundColor = "#f8fafc"; };
        grid.appendChild(div);
    });
};

window.confirmIconSelection = function(val) {
    if(iconPickerCallback) {
        if (!val) iconPickerCallback('', '', '');
        else iconPickerCallback(val, currentIconLib, currentIconColor);
    }
    document.getElementById('icon-picker-modal').style.display = 'none';
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
    'file_upload': '<ion-icon name="document-attach-outline"></ion-icon>',
    'photo': '<ion-icon name="camera-outline"></ion-icon>',
    'photo_stamped': '<ion-icon name="scan-outline"></ion-icon>',
    'facial_recognition': '<ion-icon name="person-outline"></ion-icon>',
    'barcode_scan': '<ion-icon name="barcode-outline"></ion-icon>',
    'signature': '<ion-icon name="create-outline"></ion-icon>'
};

// 2. Setup Sortable Drag and Drop
// Toolbox (Modo Clone)
new Sortable(elToolbox, {
    group: {
        name: 'shared',
        pull: 'clone',
        put: false 
    },
    sort: false, // não reordena na base
    animation: 150
});

// Canvas (Modo Receptivo)
new Sortable(elCanvas, {
    group: 'shared',
    animation: 150,
    ghostClass: 'hover-ghost',
    onAdd: function(evt) {
        // Remove o placeholder vazio (se houver)
        const emptyPlc = elCanvas.querySelector('.canvas-empty');
        if(emptyPlc) emptyPlc.remove();
        
        const itemEl = evt.item; // Elemento clonado injetado nativamente
        const type = itemEl.getAttribute('data-type');
        const rawText = itemEl.textContent.trim(); // No mais emojis
        
        // Gerar Id único (Slug interno)
        const newId = 'field_' + Math.floor(Math.random() * 99999);
        
        // Adicionar ao Estado Central
        const newField = {
            id: newId,
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
            options: (type === 'dropdown' || type === 'multiselect') ? 'Opção 1, Opção 2' : null,
            calcFormula: type === 'calculated' ? '' : null,
            textMask: (type === 'text' || type === 'number' || type === 'phone') ? '' : null,
            description: '',
            helpHtml: '',
            defaultValue: '',
            icon: '',
            allowTechnicianComment: false
        };
        
        // Injetar na exata posição na array onde o mouse soltou
        fields.splice(evt.newIndex, 0, newField);
        
        // Em React, recriaríamos a UI pelo estado. Vamos simular isso em JS Puro.
        itemEl.remove(); // Limpamos a sujeira injetada pelo Sortable original
        renderCanvas();
        selectField(newId);
    },
    onEnd: function(evt) {
        // Se reordenou DENTRO do próprio canvas, atualiza a Array indexada
        if(evt.from === elCanvas && evt.to === elCanvas) {
            const [moved] = fields.splice(evt.oldIndex, 1);
            fields.splice(evt.newIndex, 0, moved);
        }
    }
});

// 3. Funções de Renderização Interativa (Declarative-style in Vanilla JS)
function renderCanvas() {
    if(fields.length === 0) {
        elCanvas.innerHTML = '<div class="canvas-empty">Arraste os bloquinhos do menu esquerdo aqui para construir seu Checklist.</div>';
        return;
    }

    elCanvas.innerHTML = ''; // Clear board
    
    fields.forEach(f => {
        const div = document.createElement('div');
        // Elemento Ativo selecionado tem borda colorida
        div.className = `canvas-item ${selectedFieldId === f.id ? 'active' : ''}`;
        div.dataset.id = f.id;
        
        const iconHTML = f.icon ? window.renderWebIcon(f.iconLibrary||'Ionicons', f.icon, f.iconColor||'#1d4ed8', 18) : (iconMap[f.type] || '<ion-icon name="help"></ion-icon>');
        const reqTag = f.type !== 'section_break' 
            ? `<div onclick="window.toggleInlineRequired(event, '${f.id}')" title="Tornar Resposta Obrigatória?" style="cursor:pointer; display:flex; align-items:center; margin-left:8px; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800; transition:0.2s; ${f.required ? 'background:#fee2e2; color:#ef4444; border:1px solid #fca5a5;' : 'background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1;'}">
                 <ion-icon name="${f.required ? 'checkmark-circle' : 'ellipse-outline'}" style="margin-right:2px; font-size:12px;"></ion-icon> REQ
               </div>` 
            : '';
        const condTag = (f.rules && f.rules.length > 0) ? `<div style="display:flex; align-items:center; background:var(--accent-dim); color:var(--accent); font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:800;"><ion-icon name="git-network-outline" style="margin-right:2px; font-size:12px;"></ion-icon> ${f.rules.length} Gatilhos</div>` : '';
        const multiCanvasTypes = ['text', 'number', 'email', 'phone', 'date', 'photo', 'photo_stamped', 'file_upload'];
        const multiTag = (f.multiple && multiCanvasTypes.includes(f.type)) ? `<div style="display:flex; align-items:center; background:#f3e8ff; color:#6b21a8; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:800;" title="Várias respostas">M×</div>` : '';

        if (f.type === 'section_break') {
            div.style.background = '#e2e8f0';
            div.style.border = '2px dashed #94a3b8';
            div.style.textAlign = 'center';
            div.style.position = 'relative';
            div.innerHTML = `
                <div style="font-size:14px; color:#475569; font-weight:800; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:center; align-items:center;">
                    ${iconHTML} SEÇÃO: 
                    <input type="text" style="background:transparent; border:none; border-bottom:1px solid transparent; color:#475569; font-weight:800; text-transform:uppercase; font-size:14px; outline:none; text-align:center; margin-left:6px; min-width: 150px;" value="${f.label || 'NOVA ETAPA'}" onfocus="this.style.borderBottomColor='#94a3b8'; window.selectField('${f.id}')" onblur="this.style.borderBottomColor='transparent'; window.renderCanvas();" oninput="window.handleInlineLabelUpdate(event, '${f.id}')" onclick="event.stopPropagation();" />
                    ${condTag}
                </div>
                <div style="font-size:11px; color:#64748b; margin-top:4px;">O aplicativo forçará o avanço de tela e agrupará as perguntas seguintes sob este nome de Seção.</div>
                <div style="position:absolute; right:16px; top:50%; transform:translateY(-50%); display:flex; gap:16px; align-items:center;">
                    <div title="Lógica e Regras" style="color:var(--accent); cursor:pointer; font-size:18px; display:flex; align-items:center;" onclick="window.openLogicModal(event, '${f.id}')"><ion-icon name="options-outline"></ion-icon></div>
                    <div class="canvas-item-delete" onclick="window.deleteField('${f.id}')">&times;</div>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div style="display:flex; align-items:center; padding-right:110px;">
                    <div title="Trocar Ícone deste Campo" onclick="window.triggerIconPickerForField(event, '${f.id}')" style="width:44px; height:44px; flex-shrink:0; background:${f.icon ? '#eff6ff' : '#f8fafc'}; border:1px ${f.icon ? 'solid #3b82f6' : 'dashed #cbd5e1'}; border-radius:10px; display:flex; justify-content:center; align-items:center; margin-right:14px; cursor:pointer; font-size:22px; color:${f.icon ? '#1d4ed8' : '#64748b'}; transition:0.2s;" onmouseover="this.style.borderColor='#3b82f6'; this.style.color='#3b82f6'" onmouseout="this.style.borderColor='${f.icon ? '#3b82f6' : '#cbd5e1'}'; this.style.color='${f.icon ? '#1d4ed8' : '#64748b'}'">
                        ${iconHTML}
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:14.5px; color:var(--text1); display:flex; align-items:center;">
                            <input type="text" style="background:transparent; border:none; border-bottom:1px dashed transparent; color:var(--text1); font-weight:bold; font-size:14.5px; outline:none; flex:1;" value="${f.label}" onfocus="this.style.borderBottomColor='#cbd5e1'; window.selectField('${f.id}')" onblur="this.style.borderBottomColor='transparent'; window.renderCanvas();" oninput="window.handleInlineLabelUpdate(event, '${f.id}')" onclick="event.stopPropagation();" />
                            ${reqTag} ${multiTag} ${condTag}
                        </div>
                        <div style="font-size:11px; color:var(--text3); margin-top:4px; letter-spacing:0.5px">ID: ${f.id} | TYPE: ${f.type.toUpperCase()}</div>
                    </div>
                </div>
                <div style="position:absolute; right:16px; top:50%; transform:translateY(-50%); display:flex; gap:16px; align-items:center;">
                    <div title="Lógica e Regras" style="color:var(--accent); cursor:pointer; font-size:18px; display:flex; align-items:center;" onclick="window.openLogicModal(event, '${f.id}')"><ion-icon name="options-outline"></ion-icon></div>
                    <div title="Duplicar" style="color:#64748b; cursor:pointer; font-size:18px; display:flex; align-items:center;" onclick="window.cloneField('${f.id}')"><ion-icon name="copy-outline"></ion-icon></div>
                    <div title="Excluir" style="color:var(--red); cursor:pointer; font-size:20px; display:flex; align-items:center;" onclick="window.deleteField('${f.id}')">&times;</div>
                </div>
            `;
        }
        
        // Binding Click to Edit Props
        div.onclick = (e) => {
            if(e.target.className === 'canvas-item-delete') return;
            selectField(f.id);
        };

        elCanvas.appendChild(div);
    });

    // Trigger live mobile update se tiver modal aberto (ou em stand-by)
    if(typeof renderMobilePreview === 'function') {
        renderMobilePreview();
    }
}

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

window.selectField = function(id) {
    selectedFieldId = id;
    // Highlight elements visually without remounting the canvas to avoid stealing focus
    document.querySelectorAll('.canvas-item').forEach(el => {
        if(el.dataset.id === id) el.classList.add('active');
        else el.classList.remove('active');
    });
    renderProperties(); // Renderiza o painel direito
}

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

// Ações na Janela / Global Scope
window.deleteField = function(id) {
    flushQuillToBoundField();
    fields = fields.filter(f => f.id !== id);
    if(selectedFieldId === id) selectedFieldId = null;
    renderCanvas();
    renderProperties();
};

window.cloneField = function(id) {
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
        elPropsBody.innerHTML = '<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">Clique em um bloco no Canvas para configurar suas lógicas.</div>';
        return;
    }

    // Gravar instruções Quill no campo ANTES de apagar o DOM do editor (senão perde-se helpHtml ao trocar de campo / re-renderizar)
    flushQuillToBoundField();
    if (typeof window.destroyFieldHelpEditor === 'function') window.destroyFieldHelpEditor();

    const f = fields.find(x => x.id === selectedFieldId);
    if (!f) {
        selectedFieldId = null;
        elPropsBody.innerHTML = '<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">Clique em um bloco no Canvas para configurar suas lógicas.</div>';
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
        <div class="prop-group">
            <label class="prop-label">Instruções ao técnico (rich text, opcional)</label>
            <div id="field-help-editor-host" style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              <div id="field-help-editor"></div>
            </div>
            <div style="font-size:10px;color:#64748b;margin-top:6px;line-height:1.35;">
              No app: botão <b>Instruções</b> abre o texto e imagens sem empurrar o formulário. Imagens: use o ícone da imagem na barra (envia para o servidor e insere o link). Só texto/imagem também conta como instrução.
            </div>
        </div>
        
        ${f.type !== 'section_break' && f.type !== 'photo' && f.type !== 'photo_stamped' && f.type !== 'facial_recognition' && f.type !== 'file_upload' && f.type !== 'signature' && f.type !== 'geofence_check' && f.type !== 'transit_start' && f.type !== 'transit_end' ? `
        <div class="prop-group">
            <label class="prop-label">Auto-Preenchimento / Valor Padrão (Opcional)</label>
            <input class="prop-input" type="text" value="${f.defaultValue || ''}" placeholder="Use tags como {{user.name}}, {{date}}" onkeyup="window.handleFieldUpdate('defaultValue', this.value)" />
        </div>
        ` : ''}

        <div class="prop-group" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="prop-req" ${reqChecked} onchange="window.handleFieldUpdate('required', this.checked)" />
            <label for="prop-req" style="font-size:13px; font-weight:600; cursor:pointer;">Resposta Obrigatória?</label>
        </div>

        ${['text', 'number', 'email', 'phone', 'date', 'photo', 'photo_stamped', 'file_upload'].includes(f.type) ? `
        <div class="prop-group" style="background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:8px; margin-top:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="prop-multiple" ${f.multiple ? 'checked' : ''} onchange="window.handleFieldUpdate('multiple', this.checked)" />
                <label for="prop-multiple" style="font-size:13px; font-weight:700; cursor:pointer; color:#581c87;">Várias respostas (lista)</label>
            </div>
            <div style="font-size:10px; color:#6b21a8; margin-bottom:10px; line-height:1.35;">O app grava um <b>array</b> na execução (várias fotos, ficheiros ou linhas de texto/número). Compatível com checklists antigos (valor único continua a ser uma string).</div>
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

        ${f.type !== 'section_break' && f.type !== 'hidden' ? `
        <div class="prop-group" style="display:flex; align-items:flex-start; gap:10px; margin-top:4px; background:#f0f9ff; border:1px solid #bae6fd; padding:12px; border-radius:8px;">
            <input type="checkbox" id="prop-allow-comment" ${f.allowTechnicianComment ? 'checked' : ''} onchange="window.handleFieldUpdate('allowTechnicianComment', this.checked)" style="transform:scale(1.2);margin-top:2px;flex-shrink:0" />
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <label for="prop-allow-comment" style="font-size:13px; font-weight:700; color:#0369a1; cursor:pointer;">Comentário do técnico (opcional no app)</label>
                <div style="font-size:10px; color:#0c4a6e; margin-top:4px; line-height:1.35;">Mostra uma caixa de texto livre abaixo da resposta no app. Complementa as instruções ao técnico (não as substitui).</div>
            </div>
        </div>
        ` : ''}

        ${['geofence_check', 'photo', 'photo_stamped', 'facial_recognition', 'signature', 'barcode_scan'].includes(f.type) ? `
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
    rules: []
};

window.configureGlobalSettings = function() {
    const isGlobal = confirm(`O Formulário Inteiro exige Cerca Eletrônica? (Atualmente: ${globalFormSettings.requireGlobalGeofence ? 'SIM' : 'NÃO'})\\n\\nClique OK para SIM, Cancelar para NÃO.`);
    globalFormSettings.requireGlobalGeofence = isGlobal;
    if(isGlobal) {
        const rad = prompt("Digite o raio de segurança em metros:", globalFormSettings.globalGeofenceRadius);
        if(rad) globalFormSettings.globalGeofenceRadius = parseInt(rad);
        alert(`Sucesso! O formulário exigirá estar a ${globalFormSettings.globalGeofenceRadius}m do local de manutenção para ser ABERTO no App.`);
    } else {
        alert("Geofence Global Desativado. Lembre-se que você ainda pode arrastar o componente 'Validar Cerca' para travar/exigir check-in em passos isolados.");
    }
};

// Global: JSON EXPORTER & IMPORTER
window.exportJSON = function() {
    if(fields.length === 0) return alert("Canvas Vazio! Adicione blocos para exportar.");
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
                    fields = parsed.schema;
                    globalFormSettings = parsed.settings || { requireGlobalGeofence: false, globalGeofenceRadius: 200, rules: [] };
                    if(!globalFormSettings.rules) globalFormSettings.rules = [];
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

window.saveChecklist = async function() {
    const btn = document.querySelector('.topbar-actions .btn-primary');
    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳ Salvando...';
    btn.disabled = true;

    flushQuillToBoundField();

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
                alert(
                    'Guardado só neste navegador. A API não gravou (' +
                    res.status +
                    '): ' +
                    (msg || 'erro desconhecido') +
                    '\n\nConfirme que o backend está no ar e a URL da API está certa.'
                );
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

window.promptCreateTemplateFolder = async function () {
    const name = prompt('Nome da nova pasta:');
    if (!name || !String(name).trim()) return;
    try {
        const res = await fetch(`${brsparkApiBase()}/checklists/template-folders`, {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: JSON.stringify({ name: String(name).trim(), parentId: builderBrowseFolderId }),
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
        await refreshTemplateFolders();
        window.renderFormsGridFromLocal(window._formsDbCache || {});
    } catch (e) {
        alert('Erro de rede ao criar pasta.');
        console.warn(e);
    }
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
            alert('Não foi possível mover: ' + msg);
            selectEl.value = folderId === null ? '' : folderId;
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
        await fetch(`${brsparkApiBase()}/checklists/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
    } catch(e) {
        console.warn('Erro ao clonar checklist na API', e);
    }
    
    alert(`Formulário '${form.title}' clonado com sucesso!`);
    window.renderFormsGridFromLocal(db); // Re-render local list
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
                    schema,
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
        globalFormSettings = form.settings || { requireGlobalGeofence: false, globalGeofenceRadius: 200 };
        
        // Fix: Restore inputs correctly
        document.getElementById('tpl-title').value = currentFormTitle;
        document.getElementById('tpl-desc').value = currentFormDesc;
        document.getElementById('tpl-icon').value = currentFormIcon;
        document.getElementById('tpl-icon-preview').innerHTML = currentFormIcon ? `<ion-icon name="${currentFormIcon}" style="font-size:18px;margin-right:6px;vertical-align:-3px;"></ion-icon> ${currentFormIcon}` : 'Escolher Ícone da Tarefa';
        fields = JSON.parse(JSON.stringify(form.schema || []));
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
    fields = [];
    selectedFieldId = null;
    globalFormSettings = { requireGlobalGeofence: false, globalGeofenceRadius: 200 };
    
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
    
    alert(`Painel preparado para: "${title}". Comece a arrastar as opções da esquerda!`);
};

// --- MOBILE SIMULATOR RENDER LOGIC --- //
window.toggleMobilePreview = function() {
    const mod = document.getElementById('mobile-preview-overlay');
    if(!mod) return;
    if(mod.style.display === 'none') {
        mod.style.display = 'flex';
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
        return;
    }
    
    let html = '';
    
    if(globalFormSettings.requireGlobalGeofence) {
        html += `<div style="background:#ecfdf5; border:1px solid #10b981; padding:12px; border-radius:12px; font-size:12px; color:#047857; margin-bottom:8px;">
        <b style="display:block; font-size:13px; margin-bottom:4px;">🔒 Cerca Eletrônica Global:</b> O App só abrirá esta tela se o técnico estiver a menos de ${globalFormSettings.globalGeofenceRadius} metros da coordenada GPS da Manutenção.</div>`;
    }
    
    fields.forEach((f, idx) => {
        let relatedRules = globalFormSettings.rules ? globalFormSettings.rules.filter(r => r.actions && r.actions.some(a => a.targetId === f.id)) : [];
        let isCond = relatedRules.length > 0;
        let wrapperStyle = `background:white; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column; gap:8px;`;
        if(isCond) wrapperStyle += ` border: 2px dashed #c084fc; opacity:0.9; `;
        
        let labelTag = `<label style="font-size:14.5px; font-weight:700; color:#1e293b; line-height:1.2;">${idx + 1}. ${f.label}${f.required ? '<span style="color:#ef4444; margin-left:4px; font-size:16px;">*</span>' : ''}</label>`;
        let condBadge = isCond ? `<div style="font-size:10px; background:#f3e8ff; color:#7e22ce; font-weight:700; padding:4px 8px; border-radius:6px; align-self:flex-start;"><ion-icon name="color-wand-outline"></ion-icon> Ativado por ${relatedRules.length} Regra(s)</div>` : '';
        const helpPlain = (f.description || '').replace(/<[^>]+>/g, '').trim();
        const helpHtmlStr = f.helpHtml || '';
        const helpRich = helpHtmlStr.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        const helpHasImg = /<img\b[^>]*\bsrc\s*=\s*["'][^"']+["']/i.test(helpHtmlStr);
        const hasHelp = helpRich.length > 0 || helpPlain.length > 0 || helpHasImg;
        const helpMock = hasHelp
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
        
        html += `<div style="${wrapperStyle}">${condBadge}${labelTag}${helpMock}${inputMock}</div>`;
    });
    
    html += `<button disabled style="background:var(--primary); color:white; font-weight:800; border:none; padding:18px; border-radius:12px; font-size:16px; margin-top:10px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">✅ SALVAR CHECKLIST EM OFFLINE-FIRST</button>`;
    
    contentEl.innerHTML = html;
}

// Boot Local DB listener
setTimeout(() => window.loadSavedFormsList(), 100);  // let dom settle

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

window.openLogicModal = function(evt, fieldId) {
    if(evt) evt.stopPropagation();
    currentLogicFieldId = fieldId;
    
    const field = fields.find(f => f.id === fieldId);
    if(!field) return;
    
    document.getElementById('logic-modal-subtitle').innerHTML = `Regras neste bloco: <strong>${escapeHtmlLogic(field.label)} (${escapeHtmlLogic(field.id)})</strong>. Use <em>Campo monitorado</em> para disparar a condição a partir de outro campo ou de uma <em>seção/etapa</em>.`;
    
    // Initialize rules array if it doesn't exist
    if(!field.rules) field.rules = [];
    
    renderLogicRules();
    document.getElementById('logic-modal').style.display = 'flex';
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
    document.getElementById('logic-modal').style.display = 'none';
    currentLogicFieldId = null;
    renderCanvas(); // Redesenha parar recriar tags visuais possiveis
};
