/**
 * Edição completa de usuário (admin) — dados, endereço, prestador, documentos multi-location, horários.
 */
import { initPage } from './sidebar.js';
import { CONFIG } from './config.js';

const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const DOC_TYPE_OPTIONS = ['CPF', 'RG', 'CNH', 'Passaporte', 'CNS', 'PIS/PASEP', 'Outro'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function rid() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function getQueryId() {
  const p = new URLSearchParams(window.location.search);
  return p.get('id') || '';
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

function renderDocRows(tbodyId, docs, locations) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  const list = Array.isArray(docs) ? docs : [];
  tb.innerHTML = list.length
    ? list.map((d) => docRowHtml(d, locations)).join('')
    : '<tr class="doc-empty"><td colspan="7" style="text-align:center;color:var(--text3);padding:16px">Nenhum documento. Use «Adicionar».</td></tr>';
  tb.querySelectorAll('.doc-del').forEach((btn) => {
    btn.onclick = () => {
      btn.closest('tr')?.remove();
      if (!tb.querySelector('tr:not(.doc-empty)')) {
        tb.innerHTML =
          '<tr class="doc-empty"><td colspan="7" style="text-align:center;color:var(--text3);padding:16px">Nenhum documento.</td></tr>';
      }
    };
  });
}

function docRowHtml(d, locations) {
  const id = d.id || rid();
  const locIds = Array.isArray(d.locationIds) ? d.locationIds : [];
  const opts = locations
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${locIds.includes(l.id) ? 'selected' : ''}>${esc(l.name)} (${esc(l.type)})</option>`
    )
    .join('');
  return `<tr data-doc-id="${esc(id)}">
    <td><input type="hidden" class="doc-id" value="${esc(id)}" />
      <select class="form-control doc-type" style="padding:6px;font-size:12px">${DOC_TYPE_OPTIONS.map(
        (t) => `<option value="${t}" ${(d.docType || '') === t ? 'selected' : ''}>${t}</option>`
      ).join('')}</select></td>
    <td><input class="form-control doc-idnum" style="padding:6px;font-size:12px" placeholder="Número" value="${esc(d.identifier || '')}" /></td>
    <td><input class="form-control doc-from" type="date" value="${esc((d.validFrom || '').slice(0, 10))}" /></td>
    <td><input class="form-control doc-to" type="date" value="${esc((d.validTo || '').slice(0, 10))}" /></td>
    <td><input class="form-control doc-issuer" style="padding:6px;font-size:12px" placeholder="Órgão emissor" value="${esc(d.issuingBody || '')}" /></td>
    <td><select class="form-control doc-locs" multiple size="2" style="padding:4px;font-size:11px;min-width:120px" title="Vazio = válido em todas as bases do tenant">${opts}</select>
      <div style="font-size:10px;color:var(--text3);margin-top:2px">Ctrl+clique várias</div></td>
    <td><input class="form-control doc-notes" style="padding:6px;font-size:12px" placeholder="Notas" value="${esc(d.notes || '')}" />
      <button type="button" class="btn btn-sm doc-del" style="margin-top:4px;color:var(--red)">Remover</button></td>
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

function slotRowHtml(slot, locations) {
  const locIds = Array.isArray(slot.locationIds) ? slot.locationIds : [];
  const opts = locations
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${locIds.includes(l.id) ? 'selected' : ''}>${esc(l.name)} (${esc(l.type)})</option>`
    )
    .join('');
  const en = slot.enabled;
  return `<div class="sched-slot" data-slot-id="${esc(slot.id)}" style="display:grid;grid-template-columns:auto 1fr 1fr minmax(168px,1.5fr) auto;gap:8px;align-items:start;margin-bottom:8px">
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;padding-top:8px;white-space:nowrap"><input type="checkbox" class="sch-en" ${en ? 'checked' : ''}/> Ativo</label>
    <div><span style="font-size:10px;color:var(--text3)">Início</span><input type="time" class="form-control sch-start" value="${esc(slot.start || '08:00')}" style="padding:6px;font-size:12px;width:100%" /></div>
    <div><span style="font-size:10px;color:var(--text3)">Fim</span><input type="time" class="form-control sch-end" value="${esc(slot.end || '18:00')}" style="padding:6px;font-size:12px;width:100%" /></div>
    <div><span style="font-size:10px;color:var(--text3)">Regiões neste turno</span><select class="form-control sch-locs" multiple size="2" style="padding:4px;font-size:11px;width:100%" title="Vazio = não fixa base neste turno">${opts}</select>
    <span style="font-size:10px;color:var(--text3)">Ctrl/Cmd + clique</span></div>
    <button type="button" class="btn btn-sm btn-ghost sch-rm-slot" style="margin-top:18px" title="Remover turno">✕</button>
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
      container.insertAdjacentHTML('beforeend', slotRowHtml(slot, locations));
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
        container.innerHTML = slotRowHtml(slot, locations);
      }
    }
  });
}

function renderSchedule(workScheduleJson, locations) {
  const locs = Array.isArray(locations) ? locations : [];
  const w = parseJsonSafe(workScheduleJson, {});
  const wrap = document.getElementById('schedule-rows');
  if (!wrap) return;
  wrap.innerHTML = DAYS.map(({ key, label }) => {
    const slots = normalizeDayToSlots(w[key]);
    const slotsHtml = slots.map((s) => slotRowHtml(s, locs)).join('');
    return `<div class="sched-day" data-day="${key}" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-weight:700;font-size:13px;min-width:92px">${label}</span>
        <button type="button" class="btn btn-sm btn-primary sch-add-slot" data-day="${key}">+ Turno neste dia</button>
      </div>
      <div class="sched-slots" data-day="${key}">${slotsHtml}</div>
    </div>`;
  }).join('');
  bindScheduleSlotUI(locs);
}

function collectSchedule() {
  const o = {};
  const root = document.getElementById('schedule-rows');
  DAYS.forEach(({ key }) => {
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
let faceEnrollmentList = [];
let faceUserId = '';
/** Já existe TechnicianProfile (mostrar bloco técnico mesmo com papel ainda não migrado a PROVIDER) */
let hasTechnicianProfile = false;

let comprefaceDebounceTimer = null;

function setComprefaceSyncStatus(state, message) {
  const el = document.getElementById('compreface-sync-status');
  if (!el) return;
  el.className = `cf-sync--${state}`;
  el.textContent = message;
}

function applyCompreFaceSyncFromServer(sync) {
  if (!sync || typeof sync !== 'object') return;
  if (sync.ok) {
    const faces = sync.faces ?? 0;
    const sub = sync.subject || '—';
    setComprefaceSyncStatus('ok', `Galeria atualizada — ${faces} imagem(ns) enviada(s) · subject: ${sub}`);
  } else {
    setComprefaceSyncStatus('err', sync.error || 'CompreFace: sincronização falhou.');
  }
}

/** Estado persistido no usuário (lista admin + painel de edição). */
function paintComprefaceAdminPanel(sync) {
  const wrap = document.getElementById('compreface-admin-status');
  if (!wrap) return;
  if (!sync || typeof sync !== 'object') {
    wrap.innerHTML =
      '<span class="cf-admin-badge cf-admin--muted"><strong>CompreFace (registo)</strong> — sem estado guardado. Após enviar fotos ou «Sincronizar», o estado aparece aqui.</span>';
    return;
  }
  const st = String(sync.status || '').toLowerCase();
  const dateStr = sync.at
    ? new Date(sync.at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  if (st === 'synced') {
    const sub = sync.subject
      ? ` · subject <code style="font-size:10px">${esc(String(sync.subject))}</code>`
      : '';
    wrap.innerHTML = `<span class="cf-admin-badge cf-admin--ok"><strong>Sincronizado</strong> (${dateStr}) · ${Number(sync.faces) || 0} imagem(ns) na galeria${sub}</span>`;
    return;
  }
  if (st === 'pending') {
    wrap.innerHTML = `<span class="cf-admin-badge cf-admin--pending"><strong>Pendente</strong> (${dateStr}) — ${esc(String(sync.message || 'Aguarda sincronização com CompreFace.'))}</span>`;
    return;
  }
  if (st === 'error') {
    let prev = '';
    if (sync.previous && typeof sync.previous === 'object') {
      const pa = sync.previous.at
        ? new Date(sync.previous.at).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      prev = ` Último OK: ${pa} (${sync.previous.faces ?? 0} img).`;
    }
    wrap.innerHTML = `<span class="cf-admin-badge cf-admin--err"><strong>Erro de sincronização</strong> (${dateStr}) — ${esc(String(sync.message || 'Falha'))}${prev}</span>`;
    return;
  }
  wrap.innerHTML = `<span class="cf-admin-badge cf-admin--muted">${esc(JSON.stringify(sync))}</span>`;
}

async function runCompreFaceSync({ manual = false } = {}) {
  if (!faceUserId) return;
  const btn = document.getElementById('btn-compreface-sync');
  if (btn) btn.disabled = true;
  setComprefaceSyncStatus('loading', 'A sincronizar com CompreFace…');
  try {
    const res = await CONFIG.post(`/users/${encodeURIComponent(faceUserId)}/sync-compreface`, {});
    if (res?.error || res?.ok === false) {
      const msg = res?.error || 'Falha na sincronização.';
      setComprefaceSyncStatus('err', msg);
      if (res.comprefaceRecognitionSync) paintComprefaceAdminPanel(res.comprefaceRecognitionSync);
      if (manual) alert(msg);
    } else {
      const faces = res.faces ?? 0;
      const sub = res.subject || '—';
      setComprefaceSyncStatus('ok', `Galeria atualizada — ${faces} imagem(ns) enviada(s) · subject: ${sub}`);
      if (res.comprefaceRecognitionSync) paintComprefaceAdminPanel(res.comprefaceRecognitionSync);
    }
  } catch {
    setComprefaceSyncStatus('err', 'Erro de rede ao contatar o servidor.');
    if (manual) alert('Erro de rede ao sincronizar.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Após várias fotos seguidas, uma só chamada ao CompreFace (evita N sincronizações). */
function scheduleCompreFaceAutoSync() {
  if (comprefaceDebounceTimer) clearTimeout(comprefaceDebounceTimer);
  comprefaceDebounceTimer = setTimeout(() => {
    comprefaceDebounceTimer = null;
    void runCompreFaceSync({ manual: false });
  }, 550);
}

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
  if (!faceEnrollmentList.length) {
    el.innerHTML =
      '<div style="grid-column:1/-1;font-size:12px;color:var(--text3);padding:8px 0">Nenhuma foto base. Use «Adicionar fotos».</div>';
    return;
  }
  el.innerHTML = faceEnrollmentList
    .map(
      (p) => `<div class="face-card" data-photo-id="${esc(p.id)}">
      <img src="${esc(publicUploadUrl(p.url))}" alt="" loading="lazy" decoding="async" />
      <button type="button" class="btn btn-sm btn-danger face-rm" data-photo-id="${esc(p.id)}">Remover</button>
    </div>`
    )
    .join('');
  el.querySelectorAll('.face-rm').forEach((btn) => {
    btn.onclick = () => removeFacePhoto(btn.getAttribute('data-photo-id'));
  });
}

async function removeFacePhoto(photoId) {
  if (!photoId || !faceUserId) return;
  if (!confirm('Remover esta foto base?')) return;
  const res = await CONFIG.del(
    `/users/${encodeURIComponent(faceUserId)}/face-enrollment/${encodeURIComponent(photoId)}`
  );
  if (res?.error) {
    alert(res.error);
    return;
  }
  faceEnrollmentList = Array.isArray(res.photos) ? res.photos : faceEnrollmentList.filter((x) => x.id !== photoId);
  renderFaceGallery();
  if (res.comprefaceRecognitionSync) paintComprefaceAdminPanel(res.comprefaceRecognitionSync);
  if (res.comprefaceSync) applyCompreFaceSyncFromServer(res.comprefaceSync);
  else scheduleCompreFaceAutoSync();
}

export async function bootUserEditPage() {
  await initPage();
  const id = getQueryId();
  if (!id) {
    document.getElementById('page-root').innerHTML =
      '<p style="padding:40px;text-align:center">ID em falta. <a href="users.html">Voltar</a></p>';
    return;
  }

  const u = await CONFIG.get('/users/' + encodeURIComponent(id));
  if (!u || u.error) {
    document.getElementById('page-root').innerHTML =
      `<p style="padding:40px;text-align:center">Usuário não encontrado. <a href="users.html">Voltar</a></p>`;
    return;
  }

  cachedLocations = await CONFIG.get('/locations?tenantId=' + encodeURIComponent(u.tenantId)).catch(() => []);
  if (!Array.isArray(cachedLocations)) cachedLocations = [];

  document.getElementById('ue-title').textContent = u.name || u.email;
  document.getElementById('ue-sub').textContent = u.tenant?.name || u.tenantId;

  document.getElementById('f-name').value = u.name || '';
  document.getElementById('f-email').value = u.email || '';
  document.getElementById('f-phone').value = u.phone || '';
  document.getElementById('f-role').value = normalizeRoleForForm(u.role);
  document.getElementById('f-avatar').value = u.avatarUrl || '';
  document.getElementById('f-active').checked = !!u.isActive;

  faceUserId = id;
  faceEnrollmentList = parseJsonSafe(u.faceEnrollmentPhotos, []);
  if (!Array.isArray(faceEnrollmentList)) faceEnrollmentList = [];
  renderFaceGallery();
  paintComprefaceAdminPanel(u.comprefaceRecognitionSync);

  const btnFacePick = document.getElementById('btn-face-pick');
  const faceFileInput = document.getElementById('face-file-input');
  const faceUploadStatus = document.getElementById('face-upload-status');
  if (btnFacePick && faceFileInput) {
    btnFacePick.onclick = () => faceFileInput.click();
    faceFileInput.onchange = async (ev) => {
      const files = [...(ev.target.files || [])];
      ev.target.value = '';
      for (const file of files) {
        const mime = resolveFaceUploadMime(file);
        if (mime === 'image/heic' || mime === 'image/heif') {
          alert(
            `HEIC não é suportado aqui: ${file.name}\nNo iPhone use Ajustes → Câmera → Formatos → «Mais compatível», ou converta para JPEG.`
          );
          continue;
        }
        if (mime && !/^image\/(jpeg|png|webp)$/i.test(mime)) {
          alert(`Formato não reconhecido (use JPEG, PNG ou WebP): ${file.name || 'arquivo'}`);
          continue;
        }
        if (faceUploadStatus) faceUploadStatus.textContent = `A enviar ${file.name}…`;
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
          if (Array.isArray(res.photos)) faceEnrollmentList = res.photos;
          renderFaceGallery();
          if (res.comprefaceRecognitionSync) paintComprefaceAdminPanel(res.comprefaceRecognitionSync);
          scheduleCompreFaceAutoSync();
        } catch (e) {
          console.error('[face-enrollment]', e);
          alert('Falha ao enviar a foto. Verifique a ligação à API e o consola do navegador.');
          break;
        }
      }
      if (faceUploadStatus) faceUploadStatus.textContent = '';
    };
  }

  const btnCfSync = document.getElementById('btn-compreface-sync');
  if (btnCfSync) {
    btnCfSync.onclick = () => {
      if (!faceUserId) return;
      void runCompreFaceSync({ manual: true });
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

  const tp = u.technicianProfile;
  hasTechnicianProfile = !!tp;
  syncTechPanelVisibility();
  const fr = document.getElementById('f-role');
  if (fr && !fr.dataset.ueRoleBound) {
    fr.dataset.ueRoleBound = '1';
    fr.addEventListener('change', syncTechPanelVisibility);
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
    const sel = document.getElementById('t-service-locs');
    sel.innerHTML = cachedLocations
      .map(
        (l) =>
          `<option value="${esc(l.id)}" ${ids.includes(l.id) ? 'selected' : ''}>${esc(l.name)} — ${esc(l.type)}</option>`
      )
      .join('');
    renderDocRows('tbody-docs-pro', parseJsonSafe(tp.professionalDocuments, []), cachedLocations);
  } else {
    renderSchedule({}, cachedLocations);
    document.getElementById('t-service-locs').innerHTML = cachedLocations
      .map((l) => `<option value="${esc(l.id)}">${esc(l.name)} — ${esc(l.type)}</option>`)
      .join('');
    renderDocRows('tbody-docs-pro', [], cachedLocations);
  }

  renderDocRows('tbody-docs-personal', parseJsonSafe(u.personalDocuments, []), cachedLocations);

  document.getElementById('btn-add-doc-p').onclick = () => {
    const tb = document.getElementById('tbody-docs-personal');
    const empty = tb.querySelector('.doc-empty');
    if (empty) empty.remove();
    tb.insertAdjacentHTML('beforeend', docRowHtml({ id: rid(), docType: 'CPF' }, cachedLocations));
    tb.querySelector('tr:last-child .doc-del').onclick = (e) => {
      e.target.closest('tr')?.remove();
    };
  };
  document.getElementById('btn-add-doc-pro').onclick = () => {
    const tb = document.getElementById('tbody-docs-pro');
    const empty = tb.querySelector('.doc-empty');
    if (empty) empty.remove();
    tb.insertAdjacentHTML('beforeend', docRowHtml({ id: rid(), docType: 'Outro' }, cachedLocations));
    tb.querySelector('tr:last-child .doc-del').onclick = (e) => {
      e.target.closest('tr')?.remove();
    };
  };

  document.getElementById('btn-save').onclick = async () => {
    const skillsRaw = document.getElementById('t-skills')?.value || '';
    const skillsJson = skillsRaw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const svcSel = document.getElementById('t-service-locs');
    const serviceLocationIds = svcSel ? [...svcSel.selectedOptions].map((o) => o.value) : [];

    const selRole = document.getElementById('f-role').value;
    const isProviderRole = selRole === 'PROVIDER';
    /** Painel técnico também aparece com perfil já criado; é preciso enviar `technician` senão o backend assumia «não prestador» e forçava INACTIVE. */
    const includeTechnician = isProviderRole || hasTechnicianProfile;

    const body = {
      name: document.getElementById('f-name').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      phone: document.getElementById('f-phone').value.trim() || null,
      role: selRole,
      avatarUrl: document.getElementById('f-avatar').value.trim() || null,
      isActive: document.getElementById('f-active').checked,
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

    if (!body.name || !body.email) {
      alert('Nome e e-mail são obrigatórios.');
      return;
    }

    const res = await CONFIG.patch('/users/' + encodeURIComponent(id), body);
    if (res?.error) {
      alert(res.error);
      return;
    }
    alert('Guardado com sucesso.');
    window.location.href = 'users.html';
  };
}
