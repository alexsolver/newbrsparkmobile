/**
 * Painel — RT (tarefas de rotina): associações modelo ↔ utilizadores (exceto cliente).
 */
import { initPage, getStoredPanelRole } from './sidebar.js';
import { CONFIG } from './config.js';

const role = getStoredPanelRole();
let activeTenantId = null;
/** @type {{ id: string, title?: string, tenantId?: string|null }[]} */
let cachedTemplates = [];
/** @type {{ id: string, name?: string, email?: string, role?: string, isActive?: boolean }[]} */
let cachedTechnicians = [];

function roleShortLabel(role) {
  const r = String(role || '').toUpperCase();
  if (r === 'PROVIDER') return 'Prestador';
  if (r === 'MANAGER') return 'Gestor';
  if (r === 'TENANT_ADMIN') return 'Admin';
  if (r === 'USER') return 'Cliente';
  if (r === 'SAAS_ADMIN') return 'SaaS';
  return r || '—';
}

function technicianOptionLabel(u) {
  const base = `${esc(u.name || u.email)} — ${esc(u.email)}`;
  const rl = roleShortLabel(u.role);
  const inactive = u.isActive === false ? ' [inativo]' : '';
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

/** SaaS precisa de tenant explícito; demais perfis usam o tenant do JWT na API. */
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

async function ensureTenantForApi() {
  const bar = document.getElementById('rt-tenant-bar');
  const saasBox = document.getElementById('rt-saas-tenant');
  if (role === 'SAAS_ADMIN' && !activeTenantId) {
    if (bar) bar.style.display = 'flex';
    if (saasBox) saasBox.style.display = 'block';
    const res = await CONFIG.get('/tenants?limit=500');
    const sel = document.getElementById('rt-tenant-select');
    if (sel) {
      sel.innerHTML = '<option value="">Selecione o tenant…</option>';
      (res?.data || []).forEach((t) => {
        sel.innerHTML += `<option value="${esc(t.id)}">${esc(t.name)} — ${esc(t.email)}</option>`;
      });
      sel.onchange = () => {
        activeTenantId = sel.value || null;
        if (activeTenantId) void refreshAll();
      };
    }
    return false;
  }
  if (bar) bar.style.display = 'none';
  if (role === 'SAAS_ADMIN' && activeTenantId) {
    if (saasBox) saasBox.style.display = 'block';
    const res = await CONFIG.get('/tenants?limit=500');
    const sel = document.getElementById('rt-tenant-select');
    if (sel) {
      sel.innerHTML = '';
      (res?.data || []).forEach((t) => {
        sel.innerHTML += `<option value="${esc(t.id)}" ${t.id === activeTenantId ? 'selected' : ''}>${esc(t.name)} — ${esc(
          t.email
        )}</option>`;
      });
      sel.onchange = () => {
        activeTenantId = sel.value || null;
        if (activeTenantId) void refreshAll();
      };
    }
  } else if (saasBox) {
    saasBox.style.display = 'none';
  }
  if (bar && role !== 'SAAS_ADMIN') bar.style.display = 'none';
  return true;
}

function fillTemplateSelects() {
  const pickFirst = '<option value="">— Escolha o modelo —</option>';
  const allFirst = '<option value="">(todos)</option>';
  const body = cachedTemplates.map((t) => `<option value="${esc(t.id)}">${esc(t.title || t.id)}</option>`).join('');
  const bulk = document.getElementById('rt-bulk-template');
  if (bulk) bulk.innerHTML = pickFirst + body;
  const af = document.getElementById('rt-assign-filter-template');
  if (af) af.innerHTML = allFirst + body;
  if (bulk && !bulk.value && cachedTemplates.length === 1) bulk.value = cachedTemplates[0].id;
}

function fillTechnicianSelects() {
  const optsUsers =
    '<option value="">(todos)</option>' +
    cachedTechnicians.map((u) => `<option value="${esc(u.id)}">${technicianOptionLabel(u)}</option>`).join('');
  const fu = document.getElementById('rt-assign-filter-user');
  if (fu) fu.innerHTML = optsUsers;

  const bulk = document.getElementById('rt-bulk-users');
  if (bulk) {
    bulk.innerHTML = cachedTechnicians.map((u) => `<option value="${esc(u.id)}">${technicianOptionLabel(u)}</option>`).join('');
  }
}

async function loadTemplatesAndTechnicians() {
  if (!canQuery()) return;
  const [tRes, uRes] = await Promise.all([
    CONFIG.get(`/admin/routine-tasks/templates${tenantQs()}`),
    CONFIG.get(`/admin/routine-tasks/technicians${tenantQs()}`),
  ]);
  cachedTemplates = Array.isArray(tRes?.templates) ? tRes.templates : [];
  cachedTechnicians = Array.isArray(uRes?.technicians) ? uRes.technicians : [];
  fillTemplateSelects();
  fillTechnicianSelects();
}

function passesAssignmentFilters(row) {
  const ft = document.getElementById('rt-assign-filter-template')?.value || '';
  const fu = document.getElementById('rt-assign-filter-user')?.value || '';
  if (ft && String(row.templateId) !== ft) return false;
  if (fu && String(row.userId) !== fu) return false;
  return true;
}

async function loadAssignments() {
  const tbody = document.getElementById('rt-assign-tbody');
  if (!tbody || !canQuery()) return;
  tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:var(--text3)">A carregar…</td></tr>';
  const res = await CONFIG.get(`/admin/routine-tasks/assignments${tenantQs()}`);
  if (res?.error) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--red,#b91c1c)">${esc(res.error)}</td></tr>`;
    return;
  }
  const rows = Array.isArray(res?.assignments) ? res.assignments.filter(passesAssignmentFilters) : [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:var(--text3)">Sem associações com estes filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((r) => {
      const u = r.user || {};
      const tpl = r.template || {};
      const ml = r.menuLabel != null ? String(r.menuLabel) : '';
      const so = Number(r.sortOrder) || 0;
      const slots = Math.min(20, Math.max(1, Math.floor(Number(r.mobilePrefetchSlots)) || 1));
      return `<tr data-asg-id="${esc(r.id)}">
        <td>${esc(u.name || '—')}</td>
        <td>${esc(u.email || '')}</td>
        <td>${esc(tpl.title || r.templateId)}${tpl.isActive === false ? ' <span class="rt-muted">(inativo)</span>' : ''}</td>
        <td><input type="text" class="form-control rt-asg-menu" maxlength="120" value="${esc(ml)}" style="padding:6px 8px;font-size:12px" /></td>
        <td style="max-width:90px"><input type="number" class="form-control rt-asg-order" value="${esc(so)}" style="padding:6px 8px;font-size:12px" /></td>
        <td style="max-width:110px"><input type="number" class="form-control rt-asg-slots" min="1" max="20" step="1" value="${esc(
          slots
        )}" title="Execuções RT ativas no servidor (pré-carga no app)" style="padding:6px 8px;font-size:12px" /></td>
        <td style="white-space:nowrap">
          <button type="button" class="btn btn-sm btn-primary rt-asg-save">Guardar</button>
          <button type="button" class="btn btn-sm btn-secondary rt-asg-del">Remover</button>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('.rt-asg-save').forEach((btn) => {
    btn.onclick = async () => {
      const tr = btn.closest('tr');
      const id = tr?.getAttribute('data-asg-id');
      if (!id) return;
      const prevLabel = btn.textContent;
      btn.setAttribute('disabled', 'disabled');
      btn.textContent = '…';
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
          alert(out.error);
          return;
        }
        alert('Associação atualizada.');
        void loadAssignments();
      } catch (e) {
        console.error('[rt-asg-save]', e);
        alert(e instanceof Error ? e.message : 'Falha ao guardar. Veja a consola do browser.');
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
      if (!id || !confirm('Remover esta associação RT?')) return;
      const out = await CONFIG.del(`/admin/routine-tasks/assignments/${encodeURIComponent(id)}${tenantQs()}`);
      if (out?.error) {
        alert(out.error);
        return;
      }
      void loadAssignments();
    };
  });
}

async function refreshAll() {
  const ok = await ensureTenantForApi();
  if (!ok) return;
  await loadTemplatesAndTechnicians();
  await loadAssignments();
}

export async function bootRoutineTasksPage() {
  await initPage();
  activeTenantId = resolveInitialTenant();

  document.getElementById('rt-assign-filter-template')?.addEventListener('change', () => void loadAssignments());
  document.getElementById('rt-assign-filter-user')?.addEventListener('change', () => void loadAssignments());
  document.getElementById('rt-assign-reload')?.addEventListener('click', () => void loadAssignments());

  document.getElementById('rt-bulk-apply')?.addEventListener('click', async () => {
    const msg = document.getElementById('rt-bulk-msg');
    if (!canQuery()) {
      alert('Selecione o tenant.');
      return;
    }
    const templateId = document.getElementById('rt-bulk-template')?.value?.trim() || '';
    const sel = document.getElementById('rt-bulk-users');
    const userIds = sel ? [...sel.selectedOptions].map((o) => o.value).filter(Boolean) : [];
    const menuLabel = document.getElementById('rt-bulk-menu')?.value ?? '';
    if (!templateId) {
      alert('Escolha o modelo de formulário.');
      return;
    }
    if (!userIds.length) {
      alert('Selecione pelo menos um utilizador.');
      return;
    }
    if (msg) msg.textContent = 'A enviar…';
    const body = { templateId, userIds, menuLabel };
    if (activeTenantId) body.tenantId = activeTenantId;
    const out = await CONFIG.post(`/admin/routine-tasks/assignments/bulk`, body);
    if (out?.error) {
      if (msg) msg.textContent = '';
      alert(out.error);
      return;
    }
    const parts = [];
    if (Array.isArray(out.created)) parts.push(`${out.created.length} nova(s)`);
    if (Array.isArray(out.updated)) parts.push(`${out.updated.length} já existente(s) atualizada(s)`);
    if (Array.isArray(out.skipped) && out.skipped.length) parts.push(`${out.skipped.length} ignorada(s)`);
    if (msg) {
      msg.textContent = parts.length ? parts.join(' · ') : 'Concluído.';
      const skipReasons = Array.isArray(out.skipped)
        ? out.skipped.map((s) => (s && s.reason ? String(s.reason) : '')).filter(Boolean)
        : [];
      if (skipReasons.length) {
        msg.title = skipReasons.join('\n');
        const short = skipReasons[0].length > 160 ? `${skipReasons[0].slice(0, 157)}…` : skipReasons[0];
        msg.textContent += ` — ${short}`;
        if (skipReasons.length > 1) {
          msg.textContent += ` (+${skipReasons.length - 1} motivo(s); passe o rato para ver tudo)`;
        }
      } else {
        msg.title = '';
      }
    }
    void loadAssignments();
  });

  const ok = await ensureTenantForApi();
  if (ok) await refreshAll();
}
