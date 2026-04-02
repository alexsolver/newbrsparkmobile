/**
 * checklists-builder.js
 * Lógica do Criador de Checklists Drag & Drop com Vanilla JS e SortableJS
 */

// 1. Initialize State
let fields = [];
let selectedFieldId = null;
let currentFormId = null;
let currentFormTitle = 'Novo Checklist';
let currentFormDesc = '';
let currentFormIcon = '';

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
            dependsOnId: '',
            dependsOnOperator: '==',
            dependsOnValue: '',
            geofenceRadius: type === 'geofence_check' ? '150' : null,
            options: (type === 'dropdown' || type === 'multiselect') ? 'Opção 1, Opção 2' : null,
            calcFormula: type === 'calculated' ? '' : null,
            textMask: (type === 'text' || type === 'number' || type === 'phone') ? '' : null,
            description: '',
            defaultValue: '',
            icon: ''
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
        const condTag = (f.rules && f.rules.length > 0) ? `<span style="background:var(--accent-dim); color:var(--accent); font-size:10px; padding:2px 6px; border-radius:4px; float:right; margin-left:8px; font-weight:800;">🔮 ${f.rules.length} Gatilhos</span>` : '';

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
                <div style="position:absolute; right:12px; top:50%; transform:translateY(-50%); display:flex; gap:12px; align-items:center;">
                    <div title="Lógica e Regras" style="color:var(--accent); cursor:pointer; font-size:18px; line-height:1;" onclick="window.openLogicModal(event, '${f.id}')">🔮</div>
                    <div class="canvas-item-delete" onclick="window.deleteField('${f.id}')">&times;</div>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div style="display:flex; align-items:center; padding-right:60px;">
                    <div title="Trocar Ícone deste Campo" onclick="window.triggerIconPickerForField(event, '${f.id}')" style="width:44px; height:44px; flex-shrink:0; background:${f.icon ? '#eff6ff' : '#f8fafc'}; border:1px ${f.icon ? 'solid #3b82f6' : 'dashed #cbd5e1'}; border-radius:10px; display:flex; justify-content:center; align-items:center; margin-right:14px; cursor:pointer; font-size:22px; color:${f.icon ? '#1d4ed8' : '#64748b'}; transition:0.2s;" onmouseover="this.style.borderColor='#3b82f6'; this.style.color='#3b82f6'" onmouseout="this.style.borderColor='${f.icon ? '#3b82f6' : '#cbd5e1'}'; this.style.color='${f.icon ? '#1d4ed8' : '#64748b'}'">
                        ${iconHTML}
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:14.5px; color:var(--text1); display:flex; align-items:center;">
                            <input type="text" style="background:transparent; border:none; border-bottom:1px dashed transparent; color:var(--text1); font-weight:bold; font-size:14.5px; outline:none; flex:1;" value="${f.label}" onfocus="this.style.borderBottomColor='#cbd5e1'; window.selectField('${f.id}')" onblur="this.style.borderBottomColor='transparent'; window.renderCanvas();" oninput="window.handleInlineLabelUpdate(event, '${f.id}')" onclick="event.stopPropagation();" />
                            ${reqTag} ${condTag}
                        </div>
                        <div style="font-size:11px; color:var(--text3); margin-top:4px; letter-spacing:0.5px">ID: ${f.id} | TYPE: ${f.type.toUpperCase()}</div>
                    </div>
                </div>
                <div style="position:absolute; right:12px; top:50%; transform:translateY(-50%); display:flex; gap:12px; align-items:center;">
                    <div title="Lógica e Regras" style="color:var(--accent); cursor:pointer; font-size:18px; line-height:1;" onclick="window.openLogicModal(event, '${f.id}')">🔮</div>
                    <div title="Duplicar" style="color:#64748b; cursor:pointer; font-size:18px;" onclick="window.cloneField('${f.id}')"><ion-icon name="copy-outline"></ion-icon></div>
                    <div title="Excluir" style="color:var(--red); cursor:pointer; font-size:20px;" onclick="window.deleteField('${f.id}')">&times;</div>
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
    fields = fields.filter(f => f.id !== id);
    if(selectedFieldId === id) selectedFieldId = null;
    renderCanvas();
    renderProperties();
};

window.cloneField = function(id) {
    const fIndex = fields.findIndex(f => f.id === id);
    if(fIndex === -1) return;
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

function updateField(key, val) {
    if(!selectedFieldId) return;
    const f = fields.find(x => x.id === selectedFieldId);
    if(f) {
        f[key] = val;
        renderCanvas();
    }
}

function renderProperties() {
    if(!selectedFieldId) {
        elPropsBody.innerHTML = '<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">Clique em um bloco no Canvas para configurar suas lógicas.</div>';
        return;
    }

    const f = fields.find(x => x.id === selectedFieldId);
    
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
            <label class="prop-label">Ajuda / Descrição do Campo (Opcional)</label>
            <textarea class="prop-input" style="height:45px; font-size:12px;" placeholder="Ex: Fotografe o painel e o chassi..." onkeyup="window.handleFieldUpdate('description', this.value)">${f.description || ''}</textarea>
        </div>
        
        ${f.type !== 'section_break' && f.type !== 'photo' && f.type !== 'photo_stamped' && f.type !== 'file_upload' && f.type !== 'signature' && f.type !== 'geofence_check' && f.type !== 'transit_start' && f.type !== 'transit_end' ? `
        <div class="prop-group">
            <label class="prop-label">Auto-Preenchimento / Valor Padrão (Opcional)</label>
            <input class="prop-input" type="text" value="${f.defaultValue || ''}" placeholder="Use tags como {{user.name}}, {{date}}" onkeyup="window.handleFieldUpdate('defaultValue', this.value)" />
        </div>
        ` : ''}

        <div class="prop-group" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="prop-req" ${reqChecked} onchange="window.handleFieldUpdate('required', this.checked)" />
            <label for="prop-req" style="font-size:13px; font-weight:600; cursor:pointer;">Resposta Obrigatória?</label>
        </div>
        
        ${extraProps}
        
        <div style="margin-top:24px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); text-align:center; padding:20px;">
            <ion-icon name="color-wand-outline" style="font-size:32px; color:#c084fc; margin-bottom:12px;"></ion-icon>
            <div style="font-size:14px; font-weight:800; color:#1e293b;">Central de Automações</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px; margin-bottom:16px;">
                Para ocultar/exibir este passo, mudar seu valor ou torná-lo obrigatório dinamicamente, crie uma Regra Inteligente.
            </div>
            <button class="btn btn-outline" style="width:100%; border-color:#c084fc; color:#a855f7;" onclick="window.openLogicModal(event, '${f.id}')">
                ⚡ Abrir Central de Regras
            </button>
        </div>
    `;
}

// Expose pra UI HTML
window.handleFieldUpdate = function(key, val) {
    updateField(key, val);
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
        
        // 1. BACKUP OFFLINE-FIRST SEMPRE FUNCIONA (GARANTIDO)
        const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
        db[currentFormId] = {
            id: currentFormId,
            title: currentFormTitle,
            description: currentFormDesc,
            settings: globalFormSettings,
            metadata: { icon: currentFormIcon },
            schema: fields,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
        
        // UI Feedback imediato da criação (Offline Success)
        btn.innerHTML = '✅ Salvo Localmente!';
        if(window.loadSavedFormsList) window.loadSavedFormsList();
        
        // 2. Tentar Enviar payload para nuvem (Node.js/Prisma) silenciosamente
        try {
            const payload = {
                id: currentFormId,
                title: currentFormTitle,
                description: currentFormDesc,
                metadata: { icon: currentFormIcon },
                settings: globalFormSettings,
                schemaData: fields
            };
            const res = await fetch('http://localhost:3001/api/checklists/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if(res.ok) btn.innerHTML = '✅ Na Nuvem e App!';
        } catch(apiError) {
            console.warn("Salvamento em Nuvem Falhou. Modificações só estão salvas no seu Browser.", apiError);
        }
        
        setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 2000);
        
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

// --- MULTI-FORM HYBRID STORAGE MANAGEMENT --- //
window.openFormsModal = function() {
    window.loadSavedFormsList();
    document.getElementById('forms-list-modal').style.display = 'flex';
};

window.filterFormsList = function() {
   const q = document.getElementById('form-search').value.toLowerCase();
   const cards = document.querySelectorAll('.form-card-item');
   cards.forEach(card => {
       const title = card.getAttribute('data-title').toLowerCase();
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
            schemaData: newForm.schema
        };
        const token = sessionStorage.getItem('brspark_admin_token') || '';
        await fetch('http://localhost:3001/api/checklists/templates', {
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
            await fetch('http://localhost:3001/api/checklists/templates/' + id, {
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

window.loadSavedFormsList = async function() {
    try {
        const res = await fetch('http://localhost:3001/api/checklists/templates');
        if(res.ok) {
            const apiForms = await res.json();
            const db = {}; // Reconstrói sempre a verdade da nuvem
            apiForms.forEach(form => {
               db[form.id] = {
                   id: form.id,
                   title: form.title,
                   settings: form.settings,
                   schema: form.schemaData,
                   metadata: form.metadata,
                   updatedAt: form.updatedAt
               };
            });
            localStorage.setItem('brspark_checklists_db', JSON.stringify(db));
        }
    } catch(e) {
        console.warn("Sem conexão com API Node.js. Carregando formulários locais do Cache...", e);
    }
    
    const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
    window.renderFormsGridFromLocal(db);
};

window.renderFormsGridFromLocal = function(db) {
    const grid = document.getElementById('forms-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const sortedForms = Object.values(db).sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    sortedForms.forEach(form => {
        const count = (form.schema || []).length;
        const iconHtml = form.metadata?.icon ? `<ion-icon name="${form.metadata.icon}"></ion-icon>` : '📋';
        // Wrapper: card + delete button as SIBLINGS to avoid event bubbling
        grid.innerHTML += `
            <div class="form-card-item" data-title="${form.title}" style="display:flex; align-items:stretch; gap:0; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0; background:#fff; transition:border-color 0.2s;"
                 onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#e2e8f0'">
               <!-- Clickable card (open form) -->
               <div onclick="window.selectFormFromModal('${form.id}')"
                    style="flex:1; padding:16px; cursor:pointer; display:flex; align-items:center; gap:16px; border:none; background:transparent;">
                  <div style="width:48px; height:48px; border-radius:12px; background:#f1f5f9; display:flex; justify-content:center; align-items:center; font-size:24px; color:#64748b; flex-shrink:0">
                     ${iconHtml}
                  </div>
                  <div style="flex:1;">
                     <h4 style="margin:0; font-size:15px; color:#1e293b;">${form.title}</h4>
                     <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8; font-weight:600;">${count} campos</p>
                  </div>
               </div>
               <!-- Duplicate button: SIBLING -->
               <button type="button"
                  onclick="event.stopPropagation(); window.duplicateChecklist('${form.id}')"
                  style="background:#f0fdf4; border:none; border-left:1px solid #dcfce3; width:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#22c55e; font-size:20px; flex-shrink:0; transition:background 0.15s;"
                  onmouseover="this.style.background='#dcfce3'" onmouseout="this.style.background='#f0fdf4'"
                  title="Duplicar formulário">
                  <ion-icon name="copy-outline"></ion-icon>
               </button>
               <!-- Delete button: SIBLING, not child — no bubbling possible -->
               <button type="button"
                  onclick="event.stopPropagation(); window.deleteChecklist('${form.id}')"
                  style="background:#fff0f0; border:none; border-left:1px solid #fee2e2; width:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#ef4444; font-size:20px; flex-shrink:0; transition:background 0.15s;"
                  onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff0f0'"
                  title="Excluir formulário">
                  <ion-icon name="trash-outline"></ion-icon>
               </button>
            </div>
        `;
    });
};

window.loadChecklist = function(id) {
    if(!id) {
        window.createNewChecklist();
        return;
    }
    const db = JSON.parse(localStorage.getItem('brspark_checklists_db') || '{}');
    const form = db[id];
    if(form) {
        currentFormId = form.id;
        currentFormTitle = form.title;
        currentFormDesc = form.description || '';
        currentFormIcon = form.metadata?.icon || '';
        globalFormSettings = form.settings || { requireGlobalGeofence: false, globalGeofenceRadius: 200 };
        
        // Fix: Restore inputs correctly
        document.getElementById('tpl-title').value = currentFormTitle;
        document.getElementById('tpl-desc').value = currentFormDesc;
        document.getElementById('tpl-icon').value = currentFormIcon;
        document.getElementById('tpl-icon-preview').innerHTML = currentFormIcon ? `<ion-icon name="${currentFormIcon}" style="font-size:18px;margin-right:6px;vertical-align:-3px;"></ion-icon> ${currentFormIcon}` : 'Escolher Ícone da Tarefa';
        fields = form.schema || [];
        selectedFieldId = null;
        renderCanvas();
        renderProperties();
    }
};

window.createNewChecklist = function() {
    const modal = document.getElementById('new-checklist-modal');
    if(modal) {
        modal.style.display = 'flex';
        document.getElementById('new-form-name-input').value = 'Novo Checklist';
        setTimeout(() => document.getElementById('new-form-name-input').focus(), 100);
    }
};

window.confirmCreateNewChecklist = function() {
    const title = document.getElementById('new-form-name-input').value.trim() || 'Novo Checklist';
    document.getElementById('new-checklist-modal').style.display = 'none';
    
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
        
        if(f.type === 'barcode_scan') inputMock = `<div style="background:#f0f9ff; border:2px solid #38bdf8; border-radius:10px; padding:16px; display:flex; align-items:center; justify-content:center; gap:8px; color:#0284c7; font-weight:800; font-size:14px;"><ion-icon name="barcode" style="font-size:24px; color:#0284c7"></ion-icon> ESCANEAR CÓDIGO</div>`;
        if(f.type === 'signature') inputMock = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; height:80px; display:flex; align-items:flex-end; padding:12px; color:#94a3b8; font-size:12px;"><ion-icon name="pencil" style="margin-right:6px"></ion-icon>Deslize o dedo aqui para Assinar...</div>`;
        
        if(f.type === 'transit_start') inputMock = `<button disabled style="background:#3b82f6; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="rocket" style="font-size:20px"></ion-icon> INICIAR DESLOCAMENTO</button>`;
        if(f.type === 'transit_end') inputMock = `<button disabled style="background:#f43f5e; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="flag" style="font-size:20px"></ion-icon> FINALIZAR DESLOCAMENTO</button>`;
        if(f.type === 'geofence_check') inputMock = `<button disabled style="background:#0f172a; color:white; border:none; padding:14px; border-radius:10px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;"><ion-icon name="location" style="font-size:20px"></ion-icon> VALIDAR GEOLOCALIZAÇÃO<br>Raio: ${f.geofenceRadius}m</button>`;
        
        html += `<div style="${wrapperStyle}">${condBadge}${labelTag}${inputMock}</div>`;
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

        const res = await fetch('http://localhost:3001/api/checklists/dispatch', {
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

// --- NEW CONTEXTUAL LOGIC BUILDER ---
let currentLogicFieldId = null;

window.openLogicModal = function(evt, fieldId) {
    if(evt) evt.stopPropagation();
    currentLogicFieldId = fieldId;
    
    const field = fields.find(f => f.id === fieldId);
    if(!field) return;
    
    document.getElementById('logic-modal-subtitle').innerHTML = `Gatilhos baseados no campo: <strong>${field.label} (${field.id})</strong>`;
    
    // Initialize rules array if it doesn't exist
    if(!field.rules) field.rules = [];
    
    renderLogicRules();
    document.getElementById('logic-modal').style.display = 'flex';
};

function renderLogicRules() {
    const field = fields.find(f => f.id === currentLogicFieldId);
    if(!field) return;

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
        
        let opSelect = `
            <select class="prop-input" onchange="window.updateLogicRule(${ruleIndex}, 'operator', this.value)" style="margin-bottom:12px;">
                <option value="==" ${rule.operator==='=='?'selected':''}>Igual a (==)</option>
                <option value="!=" ${rule.operator==='!='?'selected':''}>Diferente de (!=)</option>
                <option value="contains" ${rule.operator==='contains'?'selected':''}>Contém texto</option>
                <option value="not_empty" ${rule.operator==='not_empty'?'selected':''}>Estiver Preenchido (Qualquer valor)</option>
                <option value="is_empty" ${rule.operator==='is_empty'?'selected':''}>Estiver Vazio</option>
            </select>
        `;
        
        let valInput = (rule.operator === 'is_empty' || rule.operator === 'not_empty') ? '' : `
            <input type="text" class="prop-input" placeholder="Valor esperado" value="${rule.value || ''}" onchange="window.updateLogicRule(${ruleIndex}, 'value', this.value)" style="margin-bottom:12px;" />
        `;
        
        // Actions
        let actionsHTML = '';
        if(!rule.actions) rule.actions = [];
        rule.actions.forEach((act, actionIndex) => {
            const fieldOptions = '<option value="">[Selec. Alvo]</option>' + fields.map(f => `<option value="${f.id}" ${act.targetId===f.id?'selected':''}>${f.label}</option>`).join('');
            
            actionsHTML += `
                <div style="display:flex; gap:8px; align-items:center; background:#f8fafc; padding:8px; border-radius:6px; margin-bottom:8px; border:1px solid #e2e8f0;">
                    <div style="color:var(--accent); font-weight:800; font-size:12px; margin-right:8px;">ENTÃO</div>
                    <select class="prop-input" style="flex:1" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'type', this.value)">
                        <option value="SHOW" ${act.type==='SHOW'?'selected':''}>Exibir o Campo</option>
                        <option value="HIDE" ${act.type==='HIDE'?'selected':''}>Ocultar o Campo</option>
                        <option value="REQUIRE" ${act.type==='REQUIRE'?'selected':''}>Tornar Obrigatório</option>
                        <option value="OPTIONAL" ${act.type==='OPTIONAL'?'selected':''}>Tornar Opcional</option>
                        <option value="SET_VALUE" ${act.type==='SET_VALUE'?'selected':''}>Definir Valor</option>
                    </select>
                    <select class="prop-input" style="flex:1">
                        ${fieldOptions}
                    </select>
                    ${act.type === 'SET_VALUE' ? `<input type="text" class="prop-input" style="flex:1" placeholder="Novo valor" value="${act.value || ''}" onchange="window.updateLogicAction(${ruleIndex}, ${actionIndex}, 'value', this.value)" />` : ''}
                    <div style="cursor:pointer; color:var(--red); font-size:20px;" onclick="window.removeLogicAction(${ruleIndex}, ${actionIndex})">&times;</div>
                </div>
            `;
        });
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:flex; gap:12px; flex:1;">
                    <div style="background:#f1f5f9; padding:6px 12px; border-radius:6px; color:#334155; font-weight:800; font-size:12px; align-self:flex-start;">SE</div>
                    <div style="flex:1;">${opSelect}</div>
                    <div style="flex:1;">${valInput}</div>
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
        if(key === 'type') renderLogicRules();
    }
};

window.saveFieldLogic = function() {
    document.getElementById('logic-modal').style.display = 'none';
    currentLogicFieldId = null;
    renderCanvas(); // Redesenha parar recriar tags visuais possiveis
};
