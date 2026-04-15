/**
 * Painel — RT (tarefas de rotina): associações modelo ↔ prestadores (exceto cliente).
 */
import { initPage, getStoredPanelRole } from './sidebar.js';
import { CONFIG } from './config.js';
import { t as userT } from './user-pages-i18n.js';
import { rtT, applyRoutineTasksStaticI18n } from './routine-tasks-i18n.js';

const role = getStoredPanelRole();
let activeTenantId = null;
/** @type {{ id: string, title?: string, tenantId?: string|null }[]} */
let cachedTemplates = [];
/** @type {{ id: string, name?: string, email?: string, role?: string, isActive?: boolean }[]} */
let cachedTechnicians = [];
/** @type {any[]} */
let cachedAssignmentsRaw = [];
/** @type {{ id: string, name?: string, email?: string }[]} */
let cachedPanelTenants = [];
let tenantFilterText = '';

let assignmentsPage = 1;
let assignmentsPageSize = 25;

function showRtToast(message, ok = true) {
  let t = document.getElementById('_rt_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_rt_toast';
    t.setAttribute('role', 'status');
    t.style.cssText =
      'position:fixed;bottom:28px;right:28px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,0.15);transition:opacity 0.3s;max-width:420px;white-space:pre-wrap;';
    document.body.appendChild(t);
  }
  t.style.background = ok ? '#10B981' : '#EF4444';
  t.style.color = '#fff';
  t.style.opacity = '1';
  t.textContent = message;
  clearTimeout(/** @type {any} */ (t)._to);
  t._to = setTimeout(() => {
    t.style.opacity = '0';
  }, 4000);
}

function announceAria(text) {
  const el = document.getElementById('rt-aria-live');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = text;
  });
}

function roleShortLabel(r0) {
  const r = String(r0 || '').toUpperCase();
  const key = `ul_role_${r}`;
  const mapped = userT(key);
  if (mapped !== key) return mapped;
  return r || '—';
}

function technicianOptionLabel(u) {
  const base = `${esc(u.name || u.email)} — ${esc(u.email)}`;
  const rl = roleShortLabel(u.role);
  const inactive = u.isActive === false ? rtT('rt_inactive') : '';
  return `${base} (${rl})${inactive}`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function tenantQs() {
  if (!activeTenantId) return '';
  return `?tenantId=${encodeURIComponent(activeTenantId)}`;
}

/** Querystring para GET de assignments (tenant + filtros servidor). */
function assignmentApiQuery() {
  const p = new URLSearchParams();
  if (activeTenantId) p.set('tenantId', activeTenantId);
  const ft = document.getElementById('rt-assign-filter-template')?.value?.trim() || '';
  const fu = document.getElementById('rt-assign-filter-user')?.value?.trim() || '';
  if (ft) p.set('templateId', ft);
  if (fu) p.set('userId', fu);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function canQuery() {
  if (role === 'SAAS_ADMIN') return !!activeTenantId;
  return true;
}

function resolveInitialTenant() {
  try {
    const raw = sessionStorage.getItem('brspark_panel_tenant');
    const panelMode = sessionStorage.getItem('brspark_panel_mode');
    if (raw && panelMode === 'tenant') {
      const t = JSON.parse(raw);
      return t.id || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readUrlState() {
  try {
    const u = new URL(window.location.href);
    const templateId = u.searchParams.get('templateId')?.trim() || '';
    const userId = u.searchParams.get('userId')?.trim() || '';
    const q = u.searchParams.get('q')?.trim() || '';
    const page = Math.max(1, parseInt(String(u.searchParams.get('page') || '1'), 10) || 1);
    let pageSize = parseInt(String(u.searchParams.get('pageSize') || '25'), 10) || 25;
    if (![10, 25, 50, 100].includes(pageSize)) pageSize = 25;
    return { templateId, userId, q, page, pageSize };
  } catch {
    return { templateId: '', userId: '', q: '', page: 1, pageSize: 25 };
  }
}

function writeUrlState() {
  try {
    const u = new URL(window.location.href);
    const ft = document.getElementById('rt-assign-filter-template')?.value?.trim() || '';
    const fu = document.getElementById('rt-assign-filter-user')?.value?.trim() || '';
    const q = document.getElementById('rt-table-search')?.value?.trim() || '';
    if (ft) u.searchParams.set('templateId', ft);
    else u.searchParams.delete('templateId');
    if (fu) u.searchParams.set('userId', fu);
    else u.searchParams.delete('userId');
    if (q) u.searchParams.set('q', q);
    else u.searchParams.delete('q');
    if (assignmentsPage > 1) u.searchParams.set('page', String(assignmentsPage));
    else u.searchParams.delete('page');
    if (assignmentsPageSize !== 25) u.searchParams.set('pageSize', String(assignmentsPageSize));
    else u.searchParams.delete('pageSize');
    history.replaceState({}, '', u.toString());
  } catch {
    /* ignore */
  }
}

function setSelectValueIfExists(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel || !value) return false;
  const ok = [...sel.options].some((o) => o.value === value);
  if (ok) {
    sel.value = value;
    return true;
  }
  return false;
}

function renderTenantSelectForSaas() {
  const sel = document.getElementById('rt-tenant-select');
  if (!sel || !cachedPanelTenants.length) return;
  const q = tenantFilterText.trim().toLowerCase();
  const list = q
    ? cachedPanelTenants.filter((t) => {
        const blob = `${t.name || ''} ${t.email || ''}`.toLowerCase();
        return blob.includes(q);
      })
    : cachedPanelTenants;

  if (!activeTenantId) {
    sel.innerHTML = `<option value="">${esc(rtT('rt_tenant_pick'))}</option>`;
    list.forEach((t) => {
      sel.innerHTML += `<option value="${esc(t.id)}">${esc(t.name)} — ${esc(t.email)}</option>`;
    });
  } else {
    sel.innerHTML = '';
    list.forEach((t) => {
      const selAttr = t.id === activeTenantId ? ' selected' : '';
      sel.innerHTML += `<option value="${esc(t.id)}"${selAttr}>${esc(t.name)} — ${esc(t.email)}</option>`;
    });
    if (![...sel.options].some((o) => o.value === activeTenantId)) {
      const full = cachedPanelTenants.find((t) => t.id === activeTenantId);
      if (full) {
        sel.innerHTML += `<option value="${esc(full.id)}" selected>${esc(full.name)} — ${esc(full.email)}</option>`;
      }
    }
  }

  if (!sel._rtOnChange) {
    sel._rtOnChange = true;
    sel.onchange = () => {
      activeTenantId = sel.value || null;
      if (activeTenantId) void refreshAll(readUrlState());
    };
  }
}

async function ensureTenantForApi() {
  const bar = document.getElementById('rt-tenant-bar');
  const saasBox = document.getElementById('rt-saas-tenant');
  const filterWrap = document.getElementById('rt-tenant-filter-wrap');

  if (role === 'SAAS_ADMIN' && !activeTenantId) {
    if (bar) bar.style.display = 'flex';
    if (saasBox) saasBox.style.display = 'block';
    if (!cachedPanelTenants.length) {
      const res = await CONFIG.get('/tenants?limit=500');
      cachedPanelTenants = Array.isArray(res?.data) ? res.data : [];
    }
    if (filterWrap) filterWrap.style.display = cachedPanelTenants.length > 12 ? 'block' : 'none';
    renderTenantSelectForSaas();
    return false;
  }

  if (bar) bar.style.display = 'none';

  if (role === 'SAAS_ADMIN' && activeTenantId) {
    if (saasBox) saasBox.style.display = 'block';
    if (!cachedPanelTenants.length) {
      const res = await CONFIG.get('/tenants?limit=500');
      cachedPanelTenants = Array.isArray(res?.data) ? res.data : [];
    }
    if (filterWrap) filterWrap.style.display = cachedPanelTenants.length > 12 ? 'block' : 'none';
    renderTenantSelectForSaas();
  } else if (saasBox) {
    saasBox.style.display = 'none';
  }

  if (bar && role !== 'SAAS_ADMIN') bar.style.display = 'none';
  return true;
}

function fillTemplateSelects() {
  const pickFirst = `<option value="">${esc(rtT('rt_option_pick_template'))}</option>`;
  const allFirst = `<option value="">${esc(rtT('rt_all_templates'))}</option>`;
  const body = cachedTemplates.map((t) => `<option value="${esc(t.id)}">${esc(t.title || t.id)}</option>`).join('');
  const bulk = document.getElementById('rt-bulk-template');
  if (bulk) bulk.innerHTML = pickFirst + body;
  const af = document.getElementById('rt-assign-filter-template');
  if (af) af.innerHTML = allFirst + body;
  if (bulk && !bulk.value && cachedTemplates.length === 1) bulk.value = cachedTemplates[0].id;
}

function fillAssignUserFilter() {
  const fu = document.getElementById('rt-assign-filter-user');
  if (!fu) return;
  const prev = fu.value;
  fu.innerHTML =
    `<option value="">${esc(rtT('rt_all_providers'))}</option>` +
    cachedTechnicians.map((u) => `<option value="${esc(u.id)}">${technicianOptionLabel(u)}</option>`).join('');
  if (prev && [...fu.options].some((o) => o.value === prev)) fu.value = prev;
}

function fillBulkUsersMulti() {
  const sel = document.getElementById('rt-bulk-users');
  if (!sel) return;
  const selected = new Set([...sel.selectedOptions].map((o) => o.value));
  const q = (document.getElementById('rt-bulk-user-filter')?.value || '').trim().toLowerCase();
  const list = q
    ? cachedTechnicians.filter((u) => {
        const blob = `${u.name || ''} ${u.email || ''} ${u.role || ''}`.toLowerCase();
        return blob.includes(q);
      })
    : cachedTechnicians;
  sel.innerHTML = list.map((u) => `<option value="${esc(u.id)}">${technicianOptionLabel(u)}</option>`).join('');
  for (const opt of sel.options) {
    if (selected.has(opt.value)) opt.selected = true;
  }
}

function fillTechnicianSelects() {
  fillAssignUserFilter();
  fillBulkUsersMulti();
}

async function loadTemplatesAndTechnicians(urlHints) {
  if (!canQuery()) return;
  const [tRes, uRes] = await Promise.all([
    CONFIG.get(`/admin/routine-tasks/templates${tenantQs()}`),
    CONFIG.get(`/admin/routine-tasks/technicians${tenantQs()}`),
  ]);
  cachedTemplates = Array.isArray(tRes?.templates) ? tRes.templates : [];
  cachedTechnicians = Array.isArray(uRes?.technicians) ? uRes.technicians : [];
  fillTemplateSelects();
  fillTechnicianSelects();
  if (urlHints?.templateId) setSelectValueIfExists('rt-assign-filter-template', urlHints.templateId);
  if (urlHints?.userId) setSelectValueIfExists('rt-assign-filter-user', urlHints.userId);
}

function passesTextFilter(row, needle) {
  if (!needle) return true;
  const u = row.user || {};
  const tpl = row.template || {};
  const ml = row.menuLabel != null ? String(row.menuLabel) : '';
  const blob = [u.name, u.email, tpl.title, ml, row.templateId, row.userId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blob.includes(needle);
}

function getTableSearchNeedle() {
  return (document.getElementById('rt-table-search')?.value || '').trim().toLowerCase();
}

function getFilteredAssignments() {
  const needle = getTableSearchNeedle();
  return cachedAssignmentsRaw.filter((row) => passesTextFilter(row, needle));
}

function escapeCsvCell(val) {
  const s = val == null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportAssignmentsCsv() {
  const rows = getFilteredAssignments();
  if (!rows.length) {
    showRtToast(rtT('rt_export_empty'), false);
    return;
  }
  const header = [
    rtT('rt_csv_provider'),
    rtT('rt_csv_email'),
    rtT('rt_csv_model'),
    rtT('rt_csv_menu'),
    rtT('rt_csv_order'),
    rtT('rt_csv_prefetch'),
    rtT('rt_csv_template_id'),
    rtT('rt_csv_user_id'),
  ];
  const lines = [header.map(escapeCsvCell).join(',')];
  for (const r of rows) {
    const u = r.user || {};
    const tpl = r.template || {};
    const ml = r.menuLabel != null ? String(r.menuLabel) : '';
    const so = Number(r.sortOrder) || 0;
    const slots = Math.min(20, Math.max(1, Math.floor(Number(r.mobilePrefetchSlots)) || 1));
    lines.push(
      [u.name || '', u.email || '', tpl.title || r.templateId || '', ml, so, slots, r.templateId || '', r.userId || '']
        .map(escapeCsvCell)
        .join(',')
    );
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rt_assignments_${activeTenantId ? String(activeTenantId).slice(0, 8) : 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  announceAria(rtT('rt_export_csv'));
}

function selectAllFilteredBulkUsers() {
  const sel = document.getElementById('rt-bulk-users');
  if (!sel) return;
  for (const opt of sel.options) opt.selected = true;
}

function bindRowActions(tbody) {
  tbody.querySelectorAll('.rt-asg-save').forEach((btn) => {
    btn.onclick = async () => {
      const tr = btn.closest('tr');
      const id = tr?.getAttribute('data-asg-id');
      if (!id) return;
      const prevLabel = btn.textContent;
      btn.setAttribute('disabled', 'disabled');
      btn.textContent = rtT('rt_saving');
      try {
        const menuLabel = tr.querySelector('.rt-asg-menu')?.value ?? '';
        const sortOrder = parseInt(String(tr.querySelector('.rt-asg-order')?.value || '0'), 10);
        const slotsRaw = String(tr.querySelector('.rt-asg-slots')?.value ?? '1').trim();
        let mobilePrefetchSlots = parseInt(slotsRaw, 10);
        if (!Number.isFinite(mobilePrefetchSlots)) mobilePrefetchSlots = 1;
        mobilePrefetchSlots = Math.min(20, Math.max(1, mobilePrefetchSlots));
        const body = {
          menuLabel,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          mobilePrefetchSlots,
        };
        if (activeTenantId) body.tenantId = activeTenantId;
        const out = await CONFIG.patch(`/admin/routine-tasks/assignments/${encodeURIComponent(id)}${tenantQs()}`, body);
        if (out == null) return;
        if (out?.error) {
          showRtToast(String(out.error), false);
          return;
        }
        showRtToast(rtT('rt_assoc_updated'), true);
        announceAria(rtT('rt_assoc_updated'));
        void loadAssignments();
      } catch (e) {
        console.error('[rt-asg-save]', e);
        showRtToast(e instanceof Error ? e.message : rtT('rt_save_failed'), false);
      } finally {
        btn.removeAttribute('disabled');
        btn.textContent = prevLabel;
      }
    };
  });
  tbody.querySelectorAll('.rt-asg-del').forEach((btn) => {
    btn.onclick = async () => {
      const tr = btn.closest('tr');
      const id = tr?.getAttribute('data-asg-id');
      if (!id) return;
      if (!confirm(rtT('rt_del_confirm'))) return;
      const out = await CONFIG.del(`/admin/routine-tasks/assignments/${encodeURIComponent(id)}${tenantQs()}`);
      if (out?.error) {
        showRtToast(String(out.error), false);
        return;
      }
      showRtToast(rtT('rt_delete_ok'), true);
      announceAria(rtT('rt_delete_ok'));
      void loadAssignments();
    };
  });
}

function renderAssignmentsTable() {
  const tbody = document.getElementById('rt-assign-tbody');
  const pag = document.getElementById('rt-pagination');
  const pageInfo = document.getElementById('rt-page-info');
  if (!tbody) return;

  const all = getFilteredAssignments();
  const pages = Math.max(1, Math.ceil(all.length / assignmentsPageSize));
  if (assignmentsPage > pages) assignmentsPage = pages;
  const slice = all.slice((assignmentsPage - 1) * assignmentsPageSize, assignmentsPage * assignmentsPageSize);

  if (!slice.length) {
    const cta = `<button type="button" class="btn btn-sm btn-outline" id="rt-empty-cta">${esc(rtT('rt_empty_cta'))}</button>`;
    tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--text3)">${esc(rtT('rt_none_filtered'))}<br/><br/>${cta}</td></tr>`;
    document.getElementById('rt-empty-cta')?.addEventListener('click', () => {
      document.getElementById('rt-bulk-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (pag) pag.style.display = 'none';
    if (pageInfo) pageInfo.textContent = '';
    return;
  }

  if (pag) pag.style.display = 'flex';
  if (pageInfo) {
    pageInfo.textContent = rtT('rt_page_of', {
      page: assignmentsPage,
      pages,
      count: all.length,
    });
  }

  tbody.innerHTML = slice
    .map((r) => {
      const u = r.user || {};
      const tpl = r.template || {};
      const ml = r.menuLabel != null ? String(r.menuLabel) : '';
      const so = Number(r.sortOrder) || 0;
      const slots = Math.min(20, Math.max(1, Math.floor(Number(r.mobilePrefetchSlots)) || 1));
      const tplInactive =
        tpl.isActive === false ? ` <span class="rt-muted">${esc(rtT('rt_template_inactive'))}</span>` : '';
      return `<tr data-asg-id="${esc(r.id)}">
        <td>${esc(u.name || '—')}</td>
        <td>${esc(u.email || '')}</td>
        <td>${esc(tpl.title || r.templateId)}${tplInactive}</td>
        <td><input type="text" class="form-control rt-asg-menu" maxlength="120" value="${esc(ml)}" style="padding:6px 8px;font-size:12px" /></td>
        <td style="max-width:90px"><input type="number" class="form-control rt-asg-order" value="${esc(so)}" style="padding:6px 8px;font-size:12px" /></td>
        <td style="max-width:110px"><input type="number" class="form-control rt-asg-slots" min="1" max="20" step="1" value="${esc(
          slots
        )}" title="${esc(rtT('rt_prefetch_title'))}" style="padding:6px 8px;font-size:12px" /></td>
        <td class="text-right" style="white-space:nowrap">
          <button type="button" class="btn btn-sm btn-primary rt-asg-save">${esc(rtT('rt_save'))}</button>
          <button type="button" class="btn btn-sm btn-secondary rt-asg-del">${esc(rtT('rt_delete'))}</button>
        </td>
      </tr>`;
    })
    .join('');

  bindRowActions(tbody);
}

async function loadAssignments() {
  const tbody = document.getElementById('rt-assign-tbody');
  if (!tbody || !canQuery()) return;
  tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--text3)">${esc(rtT('rt_loading'))}</td></tr>`;
  const res = await CONFIG.get(`/admin/routine-tasks/assignments${assignmentApiQuery()}`);
  if (res?.error) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--red,#b91c1c)">${esc(res.error)}</td></tr>`;
    return;
  }
  cachedAssignmentsRaw = Array.isArray(res?.assignments) ? res.assignments : [];
  renderAssignmentsTable();
}

async function refreshAll(urlHints) {
  const ok = await ensureTenantForApi();
  if (!ok) return;
  await loadTemplatesAndTechnicians(urlHints);
  await loadAssignments();
}

export async function bootRoutineTasksPage() {
  applyRoutineTasksStaticI18n();
  await initPage();
  activeTenantId = resolveInitialTenant();

  const initialUrl = readUrlState();
  assignmentsPage = initialUrl.page;
  assignmentsPageSize = initialUrl.pageSize;
  const psEl = document.getElementById('rt-page-size');
  if (psEl) psEl.value = String(assignmentsPageSize);
  const tsInput = document.getElementById('rt-table-search');
  if (tsInput) tsInput.value = initialUrl.q;

  let searchTimer = 0;
  document.getElementById('rt-table-search')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      assignmentsPage = 1;
      writeUrlState();
      renderAssignmentsTable();
    }, 220);
  });

  document.getElementById('rt-assign-filter-template')?.addEventListener('change', () => {
    assignmentsPage = 1;
    writeUrlState();
    void loadAssignments();
  });
  document.getElementById('rt-assign-filter-user')?.addEventListener('change', () => {
    assignmentsPage = 1;
    writeUrlState();
    void loadAssignments();
  });
  document.getElementById('rt-assign-reload')?.addEventListener('click', () => void loadAssignments());

  document.getElementById('rt-page-size')?.addEventListener('change', (e) => {
    const v = parseInt(/** @type {HTMLSelectElement} */ (e.target).value, 10);
    assignmentsPageSize = [10, 25, 50, 100].includes(v) ? v : 25;
    assignmentsPage = 1;
    writeUrlState();
    renderAssignmentsTable();
  });

  document.getElementById('rt-page-prev')?.addEventListener('click', () => {
    if (assignmentsPage <= 1) return;
    assignmentsPage -= 1;
    writeUrlState();
    renderAssignmentsTable();
  });
  document.getElementById('rt-page-next')?.addEventListener('click', () => {
    const all = getFilteredAssignments();
    const pages = Math.max(1, Math.ceil(all.length / assignmentsPageSize));
    if (assignmentsPage >= pages) return;
    assignmentsPage += 1;
    writeUrlState();
    renderAssignmentsTable();
  });

  document.getElementById('rt-bulk-user-filter')?.addEventListener('input', () => fillBulkUsersMulti());
  document.getElementById('rt-bulk-select-filtered')?.addEventListener('click', () => selectAllFilteredBulkUsers());
  document.getElementById('rt-export-csv')?.addEventListener('click', () => exportAssignmentsCsv());

  document.getElementById('rt-tenant-filter')?.addEventListener('input', () => {
    tenantFilterText = document.getElementById('rt-tenant-filter')?.value || '';
    renderTenantSelectForSaas();
  });

  document.getElementById('rt-bulk-apply')?.addEventListener('click', async () => {
    const msg = document.getElementById('rt-bulk-msg');
    if (!canQuery()) {
      showRtToast(rtT('rt_pick_org'), false);
      return;
    }
    const templateId = document.getElementById('rt-bulk-template')?.value?.trim() || '';
    const sel = document.getElementById('rt-bulk-users');
    const userIds = sel ? [...sel.selectedOptions].map((o) => o.value).filter(Boolean) : [];
    const menuLabel = document.getElementById('rt-bulk-menu')?.value ?? '';
    if (!templateId) {
      showRtToast(rtT('rt_err_pick_template'), false);
      return;
    }
    if (!userIds.length) {
      showRtToast(rtT('rt_pick_users'), false);
      return;
    }
    if (msg) msg.textContent = rtT('rt_sending');
    const body = { templateId, userIds, menuLabel };
    if (activeTenantId) body.tenantId = activeTenantId;
    const out = await CONFIG.post(`/admin/routine-tasks/assignments/bulk`, body);
    if (out?.error) {
      if (msg) msg.textContent = '';
      showRtToast(String(out.error), false);
      return;
    }
    const parts = [];
    if (Array.isArray(out.created)) parts.push(rtT('rt_bulk_new', { n: out.created.length }));
    if (Array.isArray(out.updated)) parts.push(rtT('rt_bulk_updated', { n: out.updated.length }));
    if (Array.isArray(out.skipped) && out.skipped.length) parts.push(rtT('rt_bulk_skipped', { n: out.skipped.length }));
    if (msg) {
      msg.textContent = parts.length ? parts.join(' · ') : rtT('rt_bulk_done');
      const skipReasons = Array.isArray(out.skipped)
        ? out.skipped.map((s) => (s && s.reason ? String(s.reason) : '')).filter(Boolean)
        : [];
      if (skipReasons.length) {
        msg.title = skipReasons.join('\n');
        const short = skipReasons[0].length > 160 ? `${skipReasons[0].slice(0, 157)}…` : skipReasons[0];
        msg.textContent += ` — ${short}`;
        if (skipReasons.length > 1) {
          msg.textContent += rtT('rt_bulk_more_reasons', { n: skipReasons.length - 1 });
        }
      } else {
        msg.title = '';
      }
    }
    announceAria(parts.join(' '));
    void loadAssignments();
  });

  const ok = await ensureTenantForApi();
  if (ok) {
    await refreshAll(initialUrl);
    writeUrlState();
  }
}
