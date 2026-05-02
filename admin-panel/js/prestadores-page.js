/**
 * Hub único: vínculos provider-first e convites de parceria.
 */
import { initPage } from './sidebar.js';
import { CONFIG, getEffectivePanelCapabilities } from './config.js';
import { getAdminUiLocale, t, applyPrestadoresPageI18n } from './user-pages-i18n.js';

/** Substitui `{chave}` nos textos do painel (mapa M). */
function tr(key, vars = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Clic no texto dentro do `<button>` → `target` pode ser nó de texto (sem `closest`). */
function prDomElementFromTarget(clickTarget) {
  if (!clickTarget) return null;
  return clickTarget.nodeType === 1 ? clickTarget : clickTarget.parentElement || null;
}

let partnershipCandidateEmails = new Set();
let directorySearchTimer = null;
let directorySearchSeq = 0;

function clearPlatformDirectoryUi() {
  const inp = document.getElementById('pr-platform-search');
  const statusEl = document.getElementById('pr-platform-search-status');
  const resultsEl = document.getElementById('pr-platform-search-results');
  const clearBtn = document.getElementById('pr-platform-search-clear');
  if (inp) inp.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (statusEl) statusEl.textContent = t('pr_platform_search_idle');
  if (resultsEl) resultsEl.innerHTML = '';
  const sk = document.getElementById('pr-search-skill');
  if (sk) sk.value = '';
  const ts = document.getElementById('pr-search-tech-status');
  if (ts) ts.value = '';
  const sch = document.getElementById('pr-search-schedule');
  if (sch) sch.value = '';
  const cov = document.getElementById('pr-search-coverage');
  if (cov) cov.value = '';
  const ms = document.getElementById('pr-search-min-score');
  if (ms) ms.value = '';
  const loc = document.getElementById('pr-search-location');
  if (loc) loc.value = '';
}

function buildDirectorySearchParams() {
  const params = new URLSearchParams();
  const q = String(document.getElementById('pr-platform-search')?.value || '').trim();
  if (q) params.set('q', q.slice(0, 200));
  const skill = String(document.getElementById('pr-search-skill')?.value || '').trim();
  if (skill) params.set('skill', skill.slice(0, 120));
  const loc = String(document.getElementById('pr-search-location')?.value || '').trim();
  if (loc) params.set('locationId', loc);
  if (String(document.getElementById('pr-search-schedule')?.value || '').trim() === '1') {
    params.set('hasSchedule', '1');
  }
  if (String(document.getElementById('pr-search-coverage')?.value || '').trim() === '1') {
    params.set('hasCoverage', '1');
  }
  const tst = String(document.getElementById('pr-search-tech-status')?.value || '').trim();
  if (tst) params.set('techStatus', tst.slice(0, 32));
  const minRaw = String(document.getElementById('pr-search-min-score')?.value || '').trim();
  if (minRaw !== '' && Number.isFinite(Number(minRaw))) {
    params.set('minScore', minRaw.slice(0, 12));
  }
  params.set('pageSize', '40');
  params.set('page', '1');
  const tid = inviteTenantId();
  if (tid) params.set('tenantId', tid);
  return params;
}

/** Critérios para busca explícita (botão): texto ≥2 ou qualquer filtro avançado. */
function directorySearchHasCriteriaForButton() {
  const q = String(document.getElementById('pr-platform-search')?.value || '').trim();
  const skill = String(document.getElementById('pr-search-skill')?.value || '').trim();
  const loc = String(document.getElementById('pr-search-location')?.value || '').trim();
  const sch = String(document.getElementById('pr-search-schedule')?.value || '').trim();
  const cov = String(document.getElementById('pr-search-coverage')?.value || '').trim();
  const tst = String(document.getElementById('pr-search-tech-status')?.value || '').trim();
  const minRaw = String(document.getElementById('pr-search-min-score')?.value || '').trim();
  const hasMin = minRaw !== '' && Number.isFinite(Number(minRaw));
  return (
    q.length >= 2 ||
    !!skill ||
    !!loc ||
    sch === '1' ||
    cov === '1' ||
    !!tst ||
    hasMin
  );
}

/** Atalho ao digitar: só texto geral com ≥2 caracteres. */
function directorySearchHasCriteriaForAuto() {
  const q = String(document.getElementById('pr-platform-search')?.value || '').trim();
  return q.length >= 2;
}

async function loadPrSearchLocations() {
  const sel = document.getElementById('pr-search-location');
  const hint = document.getElementById('pr-search-location-hint');
  if (!sel) return;
  const tid = inviteTenantId() || panelTenantId();
  const prev = sel.value;
  sel.innerHTML = '';
  const o0 = document.createElement('option');
  o0.value = '';
  o0.textContent = t('pr_search_location_any');
  sel.appendChild(o0);
  if (!tid) {
    if (hint) {
      hint.style.display = '';
      hint.textContent = t('pr_search_location_need_tenant');
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
    if (prev && Array.from(sel.options).some((x) => x.value === prev)) sel.value = prev;
  } catch {
    /* ignore */
  }
}

function setPrestadoresTab(which) {
  const bonds = document.getElementById('pr-panel-bonds');
  const inv = document.getElementById('pr-panel-invite');
  const bbtn = document.getElementById('pr-tab-btn-bonds');
  const ibtn = document.getElementById('pr-tab-btn-invite');
  const isInvite = which === 'invite';
  if (bonds) bonds.hidden = isInvite;
  if (inv) inv.hidden = !isInvite;
  if (bbtn) {
    bbtn.classList.toggle('pr-tab--active', !isInvite);
    bbtn.setAttribute('aria-selected', !isInvite ? 'true' : 'false');
  }
  if (ibtn) {
    ibtn.classList.toggle('pr-tab--active', isInvite);
    ibtn.setAttribute('aria-selected', isInvite ? 'true' : 'false');
  }
  if (isInvite) void loadPrSearchLocations();
}

async function onPrBondsDelegatedClick(ev) {
  const el = prDomElementFromTarget(ev.target);
  const endBtn = el?.closest?.('button.pr-tp-end');
  if (endBtn) {
    ev.preventDefault();
    const affId = endBtn.getAttribute('data-aff');
    const mode = String(endBtn.getAttribute('data-pr-end-mode') || 'link');
    if (!affId) return;
    const msg = mode === 'invite' ? t('pr_confirm_end_invite') : t('pr_confirm_end_link');
    if (!confirm(msg)) return;
    endBtn.disabled = true;
    try {
      const res = await CONFIG.post(`/providers/affiliations/${encodeURIComponent(affId)}/end`, {});
      if (res?.error) {
        alert(res.error);
        return;
      }
      await loadBondsTable();
    } finally {
      endBtn.disabled = false;
    }
    return;
  }
  const susp = el?.closest?.('button.pr-tp-suspend');
  if (susp) {
    ev.preventDefault();
    const affId = susp.getAttribute('data-aff');
    if (!affId) return;
    if (!confirm(t('pr_confirm_suspend'))) return;
    susp.disabled = true;
    try {
      const res = await CONFIG.post(`/providers/affiliations/${encodeURIComponent(affId)}/suspend`, {});
      if (res?.error) {
        alert(res.error);
        return;
      }
      await loadBondsTable();
    } finally {
      susp.disabled = false;
    }
    return;
  }
  const resu = el?.closest?.('button.pr-tp-resume');
  if (resu) {
    ev.preventDefault();
    const affId = resu.getAttribute('data-aff');
    if (!affId) return;
    if (!confirm(t('pr_confirm_resume'))) return;
    resu.disabled = true;
    try {
      const res = await CONFIG.post(`/providers/affiliations/${encodeURIComponent(affId)}/resume`, {});
      if (res?.error) {
        alert(res.error);
        return;
      }
      await loadBondsTable();
    } finally {
      resu.disabled = false;
    }
    return;
  }
  const act = el?.closest?.('button.pr-tp-act');
  if (!act) return;
  ev.preventDefault();
  const affId = act.getAttribute('data-aff');
  if (!affId) return;
  if (!confirm(t('pr_confirm_activate'))) return;
  act.disabled = true;
  try {
    const res = await CONFIG.post(`/providers/affiliations/${encodeURIComponent(affId)}/activate`, {});
    if (res?.error) {
      alert(res.error);
      return;
    }
    await loadBondsTable();
  } finally {
    act.disabled = false;
  }
}

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

function tenantsAssociableForPanelUsers(list) {
  return (Array.isArray(list) ? list : []).filter(
    (x) => String(x.kind || 'COMPANY').toUpperCase() === 'COMPANY',
  );
}

await initPage();
applyPrestadoresPageI18n();

try {
  document.title = t('pr_pageTitle');
} catch {
  /* ignore */
}

const panelCaps = new Set(getEffectivePanelCapabilities());
const canManageTenantUsers =
  panelCaps.has('tenant.users.write.self') ||
  panelCaps.has('tenant.users.write.limited') ||
  panelCaps.has('tenant.users.write.any');
const secBonds = document.getElementById('pr-section-bonds');
const secInvite = document.getElementById('pr-section-invite');
const permBanner = document.getElementById('pr-perm-banner');

if (!canManageTenantUsers) {
  if (permBanner) {
    permBanner.style.display = '';
    permBanner.textContent = t('pr_perm_none');
  }
  if (secBonds) secBonds.hidden = true;
  if (secInvite) secInvite.hidden = true;
  document.getElementById('pr-tabs-wrap')?.setAttribute('hidden', '');
  document.getElementById('pr-panel-bonds')?.setAttribute('hidden', '');
  document.getElementById('pr-panel-invite')?.setAttribute('hidden', '');
} else {
  document.getElementById('pr-tabs-wrap')?.removeAttribute('hidden');
  setPrestadoresTab('bonds');
}

if (canManageTenantUsers) {
  const prBondsSection = document.getElementById('pr-section-bonds');
  if (prBondsSection && prBondsSection.dataset.prBondsActDeleg !== '1') {
    prBondsSection.dataset.prBondsActDeleg = '1';
    prBondsSection.addEventListener('click', (ev) => void onPrBondsDelegatedClick(ev));
  }
}

async function loadTenantSelects() {
  const wrapBonds = document.getElementById('pr-wrap-bonds-tenant');
  const selBonds = document.getElementById('pr-bonds-tenant');
  const wrapInv = document.getElementById('pr-wrap-invite-tenant');
  const selInv = document.getElementById('pr-invite-tenant');
  const tid = panelTenantId();
  if (tid) {
    if (wrapBonds) wrapBonds.style.display = 'none';
    if (wrapInv) wrapInv.style.display = 'none';
    return;
  }
  if (wrapBonds) wrapBonds.style.display = '';
  if (wrapInv) wrapInv.style.display = '';
  const res = await CONFIG.get('/tenants?limit=200');
  const list = res?.data || res || [];
  const rows = tenantsAssociableForPanelUsers(Array.isArray(list) ? list : []);
  const opts = rows
    .map((x) => `<option value="${escAttr(x.id)}">${escAttr(x.name || x.slug || x.id)}</option>`)
    .join('');
  if (selBonds) {
    selBonds.innerHTML = opts;
    selBonds.addEventListener('change', () => void loadBondsTable());
  }
  if (selInv) {
    selInv.innerHTML = opts;
    selInv.addEventListener('change', () => {
      void loadPartnershipCandidates();
      void loadPrSearchLocations();
    });
  }
}

function inviteTenantId() {
  const tid = panelTenantId();
  if (tid) return tid;
  return String(document.getElementById('pr-invite-tenant')?.value || '').trim() || null;
}

function bondsTenantId() {
  const tid = panelTenantId();
  if (tid) return tid;
  return String(document.getElementById('pr-bonds-tenant')?.value || '').trim() || null;
}

let partnershipCandidates = [];

async function loadPartnershipCandidates() {
  const listEl = document.getElementById('pr-candidates-list');
  const statusEl = document.getElementById('pr-candidates-status');
  const filterEl = document.getElementById('pr-candidates-filter');
  if (!listEl || !statusEl) return;
  clearPlatformDirectoryUi();
  if (filterEl) filterEl.value = '';
  partnershipCandidates = [];
  partnershipCandidateEmails = new Set();
  listEl.innerHTML = '';
  statusEl.textContent = t('pr_loading');
  const tid = inviteTenantId();
  if (!tid) {
    statusEl.textContent = t('pr_select_tenant_first');
    return;
  }
  try {
    const out = await CONFIG.get(`/users/partnership-candidates?tenantId=${encodeURIComponent(tid)}`);
    const rows = Array.isArray(out?.data) ? out.data : Array.isArray(out) ? out : [];
    partnershipCandidates = rows;
    partnershipCandidateEmails = new Set(
      rows.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean),
    );
    statusEl.textContent = tr('pr_candidates_count', { n: rows.length });
    renderPartnershipCandidatesList('');
  } catch (e) {
    console.error('[partnership-candidates]', e);
    statusEl.textContent = e?.message || String(e) || '—';
  }
}

function renderDirectorySearchResults(rows) {
  const resultsEl = document.getElementById('pr-platform-search-results');
  const statusEl = document.getElementById('pr-platform-search-status');
  if (!resultsEl) return;
  if (!rows.length) {
    resultsEl.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--text3)">${escAttr(t('pr_platform_search_empty'))}</div>`;
    if (statusEl) statusEl.textContent = tr('pr_platform_search_summary', { n: 0 });
    return;
  }
  if (statusEl) statusEl.textContent = tr('pr_platform_search_summary', { n: rows.length });
  resultsEl.innerHTML = rows
    .map((u) => {
      const em = escAttr(u.email || '');
      const nm = escAttr(u.name || '—');
      const spec = u.technician?.specialty ? escAttr(String(u.technician.specialty)) : '';
      const specSub = spec ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${spec}</div>` : '';
      const sc = u.technician?.score;
      const scoreSub =
        sc != null && sc !== ''
          ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escAttr(t('pr_result_score'))}: ${escAttr(String(sc))}</div>`
          : '';
      const low = String(u.email || '').trim().toLowerCase();
      const onPreloadedEligibleList = partnershipCandidateEmails.has(low);
      const badge = onPreloadedEligibleList
        ? `<span class="pr-platform-row-badge pr-platform-row-badge--ok">${escAttr(t('pr_badge_eligible'))}</span>`
        : '';
      return `<button type="button" class="pr-dir-pick-row" data-pr-email="${em}" style="display:block;width:100%;text-align:left;padding:10px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer;font-size:13px;color:var(--text)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
          <div style="min-width:0;flex:1"><div style="font-weight:800">${nm}</div><div style="font-size:12px;color:var(--text2);margin-top:2px">${em}</div>${specSub}${scoreSub}</div>
          <span style="font-size:11px;font-weight:700;color:var(--blue);flex-shrink:0;align-self:center">${escAttr(t('pr_platform_use_email'))}</span>
        </div>${badge}</button>`;
    })
    .join('');
}

async function runDirectorySearch(mode = 'button') {
  const inp = document.getElementById('pr-platform-search');
  const statusEl = document.getElementById('pr-platform-search-status');
  const clearBtn = document.getElementById('pr-platform-search-clear');
  const q = String(inp?.value || '').trim();
  if (clearBtn) clearBtn.style.display = q.length ? '' : 'none';
  const ok =
    mode === 'auto' ? directorySearchHasCriteriaForAuto() : directorySearchHasCriteriaForButton();
  if (!ok) {
    const resEl = document.getElementById('pr-platform-search-results');
    if (resEl) resEl.innerHTML = '';
    if (statusEl) {
      if (mode === 'auto' && q.length === 1) {
        statusEl.textContent = t('pr_platform_search_min');
      } else {
        statusEl.textContent = t('pr_platform_search_idle');
      }
    }
    return;
  }
  directorySearchSeq += 1;
  const mySeq = directorySearchSeq;
  if (statusEl) statusEl.textContent = t('pr_loading');
  try {
    const params = buildDirectorySearchParams();
    if (mode === 'auto') {
      const useFull = directorySearchHasCriteriaForButton();
      const paramsAuto = useFull
        ? buildDirectorySearchParams()
        : (() => {
            const qOnly = new URLSearchParams();
            qOnly.set('q', q.slice(0, 200));
            qOnly.set('pageSize', '40');
            qOnly.set('page', '1');
            const tid = inviteTenantId();
            if (tid) qOnly.set('tenantId', tid);
            return qOnly;
          })();
      const outAuto = await CONFIG.get(`/providers/panel/saas-provider-directory?${paramsAuto.toString()}`);
      if (mySeq !== directorySearchSeq) return;
      if (outAuto?.error) {
        if (statusEl) statusEl.textContent = String(outAuto.error);
        const resErr = document.getElementById('pr-platform-search-results');
        if (resErr) resErr.innerHTML = '';
        return;
      }
      const rowsAuto = Array.isArray(outAuto?.data) ? outAuto.data : [];
      renderDirectorySearchResults(rowsAuto);
      return;
    }
    const out = await CONFIG.get(`/providers/panel/saas-provider-directory?${params.toString()}`);
    if (mySeq !== directorySearchSeq) return;
    if (out?.error) {
      if (statusEl) statusEl.textContent = String(out.error);
      const resErr = document.getElementById('pr-platform-search-results');
      if (resErr) resErr.innerHTML = '';
      return;
    }
    const rows = Array.isArray(out?.data) ? out.data : [];
    renderDirectorySearchResults(rows);
  } catch (e) {
    if (mySeq !== directorySearchSeq) return;
    console.error('[saas-provider-directory]', e);
    if (statusEl) statusEl.textContent = t('pr_platform_search_error');
    const resCatch = document.getElementById('pr-platform-search-results');
    if (resCatch) resCatch.innerHTML = '';
  }
}

function renderPartnershipCandidatesList(q) {
  const listEl = document.getElementById('pr-candidates-list');
  if (!listEl) return;
  const needle = String(q || '').trim().toLowerCase();
  const rows = partnershipCandidates.filter((r) => {
    if (!needle) return true;
    const em = String(r.email || '').toLowerCase();
    const nm = String(r.name || '').toLowerCase();
    const ct = String(r.city || '').toLowerCase();
    return em.includes(needle) || nm.includes(needle) || ct.includes(needle);
  });
  if (!rows.length) {
    const emptyMsg = partnershipCandidates.length
      ? t('pr_candidates_filter_empty')
      : t('pr_candidates_empty_list');
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--text3);line-height:1.45">${escAttr(emptyMsg)}</div>`;
    return;
  }
  listEl.innerHTML = rows
    .map((r) => {
      const em = escAttr(r.email || '');
      const nm = escAttr(r.name || '—');
      const ct = r.city ? escAttr(String(r.city)) : '';
      const sub = ct ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${ct}</div>` : '';
      return `<button type="button" class="pr-invite-cand-row" data-pr-email="${em}" style="display:block;width:100%;text-align:left;padding:10px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer;font-size:13px;color:var(--text)">
          <div style="font-weight:800">${nm}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${em}</div>
          ${sub}
        </button>`;
    })
    .join('');
}

async function loadBondsTable() {
  const statusEl = document.getElementById('pr-bonds-status');
  const tbody = document.getElementById('pr-bonds-tbody');
  const tid = bondsTenantId();
  if (!tid) {
    if (statusEl) statusEl.textContent = t('pr_select_tenant_first');
    if (tbody) tbody.innerHTML = '';
    return;
  }
  if (statusEl) statusEl.textContent = t('pr_loading');
  if (tbody) tbody.innerHTML = '';
  try {
    const out = await CONFIG.get(`/tenants/${encodeURIComponent(tid)}/providers`);
    if (out?.error) {
      if (statusEl) statusEl.textContent = String(out.error);
      return;
    }
    const rows = Array.isArray(out?.data) ? out.data : [];
    if (statusEl) {
      statusEl.textContent = tr('pr_bonds_count', { n: rows.length });
    }
    if (!tbody) return;
    tbody.innerHTML = rows
      .map((r) => {
        const u = r.providerIdentity?.user || {};
        const name = String(u.name || '').trim() || '—';
        const em = String(u.loginEmailNorm || u.email || '').trim();
        const rt = String(r.relationshipType || 'DEDICATED').toUpperCase();
        const rel =
          rt === 'OWNER'
            ? t('pr_rel_owner')
            : rt === 'DEDICATED' || rt === 'PARTNER'
              ? t('pr_rel_dedicated')
              : rt;
        const st = String(r.status || '').toUpperCase();
        const reqAt = r.requestedAt
          ? new Date(r.requestedAt).toLocaleString(getAdminUiLocale())
          : '—';
        const kycOk =
          typeof r.activationKycOk === 'boolean'
            ? r.activationKycOk
            : String(r.providerIdentity?.kycStatus || '').toUpperCase() === 'APPROVED';
        const userId = String(u.id || '').trim();
        const fichaVinculos = userId
          ? `<a class="pr-ficha-aff" href="user-edit.html?id=${encodeURIComponent(userId)}#sec-provider-affiliations" style="font-size:11px;color:var(--blue);text-decoration:none;margin-top:4px;display:inline-block">${escAttr(t('pr_open_user_affiliations'))}</a>`
          : '';
        const kycShortcut = userId
          ? `<a class="btn btn-sm btn-outline" href="user-edit.html?id=${encodeURIComponent(userId)}" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:6px">${escAttr(t('pr_kyc_open_user'))}</a>`
          : '';
        const pendenteBlock = `${fichaVinculos ? `<div>${fichaVinculos}</div>` : ''}<div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px"><span style="font-size:11px;color:var(--text3)">${escAttr(t('pr_kyc_pending'))}</span>${kycShortcut}</div>`;
        const needsAdminActivate = st === 'REQUESTED' || st === 'INVITED';
        const aff = escAttr(r.id);
        const cancelInviteBtn = needsAdminActivate
          ? `<button type="button" class="btn btn-sm btn-outline pr-tp-end" data-aff="${aff}" data-pr-end-mode="invite">${escAttr(t('pr_end_invite'))}</button>`
          : '';
        let actionsInner = '—';
        if (needsAdminActivate) {
          if (kycOk) {
            actionsInner = `<div class="pr-bonds-actions"><button type="button" class="btn btn-sm btn-primary pr-tp-act" data-aff="${aff}">${escAttr(t('pr_activate'))}</button>${cancelInviteBtn}</div>`;
          } else {
            actionsInner = `<div class="pr-bonds-actions" style="max-width:260px">${pendenteBlock}<div style="margin-top:8px">${cancelInviteBtn}</div></div>`;
          }
        } else if (st === 'ACTIVE') {
          actionsInner = `<div class="pr-bonds-actions">
            <button type="button" class="btn btn-sm btn-outline pr-tp-suspend" data-aff="${aff}">${escAttr(t('pr_suspend'))}</button>
            <button type="button" class="btn btn-sm btn-outline pr-tp-end" data-aff="${aff}" data-pr-end-mode="link">${escAttr(t('pr_end_link'))}</button>
          </div>`;
        } else if (st === 'SUSPENDED') {
          actionsInner = `<div class="pr-bonds-actions">
            <button type="button" class="btn btn-sm btn-primary pr-tp-resume" data-aff="${aff}">${escAttr(t('pr_resume'))}</button>
            <button type="button" class="btn btn-sm btn-outline pr-tp-end" data-aff="${aff}" data-pr-end-mode="link">${escAttr(t('pr_end_link'))}</button>
          </div>`;
        } else if (st === 'INACTIVE' || st === 'REJECTED') {
          actionsInner = `<span style="font-size:11px;color:var(--text3)">${escAttr(t('pr_bonds_no_actions'))}</span>`;
        }
        return `<tr>
            <td><strong>${escAttr(name)}</strong><div style="font-size:11px;color:var(--text3);margin-top:2px">${escAttr(em)}</div>${fichaVinculos ? `<div style="margin-top:4px">${fichaVinculos}</div>` : ''}</td>
            <td>${escAttr(rel)}</td>
            <td><code>${escAttr(st)}</code></td>
            <td style="white-space:nowrap">${escAttr(reqAt)}</td>
            <td>${actionsInner}</td>
          </tr>`;
      })
      .join('');
    /* Ações: ver `onPrBondsDelegatedClick` em `#pr-section-bonds`. */
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = e?.message || String(e) || '—';
  }
}

async function runAffiliationInviteSubmit() {
  if (!canManageTenantUsers) {
    alert(t('pr_no_perm_invite'));
    return;
  }
  const submitBtn = document.getElementById('pr-invite-submit');
  const email = String(document.getElementById('pr-invite-email')?.value || '').trim();
  if (!email) {
    alert(t('pr_alert_email'));
    return;
  }
  const relationshipType = String(document.getElementById('pr-invite-type')?.value || 'DEDICATED')
    .trim()
    .toUpperCase();
  const note = String(document.getElementById('pr-invite-note')?.value || '').trim();
  const tenantId = inviteTenantId();
  if (!tenantId) {
    alert(t('pr_alert_tenant'));
    return;
  }
  if (submitBtn) submitBtn.disabled = true;
  try {
    const out = await CONFIG.post('/providers/affiliations/invite', {
      email,
      tenantId,
      relationshipType,
      note: note || undefined,
    });
    if (!out) {
      alert(t('pr_alert_session'));
      return;
    }
    if (out.error) {
      alert(out.error);
      return;
    }
    const acceptUrl = out.acceptUrl || '';
    const n = out.notify || {};
    const skipReason = n.emailSkippedReason ? String(n.emailSkippedReason).slice(0, 260) : '';
    const emailLine =
      n.emailSent === true
        ? `\n\n${tr('pr_invite_email_ok', { p: n.emailProvider || 'ok' })}`
        : n.emailSkipped
          ? `\n\n${tr('pr_invite_email_skip', { p: n.emailProvider || '—', r: skipReason || '—' })}`
          : n.emailError
            ? `\n\n${tr('pr_invite_email_fail', { e: String(n.emailError).slice(0, 200) })}`
            : '';
    const pushTok = typeof n.pushTokenCount === 'number' ? n.pushTokenCount : null;
    const pushErrExpo = n.pushFirstError ? String(n.pushFirstError).slice(0, 160) : '';
    const pushLine =
      typeof n.pushSent === 'number'
        ? n.pushSent > 0
          ? `\n\n${tr('pr_invite_push_ok', { n: n.pushSent, err: n.pushErrors ? String(n.pushErrors) : '' })}`
          : pushTok && pushTok > 0
            ? `\n\n${tr('pr_invite_push_partial', { n: pushTok, e: pushErrExpo || '' })}`
            : `\n\n${t('pr_invite_push_none')}`
        : '';
    alert(
      `${t('pr_invite_created_title')}\n\n${tr('pr_invite_created_body', { type: relationshipType, email })}\n\n${acceptUrl}${emailLine}${pushLine}`,
    );
    document.getElementById('pr-invite-note').value = '';
    void loadBondsTable();
    void loadPartnershipCandidates();
  } catch (err) {
    console.error('[pr-invite-submit]', err);
    alert(err?.message || String(err) || '—');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

document.getElementById('pr-candidates-filter')?.addEventListener('input', (e) => {
  renderPartnershipCandidatesList(e.target?.value || '');
});

function prFillInviteEmailFromRow(emRaw) {
  const em = String(emRaw || '').trim();
  if (!em) return;
  const input = document.getElementById('pr-invite-email');
  if (input) input.value = em;
}

document.getElementById('pr-candidates-list')?.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('button[data-pr-email]') : null;
  if (!btn) return;
  prFillInviteEmailFromRow(btn.getAttribute('data-pr-email'));
});

if (canManageTenantUsers) {
  document.getElementById('pr-platform-search')?.addEventListener('input', () => {
    clearTimeout(directorySearchTimer);
    directorySearchTimer = setTimeout(() => void runDirectorySearch('auto'), 420);
  });
  document.getElementById('pr-directory-search-btn')?.addEventListener('click', () => void runDirectorySearch('button'));
  document.getElementById('pr-tab-btn-bonds')?.addEventListener('click', () => setPrestadoresTab('bonds'));
  document.getElementById('pr-tab-btn-invite')?.addEventListener('click', () => setPrestadoresTab('invite'));
  document.getElementById('pr-platform-search-clear')?.addEventListener('click', () => {
    clearPlatformDirectoryUi();
  });
  document.getElementById('pr-platform-search-results')?.addEventListener('click', (e) => {
    const row = e.target?.closest?.('button.pr-dir-pick-row');
    if (!row) return;
    prFillInviteEmailFromRow(row.getAttribute('data-pr-email'));
    row.style.boxShadow = 'inset 0 0 0 2px var(--blue, #2563eb)';
    setTimeout(() => {
      row.style.boxShadow = '';
    }, 500);
  });
}

document.getElementById('pr-invite-submit')?.addEventListener('click', () => void runAffiliationInviteSubmit());

document.getElementById('pr-bonds-refresh')?.addEventListener('click', () => void loadBondsTable());

const hintBonds = document.getElementById('pr-bonds-hint');
if (hintBonds) {
  hintBonds.textContent = panelTenantId() ? t('pr_card_bonds_hint') : t('pr_card_bonds_hint_global');
}

await loadTenantSelects();

if (canManageTenantUsers) {
  void loadBondsTable();
  void loadPartnershipCandidates();
}
