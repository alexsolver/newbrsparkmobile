/**
 * Edição completa de utilizador (admin) — dados, endereço, prestador, documentos multi-location, horários.
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

function renderSchedule(workScheduleJson) {
  const w = parseJsonSafe(workScheduleJson, {});
  const wrap = document.getElementById('schedule-rows');
  if (!wrap) return;
  wrap.innerHTML = DAYS.map(({ key, label }) => {
    const row = w[key] || {};
    const en = row.enabled !== false && (row.start || row.end || row.enabled === true);
    return `<div class="sched-row" style="display:grid;grid-template-columns:100px 1fr 1fr 1fr;gap:8px;align-items:center;margin-bottom:8px">
      <label style="font-weight:700;font-size:12px">${label}</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" class="sch-en" data-day="${key}" ${en ? 'checked' : ''}/> Ativo</label>
      <input type="time" class="form-control sch-start" data-day="${key}" value="${esc(row.start || '08:00')}" style="padding:6px;font-size:12px" />
      <input type="time" class="form-control sch-end" data-day="${key}" value="${esc(row.end || '18:00')}" style="padding:6px;font-size:12px" />
    </div>`;
  }).join('');
}

function collectSchedule() {
  const o = {};
  DAYS.forEach(({ key }) => {
    const en = document.querySelector(`.sch-en[data-day="${key}"]`)?.checked;
    const start = document.querySelector(`.sch-start[data-day="${key}"]`)?.value || '08:00';
    const end = document.querySelector(`.sch-end[data-day="${key}"]`)?.value || '18:00';
    o[key] = { enabled: !!en, start, end };
  });
  return o;
}

let cachedLocations = [];

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
      `<p style="padding:40px;text-align:center">Utilizador não encontrado. <a href="users.html">Voltar</a></p>`;
    return;
  }

  cachedLocations = await CONFIG.get('/locations?tenantId=' + encodeURIComponent(u.tenantId)).catch(() => []);
  if (!Array.isArray(cachedLocations)) cachedLocations = [];

  document.getElementById('ue-title').textContent = u.name || u.email;
  document.getElementById('ue-sub').textContent = u.tenant?.name || u.tenantId;

  document.getElementById('f-name').value = u.name || '';
  document.getElementById('f-email').value = u.email || '';
  document.getElementById('f-phone').value = u.phone || '';
  document.getElementById('f-role').value = u.role || 'USER';
  document.getElementById('f-avatar').value = u.avatarUrl || '';
  document.getElementById('f-active').checked = !!u.isActive;

  const addr = parseJsonSafe(u.addressJson, {});
  document.getElementById('a-line1').value = addr.line1 || '';
  document.getElementById('a-line2').value = addr.line2 || '';
  document.getElementById('a-district').value = addr.district || '';
  document.getElementById('a-city').value = addr.city || '';
  document.getElementById('a-state').value = addr.state || '';
  document.getElementById('a-postal').value = addr.postalCode || '';
  document.getElementById('a-country').value = addr.countryCode || 'BR';

  const tp = u.technicianProfile;
  document.getElementById('f-provider').checked = !!tp;
  document.getElementById('tech-panel').style.display = tp ? 'block' : 'none';
  if (tp) {
    document.getElementById('t-status').value = tp.status || 'PENDING';
    document.getElementById('t-cft').value = tp.cft || '';
    document.getElementById('t-specialty').value = tp.specialty || '';
    document.getElementById('t-score').value = String(tp.score ?? 5);
    const skills = parseJsonSafe(tp.skillsJson, []);
    document.getElementById('t-skills').value = Array.isArray(skills) ? skills.join(', ') : '';
    renderSchedule(tp.workScheduleJson);
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
    renderSchedule({});
    document.getElementById('t-service-locs').innerHTML = cachedLocations
      .map((l) => `<option value="${esc(l.id)}">${esc(l.name)} — ${esc(l.type)}</option>`)
      .join('');
    renderDocRows('tbody-docs-pro', [], cachedLocations);
  }

  document.getElementById('f-provider').onchange = () => {
    document.getElementById('tech-panel').style.display = document.getElementById('f-provider').checked ? 'block' : 'none';
  };

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

    const body = {
      name: document.getElementById('f-name').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      phone: document.getElementById('f-phone').value.trim() || null,
      role: document.getElementById('f-role').value,
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
      isProvider: document.getElementById('f-provider').checked,
      technician: document.getElementById('f-provider').checked
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
