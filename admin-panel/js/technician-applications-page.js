/**
 * Lista e detalhe de candidaturas de cadastro de prestador + convite.
 */
import { initPage } from './sidebar.js';
import { CONFIG } from './config.js';
import {
  applyTechnicianApplicationsPageI18n,
  tpT,
  tpFormatDateTime,
  tpStatusLabel,
} from './technician-applications-i18n.js';

function panelTenantId() {
  try {
    if (sessionStorage.getItem('brspark_panel_mode') === 'tenant') {
      const t = JSON.parse(sessionStorage.getItem('brspark_panel_tenant') || '{}');
      return t.id || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

let currentDetailId = null;
let revisionTargetId = null;
let searchDebounce = null;

function listSearchQueryValue() {
  const raw = document.getElementById('filter-search')?.value ?? '';
  return String(raw).trim().slice(0, 200);
}

function syncTechAppsListUrl() {
  try {
    const st = document.getElementById('filter-status')?.value || '';
    const sp = new URLSearchParams();
    if (st) sp.set('status', st);
    const qv = listSearchQueryValue();
    if (qv) sp.set('q', qv);
    const qs = sp.toString();
    window.history.replaceState({}, '', `technician-applications.html${qs ? `?${qs}` : ''}`);
  } catch {
    /* ignore */
  }
}

function readTechAppsStatusFromUrl() {
  try {
    const st = new URLSearchParams(window.location.search).get('status');
    const sel = document.getElementById('filter-status');
    if (!st || !sel) return;
    const ok = Array.from(sel.options).some((o) => o.value === st);
    if (ok) sel.value = st;
  } catch {
    /* ignore */
  }
}

function readTechAppsQFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get('q');
    const inp = document.getElementById('filter-search');
    if (!inp) return;
    if (q != null && q !== '') inp.value = String(q).trim().slice(0, 200);
    else inp.value = '';
  } catch {
    /* ignore */
  }
}

function showList() {
  document.getElementById('view-list').style.display = '';
  document.getElementById('view-detail').style.display = 'none';
  const nav = document.getElementById('tech-apps-user-nav');
  if (nav) nav.style.display = '';
  currentDetailId = null;
  syncTechAppsListUrl();
  loadList();
}

function showDetail(id) {
  currentDetailId = id;
  document.getElementById('view-list').style.display = 'none';
  document.getElementById('view-detail').style.display = '';
  const nav = document.getElementById('tech-apps-user-nav');
  if (nav) nav.style.display = 'none';
  window.history.replaceState({}, '', `technician-applications.html?id=${encodeURIComponent(id)}`);
  loadDetail(id);
}

function statusBadgeHtml(r) {
  if (r.kind === 'orphan_profile' || r.status === 'PERFIL_SEM_CANDIDATURA') {
    const t = escapeHtml(tpT('tp_badge_orphan_title'));
    return `<span class="badge badge-amber" title="${t}">${escapeHtml(tpT('tp_badge_orphan'))}</span>`;
  }
  return `<span class="badge">${escapeHtml(tpStatusLabel(r.status))}</span>`;
}

function actionsCellHtml(r) {
  if (r.kind === 'orphan_profile' && r.orphanUserId) {
    const uid = escapeHtml(r.orphanUserId);
    const em = escapeHtml(r.invitedEmail || '');
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end">
      <a class="btn btn-sm btn-outline" href="user-edit.html?id=${uid}">${escapeHtml(tpT('tp_act_user'))}</a>
      <button type="button" class="btn btn-sm btn-primary" data-invite-email="${em}" data-invite-tenant="${escapeHtml(r.tenantId || '')}">${escapeHtml(tpT('tp_act_invite'))}</button>
    </div>`;
  }
  if (r.id) {
    return `<button type="button" class="btn btn-sm btn-outline" data-open="${escapeHtml(r.id)}">${escapeHtml(tpT('tp_act_open'))}</button>`;
  }
  return '—';
}

async function loadList() {
  const st = document.getElementById('filter-status')?.value || '';
  const tid = panelTenantId();
  const q = new URLSearchParams();
  if (st) q.set('status', st);
  if (tid) q.set('tenantId', tid);
  const qv = listSearchQueryValue();
  if (qv) q.set('q', qv);
  const path = `/technician-registration${q.toString() ? `?${q}` : ''}`;
  const res = await CONFIG.get(path);
  const tb = document.getElementById('tbody-apps');
  if (!tb) return;
  if (res?.error) {
    tb.innerHTML = `<tr><td colspan="5" style="padding:0;border:none"><div class="empty-state-pro" style="padding:28px 16px 24px"><div class="empty-state-pro-title" style="color:var(--red)">${escapeHtml(tpT('tp_err_load'))}</div><p class="empty-state-pro-sub" style="color:var(--red)">${escapeHtml(res.error)}</p></div></td></tr>`;
    syncTechAppsListUrl();
    return;
  }
  const rows = res?.data || [];
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="5" style="padding:0;border:none">
      <div class="empty-state-pro" style="padding:36px 20px 32px">
        <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
        <div class="empty-state-pro-title">${escapeHtml(tpT('tp_empty_title'))}</div>
        <p class="empty-state-pro-sub">${escapeHtml(tpT('tp_empty_sub'))}</p>
      </div></td></tr>`;
    syncTechAppsListUrl();
    return;
  }
  tb.innerHTML = rows
    .map((r) => {
      const nameHint =
        r.candidateName && r.kind === 'orphan_profile'
          ? `<span style="display:block;font-size:11px;color:var(--text3);margin-top:4px">${escapeHtml(r.candidateName)}</span>`
          : '';
      return `<tr>
      <td>${escapeHtml(r.invitedEmail)}${nameHint}</td>
      <td>${escapeHtml(r.tenantName || r.tenantId)}</td>
      <td>${statusBadgeHtml(r)}</td>
      <td style="font-size:12px;color:var(--text3)">${escapeHtml(tpFormatDateTime(r.updatedAt))}</td>
      <td style="text-align:right">${actionsCellHtml(r)}</td>
    </tr>`;
    })
    .join('');
  tb.querySelectorAll('[data-open]').forEach((btn) => {
    btn.onclick = () => showDetail(btn.getAttribute('data-open'));
  });
  tb.querySelectorAll('[data-invite-email]').forEach((btn) => {
    btn.onclick = async () => {
      const email = btn.getAttribute('data-invite-email') || '';
      const tAttr = btn.getAttribute('data-invite-tenant') || '';
      document.getElementById('invite-email').value = email;
      await loadTenantsForInvite();
      const sel = document.getElementById('invite-tenant');
      if (sel && tAttr) {
        const opt = Array.from(sel.options).find((o) => o.value === tAttr);
        if (opt) sel.value = tAttr;
      }
      openModal('modal-invite');
    };
  });
  syncTechAppsListUrl();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function candidateNameFromResponses(res) {
  const rj = res?.responsesJson;
  if (!rj || typeof rj !== 'object' || Array.isArray(rj)) return '';
  if (typeof rj.name === 'string' && rj.name.trim()) return rj.name.trim();
  if (rj.technician && typeof rj.technician.name === 'string' && rj.technician.name.trim()) {
    return rj.technician.name.trim();
  }
  const fn = typeof rj.firstName === 'string' ? rj.firstName.trim() : '';
  const ln = typeof rj.lastName === 'string' ? rj.lastName.trim() : '';
  return [fn, ln].filter(Boolean).join(' ').trim();
}

function detailSummaryCard(label, value) {
  const v =
    value != null && String(value).trim() !== ''
      ? String(value)
      : '—';
  return `<div class="stat-card" style="margin-bottom:0"><div class="stat-label">${escapeHtml(label)}</div><div style="font-size:14px;font-weight:700;color:var(--text);word-break:break-word;line-height:1.35;margin-top:6px">${escapeHtml(v)}</div></div>`;
}

function buildDetailSummaryHtml(res) {
  const parts = [
    detailSummaryCard(tpT('tp_detail_summary_email'), res.invitedEmail),
    detailSummaryCard(tpT('tp_detail_summary_tenant'), res.tenant?.name || ''),
    detailSummaryCard(tpT('tp_detail_summary_status'), tpStatusLabel(res.status)),
  ];
  const nm = candidateNameFromResponses(res);
  if (nm) parts.push(detailSummaryCard(tpT('tp_detail_summary_name'), nm));
  parts.push(
    detailSummaryCard(tpT('tp_detail_summary_submitted'), tpFormatDateTime(res.submittedAt)),
    detailSummaryCard(tpT('tp_detail_summary_created'), tpFormatDateTime(res.createdAt)),
  );
  return parts.join('');
}

async function loadDetail(id) {
  const res = await CONFIG.get(`/technician-registration/${encodeURIComponent(id)}`);
  const meta = document.getElementById('detail-meta');
  const jsonEl = document.getElementById('detail-json');
  const sumEl = document.getElementById('detail-summary');
  const eventsEl = document.getElementById('detail-events');
  const actions = document.getElementById('detail-actions');
  const revBox = document.getElementById('detail-revision');
  if (res?.error) {
    if (meta) {
      meta.style.display = '';
      meta.textContent = res.error;
    }
    if (sumEl) {
      sumEl.style.display = 'none';
      sumEl.innerHTML = '';
    }
    return;
  }
  if (meta) meta.style.display = 'none';
  if (sumEl) {
    sumEl.style.display = 'grid';
    sumEl.innerHTML = buildDetailSummaryHtml(res);
  }
  document.getElementById('detail-title').textContent = res.invitedEmail || tpT('tp_detail_title');
  if (res.revisionNote && ['NEEDS_REVISION', 'REJECTED'].includes(res.status)) {
    revBox.style.display = 'block';
    revBox.innerHTML = `<strong>${escapeHtml(tpT('tp_detail_revision'))}</strong> ${escapeHtml(res.revisionNote)}`;
  } else {
    revBox.style.display = 'none';
  }
  const safe = { ...res };
  delete safe.passwordHash;
  delete safe.inviteToken;
  jsonEl.textContent = JSON.stringify(safe, null, 2);
  eventsEl.innerHTML = (res.events || [])
    .map(
      (e) =>
        `<li><strong>${escapeHtml(e.type)}</strong> ${e.message ? '— ' + escapeHtml(e.message) : ''} <span style="opacity:0.75">(${escapeHtml(tpFormatDateTime(e.createdAt))})</span></li>`
    )
    .join('');

  actions.innerHTML = '';
  if (res.status === 'SUBMITTED') {
    actions.innerHTML = `
      <button type="button" class="btn btn-primary" id="act-approve">${escapeHtml(tpT('tp_act_approve'))}</button>
      <button type="button" class="btn btn-outline" id="act-revision">${escapeHtml(tpT('tp_act_revision'))}</button>
      <button type="button" class="btn btn-danger" id="act-reject">${escapeHtml(tpT('tp_act_reject'))}</button>`;
    document.getElementById('act-approve').onclick = async () => {
      if (!confirm(tpT('tp_cf_approve'))) return;
      const out = await CONFIG.post(`/technician-registration/${encodeURIComponent(id)}/approve`, {});
      if (out?.error) {
        alert(out.error);
        return;
      }
      alert(tpT('tp_ok_approve'));
      showList();
    };
    document.getElementById('act-revision').onclick = () => {
      revisionTargetId = id;
      document.getElementById('revision-msg').value = '';
      openModal('modal-revision');
    };
    document.getElementById('act-reject').onclick = async () => {
      const reason = prompt(tpT('tp_prompt_reject'));
      if (!reason || !reason.trim()) return;
      const out = await CONFIG.post(`/technician-registration/${encodeURIComponent(id)}/reject`, {
        reason: reason.trim(),
      });
      if (out?.error) {
        alert(out.error);
        return;
      }
      showList();
    };
  } else if (['INVITED', 'DRAFT', 'NEEDS_REVISION'].includes(res.status)) {
    actions.innerHTML = `<p style="font-size:12px;color:var(--text3)">${escapeHtml(tpT('tp_wait_submit'))}</p>`;
  } else if (res.status === 'APPROVED' && res.createdUser) {
    actions.innerHTML = `<a class="btn btn-sm btn-primary" href="user-edit.html?id=${encodeURIComponent(res.createdUser.id)}">${escapeHtml(tpT('tp_open_created_user'))}</a>`;
  }
}

async function loadTenantsForInvite() {
  const wrap = document.getElementById('wrap-invite-tenant');
  const sel = document.getElementById('invite-tenant');
  if (!wrap || !sel) return;
  if (panelTenantId()) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const res = await CONFIG.get('/tenants?limit=200');
  const list = res?.data || res || [];
  const rows = Array.isArray(list) ? list : [];
  sel.innerHTML = rows.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name || t.slug)}</option>`).join('');
}

export async function bootTechnicianApplicationsPage() {
  await initPage();
  applyTechnicianApplicationsPageI18n();
  readTechAppsStatusFromUrl();
  readTechAppsQFromUrl();

  document.getElementById('filter-status').onchange = () => loadList();
  const fq = document.getElementById('filter-search');
  if (fq) {
    fq.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadList(), 320);
    });
  }
  document.getElementById('btn-invite').onclick = async () => {
    document.getElementById('invite-email').value = '';
    await loadTenantsForInvite();
    openModal('modal-invite');
  };
  document.querySelectorAll('[data-close-invite]').forEach((b) => {
    b.onclick = () => closeModal('modal-invite');
  });
  document.querySelectorAll('[data-close-rev]').forEach((b) => {
    b.onclick = () => closeModal('modal-revision');
  });
  document.getElementById('invite-submit').onclick = async () => {
    const email = document.getElementById('invite-email').value.trim();
    if (!email) {
      alert(tpT('tp_alert_email'));
      return;
    }
    const body = { email };
    const tid = panelTenantId();
    if (tid) body.tenantId = tid;
    else body.tenantId = document.getElementById('invite-tenant')?.value;
    if (!body.tenantId) {
      alert(tpT('tp_alert_tenant'));
      return;
    }
    const out = await CONFIG.post('/technician-registration/invite', body);
    if (out?.error) {
      alert(out.error);
      return;
    }
    closeModal('modal-invite');
    const hint = out.deepLinkHint || '';
    let emailLine = '';
    if (out.email) {
      if (out.email.sent) {
        emailLine = `\n\n${tpT('tp_invite_email_sent')}`;
      } else if (out.email.skipped) {
        const d = out.email.detail || tpT('tp_invite_email_skipped_default');
        emailLine = `\n\n${tpT('tp_invite_email_skipped', { detail: d })}`;
      } else {
        const d = out.email.detail || tpT('tp_invite_email_fail_unknown');
        emailLine = `\n\n${tpT('tp_invite_email_fail', { detail: d })}`;
      }
    }
    const msg = `${tpT('tp_invite_ok_intro')}\n\n${tpT('tp_invite_ok_token')}\n${out.inviteToken}\n\n${tpT('tp_invite_ok_link')}\n/auth/tech-registration?token=${out.inviteToken}\n\n${hint}${emailLine}`;
    alert(msg);
    loadList();
  };
  document.getElementById('revision-submit').onclick = async () => {
    const msg = document.getElementById('revision-msg').value.trim();
    if (!msg) {
      alert(tpT('tp_alert_rev_msg'));
      return;
    }
    const rid = revisionTargetId;
    if (!rid) return;
    const out = await CONFIG.post(`/technician-registration/${encodeURIComponent(rid)}/request-revision`, {
      message: msg,
    });
    if (out?.error) {
      alert(out.error);
      return;
    }
    closeModal('modal-revision');
    loadDetail(rid);
  };
  document.getElementById('btn-close-detail').onclick = () => showList();

  const params = new URLSearchParams(window.location.search);
  const qid = params.get('id');
  if (qid) showDetail(qid);
  else loadList();
}

bootTechnicianApplicationsPage();
