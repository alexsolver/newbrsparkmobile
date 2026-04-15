/**
 * Edição completa de usuário (admin) — dados, endereço, prestador, documentos multi-location, horários.
 */
import { initPage, getStoredPanelRole } from './sidebar.js';
import { CONFIG } from './config.js';
import {
  getAdminUiLocale,
  setAdminUiLocale,
  t,
  DOC_TYPE_ROWS,
  weekdaysForLocale,
  applyUserEditStaticPageI18n,
  applyAddressFieldLabelsForCountry,
} from './user-pages-i18n.js';
import { adminIntlLocale } from './admin-i18n-resolve.js';

/** Atualizado em `bootUserEditPage` para acionar indicador «não guardado» */
const dirtyHooks = { mark: () => {} };
/** Definido em `bootUserEditPage` — atualiza a secção de ponto após alterar a galeria facial. */
let bumpUserRefFaceState = null;
/** Tenant com `locale.countryCode === 'BR'` — mostra vínculo CLT/PJ no registro de horas. */
let ueTenantCountryBr = false;

function readWtBrRegimeFromDom() {
  const wrap = document.getElementById('wt-br-regime-wrap');
  if (!wrap) return 'CLT';
  const sel = wrap.querySelector('input[name="f-wt-br-regime"]:checked');
  return sel && String(sel.value).toUpperCase() === 'PJ' ? 'PJ' : 'CLT';
}

function updateWtBrRegimeRow() {
  const wrap = document.getElementById('wt-br-regime-wrap');
  const fWt = document.getElementById('f-work-time');
  if (!wrap) return;
  const show = ueTenantCountryBr && fWt && fWt.checked;
  wrap.hidden = !show;
  let ro = false;
  try {
    ro = isUserEditReadonly();
  } catch {
    ro = false;
  }
  wrap.querySelectorAll('input[name="f-wt-br-regime"]').forEach((inp) => {
    inp.disabled = ro;
  });
  wrap.querySelectorAll('.wt-br-lbl').forEach((lbl) => {
    if (lbl instanceof HTMLElement) {
      lbl.style.pointerEvents = ro ? 'none' : '';
      lbl.style.opacity = ro ? '0.65' : '';
    }
  });
}

function markDirty() {
  dirtyHooks.mark();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

const NAV_CTX_KEY = 'brspark_user_edit_nav';
const DUP_DRAFT_KEY = 'brspark_user_duplicate_draft';

function docTypeOptionsHtml(selectedType) {
  const loc = getAdminUiLocale();
  const rows = DOC_TYPE_ROWS[loc] || DOC_TYPE_ROWS['pt-BR'];
  return rows
    .map(
      ([val, lab]) =>
        `<option value="${esc(val)}" ${(selectedType || '') === val ? 'selected' : ''}>${esc(lab)}</option>`
    )
    .join('');
}

function docValidityBadge(validFrom, validTo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = validTo ? new Date(String(validTo).slice(0, 10)) : null;
  const from = validFrom ? new Date(String(validFrom).slice(0, 10)) : null;
  if (to && !Number.isNaN(to.getTime())) {
    to.setHours(0, 0, 0, 0);
    if (to < today) {
      return `<span class="ue-doc-badge ue-doc-badge--err">${esc(t('docExpired'))}</span>`;
    }
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    if (to <= soon) {
      return `<span class="ue-doc-badge ue-doc-badge--warn">${esc(t('docExpiring'))}</span>`;
    }
    return `<span class="ue-doc-badge ue-doc-badge--ok">${esc(t('docValidOk'))}</span>`;
  }
  if (from && !Number.isNaN(from.getTime()) && from > today) {
    return `<span class="ue-doc-badge ue-doc-badge--muted">${esc(t('docUnknown'))}</span>`;
  }
  return `<span class="ue-doc-badge ue-doc-badge--muted">${esc(t('docUnknown'))}</span>`;
}

function refreshDocValidityInTable(tbodyId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.querySelectorAll('tr[data-doc-id]').forEach((tr) => {
    const vf = tr.querySelector('.doc-from')?.value || '';
    const vt = tr.querySelector('.doc-to')?.value || '';
    const cell = tr.querySelector('.doc-valid-wrap');
    if (cell) cell.innerHTML = docValidityBadge(vf, vt);
  });
}

function bindDocTableDelegation(tbodyId, userId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  if (tb.dataset.docDeleg !== '1') {
    tb.dataset.docDeleg = '1';
    tb.addEventListener('click', (e) => {
      const btn = e.target.closest('.doc-upload-btn');
      if (!btn || !tb.contains(btn)) return;
      e.preventDefault();
      btn.closest('tr')?.querySelector('.doc-file')?.click();
    });
    tb.addEventListener('change', (e) => {
      const tgt = e.target;
      if (tgt.matches('.doc-from, .doc-to, .doc-type')) {
        refreshDocValidityInTable(tbodyId);
        markDirty();
      }
      if (tgt.matches('.doc-file')) {
        const uid = tb.dataset.docUploadUserId;
        if (!uid) return;
        const file = tgt.files && tgt.files[0];
        tgt.value = '';
        if (!file) return;
        const tr = tgt.closest('tr');
        const attInp = tr?.querySelector('.doc-attach');
        const ubtn = tr?.querySelector('.doc-upload-btn');
        const prevLbl = ubtn ? ubtn.textContent : '';
        if (ubtn) {
          ubtn.textContent = t('ue_docUploading');
          ubtn.disabled = true;
        }
        void (async () => {
          try {
            const b64 = await fileToBase64(file);
            const res = await CONFIG.post(`/users/${encodeURIComponent(uid)}/document-attachment`, {
              fileBase64: b64,
              mimeType: file.type || 'application/octet-stream',
              fileName: file.name || 'upload',
            });
            if (res?.url && attInp) {
              attInp.value = res.url;
              markDirty();
            } else {
              alert(res?.error || t('ue_docUploadErr'));
            }
          } catch {
            alert(t('ue_docUploadErr'));
          } finally {
            if (ubtn) {
              ubtn.disabled = false;
              ubtn.textContent = prevLbl || t('ue_docUploadBtn');
            }
          }
        })();
      }
    });
    tb.addEventListener('input', (e) => {
      if (e.target.matches('.doc-idnum, .doc-issuer, .doc-notes, .doc-attach')) markDirty();
    });
  }
  if (userId) tb.dataset.docUploadUserId = userId;
}

function rid() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function getQueryId() {
  const p = new URLSearchParams(window.location.search);
  return p.get('id') || '';
}

/** Query `readonly=1` ou `ro=1` — ficha sem edição (só consulta). */
export function isUserEditReadonly() {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = (p.get('readonly') || p.get('ro') || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

function applyUserEditReadonlyIfNeeded() {
  if (!isUserEditReadonly()) return;
  document.documentElement.classList.add('ue-readonly-mode');
  const crumb = document.getElementById('ue-crumb-name');
  if (crumb) crumb.textContent = t('ue_readonlyCrumb');
  try {
    const base = document.title.replace(/\s+—\s+.*$/, '').trim();
    document.title = `${base} — ${t('ue_readonlyCrumb')}`;
  } catch {
    /* ignore */
  }

  const tb = document.querySelector('.ue-page-toolbar');
  if (tb && !document.getElementById('ue-readonly-banner')) {
    const banner = document.createElement('div');
    banner.id = 'ue-readonly-banner';
    banner.className = 'ue-readonly-banner hint-box';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<strong>${esc(t('ue_readonlyBannerTitle'))}</strong> ${esc(t('ue_readonlyBannerBody'))}`;
    tb.insertAdjacentElement('afterend', banner);
  }

  ['btn-save', 'btn-save-stay', 'btn-discard'].forEach((hid) => {
    const el = document.getElementById(hid);
    if (el) el.hidden = true;
  });
  ['act-duplicate', 'act-role-matrix'].forEach((hid) => {
    document.getElementById(hid)?.setAttribute('hidden', 'hidden');
  });

  const scroll = document.querySelector('.ue-scroll');
  if (scroll) {
    scroll.querySelectorAll('input, select, textarea, button').forEach((el) => {
      el.disabled = true;
    });
  }
}

/**
 * Substitui o conteúdo da ficha por um estado de erro (URL sem id ou API).
 * Remove `ue-edit-html` para o scroll da página voltar a funcionar.
 */
function renderUserEditFatalUI(variant, detail) {
  const conf =
    variant === 'missingId'
      ? {
          title: t('ue_fatalMissingTitle'),
          description: t('ue_fatalMissingBody'),
          icon: 'link-outline',
          iconColor: 'var(--color-status-info-fg, var(--blue))',
        }
      : {
          title: t('ue_fatalNotFoundTitle'),
          description: t('ue_fatalNotFoundBody'),
          icon: 'person-remove-outline',
          iconColor: 'var(--amber)',
        };

  document.documentElement.classList.remove('ue-edit-html');
  document.documentElement.classList.add('ue-edit-error-html');

  const root = document.getElementById('page-root');
  if (!root) return;

  const detailHtml =
    variant === 'notFound' && detail && String(detail).trim()
      ? `<p class="ue-edit-error-detail" role="status">${esc(String(detail).trim().slice(0, 500))}</p>`
      : '';

  root.innerHTML = `
    <div class="main-content ue-edit-error-main">
      <div class="topbar topbar--data">
        <nav class="topbar-breadcrumb" aria-label="Trilha">
          <a href="dashboard.html" style="color:inherit;text-decoration:none;font-weight:600">${esc(t('ul_breadcrumb'))}</a>
          <span class="topbar-breadcrumb-sep">/</span>
          <a href="users.html" style="color:inherit;text-decoration:none;font-weight:600">${esc(t('ul_breadcrumbUsers'))}</a>
          <span class="topbar-breadcrumb-sep">/</span>
          <span>${esc(t('ue_fatalEdit'))}</span>
        </nav>
      </div>
      <div class="data-toolbar" style="margin:0 28px 16px">
        <div class="data-toolbar-main"></div>
        <div class="data-toolbar-actions">
          <a href="users.html" class="btn btn-outline btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">
            <ion-icon name="arrow-back-outline" style="font-size:17px;vertical-align:-3px"></ion-icon>
            ${esc(t('ue_fatalBackList'))}
          </a>
        </div>
      </div>
      <div class="page-body ue-edit-error-body">
        <div class="data-shell ue-edit-error-card fade-in">
          <div class="empty-state-pro" style="padding:36px 28px 40px">
            <ion-icon name="${conf.icon}" style="font-size:52px;color:${conf.iconColor};opacity:0.88"></ion-icon>
            <div class="empty-state-pro-title">${esc(conf.title)}</div>
            <p class="empty-state-pro-sub">${esc(conf.description)}</p>
            ${detailHtml}
            <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
              <a href="users.html" class="btn btn-primary">${esc(t('ue_fatalGoUsers'))}</a>
              <a href="dashboard.html" class="btn btn-outline">${esc(t('ue_fatalDashboard'))}</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function parseJsonSafe(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}

function renderDocRows(tbodyId, docs, locations, userId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  const list = Array.isArray(docs) ? docs : [];
  const locOpts = getLocationMultiselectOptionsHtml(locations);
  tb.innerHTML = list.length
    ? list.map((d) => docRowHtml(d, locOpts)).join('')
    : `<tr class="doc-empty"><td colspan="9" style="text-align:center;color:var(--text3);padding:16px">${esc(t('ue_docEmpty'))}</td></tr>`;
  tb.querySelectorAll('.doc-del').forEach((btn) => {
    btn.onclick = () => {
      btn.closest('tr')?.remove();
      if (!tb.querySelector('tr:not(.doc-empty)')) {
        tb.innerHTML = `<tr class="doc-empty"><td colspan="9" style="text-align:center;color:var(--text3);padding:16px">${esc(t('ue_docEmpty'))}</td></tr>`;
      }
      markDirty();
    };
  });
  syncDocLocsMultiselectSelections(tb);
  refreshDocValidityInTable(tbodyId);
  bindDocTableDelegation(tbodyId, userId);
}

function docRowHtml(d, locOptsHtml) {
  const id = d.id || rid();
  const locIds = Array.isArray(d.locationIds) ? d.locationIds : [];
  const locAttr = esc(locIds.join('|'));
  return `<tr data-doc-id="${esc(id)}">
    <td><input type="hidden" class="doc-id" value="${esc(id)}" />
      <select class="form-control doc-type" style="padding:6px;font-size:12px">${docTypeOptionsHtml(d.docType)}</select></td>
    <td><input class="form-control doc-idnum" style="padding:6px;font-size:12px" placeholder="${esc(t('ue_docPhNumber'))}" value="${esc(d.identifier || '')}" /></td>
    <td><input class="form-control doc-from" type="date" value="${esc((d.validFrom || '').slice(0, 10))}" /></td>
    <td><input class="form-control doc-to" type="date" value="${esc((d.validTo || '').slice(0, 10))}" /></td>
    <td class="doc-valid-wrap">${docValidityBadge(d.validFrom, d.validTo)}</td>
    <td><input class="form-control doc-issuer" style="padding:6px;font-size:12px" placeholder="${esc(t('ue_docPhIssuer'))}" value="${esc(d.issuingBody || '')}" /></td>
    <td><select class="form-control doc-locs" multiple size="2" style="padding:4px;font-size:11px;min-width:120px" title="${esc(t('ue_docLocsTitle'))}" data-initial-locs="${locAttr}">${locOptsHtml}</select>
      <div style="font-size:10px;color:var(--text3);margin-top:2px">${esc(t('ue_docLocsHint'))}</div></td>
    <td class="ue-doc-attach-cell"><input class="form-control doc-attach" style="padding:6px;font-size:12px;margin-bottom:4px" placeholder="${esc(t('ue_docPhAttach'))}" value="${esc(d.attachmentUrl || d.fileUrl || '')}" />
      <input type="file" class="doc-file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" style="display:none" />
      <button type="button" class="btn btn-sm btn-outline doc-upload-btn" style="width:100%">${esc(t('ue_docUploadBtn'))}</button></td>
    <td><input class="form-control doc-notes" style="padding:6px;font-size:12px" placeholder="${esc(t('ue_docPhNotes'))}" value="${esc(d.notes || '')}" />
      <button type="button" class="btn btn-sm doc-del" style="margin-top:4px;color:var(--red)">${esc(t('ue_docRemove'))}</button></td>
  </tr>`;
}

function collectDocTable(tbodyId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return [];
  const out = [];
  tb.querySelectorAll('tr[data-doc-id]').forEach((tr) => {
    const sel = tr.querySelector('.doc-locs');
    const locs = sel ? [...sel.selectedOptions].map((o) => o.value) : [];
    out.push({
      id: tr.querySelector('.doc-id')?.value || rid(),
      docType: tr.querySelector('.doc-type')?.value || 'Outro',
      identifier: tr.querySelector('.doc-idnum')?.value?.trim() || null,
      validFrom: tr.querySelector('.doc-from')?.value || null,
      validTo: tr.querySelector('.doc-to')?.value || null,
      issuingBody: tr.querySelector('.doc-issuer')?.value?.trim() || null,
      notes: tr.querySelector('.doc-notes')?.value?.trim() || null,
      attachmentUrl: tr.querySelector('.doc-attach')?.value?.trim() || null,
      locationIds: locs,
    });
  });
  return out;
}

/** Um turno guardado em workScheduleJson */
function slotFromRaw(s) {
  const start = s.start || '08:00';
  const end = s.end || '18:00';
  let enabled;
  if (typeof s.enabled === 'boolean') enabled = s.enabled;
  else enabled = !!(s.start || s.end || s.enabled === true);
  return {
    id: s.id || rid(),
    enabled,
    start,
    end,
    locationIds: Array.isArray(s.locationIds) ? [...s.locationIds] : [],
  };
}

/** Legado: dia = { enabled, start, end } | novo: dia = [{ ...turnos }] */
function normalizeDayToSlots(raw) {
  if (Array.isArray(raw)) {
    const slots = raw.map((s) => slotFromRaw(s));
    return slots.length
      ? slots
      : [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
  }
  if (raw && typeof raw === 'object') {
    return [slotFromRaw(raw)];
  }
  return [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
}

function slotRowHtml(slot, locOptsHtml) {
  const locIds = Array.isArray(slot.locationIds) ? slot.locationIds : [];
  const locAttr = esc(locIds.join('|'));
  const en = slot.enabled;
  return `<div class="sched-slot" data-slot-id="${esc(slot.id)}" style="display:grid;grid-template-columns:auto 1fr 1fr minmax(168px,1.5fr) auto;gap:8px;align-items:start;margin-bottom:8px">
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;padding-top:8px;white-space:nowrap"><input type="checkbox" class="sch-en" ${en ? 'checked' : ''}/> ${esc(t('ue_schActiveLbl'))}</label>
    <div><span style="font-size:10px;color:var(--text3)">${esc(t('ue_schStart'))}</span><input type="time" class="form-control sch-start" value="${esc(slot.start || '08:00')}" style="padding:6px;font-size:12px;width:100%" /></div>
    <div><span style="font-size:10px;color:var(--text3)">${esc(t('ue_schEnd'))}</span><input type="time" class="form-control sch-end" value="${esc(slot.end || '18:00')}" style="padding:6px;font-size:12px;width:100%" /></div>
    <div><span style="font-size:10px;color:var(--text3)">${esc(t('ue_schLocsInSlot'))}</span><select class="form-control sch-locs" multiple size="2" style="padding:4px;font-size:11px;width:100%" title="${esc(t('ue_schLocsTitle'))}" data-initial-sch-locs="${locAttr}">${locOptsHtml}</select>
    <span style="font-size:10px;color:var(--text3)">${esc(t('ue_schLocsHintShort'))}</span></div>
    <button type="button" class="btn btn-sm btn-ghost sch-rm-slot" style="margin-top:18px" title="${esc(t('ue_schRemoveTitle'))}">✕</button>
  </div>`;
}

function bindScheduleSlotUI(locations) {
  const root = document.getElementById('schedule-rows');
  if (!root || root.dataset.schBound === '1') return;
  root.dataset.schBound = '1';
  root.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.sch-add-slot');
    if (addBtn) {
      const day = addBtn.getAttribute('data-day');
      const container = root.querySelector(`.sched-slots[data-day="${day}"]`);
      if (!container) return;
      const slot = { id: rid(), enabled: true, start: '08:00', end: '18:00', locationIds: [] };
      const optH = getLocationMultiselectOptionsHtml(locations);
      container.insertAdjacentHTML('beforeend', slotRowHtml(slot, optH));
      syncSchLocsMultiselectSelections(container.lastElementChild);
      return;
    }
    const rm = e.target.closest('.sch-rm-slot');
    if (rm) {
      const slotEl = rm.closest('.sched-slot');
      const dayWrap = slotEl?.closest('.sched-day');
      if (!slotEl || !dayWrap) return;
      slotEl.remove();
      const container = dayWrap.querySelector('.sched-slots');
      if (container && !container.querySelector('.sched-slot')) {
        const slot = { id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [] };
        const optH = getLocationMultiselectOptionsHtml(locations);
        container.innerHTML = slotRowHtml(slot, optH);
        syncSchLocsMultiselectSelections(container);
      }
    }
  });
}

function renderSchedule(workScheduleJson, locations) {
  const locs = Array.isArray(locations) ? locations : [];
  const locOpts = getLocationMultiselectOptionsHtml(locs);
  const w = parseJsonSafe(workScheduleJson, {});
  const wrap = document.getElementById('schedule-rows');
  if (!wrap) return;
  const DAYS = weekdaysForLocale();
  wrap.innerHTML = DAYS.map(({ key, label }) => {
    const slots = normalizeDayToSlots(w[key]);
    const slotsHtml = slots.map((s) => slotRowHtml(s, locOpts)).join('');
    return `<div class="sched-day" data-day="${key}" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-weight:700;font-size:13px;min-width:92px">${label}</span>
        <button type="button" class="btn btn-sm btn-primary sch-add-slot" data-day="${key}">${esc(t('ue_schAddSlotBtn'))}</button>
      </div>
      <div class="sched-slots" data-day="${key}">${slotsHtml}</div>
    </div>`;
  }).join('');
  syncSchLocsMultiselectSelections(wrap);
  bindScheduleSlotUI(locs);
}

function collectSchedule() {
  const o = {};
  const root = document.getElementById('schedule-rows');
  weekdaysForLocale().forEach(({ key }) => {
    const slots = [];
    root?.querySelectorAll(`.sched-day[data-day="${key}"] .sched-slot`).forEach((slotEl) => {
      const en = slotEl.querySelector('.sch-en')?.checked;
      const start = slotEl.querySelector('.sch-start')?.value || '08:00';
      const end = slotEl.querySelector('.sch-end')?.value || '18:00';
      const sel = slotEl.querySelector('.sch-locs');
      const locationIds = sel ? [...sel.selectedOptions].map((x) => x.value) : [];
      slots.push({
        id: slotEl.dataset.slotId || rid(),
        enabled: !!en,
        start,
        end,
        locationIds,
      });
    });
    o[key] = slots.length
      ? slots
      : [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
  });
  return o;
}

function publicUploadUrl(relativeOrAbsolute) {
  const p = String(relativeOrAbsolute || '');
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const base = CONFIG.API_BASE.replace(/\/api\/?$/i, '');
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

/** MIME confiável para o backend (muitos telemóveis deixam `file.type` vazio ou «octet-stream»). */
function resolveFaceUploadMime(file) {
  const t = String(file?.type || '').toLowerCase().trim();
  if (/^image\/(jpeg|jpg|png|webp)$/i.test(t)) return t === 'image/jpg' ? 'image/jpeg' : t;
  if (t === 'image/heic' || t === 'image/heif') return 'image/heic';
  const n = String(file?.name || '').toLowerCase();
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.heic') || n.endsWith('.heif')) return 'image/heic';
  return t || '';
}

let cachedLocations = [];
/** Cache do HTML das `<option>` de bases (evita reconstruir N×M strings por render da tabela de documentos / horários). */
let _locationMultiselectOptsKey = '';
let _locationMultiselectOptsHtml = '';

function getLocationMultiselectOptionsHtml(locations) {
  const list = Array.isArray(locations) ? locations : [];
  const key = list.map((l) => l.id).join('\u001e');
  if (key === _locationMultiselectOptsKey && _locationMultiselectOptsHtml) return _locationMultiselectOptsHtml;
  _locationMultiselectOptsKey = key;
  _locationMultiselectOptsHtml = list
    .map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${esc(l.type)})</option>`)
    .join('');
  return _locationMultiselectOptsHtml;
}

function syncDocLocsMultiselectSelections(root) {
  if (!root) return;
  root.querySelectorAll('select.doc-locs').forEach((sel) => {
    const raw = sel.getAttribute('data-initial-locs') || '';
    const ids = new Set(raw.split('|').map((s) => s.trim()).filter(Boolean));
    [...sel.options].forEach((o) => {
      o.selected = ids.has(o.value);
    });
  });
}

function syncSchLocsMultiselectSelections(root) {
  if (!root) return;
  root.querySelectorAll('select.sch-locs').forEach((sel) => {
    const raw = sel.getAttribute('data-initial-sch-locs') || '';
    const ids = new Set(raw.split('|').map((s) => s.trim()).filter(Boolean));
    [...sel.options].forEach((o) => {
      o.selected = ids.has(o.value);
    });
  });
}

let faceEnrollmentList = [];
let faceUserId = '';
/** Alinhado a admin-panel/backend/src/lib/faceEnrollmentPrimary.js */
const REGISTRATION_PRIMARY_FACE_ID = 'fe_reg_primary';

function isPrimaryRegistrationFace(p) {
  return !!(p && typeof p === 'object' && (p.registrationPrimary === true || p.id === REGISTRATION_PRIMARY_FACE_ID));
}

function sortFaceEnrollmentForDisplay(list) {
  if (!Array.isArray(list)) return [];
  const prim = list.filter(isPrimaryRegistrationFace);
  const rest = list.filter((p) => p && !isPrimaryRegistrationFace(p));
  return [...prim, ...rest];
}
/** Já existe TechnicianProfile (mostrar bloco técnico mesmo com papel ainda não migrado a PROVIDER) */
let hasTechnicianProfile = false;

function normalizeRoleForForm(r) {
  if (r === 'ADMIN') return 'TENANT_ADMIN';
  return r || 'USER';
}

function syncTechPanelVisibility() {
  const roleEl = document.getElementById('f-role');
  const panel = document.getElementById('tech-panel');
  if (!roleEl || !panel) return;
  const show = roleEl.value === 'PROVIDER' || hasTechnicianProfile;
  panel.style.display = show ? 'block' : 'none';
}

function renderFaceGallery() {
  const el = document.getElementById('face-gallery');
  if (!el) return;
  const ordered = sortFaceEnrollmentForDisplay(faceEnrollmentList);
  if (!ordered.length) {
    el.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:var(--text3);padding:8px 0">${esc(t('ue_faceGalleryEmpty'))}</div>`;
    return;
  }
  el.innerHTML = ordered
    .map((p) => {
      const primary = isPrimaryRegistrationFace(p);
      const rm = primary
        ? `<span class="face-card-protected" title="${esc(t('ue_faceProtectedTitle'))}">${esc(t('ue_faceProtectedBadge'))}</span>`
        : `<button type="button" class="btn btn-sm btn-danger face-rm" data-photo-id="${esc(p.id)}">${esc(t('ue_docRemove'))}</button>`;
      return `<div class="face-card${primary ? ' face-card--primary' : ''}" data-photo-id="${esc(p.id)}">
      ${primary ? `<div class="face-card-ribbon">${esc(t('ue_faceRibbonPrimary'))}</div>` : ''}
      <img src="${esc(publicUploadUrl(p.url))}" alt="" loading="lazy" decoding="async" />
      ${rm}
    </div>`;
    })
    .join('');
  el.querySelectorAll('.face-rm').forEach((btn) => {
    btn.onclick = () => removeFacePhoto(btn.getAttribute('data-photo-id'));
  });
}

async function removeFacePhoto(photoId) {
  if (!photoId || !faceUserId) return;
  const row = faceEnrollmentList.find((x) => x && x.id === photoId);
  if (row && isPrimaryRegistrationFace(row)) {
    alert(t('ue_facePrimaryRemoveBlock'));
    return;
  }
  if (!confirm(t('ue_faceRemoveConfirm'))) return;
  const res = await CONFIG.del(
    `/users/${encodeURIComponent(faceUserId)}/face-enrollment/${encodeURIComponent(photoId)}`
  );
  if (res?.error) {
    alert(res.error);
    return;
  }
  faceEnrollmentList = Array.isArray(res.photos)
    ? sortFaceEnrollmentForDisplay(res.photos)
    : sortFaceEnrollmentForDisplay(faceEnrollmentList.filter((x) => x.id !== photoId));
  renderFaceGallery();
  if (bumpUserRefFaceState && res.comprefaceRecognitionSync != null) {
    bumpUserRefFaceState({
      faceEnrollmentPhotos: faceEnrollmentList,
      comprefaceRecognitionSync: res.comprefaceRecognitionSync,
    });
  }
  if (res.comprefaceSync && res.comprefaceSync.ok === false && res.comprefaceSync.error) {
    alert(res.comprefaceSync.error);
  }
}

function buildUserPatchPayload() {
  const skillsRaw = document.getElementById('t-skills')?.value || '';
  const skillsJson = skillsRaw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const svcSel = document.getElementById('t-service-locs');
  const serviceLocationIds = svcSel ? [...svcSel.selectedOptions].map((o) => o.value) : [];
  const selRole = document.getElementById('f-role')?.value || 'USER';
  const isProviderRole = selRole === 'PROVIDER';
  const includeTechnician = isProviderRole || hasTechnicianProfile;
  const plRaw = (document.getElementById('f-preferred-locale')?.value || '').trim();
  const notes = document.getElementById('f-admin-notes')?.value ?? '';

  return {
    name: document.getElementById('f-name').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    employeeMatricula: (document.getElementById('f-employee-matricula')?.value || '').trim() || null,
    phone: document.getElementById('f-phone').value.trim() || null,
    role: selRole,
    avatarUrl: document.getElementById('f-avatar').value.trim() || null,
    isActive: document.getElementById('f-active').checked,
    workTimeTrackingEnabled: !!document.getElementById('f-work-time')?.checked,
    ...(function wtBrPayload() {
      const wtOn = !!document.getElementById('f-work-time')?.checked;
      if (!ueTenantCountryBr) return {};
      if (!wtOn) return { workTimeBrazilRegime: null };
      return { workTimeBrazilRegime: readWtBrRegimeFromDom() === 'PJ' ? 'PJ' : 'CLT' };
    })(),
    addressJson: {
      line1: document.getElementById('a-line1').value.trim() || null,
      line2: document.getElementById('a-line2').value.trim() || null,
      district: document.getElementById('a-district').value.trim() || null,
      city: document.getElementById('a-city').value.trim() || null,
      state: document.getElementById('a-state').value.trim() || null,
      postalCode: document.getElementById('a-postal').value.trim() || null,
      countryCode: document.getElementById('a-country').value.trim() || 'BR',
    },
    personalDocuments: collectDocTable('tbody-docs-personal'),
    preferredChatLocale: plRaw || null,
    adminInternalNotes: isManagerPanelSession() ? undefined : notes.trim() === '' ? null : notes,
    isProvider: isProviderRole,
    technician: includeTechnician
      ? {
          status: document.getElementById('t-status').value,
          cft: document.getElementById('t-cft').value.trim() || null,
          specialty: document.getElementById('t-specialty').value.trim() || null,
          score: Number(document.getElementById('t-score').value) || 5,
          workScheduleJson: collectSchedule(),
          skillsJson,
          serviceLocationIds,
          professionalDocuments: collectDocTable('tbody-docs-pro'),
        }
      : undefined,
  };
}

function isAdminLevel(role) {
  const r = String(role || '').toUpperCase();
  return r === 'TENANT_ADMIN' || r === 'SAAS_ADMIN' || r === 'ADMIN';
}

function needsElevateConfirm(prevRole, nextRole) {
  const p = normalizeRoleForForm(prevRole);
  const n = String(nextRole || '').toUpperCase();
  if (!isAdminLevel(p) && isAdminLevel(n)) return true;
  if (isAdminLevel(p) && n === 'SAAS_ADMIN' && p !== 'SAAS_ADMIN') return true;
  return false;
}

function openElevateConfirmModal(expectedEmail) {
  return new Promise((resolve) => {
    const ov = document.getElementById('elevate-role-modal');
    const inp = document.getElementById('elevate-email-input');
    const tEl = document.getElementById('elevate-modal-title');
    const bEl = document.getElementById('elevate-modal-body');
    if (!ov || !inp) return resolve(true);
    if (tEl) tEl.textContent = t('elevateTitle');
    if (bEl) bEl.textContent = t('elevateBody');
    inp.value = '';
    ov.classList.add('open');
    const close = (ok) => {
      ov.classList.remove('open');
      resolve(ok);
    };
    const onClose = () => close(false);
    document.querySelectorAll('[data-close-elevate]').forEach((b) => {
      b.onclick = onClose;
    });
    const conf = document.getElementById('elevate-confirm-btn');
    if (conf) {
      conf.onclick = () => {
        if (String(inp.value).trim().toLowerCase() !== String(expectedEmail).trim().toLowerCase()) {
          alert(t('elevateMismatch'));
          return;
        }
        close(true);
      };
    }
    ov.onclick = (ev) => {
      if (ev.target === ov) close(false);
    };
  });
}

function paintSummaryBar(u) {
  const bar = document.getElementById('ue-summary-bar');
  if (!bar) return;
  const locFmt = adminIntlLocale(getAdminUiLocale());
  const fmt = (d) =>
    d ? new Date(d).toLocaleString(locFmt, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const role = normalizeRoleForForm(u.role);
  const tp = u.technicianProfile;
  const tpSt = tp ? String(tp.status || '').toUpperCase() : '';
  const chips = [
    `<span class="ue-sum-chip"><strong>${esc(t('summaryId'))}</strong> <code style="font-size:11px">${esc(u.id)}</code></span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summaryTenant'))}</strong> ${esc(u.tenant?.name || u.tenantId || '—')}</span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summaryRole'))}</strong> ${esc(role)}</span>`,
    `<span class="ue-sum-chip">${u.isActive ? esc(t('summaryActive')) : esc(t('summaryInactive'))}</span>`,
    tp
      ? `<span class="ue-sum-chip"><strong>${esc(t('summaryProvider'))}</strong> ${esc(tpSt || '—')}</span>`
      : '',
    `<span class="ue-sum-chip"><strong>${esc(t('summaryLastLogin'))}</strong> ${esc(fmt(u.lastLogin))}</span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summaryWorkTime'))}</strong> ${u.workTimeTrackingEnabled ? '✓' : '—'}</span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summarySession'))}</strong> ${
      u.currentSessionId ? esc(String(u.currentSessionId).slice(0, 14)) + '…' : esc(t('summarySessionNone'))
    }</span>`,
  ].filter(Boolean);
  bar.innerHTML = chips.join('');
}

async function loadUserAudit(userId) {
  const tb = document.getElementById('ue-audit-tbody');
  if (!tb) return;
  tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">${esc(t('ue_auditLoading'))}</td></tr>`;
  const res = await CONFIG.get(`/users/${encodeURIComponent(userId)}/admin-activity?limit=40`).catch(() => null);
  if (!res || res.error) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red);padding:16px">${esc(t('auditLoadErr'))}</td></tr>`;
    return;
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">${esc(t('auditEmpty'))}</td></tr>`;
    return;
  }
  const loc = adminIntlLocale(getAdminUiLocale());
  tb.innerHTML = rows
    .map((log) => {
      const dt = log.createdAt ? new Date(log.createdAt).toLocaleString(loc) : '—';
      const adm = log.admin?.email || log.admin?.name || '—';
      const meta = log.metadata != null ? JSON.stringify(log.metadata).slice(0, 220) : '';
      return `<tr>
        <td style="white-space:nowrap;font-size:11px;color:var(--text3)">${esc(dt)}</td>
        <td style="font-weight:600">${esc(log.action || '')}</td>
        <td style="font-size:11px">${esc(adm)}</td>
        <td style="font-size:10px;color:var(--text3);word-break:break-all">${esc(meta)}</td>
      </tr>`;
    })
    .join('');
}

function fillRoleMatrixModal() {
  const body = document.getElementById('role-matrix-body');
  if (!body) return;
  body.innerHTML = `<p style="margin-bottom:10px">${esc(t('ue_roleMatrixIntro'))}</p>
      <ul style="padding-left:18px;margin:0">
        <li>${esc(t('ue_roleMatrixLiUser'))}</li>
        <li>${esc(t('ue_roleMatrixLiProv'))}</li>
        <li>${esc(t('ue_roleMatrixLiMgr'))}</li>
        <li>${esc(t('ue_roleMatrixLiTenant'))}</li>
        <li>${esc(t('ue_roleMatrixLiSaas'))}</li>
      </ul>`;
}

function applyUserEditToolbarI18n() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('ue-back-list-txt', t('backList'));
  set('ue-more-actions-txt', t('moreActions'));
  set('btn-save', t('save'));
  set('btn-save-stay', t('saveStay'));
  set('btn-discard', t('discard'));
  set('ue-unsaved-badge', t('unsaved'));
  set('ue-locale-label', t('localeLabel'));
  set('act-copy-link', t('copyLink'));
  set('act-export-json', t('exportJson'));
  set('act-duplicate', t('duplicate'));
  set('act-role-matrix', t('roleMatrix'));
  set('act-open-audit', t('openAuditPage'));
  set('ue-avatar-upload-txt', t('ue_avatarUploadBtn'));
  const locSel = document.getElementById('ue-panel-locale');
  if (locSel) locSel.value = getAdminUiLocale();
  const fl = document.getElementById('t-service-locs-filter');
  if (fl) fl.placeholder = t('filterLocs');
  document.querySelectorAll('.ue-doc-sit-th').forEach((th) => {
    th.textContent = t('docSituation');
  });
  document.getElementById('lbl-mfa') && (document.getElementById('lbl-mfa').textContent = t('mfaTitle'));
  document.getElementById('ue-mfa-hint') && (document.getElementById('ue-mfa-hint').textContent = t('mfaBody'));
  document.getElementById('lbl-email-ver') && (document.getElementById('lbl-email-ver').textContent = t('emailVerifyTitle'));
  document.getElementById('ue-emailver-hint') && (document.getElementById('ue-emailver-hint').textContent = t('emailVerifyBody'));
  set('btn-email-ver-send', t('ue_emailVerSendBtn'));
  set('btn-email-ver-mark', t('ue_emailVerMarkBtn'));
  document.getElementById('lbl-admin-notes') && (document.getElementById('lbl-admin-notes').textContent = t('internalNotes'));
  document.getElementById('hint-admin-notes') && (document.getElementById('hint-admin-notes').textContent = t('internalNotesHint'));
  document.getElementById('lbl-preferred-locale') && (document.getElementById('lbl-preferred-locale').textContent = t('appLocale'));
  document.getElementById('hint-preferred-locale') && (document.getElementById('hint-preferred-locale').textContent = t('appLocaleHint'));
  document.getElementById('role-matrix-title') && (document.getElementById('role-matrix-title').textContent = t('roleMatrixTitle'));
}

function renderServiceLocationOptions(selectedIdList, filterText) {
  const sel = document.getElementById('t-service-locs');
  if (!sel) return;
  const ft = String(filterText || '').trim().toLowerCase();
  const selected = new Set(Array.isArray(selectedIdList) ? selectedIdList : []);
  let list = cachedLocations;
  if (ft) {
    const hit = cachedLocations.filter((l) => `${l.name} ${l.type}`.toLowerCase().includes(ft));
    const selectedObjs = cachedLocations.filter((l) => selected.has(l.id));
    const map = new Map();
    [...selectedObjs, ...hit].forEach((l) => map.set(l.id, l));
    list = [...map.values()];
  }
  sel.innerHTML = list
    .map((l) => {
      const on = selected.has(l.id);
      return `<option value="${esc(l.id)}" ${on ? 'selected' : ''}>${esc(l.name)} — ${esc(l.type)}</option>`;
    })
    .join('');
}

function paintAddressCountryHint() {
  const hint = document.getElementById('addr-country-hint');
  if (!hint) return;
  const c = String(document.getElementById('a-country')?.value || '').trim().toUpperCase();
  const useEnStyleAddrHints = getAdminUiLocale() === 'en-US' || getAdminUiLocale() === 'es-ES';
  if (useEnStyleAddrHints) {
    hint.textContent =
      c === 'BR'
        ? t('ue_addrHintBR')
        : c === 'US'
          ? t('ue_addrHintUS')
          : t('ue_addrHintGeneric');
  } else {
    hint.textContent = c === 'US' || c === 'CA' ? t('ue_addrHintNonBR') : t('ue_addrHintDefault');
  }
}

function paintAddressFieldUi() {
  paintAddressCountryHint();
  applyAddressFieldLabelsForCountry();
}

function paintEmailVerificationUx(u) {
  const hint = document.getElementById('ue-emailver-hint');
  const sendBtn = document.getElementById('btn-email-ver-send');
  const markBtn = document.getElementById('btn-email-ver-mark');
  if (!hint) return;
  const iso = u && u.emailVerifiedAt;
  if (iso) {
    const loc = adminIntlLocale(getAdminUiLocale());
    const d = new Date(iso);
    const fmt = Number.isNaN(d.getTime()) ? '' : d.toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
    hint.textContent = t('ue_emailVerVerified').replace(/\{date\}/g, fmt || String(iso));
    if (sendBtn) sendBtn.hidden = true;
    if (markBtn) markBtn.hidden = true;
  } else {
    hint.textContent = t('ue_emailVerPendingDesc');
    if (sendBtn) sendBtn.hidden = false;
    if (markBtn) {
      const actor = (getStoredPanelRole() || '').trim().toUpperCase();
      markBtn.hidden = actor === 'MANAGER';
    }
  }
}

function isManagerPanelSession() {
  return (getStoredPanelRole() || '').trim().toUpperCase() === 'MANAGER';
}

/** Papéis elevados na ficha: esconde opções e bloqueia alteração conforme o papel do painel. */
function applyUserEditSensitiveFieldRbac(targetUser) {
  const sel = document.getElementById('f-role');
  const notes = document.getElementById('f-admin-notes');
  const resetRole = () => {
    if (!sel) return;
    [...sel.options].forEach((o) => {
      o.hidden = false;
      o.disabled = false;
    });
    sel.disabled = false;
    sel.removeAttribute('title');
  };
  const clearNotesRbac = () => {
    if (!notes) return;
    notes.readOnly = false;
    notes.classList.remove('ue-rbac-readonly-field');
    notes.removeAttribute('title');
  };
  resetRole();
  clearNotesRbac();
  if (!targetUser) return;

  const actor = (getStoredPanelRole() || '').trim().toUpperCase();
  if (!actor) return;

  const targetRole = normalizeRoleForForm(targetUser.role);

  if (sel) {
    if (actor === 'MANAGER') {
      ['TENANT_ADMIN', 'SAAS_ADMIN'].forEach((val) => {
        const o = sel.querySelector(`option[value="${val}"]`);
        if (o) o.hidden = true;
      });
      if (targetRole === 'TENANT_ADMIN' || targetRole === 'SAAS_ADMIN') {
        sel.disabled = true;
        sel.title = t('ue_rbacRoleFieldLocked');
      }
    } else if (actor === 'TENANT_ADMIN') {
      const o = sel.querySelector('option[value="SAAS_ADMIN"]');
      if (o) o.hidden = true;
      if (targetRole === 'SAAS_ADMIN') {
        sel.disabled = true;
        sel.title = t('ue_rbacRoleFieldLocked');
      }
    }
  }

  if (notes && actor === 'MANAGER') {
    notes.readOnly = true;
    notes.classList.add('ue-rbac-readonly-field');
    notes.title = t('ue_rbacAdminNotesReadonly');
  }
}

export async function bootUserEditPage() {
  await initPage();
  const id = getQueryId();
  if (!id) {
    renderUserEditFatalUI('missingId');
    return;
  }

  const u = await CONFIG.get('/users/' + encodeURIComponent(id));
  if (!u || u.error) {
    renderUserEditFatalUI('notFound', u && u.error != null ? u.error : '');
    return;
  }

  cachedLocations = await CONFIG.get('/locations?tenantId=' + encodeURIComponent(u.tenantId)).catch(() => []);
  if (!Array.isArray(cachedLocations)) cachedLocations = [];

  applyUserEditToolbarI18n();
  applyUserEditStaticPageI18n();
  const backList = document.getElementById('ue-back-list');
  if (backList) backList.href = 'users.html?resume=1';

  let uRef = u;
  let baselineOriginalRole = normalizeRoleForForm(u.role);
  let initialPayloadJson = '';
  /** Evita bloquear o thread no clique (JSON grande / muitos campos). */
  let dirtyDebounceTimer = null;
  const refreshDirty = () => {
    if (dirtyDebounceTimer != null) clearTimeout(dirtyDebounceTimer);
    dirtyDebounceTimer = setTimeout(() => {
      dirtyDebounceTimer = null;
      try {
        const cur = JSON.stringify(buildUserPatchPayload());
        const dirty = cur !== initialPayloadJson;
        const disc = document.getElementById('btn-discard');
        if (disc) disc.hidden = !dirty;
        const badge = document.getElementById('ue-unsaved-badge');
        if (badge) badge.hidden = !dirty;
      } catch (e) {
        console.error('[user-edit] refreshDirty', e);
      }
    }, 64);
  };
  dirtyHooks.mark = () => refreshDirty();

  document.getElementById('ue-title').textContent = u.name || u.email;
  const subBits = [u.tenant?.name, u.tenant?.email].filter(Boolean);
  document.getElementById('ue-sub').textContent =
    subBits.length ? subBits.join(' · ') : (u.tenantId || '—');
  const crumb = document.getElementById('ue-crumb-name');
  if (crumb) {
    const display = String(u.name || u.email || 'Editar').trim() || 'Editar';
    crumb.textContent = display.length > 36 ? `${display.slice(0, 33)}…` : display;
  }

  document.getElementById('f-name').value = u.name || '';
  document.getElementById('f-email').value = u.email || '';
  const fMat = document.getElementById('f-employee-matricula');
  if (fMat) fMat.value = u.employeeMatricula != null ? String(u.employeeMatricula) : '';
  document.getElementById('f-phone').value = u.phone || '';
  document.getElementById('f-role').value = normalizeRoleForForm(u.role);
  document.getElementById('f-avatar').value = u.avatarUrl || '';
  document.getElementById('f-active').checked = !!u.isActive;

  const fAdminNotes = document.getElementById('f-admin-notes');
  if (fAdminNotes) fAdminNotes.value = u.adminInternalNotes != null ? String(u.adminInternalNotes) : '';
  const fPrefLoc = document.getElementById('f-preferred-locale');
  if (fPrefLoc) fPrefLoc.value = u.preferredChatLocale || '';

  paintSummaryBar(u);

  const sess = document.getElementById('ue-session-info');
  if (sess) {
    const sid = u.currentSessionId ? String(u.currentSessionId) : '';
    const did = u.currentDeviceId ? String(u.currentDeviceId) : '';
    sess.innerHTML = sid || did
      ? `<div><strong>sessionId</strong> <code style="font-size:11px">${esc(sid || '—')}</code></div><div style="margin-top:6px"><strong>deviceId</strong> <code style="font-size:11px">${esc(did || '—')}</code></div>`
      : `<span style="color:var(--text3)">${esc(t('summarySessionNone'))}</span>`;
  }
  const btnDisc = document.getElementById('btn-disconnect');
  if (btnDisc) {
    btnDisc.onclick = async () => {
      if (!confirm(t('ue_disconnectConfirm'))) return;
      const r = await CONFIG.post(`/users/${encodeURIComponent(id)}/disconnect`, {}).catch(() => null);
      if (r?.ok) {
        alert(t('disconnectOk'));
        const u2 = await CONFIG.get('/users/' + encodeURIComponent(id));
        if (u2 && !u2.error) {
          uRef = u2;
          paintSummaryBar(u2);
          paintEmailVerificationUx(u2);
          if (sess) {
            sess.innerHTML = `<span style="color:var(--text3)">${esc(t('summarySessionNone'))}</span>`;
          }
        }
      } else alert(r?.error || t('ue_disconnectGenericErr'));
    };
  }

  paintEmailVerificationUx(u);

  const btnVerSend = document.getElementById('btn-email-ver-send');
  const btnVerMark = document.getElementById('btn-email-ver-mark');
  if (btnVerSend && !btnVerSend.dataset.ueBound) {
    btnVerSend.dataset.ueBound = '1';
    btnVerSend.addEventListener('click', async () => {
      if (isUserEditReadonly()) return;
      btnVerSend.disabled = true;
      const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/send-email-verification`, {}).catch(() => null);
      btnVerSend.disabled = false;
      if (res?.ok) {
        const detail = String(
          res.email?.error || res.email?.reason || (res.email?.skipped ? 'Nylas' : '') || '?',
        );
        const msg = res.email?.sent
          ? t('ue_emailVerSentOk')
          : t('ue_emailVerSentWarn').replace(/\{detail\}/g, detail);
        alert(msg + (res.verificationUrl ? `\n\n${res.verificationUrl}` : ''));
      } else alert(res?.error || t('ue_emailVerSendErr'));
    });
  }
  if (btnVerMark && !btnVerMark.dataset.ueBound) {
    btnVerMark.dataset.ueBound = '1';
    btnVerMark.addEventListener('click', async () => {
      if (isUserEditReadonly()) return;
      if (!confirm(t('ue_emailVerMarkConfirm'))) return;
      const res = await CONFIG.patch(`/users/${encodeURIComponent(id)}`, { emailVerifiedAt: true }).catch(() => null);
      if (res && !res.error) {
        uRef = res;
        paintEmailVerificationUx(res);
        alert(t('ue_emailVerMarkOk'));
      } else alert(res?.error || t('ue_emailVerMarkErr'));
    });
  }

  void loadUserAudit(id);

  ueTenantCountryBr =
    String(u.tenant?.locale?.countryCode || '')
      .trim()
      .toUpperCase() === 'BR';

  const fWt = document.getElementById('f-work-time');
  if (fWt) fWt.checked = !!u.workTimeTrackingEnabled;

  const rClt = document.getElementById('wt-br-r-clt');
  const rPj = document.getElementById('wt-br-r-pj');
  const wtBrSeg = document.querySelector('#wt-br-regime-wrap .wt-br-regime-seg');
  if (rClt && rPj) {
    if (String(u.workTimeBrazilRegime || '').toUpperCase() === 'PJ') rPj.checked = true;
    else rClt.checked = true;
  }
  if (wtBrSeg && !wtBrSeg.dataset.ueWtBrBound) {
    wtBrSeg.dataset.ueWtBrBound = '1';
    wtBrSeg.addEventListener('change', (ev) => {
      ev.stopPropagation();
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || t.name !== 'f-wt-br-regime') return;
      if (isUserEditReadonly()) return;
      markDirty();
    });
  }
  if (fWt && !fWt.dataset.ueWtBrSync) {
    fWt.dataset.ueWtBrSync = '1';
    fWt.addEventListener('change', () => {
      updateWtBrRegimeRow();
      markDirty();
    });
  }
  updateWtBrRegimeRow();

  const wtHint = document.getElementById('wt-user-hint');
  const wtFace = document.getElementById('wt-face-status');
  const paintWorkTimeHints = (userRow, wtSet) => {
    if (!wtHint) return;
    if (!wtSet || wtSet.error) {
      wtHint.textContent = t('ue_wtPolicyLoadErr');
      return;
    }
    const parts = [];
    if (!wtSet.moduleEnabled) parts.push(t('ue_wtHintModuleOff'));
    const photos = Array.isArray(userRow.faceEnrollmentPhotos) ? userRow.faceEnrollmentPhotos : [];
    const cfOk = userRow.comprefaceRecognitionSync && String(userRow.comprefaceRecognitionSync.status) === 'synced';
    let faceMatriculaWarn = false;
    if (wtSet.requireFaceOnEveryPunch) {
      if (photos.length === 0) {
        parts.push(t('ue_wtHintFaceNoPhotos'));
        faceMatriculaWarn = true;
      } else if (!cfOk) {
        parts.push(t('ue_wtHintFaceMatchNotSynced'));
        faceMatriculaWarn = true;
      }
    }
    if (
      faceMatriculaWarn &&
      String(userRow.technicianProfile?.status || '').toUpperCase() === 'ACTIVE'
    ) {
      parts.push(t('ue_wtHintTechActive'));
    }
    wtHint.innerHTML =
      parts.length > 0
        ? `<strong>${esc(t('ue_wtHintAttentionPrefix'))}</strong> ${parts.map((p) => esc(p)).join('<br><br>')}`
        : `<strong>${esc(t('ue_wtHintPolicyPrefix'))}</strong> ${esc(t('ue_wtHintPolicyOk'))}`;
    if (wtFace) {
      const n = photos.length;
      const linePhotos = n ? t('ue_wtFacePhotosCount').replace(/\{n\}/g, String(n)) : t('ue_wtFaceNoPhotos');
      wtFace.innerHTML = `<span style="color:var(--text)">${esc(t('ue_wtFaceMatricula'))}</span> ${esc(linePhotos)}`;
    }
  };

  const wtSet = await CONFIG.get('/work-time/settings?tenantId=' + encodeURIComponent(u.tenantId)).catch(() => null);
  paintWorkTimeHints(u, wtSet);
  bumpUserRefFaceState = (partial) => {
    uRef = { ...uRef, ...partial };
    paintWorkTimeHints(uRef, wtSet);
  };

  faceUserId = id;
  faceEnrollmentList = sortFaceEnrollmentForDisplay(parseJsonSafe(u.faceEnrollmentPhotos, []));
  if (!Array.isArray(faceEnrollmentList)) faceEnrollmentList = [];
  renderFaceGallery();

  const faceIdentityHint = document.getElementById('face-identity-admin-hint');
  if (faceIdentityHint) {
    const tpActive = String(u.technicianProfile?.status || '').toUpperCase() === 'ACTIVE';
    if (tpActive) {
      faceIdentityHint.style.display = 'block';
      faceIdentityHint.textContent = t('ue_faceIdentityActive');
    } else {
      faceIdentityHint.style.display = 'none';
      faceIdentityHint.textContent = '';
    }
  }

  const btnFacePick = document.getElementById('btn-face-pick');
  const faceFileInput = document.getElementById('face-file-input');
  const faceUploadStatus = document.getElementById('face-upload-status');
  if (btnFacePick && faceFileInput) {
    btnFacePick.onclick = () => faceFileInput.click();
    faceFileInput.onchange = async (ev) => {
      const files = [...(ev.target.files || [])];
      ev.target.value = '';
      let prog = null;
      for (const file of files) {
        const mime = resolveFaceUploadMime(file);
        if (mime === 'image/heic' || mime === 'image/heif') {
          alert(t('ue_faceHeicAlert').replace(/\{file\}/g, file.name || ''));
          continue;
        }
        if (mime && !/^image\/(jpeg|png|webp)$/i.test(mime)) {
          alert(t('ue_faceFormatAlert').replace(/\{file\}/g, file.name || t('ue_faceFileFallback')));
          continue;
        }
        if (faceUploadStatus) faceUploadStatus.textContent = t('ue_faceUploadingFile').replace(/\{file\}/g, file.name || '');
        prog = document.getElementById('face-upload-progress');
        if (prog) {
          prog.hidden = false;
          prog.setAttribute('aria-busy', 'true');
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const comma = dataUrl.indexOf(',');
          const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
          const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/face-enrollment`, {
            fileBase64: b64,
            mimeType: mime || 'application/octet-stream',
          });
          if (res == null) break;
          if (res?.error) {
            alert(res.error);
            break;
          }
          if (Array.isArray(res.photos)) faceEnrollmentList = sortFaceEnrollmentForDisplay(res.photos);
          renderFaceGallery();
          if (bumpUserRefFaceState && res.comprefaceRecognitionSync != null) {
            bumpUserRefFaceState({
              faceEnrollmentPhotos: res.photos,
              comprefaceRecognitionSync: res.comprefaceRecognitionSync,
            });
          }
          if (res.comprefaceSync && res.comprefaceSync.ok === false && res.comprefaceSync.error) {
            alert(res.comprefaceSync.error);
          }
        } catch (e) {
          console.error('[face-enrollment]', e);
          alert(t('ue_faceUploadFail'));
          break;
        } finally {
          if (prog) {
            prog.hidden = true;
            prog.removeAttribute('aria-busy');
          }
        }
      }
      if (faceUploadStatus) faceUploadStatus.textContent = '';
    };
  }

  const addr = parseJsonSafe(u.addressJson, {});
  document.getElementById('a-line1').value = addr.line1 || '';
  document.getElementById('a-line2').value = addr.line2 || '';
  document.getElementById('a-district').value = addr.district || '';
  document.getElementById('a-city').value = addr.city || '';
  document.getElementById('a-state').value = addr.state || '';
  document.getElementById('a-postal').value = addr.postalCode || '';
  document.getElementById('a-country').value = addr.countryCode || 'BR';
  paintAddressFieldUi();
  const aCountry = document.getElementById('a-country');
  if (aCountry && !aCountry.dataset.ueHintBound) {
    aCountry.dataset.ueHintBound = '1';
    aCountry.addEventListener('input', () => {
      paintAddressFieldUi();
      markDirty();
    });
  }

  const tp = u.technicianProfile;
  hasTechnicianProfile = !!tp;
  syncTechPanelVisibility();
  const fr = document.getElementById('f-role');
  if (fr && !fr.dataset.ueRoleBound) {
    fr.dataset.ueRoleBound = '1';
    fr.addEventListener('change', () => {
      syncTechPanelVisibility();
      markDirty();
    });
  }
  if (tp) {
    document.getElementById('t-status').value = tp.status || 'PENDING';
    document.getElementById('t-cft').value = tp.cft || '';
    document.getElementById('t-specialty').value = tp.specialty || '';
    document.getElementById('t-score').value = String(tp.score ?? 5);
    const skills = parseJsonSafe(tp.skillsJson, []);
    document.getElementById('t-skills').value = Array.isArray(skills) ? skills.join(', ') : '';
    renderSchedule(tp.workScheduleJson, cachedLocations);
    const svc = parseJsonSafe(tp.serviceLocationIds, []);
    const ids = Array.isArray(svc) ? svc : [];
    renderServiceLocationOptions(ids, '');
    renderDocRows('tbody-docs-pro', parseJsonSafe(tp.professionalDocuments, []), cachedLocations, u.id);
  } else {
    renderSchedule({}, cachedLocations);
    renderServiceLocationOptions([], '');
    renderDocRows('tbody-docs-pro', [], cachedLocations, u.id);
  }

  const locFilter = document.getElementById('t-service-locs-filter');
  const svcSelEl = document.getElementById('t-service-locs');
  if (locFilter && svcSelEl && !locFilter.dataset.ueBound) {
    locFilter.dataset.ueBound = '1';
    locFilter.addEventListener('input', () => {
      const selected = [...svcSelEl.selectedOptions].map((o) => o.value);
      renderServiceLocationOptions(selected, locFilter.value);
    });
    svcSelEl.addEventListener('change', markDirty);
  }

  renderDocRows('tbody-docs-personal', parseJsonSafe(u.personalDocuments, []), cachedLocations, u.id);

  const schRoot = document.getElementById('schedule-rows');
  if (schRoot && !schRoot.dataset.ueDirty) {
    schRoot.dataset.ueDirty = '1';
    schRoot.addEventListener('change', markDirty);
    schRoot.addEventListener('click', (e) => {
      if (e.target.closest('.sch-add-slot, .sch-rm-slot')) markDirty();
    });
  }

  document.getElementById('btn-add-doc-p').onclick = () => {
    const tb = document.getElementById('tbody-docs-personal');
    const empty = tb.querySelector('.doc-empty');
    if (empty) empty.remove();
    const locOptsNew = getLocationMultiselectOptionsHtml(cachedLocations);
    tb.insertAdjacentHTML('beforeend', docRowHtml({ id: rid(), docType: 'CPF' }, locOptsNew));
    syncDocLocsMultiselectSelections(tb.lastElementChild);
    const tr = tb.querySelector('tr:last-child');
    tr.querySelector('.doc-del').onclick = (e) => {
      e.target.closest('tr')?.remove();
      markDirty();
    };
    tr.querySelector('.doc-type')?.addEventListener('change', markDirty);
    refreshDocValidityInTable('tbody-docs-personal');
    markDirty();
  };
  document.getElementById('btn-add-doc-pro').onclick = () => {
    const tb = document.getElementById('tbody-docs-pro');
    const empty = tb.querySelector('.doc-empty');
    if (empty) empty.remove();
    const locOptsNewP = getLocationMultiselectOptionsHtml(cachedLocations);
    tb.insertAdjacentHTML('beforeend', docRowHtml({ id: rid(), docType: 'Outro' }, locOptsNewP));
    syncDocLocsMultiselectSelections(tb.lastElementChild);
    const tr = tb.querySelector('tr:last-child');
    tr.querySelector('.doc-del').onclick = (e) => {
      e.target.closest('tr')?.remove();
      markDirty();
    };
    tr.querySelector('.doc-type')?.addEventListener('change', markDirty);
    refreshDocValidityInTable('tbody-docs-pro');
    markDirty();
  };

  ['f-name', 'f-email', 'f-phone', 'f-avatar', 'f-active', 'f-work-time', 'f-admin-notes', 'f-preferred-locale'].forEach(
    (fid) => {
      const el = document.getElementById(fid);
      if (!el || el.dataset.ueDirty) return;
      el.dataset.ueDirty = '1';
      el.addEventListener('change', markDirty);
      el.addEventListener('input', markDirty);
    }
  );
  document.querySelectorAll('#sec-endereco .form-control, #sec-tecnico .form-control, #sec-tecnico select').forEach((el) => {
    if (el.dataset.ueDirty) return;
    el.dataset.ueDirty = '1';
    el.addEventListener('change', markDirty);
    el.addEventListener('input', markDirty);
  });

  let matriculaTimer = null;
  const fMatricula = document.getElementById('f-employee-matricula');
  const matHint = document.createElement('div');
  /** Não reutilizar `ue-matricula-hint` — já existe o parágrafo estático no HTML (id duplicado quebrava o DOM). */
  matHint.id = 'ue-matricula-live-status';
  matHint.style.cssText = 'font-size:11px;margin-top:6px;color:var(--text3)';
  if (fMatricula && !fMatricula.dataset.ueMat) {
    fMatricula.dataset.ueMat = '1';
    fMatricula.insertAdjacentElement('afterend', matHint);
    const checkMat = async () => {
      const raw = (fMatricula.value || '').trim();
      if (!raw) {
        matHint.textContent = '';
        return;
      }
      const res = await CONFIG.get(
        `/users?tenantId=${encodeURIComponent(u.tenantId)}&q=${encodeURIComponent(raw)}&limit=8`
      ).catch(() => null);
      const rows = Array.isArray(res?.data) ? res.data : [];
      const other = rows.find((x) => x.id !== id);
      matHint.style.color = other ? 'var(--red)' : 'var(--green)';
      matHint.textContent = other ? t('matriculaDup') : t('matriculaOk');
    };
    fMatricula.addEventListener('blur', () => {
      clearTimeout(matriculaTimer);
      matriculaTimer = setTimeout(checkMat, 200);
    });
    fMatricula.addEventListener('input', () => {
      matHint.textContent = '';
      markDirty();
    });
  }

  const locPanel = document.getElementById('ue-panel-locale');
  if (locPanel && !locPanel.dataset.ueBound) {
    locPanel.dataset.ueBound = '1';
    locPanel.addEventListener('change', () => {
      setAdminUiLocale(locPanel.value);
      window.location.reload();
    });
  }

  const moreBtn = document.getElementById('btn-more-actions');
  const moreDrop = document.getElementById('ue-more-dropdown');
  const closeMoreMenu = () => {
    const d = document.getElementById('ue-more-dropdown');
    if (d) d.hidden = true;
    const b = document.getElementById('btn-more-actions');
    if (b) b.setAttribute('aria-expanded', 'false');
  };
  if (moreBtn && moreDrop && !moreBtn.dataset.ueBound) {
    moreBtn.dataset.ueBound = '1';
    moreBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const open = moreDrop.hidden;
      moreDrop.hidden = !open;
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (!document.documentElement.dataset.ueUserEditMoreMenuCloser) {
      document.documentElement.dataset.ueUserEditMoreMenuCloser = '1';
      document.addEventListener('click', closeMoreMenu);
    }
  }

  document.getElementById('act-copy-link')?.addEventListener('click', () => {
    const ro = isUserEditReadonly() ? '&readonly=1' : '';
    const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(id)}${ro}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => alert(t('ue_copyLinkOk')))
      .catch(() => prompt(t('ue_copyLinkPrompt'), url));
    closeMoreMenu();
  });
  document.getElementById('act-export-json')?.addEventListener('click', () => {
    const snap = { exportedAt: new Date().toISOString(), userId: id, payload: buildUserPatchPayload() };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `user-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    closeMoreMenu();
  });
  document.getElementById('act-duplicate')?.addEventListener('click', () => {
    try {
      const draft = {
        tenantId: u.tenantId,
        role: document.getElementById('f-role').value,
        name: `${(document.getElementById('f-name').value || '').trim()}${t('ue_duplicateNameSuffix')}`,
        phone: document.getElementById('f-phone').value || '',
        preferredChatLocale: document.getElementById('f-preferred-locale')?.value || '',
      };
      sessionStorage.setItem(DUP_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
    window.location.href = 'users.html';
  });
  document.getElementById('act-role-matrix')?.addEventListener('click', () => {
    fillRoleMatrixModal();
    document.getElementById('role-matrix-modal')?.classList.add('open');
    closeMoreMenu();
  });
  document.querySelectorAll('[data-close-matrix]').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('role-matrix-modal')?.classList.remove('open'));
  });

  const btnAv = document.getElementById('btn-avatar-upload');
  const inpAv = document.getElementById('ue-avatar-file');
  const txtAv = document.getElementById('ue-avatar-upload-txt');
  if (btnAv && inpAv && !btnAv.dataset.ueBound) {
    btnAv.dataset.ueBound = '1';
    btnAv.addEventListener('click', () => {
      if (isUserEditReadonly()) return;
      inpAv.click();
    });
    inpAv.addEventListener('change', () => {
      const f = inpAv.files && inpAv.files[0];
      inpAv.value = '';
      if (!f || isUserEditReadonly()) return;
      const n = (f.name || '').toLowerCase();
      if (n.endsWith('.heic') || n.endsWith('.heif')) {
        alert(t('ue_avatarHeic'));
        return;
      }
      const prev = txtAv ? txtAv.textContent : '';
      if (txtAv) txtAv.textContent = t('ue_avatarUploading');
      btnAv.disabled = true;
      void (async () => {
        try {
          const b64 = await fileToBase64(f);
          const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/avatar-attachment`, {
            fileBase64: b64,
            mimeType: f.type || 'application/octet-stream',
            fileName: f.name || 'upload',
          });
          const finp = document.getElementById('f-avatar');
          if (res?.url && finp) {
            finp.value = res.url;
            markDirty();
          } else {
            alert(res?.error || t('ue_avatarUploadErr'));
          }
        } catch {
          alert(t('ue_avatarUploadErr'));
        } finally {
          btnAv.disabled = false;
          if (txtAv) txtAv.textContent = prev || t('ue_avatarUploadBtn');
        }
      })();
    });
  }

  const navRaw = sessionStorage.getItem(NAV_CTX_KEY);
  let navCtx = null;
  try {
    navCtx = navRaw ? JSON.parse(navRaw) : null;
  } catch {
    navCtx = null;
  }
  if (navCtx && Array.isArray(navCtx.ids) && navCtx.ids.length) {
    const idx = navCtx.ids.indexOf(id);
    const wrap = document.getElementById('ue-nav-arrows');
    const prev = document.getElementById('ue-prev-user');
    const next = document.getElementById('ue-next-user');
    if (wrap && prev && next && idx >= 0) {
      wrap.hidden = false;
      prev.title = t('prevUser');
      next.title = t('nextUser');
      const roQS = isUserEditReadonly() ? '&readonly=1' : '';
      if (idx > 0) prev.href = `user-edit.html?id=${encodeURIComponent(navCtx.ids[idx - 1])}${roQS}`;
      else prev.href = '#';
      prev.style.opacity = idx > 0 ? '1' : '0.35';
      prev.onclick = (e) => {
        if (idx <= 0) e.preventDefault();
      };
      if (idx < navCtx.ids.length - 1) next.href = `user-edit.html?id=${encodeURIComponent(navCtx.ids[idx + 1])}${roQS}`;
      else next.href = '#';
      next.style.opacity = idx < navCtx.ids.length - 1 ? '1' : '0.35';
      next.onclick = (e) => {
        if (idx >= navCtx.ids.length - 1) e.preventDefault();
      };
    }
  }

  applyUserEditSensitiveFieldRbac(u);
  initialPayloadJson = JSON.stringify(buildUserPatchPayload());
  refreshDirty();
  applyUserEditReadonlyIfNeeded();

  if (!window.__brsparkUeEditBeforeUnload) {
    window.__brsparkUeEditBeforeUnload = true;
    window.addEventListener('beforeunload', (e) => {
      if (isUserEditReadonly()) return;
      try {
        const cur = JSON.stringify(buildUserPatchPayload());
        const dirty = cur !== initialPayloadJson;
        if (dirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      } catch {
        /* ignore */
      }
    });
  }

  document.getElementById('btn-discard').onclick = () => {
    if (!confirm(t('ue_discardConfirm'))) return;
    window.location.reload();
  };

  async function doSave(stay) {
    if (isUserEditReadonly()) return;
    if (isManagerPanelSession() && String(uRef.role || '').toUpperCase() === 'SAAS_ADMIN') {
      alert(t('ue_rbacCannotEditSaasUser'));
      return;
    }
    const body = buildUserPatchPayload();
    if (!body.name || !body.email) {
      alert(t('ue_saveNeedNameEmail'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      alert(t('ue_saveEmailInvalid'));
      return;
    }
    const newRole = body.role;
    if (needsElevateConfirm(baselineOriginalRole, newRole)) {
      const ok = await openElevateConfirmModal(uRef.email);
      if (!ok) return;
    }
    const res = await CONFIG.patch('/users/' + encodeURIComponent(id), body);
    if (res?.error) {
      alert(res.error);
      return;
    }
    baselineOriginalRole = normalizeRoleForForm(res.role);
    uRef = res;
    if (fAdminNotes) fAdminNotes.value = res.adminInternalNotes != null ? String(res.adminInternalNotes) : '';
    if (fPrefLoc) fPrefLoc.value = res.preferredChatLocale || '';
    paintSummaryBar(res);
    paintEmailVerificationUx(res);
    paintWorkTimeHints(res, wtSet);
    void loadUserAudit(id);
    initialPayloadJson = JSON.stringify(buildUserPatchPayload());
    refreshDirty();
    if (stay) {
      alert(t('ue_saveOk'));
    } else {
      window.location.href = 'users.html?resume=1';
    }
  }

  document.getElementById('btn-save').onclick = () => doSave(false);
  document.getElementById('btn-save-stay').onclick = () => doSave(true);
}
