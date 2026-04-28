/**
 * Diretório de prestadores — por omissão oculta quem está numa janela exclusiva de dedicado a outra empresa;
 * checkbox opcional para listar todos (ignora filtro por horário).
 */
import { initPage } from './sidebar.js';
import { CONFIG, getEffectivePanelCapabilities } from './config.js';
import { t, applyPrestadoresCatalogoPageI18n } from './user-pages-i18n.js';
import { tpFormatDateTime } from './technician-applications-i18n.js';

const PAGE_SIZE = 50;
let currentPage = 1;
let lastMeta = { total: 0, page: 1, pageSize: PAGE_SIZE, fetchedFromDb: 0, capped: false };

function panelTenantId() {
  try {
    if (sessionStorage.getItem('brspark_panel_mode') === 'tenant') {
      const row = JSON.parse(sessionStorage.getItem('brspark_panel_tenant') || '{}');
      return row.id || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isGlobalPlatformSession() {
  return String(sessionStorage.getItem('brspark_panel_mode') || '').trim() === 'global';
}

function canUsePlatformTenantPicker() {
  const caps = new Set(getEffectivePanelCapabilities());
  return caps.has('platform.users.read') && isGlobalPlatformSession();
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function trMeta(key, vars) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

function readUrlState() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return {
      page: Math.max(1, parseInt(sp.get('page') || '1', 10) || 1),
      q: String(sp.get('q') || '').trim().slice(0, 200),
      skill: String(sp.get('skill') || '').trim().slice(0, 120),
      locationId: String(sp.get('locationId') || '').trim(),
      techStatus: String(sp.get('techStatus') || '').trim(),
      hasSchedule: String(sp.get('hasSchedule') || '').trim(),
      hasCoverage: String(sp.get('hasCoverage') || '').trim(),
      tenantId: String(sp.get('tenantId') || '').trim(),
      includeDedicatedBound: String(sp.get('includeDedicatedBound') || '').trim() === '1',
    };
  } catch {
    return {
      page: 1,
      q: '',
      skill: '',
      locationId: '',
      techStatus: '',
      hasSchedule: '',
      hasCoverage: '',
      tenantId: '',
      includeDedicatedBound: false,
    };
  }
}

function writeUrlState() {
  try {
    const sp = new URLSearchParams();
    if (currentPage > 1) sp.set('page', String(currentPage));
    const q = document.getElementById('pdc-filter-q')?.value?.trim() || '';
    if (q) sp.set('q', q.slice(0, 200));
    const skill = document.getElementById('pdc-filter-skill')?.value?.trim() || '';
    if (skill) sp.set('skill', skill.slice(0, 120));
    const loc = document.getElementById('pdc-filter-location')?.value || '';
    if (loc) sp.set('locationId', loc);
    const st = document.getElementById('pdc-filter-tech-status')?.value || '';
    if (st) sp.set('techStatus', st);
    const sch = document.getElementById('pdc-filter-schedule')?.value || '';
    if (sch) sp.set('hasSchedule', sch);
    const cov = document.getElementById('pdc-filter-coverage')?.value || '';
    if (cov) sp.set('hasCoverage', cov);
    if (document.getElementById('pdc-filter-include-dedicated')?.checked) sp.set('includeDedicatedBound', '1');
    const ten = document.getElementById('pdc-filter-tenant')?.value || '';
    if (ten && canUsePlatformTenantPicker()) sp.set('tenantId', ten);
    const qs = sp.toString();
    window.history.replaceState({}, '', `prestadores-catalogo.html${qs ? `?${qs}` : ''}`);
  } catch {
    /* ignore */
  }
}

function applyUrlToForm(st, opts = {}) {
  const { skipTenant = false, skipLocation = false } = opts;
  const qEl = document.getElementById('pdc-filter-q');
  const skEl = document.getElementById('pdc-filter-skill');
  const locEl = document.getElementById('pdc-filter-location');
  const tsEl = document.getElementById('pdc-filter-tech-status');
  const schEl = document.getElementById('pdc-filter-schedule');
  const covEl = document.getElementById('pdc-filter-coverage');
  const tenEl = document.getElementById('pdc-filter-tenant');
  if (qEl) qEl.value = st.q || '';
  if (skEl) skEl.value = st.skill || '';
  if (locEl && st.locationId && !skipLocation) locEl.value = st.locationId;
  if (tsEl && st.techStatus) tsEl.value = st.techStatus;
  if (schEl && st.hasSchedule) schEl.value = st.hasSchedule;
  if (covEl && st.hasCoverage) covEl.value = st.hasCoverage;
  const incDed = document.getElementById('pdc-filter-include-dedicated');
  if (incDed) incDed.checked = !!st.includeDedicatedBound;
  if (tenEl && st.tenantId && canUsePlatformTenantPicker() && !skipTenant) {
    if (Array.from(tenEl.options).some((o) => o.value === st.tenantId)) tenEl.value = st.tenantId;
  }
  currentPage = st.page || 1;
}

async function loadTenantOptions() {
  const wrap = document.getElementById('pdc-wrap-tenant');
  const sel = document.getElementById('pdc-filter-tenant');
  if (!wrap || !sel || !canUsePlatformTenantPicker()) return;
  wrap.style.display = '';
  const cur = sel.value;
  sel.innerHTML = `<option value="">${escHtml(t('pdc_filter_tenant_all'))}</option>`;
  try {
    const j = await CONFIG.get('/tenants?page=1&limit=500&all=1&kind=COMPANY');
    const rows = Array.isArray(j?.data) ? j.data : [];
    for (const r of rows) {
      const id = String(r.id || '').trim();
      if (!id) continue;
      const nm = String(r.name || r.slug || id).trim();
      const op = document.createElement('option');
      op.value = id;
      op.textContent = nm;
      sel.appendChild(op);
    }
    if (cur && Array.from(sel.options).some((o) => o.value === cur)) sel.value = cur;
  } catch {
    /* ignore */
  }
}

function effectiveTenantIdForApi() {
  if (canUsePlatformTenantPicker()) {
    const v = String(document.getElementById('pdc-filter-tenant')?.value || '').trim();
    if (v) return v;
    return null;
  }
  return panelTenantId();
}

function effectiveTenantIdForLocations() {
  return effectiveTenantIdForApi() || panelTenantId();
}

async function loadLocationOptions() {
  const sel = document.getElementById('pdc-filter-location');
  const hint = document.getElementById('pdc-location-hint');
  if (!sel) return;
  const tid = effectiveTenantIdForLocations();
  const prev = sel.value;
  sel.innerHTML = `<option value="">${escHtml(t('pdc_filter_location_any'))}</option>`;
  if (!tid) {
    if (hint) {
      hint.style.display = '';
      hint.textContent = t('pdc_filter_location_hint');
    }
    return;
  }
  if (hint) hint.style.display = 'none';
  try {
    const list = await CONFIG.get(`/locations?tenantId=${encodeURIComponent(tid)}`);
    const rows = Array.isArray(list) ? list : [];
    for (const loc of rows) {
      const id = String(loc.id || '').trim();
      if (!id) continue;
      const op = document.createElement('option');
      op.value = id;
      op.textContent = String(loc.name || id);
      sel.appendChild(op);
    }
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
  } catch {
    /* ignore */
  }
}

function yn(b) {
  return b ? t('pdc_yes') : t('pdc_no');
}

function renderRows(rows) {
  const tb = document.getElementById('pdc-tbody');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text3)">${escHtml(t('pdc_empty'))}</td></tr>`;
    return;
  }
  tb.innerHTML = rows
    .map((r) => {
      const tech = r.technician || {};
      const spec = tech.specialty ? escHtml(tech.specialty) : '—';
      const st = tech.status ? escHtml(tech.status) : '—';
      const href = `user-edit.html?id=${encodeURIComponent(r.userId)}`;
      return `<tr>
        <td>${escHtml(r.name || '—')}</td>
        <td>${escHtml(r.email || '')}</td>
        <td>${escHtml(r.tenantName || r.tenantId || '—')}</td>
        <td><span class="badge">${st}</span></td>
        <td>${spec}</td>
        <td>${escHtml(yn(!!tech.hasSchedule))}</td>
        <td>${escHtml(yn(!!tech.hasCoverageArea))}</td>
        <td>${escHtml(tpFormatDateTime(r.updatedAt))}</td>
        <td class="text-right"><a class="btn btn-ghost btn-sm" href="${href}" style="text-decoration:none">${escHtml(t('pdc_open_user'))}</a></td>
      </tr>`;
    })
    .join('');
}

function renderMeta() {
  const el = document.getElementById('pdc-meta');
  if (!el) return;
  const pages = Math.max(1, Math.ceil(lastMeta.total / (lastMeta.pageSize || PAGE_SIZE)));
  const capped = lastMeta.capped ? t('pdc_meta_capped') : '';
  el.textContent = trMeta('pdc_meta', {
    total: lastMeta.total,
    page: lastMeta.page,
    pages,
    fetched: lastMeta.fetchedFromDb,
    capped,
  });
}

async function loadDirectory() {
  const tb = document.getElementById('pdc-tbody');
  const banner = document.getElementById('pdc-banner');
  if (tb) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:22px;color:var(--text3)">…</td></tr>`;
  }
  if (banner) {
    banner.style.display = 'none';
    banner.textContent = '';
  }

  const q = document.getElementById('pdc-filter-q')?.value?.trim().slice(0, 200) || '';
  const skill = document.getElementById('pdc-filter-skill')?.value?.trim().slice(0, 120) || '';
  const locationId = document.getElementById('pdc-filter-location')?.value || '';
  const techStatus = document.getElementById('pdc-filter-tech-status')?.value || '';
  const hasSchedule = document.getElementById('pdc-filter-schedule')?.value || '';
  const hasCoverage = document.getElementById('pdc-filter-coverage')?.value || '';

  const sp = new URLSearchParams();
  sp.set('page', String(currentPage));
  sp.set('pageSize', String(PAGE_SIZE));
  if (q) sp.set('q', q);
  if (skill) sp.set('skill', skill);
  if (locationId) sp.set('locationId', locationId);
  if (techStatus) sp.set('techStatus', techStatus);
  if (hasSchedule) sp.set('hasSchedule', hasSchedule);
  if (hasCoverage) sp.set('hasCoverage', hasCoverage);
  if (document.getElementById('pdc-filter-include-dedicated')?.checked) sp.set('includeDedicatedBound', '1');
  const apiTenant = effectiveTenantIdForApi();
  if (apiTenant) sp.set('tenantId', apiTenant);

  const path = `/providers/panel/saas-provider-directory?${sp.toString()}`;
  const j = await CONFIG.get(path);
  if (j?.error) {
    if (tb) {
      const msg = String(j.error || t('pdc_err'));
      tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--danger, #b42318)">${escHtml(msg)}</td></tr>`;
    }
    if (banner && /permissão|permission/i.test(String(j.error))) {
      banner.style.display = '';
      banner.textContent = t('pdc_perm');
    }
    return;
  }
  const rows = Array.isArray(j?.data) ? j.data : [];
  lastMeta = {
    total: Number(j?.meta?.total) || 0,
    page: Number(j?.meta?.page) || currentPage,
    pageSize: Number(j?.meta?.pageSize) || PAGE_SIZE,
    fetchedFromDb: Number(j?.meta?.fetchedFromDb) || 0,
    capped: !!j?.meta?.capped,
  };
  if (banner && lastMeta.capped) {
    banner.style.display = '';
    banner.textContent = t('pdc_banner_capped');
  }
  renderRows(rows);
  renderMeta();
  writeUrlState();
}

await initPage();
applyPrestadoresCatalogoPageI18n();
try {
  document.title = t('pdc_pageTitle');
} catch {
  /* ignore */
}

const st0 = readUrlState();
applyUrlToForm(st0, { skipTenant: true, skipLocation: true });
await loadTenantOptions();
applyUrlToForm(st0, { skipLocation: true });
await loadLocationOptions();
applyUrlToForm(st0);
await loadDirectory();

document.getElementById('pdc-btn-apply')?.addEventListener('click', () => {
  currentPage = 1;
  loadDirectory();
});
document.getElementById('pdc-btn-refresh')?.addEventListener('click', () => {
  loadDirectory();
});
document.getElementById('pdc-btn-prev')?.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadDirectory();
  }
});
document.getElementById('pdc-btn-next')?.addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(lastMeta.total / (lastMeta.pageSize || PAGE_SIZE)));
  if (currentPage < pages) {
    currentPage += 1;
    loadDirectory();
  }
});

document.getElementById('pdc-filter-tenant')?.addEventListener('change', async () => {
  document.getElementById('pdc-filter-location').value = '';
  await loadLocationOptions();
  currentPage = 1;
  loadDirectory();
});
