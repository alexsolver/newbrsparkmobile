/**
 * Hub único: vínculos provider-first, convites de parceria e resumo de candidaturas.
 */
import { initPage } from './sidebar.js';
import { CONFIG, getEffectivePanelCapabilities } from './config.js';
import { getAdminUiLocale, t, applyPrestadoresPageI18n } from './user-pages-i18n.js';
import { tpFormatDateTime, tpStatusLabel, tpT } from './technician-applications-i18n.js';

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

async function onPrBondsActivateDelegatedClick(ev) {
  const el = prDomElementFromTarget(ev.target);
  const btn = el?.closest?.('button.pr-tp-act');
  if (!btn) return;
  ev.preventDefault();
  const affId = btn.getAttribute('data-aff');
  if (!affId) return;
  if (!confirm(t('pr_confirm_activate'))) return;
  btn.disabled = true;
  try {
    const res = await CONFIG.post(`/providers/affiliations/${encodeURIComponent(affId)}/activate`, {});
    if (res?.error) {
      alert(res.error);
      return;
    }
    await loadBondsTable();
  } finally {
    btn.disabled = false;
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
const canManageTechApplications =
  panelCaps.has('tenant.technicianRegistration.write.self') ||
  panelCaps.has('tenant.technicianRegistration.write.any');

const secBonds = document.getElementById('pr-section-bonds');
const secInvite = document.getElementById('pr-section-invite');
const secApps = document.getElementById('pr-section-apps');
const permBanner = document.getElementById('pr-perm-banner');

if (!canManageTenantUsers && !canManageTechApplications) {
  if (permBanner) {
    permBanner.style.display = '';
    permBanner.textContent = t('pr_perm_none');
  }
  if (secBonds) secBonds.hidden = true;
  if (secInvite) secInvite.hidden = true;
  if (secApps) secApps.hidden = true;
} else {
  if (secBonds) secBonds.hidden = !canManageTenantUsers;
  if (secInvite) secInvite.hidden = !canManageTenantUsers;
  if (secApps) secApps.hidden = !canManageTechApplications;
}

if (canManageTenantUsers) {
  const prBondsSection = document.getElementById('pr-section-bonds');
  if (prBondsSection && prBondsSection.dataset.prBondsActDeleg !== '1') {
    prBondsSection.dataset.prBondsActDeleg = '1';
    prBondsSection.addEventListener('click', (ev) => void onPrBondsActivateDelegatedClick(ev));
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
    selInv.addEventListener('change', () => void loadPartnershipCandidates());
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
  if (filterEl) filterEl.value = '';
  partnershipCandidates = [];
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
    statusEl.textContent = tr('pr_candidates_count', { n: rows.length });
    renderPartnershipCandidatesList('');
  } catch (e) {
    console.error('[partnership-candidates]', e);
    statusEl.textContent = e?.message || String(e) || '—';
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
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--text3)">${
      partnershipCandidates.length ? t('pr_candidates_filter_empty') : '—'
    }</div>`;
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
        const em = String(u.email || '').trim();
        const rel =
          String(r.relationshipType || 'PARTNER').toUpperCase() === 'DEDICATED'
            ? t('pr_rel_dedicated')
            : t('pr_rel_partner');
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
        const actBtn = needsAdminActivate
          ? kycOk
            ? `<button type="button" class="btn btn-sm btn-primary pr-tp-act" data-aff="${escAttr(r.id)}">${escAttr(t('pr_activate'))}</button>`
            : pendenteBlock
          : '—';
        return `<tr>
            <td><strong>${escAttr(name)}</strong><div style="font-size:11px;color:var(--text3);margin-top:2px">${escAttr(em)}</div>${fichaVinculos ? `<div style="margin-top:4px">${fichaVinculos}</div>` : ''}</td>
            <td>${escAttr(rel)}</td>
            <td><code>${escAttr(st)}</code></td>
            <td style="white-space:nowrap">${escAttr(reqAt)}</td>
            <td style="white-space:nowrap">${actBtn}</td>
          </tr>`;
      })
      .join('');
    /* Ativar: ver `onPrBondsActivateDelegatedClick` em `#pr-section-bonds`. */
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = e?.message || String(e) || '—';
  }
}

async function loadTechSummary() {
  const statusEl = document.getElementById('pr-apps-status');
  const tbody = document.getElementById('pr-tech-tbody');
  if (!canManageTechApplications) return;
  if (statusEl) statusEl.textContent = t('pr_loading');
  if (tbody) tbody.innerHTML = '';
  try {
    const out = await CONFIG.get('/technician-registration');
    const rows = Array.isArray(out?.data) ? out.data : [];
    const slice = rows.slice(0, 12);
    if (statusEl) {
      statusEl.textContent = tr('pr_apps_summary', { n: rows.length });
    }
    if (!tbody) return;
    tbody.innerHTML = slice
      .map((r) => {
        const em = escAttr(r.invitedEmail || r.candidateName || '—');
        const tn = escAttr(r.tenantName || '—');
        const rawSt = String(r.status || '').trim();
        const st =
          rawSt === 'PERFIL_SEM_CANDIDATURA' || rawSt === '__ORPHAN__'
            ? tpT('tp_badge_orphan')
            : tpStatusLabel(r.status || '');
        const up = r.updatedAt ? tpFormatDateTime(r.updatedAt) : '—';
        return `<tr><td>${em}</td><td>${tn}</td><td>${escAttr(st)}</td><td style="white-space:nowrap">${escAttr(up)}</td></tr>`;
      })
      .join('');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:14px;font-size:12px;color:var(--text3)">${escAttr(t('pr_apps_empty'))}</td></tr>`;
    }
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
  const relationshipType = String(document.getElementById('pr-invite-type')?.value || 'PARTNER')
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

document.getElementById('pr-candidates-list')?.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('button[data-pr-email]') : null;
  if (!btn) return;
  const em = btn.getAttribute('data-pr-email');
  if (!em) return;
  const input = document.getElementById('pr-invite-email');
  if (input) input.value = em;
});

document.getElementById('pr-invite-submit')?.addEventListener('click', () => void runAffiliationInviteSubmit());

document.getElementById('pr-bonds-refresh')?.addEventListener('click', () => void loadBondsTable());
document.getElementById('pr-apps-refresh')?.addEventListener('click', () => void loadTechSummary());

const hintBonds = document.getElementById('pr-bonds-hint');
if (hintBonds) {
  hintBonds.textContent = panelTenantId() ? t('pr_card_bonds_hint') : t('pr_card_bonds_hint_global');
}

await loadTenantSelects();

if (canManageTenantUsers) {
  void loadBondsTable();
  void loadPartnershipCandidates();
}
if (canManageTechApplications) {
  void loadTechSummary();
}
