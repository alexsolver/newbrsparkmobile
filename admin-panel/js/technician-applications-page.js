/**
 * Lista e detalhe de candidaturas de cadastro de prestador + convite.
 */
import { initPage } from './sidebar.js';
import { CONFIG } from './config.js';

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

function showList() {
  document.getElementById('view-list').style.display = '';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('back-users').style.display = '';
  currentDetailId = null;
  window.history.replaceState({}, '', 'technician-applications.html');
  loadList();
}

function showDetail(id) {
  currentDetailId = id;
  document.getElementById('view-list').style.display = 'none';
  document.getElementById('view-detail').style.display = '';
  document.getElementById('back-users').style.display = 'none';
  window.history.replaceState({}, '', `technician-applications.html?id=${encodeURIComponent(id)}`);
  loadDetail(id);
}

async function loadList() {
  const st = document.getElementById('filter-status')?.value || '';
  const tid = panelTenantId();
  const q = new URLSearchParams();
  if (st) q.set('status', st);
  if (tid) q.set('tenantId', tid);
  const path = `/technician-registration${q.toString() ? `?${q}` : ''}`;
  const res = await CONFIG.get(path);
  const tb = document.getElementById('tbody-apps');
  if (!tb) return;
  if (res?.error) {
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">${res.error}</td></tr>`;
    return;
  }
  const rows = res?.data || [];
  if (!rows.length) {
    tb.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">Nenhuma candidatura.</td></tr>';
    return;
  }
  tb.innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.invitedEmail)}</td>
      <td>${escapeHtml(r.tenantName || r.tenantId)}</td>
      <td><span class="badge">${escapeHtml(r.status)}</span></td>
      <td style="font-size:12px;color:var(--text3)">${formatDate(r.updatedAt)}</td>
      <td style="text-align:right"><button type="button" class="btn btn-sm btn-outline" data-open="${escapeHtml(r.id)}">Abrir</button></td>
    </tr>`
    )
    .join('');
  tb.querySelectorAll('[data-open]').forEach((btn) => {
    btn.onclick = () => showDetail(btn.getAttribute('data-open'));
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

async function loadDetail(id) {
  const res = await CONFIG.get(`/technician-registration/${encodeURIComponent(id)}`);
  const meta = document.getElementById('detail-meta');
  const jsonEl = document.getElementById('detail-json');
  const eventsEl = document.getElementById('detail-events');
  const actions = document.getElementById('detail-actions');
  const revBox = document.getElementById('detail-revision');
  if (res?.error) {
    meta.textContent = res.error;
    return;
  }
  document.getElementById('detail-title').textContent = res.invitedEmail || 'Candidatura';
  meta.innerHTML = `<strong>${escapeHtml(res.tenant?.name || '')}</strong> · Estado: <strong>${escapeHtml(res.status)}</strong>`;
  if (res.revisionNote && ['NEEDS_REVISION', 'REJECTED'].includes(res.status)) {
    revBox.style.display = 'block';
    revBox.innerHTML = `<strong>Mensagem ao candidato:</strong> ${escapeHtml(res.revisionNote)}`;
  } else {
    revBox.style.display = 'none';
  }
  const safe = { ...res };
  delete safe.passwordHash;
  delete safe.inviteToken;
  jsonEl.textContent = JSON.stringify(safe.responsesJson || {}, null, 2);
  eventsEl.innerHTML = (res.events || [])
    .map(
      (e) =>
        `<li><strong>${escapeHtml(e.type)}</strong> ${e.message ? '— ' + escapeHtml(e.message) : ''} <span style="opacity:0.75">(${formatDate(e.createdAt)})</span></li>`
    )
    .join('');

  actions.innerHTML = '';
  if (res.status === 'SUBMITTED') {
    actions.innerHTML = `
      <button type="button" class="btn btn-primary" id="act-approve">Aprovar e criar prestador</button>
      <button type="button" class="btn btn-outline" id="act-revision">Pedir ajustes</button>
      <button type="button" class="btn btn-danger" id="act-reject">Recusar</button>`;
    document.getElementById('act-approve').onclick = async () => {
      if (!confirm('Aprovar esta candidatura? Será criado o utilizador prestador com os dados submetidos.')) return;
      const out = await CONFIG.post(`/technician-registration/${encodeURIComponent(id)}/approve`, {});
      if (out?.error) {
        alert(out.error);
        return;
      }
      alert('Prestador criado e ativado com sucesso.');
      showList();
    };
    document.getElementById('act-revision').onclick = () => {
      revisionTargetId = id;
      document.getElementById('revision-msg').value = '';
      openModal('modal-revision');
    };
    document.getElementById('act-reject').onclick = async () => {
      const reason = prompt('Motivo da recusa (obrigatório):');
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
    actions.innerHTML =
      '<p style="font-size:12px;color:var(--text3)">Aguardando submissão do candidato (link com token enviado no convite).</p>';
  } else if (res.status === 'APPROVED' && res.createdUser) {
    actions.innerHTML = `<a class="btn btn-sm btn-primary" href="user-edit.html?id=${encodeURIComponent(res.createdUser.id)}">Abrir utilizador criado</a>`;
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
  sel.innerHTML = rows.map((t) => `<option value="${t.id}">${t.name || t.slug}</option>`).join('');
}

export async function bootTechnicianApplicationsPage() {
  await initPage();
  document.getElementById('filter-status').onchange = () => loadList();
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
      alert('Informe o e-mail.');
      return;
    }
    const body = { email };
    const tid = panelTenantId();
    if (tid) body.tenantId = tid;
    else body.tenantId = document.getElementById('invite-tenant')?.value;
    if (!body.tenantId) {
      alert('Selecione o tenant.');
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
        emailLine = '\n\nUm e-mail com o convite foi enviado ao candidato (Nylas).';
      } else if (out.email.skipped) {
        emailLine = `\n\nE-mail não enviado: ${out.email.detail || 'configure Nylas (API Key + Grant ID) no servidor ou em Integrações.'}`;
      } else {
        emailLine = `\n\nAviso: o convite foi criado, mas o envio por e-mail falhou: ${out.email.detail || 'erro desconhecido'}`;
      }
    }
    const msg = `Convite criado.\n\nO prestador já deve ter conta no BrSpark com este e-mail (cadastro no app) antes de abrir o link.\n\nToken (guarde para o candidato):\n${out.inviteToken}\n\nSugestão de link no app:\n/auth/tech-registration?token=${out.inviteToken}\n\n${hint}${emailLine}`;
    alert(msg);
    loadList();
  };
  document.getElementById('revision-submit').onclick = async () => {
    const msg = document.getElementById('revision-msg').value.trim();
    if (!msg) {
      alert('Escreva a mensagem.');
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
