/**
 * Painel Qualidade — Avaliações: KPIs, disputas, instâncias, templates, ranking.
 */
import { initPage } from './sidebar.js';
import { CONFIG, getPanelCapabilities } from './config.js';
import { getAdminUiLocale } from './user-pages-i18n.js';
import { evT, applyEvaluationsStaticI18n } from './evaluations-i18n.js';

const Q_TYPES = ['RATING', 'NPS', 'BOOLEAN', 'TEXT', 'MULTIPLE_CHOICE'];
const panelCaps = new Set(getPanelCapabilities());
const canCrossTenantEvaluations =
  panelCaps.has('tenant.access.any') || panelCaps.has('platform.dashboard.read');
const canManageEvaluationTemplates =
  panelCaps.has('tenant.operations.write.self') || panelCaps.has('tenant.operations.write.any');

/** Cancela listeners load/error do preview do logo do template ao mudar URL ou limpar. */
let tplSurveyLogoPreviewAbort = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tenant ativo no painel (modo tenant) — necessário para «Novo template» sem lista global de tenants. */
function resolvePanelTenantId() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    if (sessionStorage.getItem('brspark_panel_mode') !== 'tenant') return null;
    const t = JSON.parse(sessionStorage.getItem('brspark_panel_tenant') || '{}');
    return t?.id && String(t.id).trim() ? String(t.id).trim() : null;
  } catch {
    return null;
  }
}

/** Rótulo legível para estado da instância (evita PENDING/IN_REVIEW na UI). */
function instanceStatusLabel(code) {
  const c = String(code || 'UNKNOWN').toUpperCase();
  return evT(`ev_inst_badge_${c}`);
}

function instanceBadgeClass(code) {
  const s = String(code || '').toUpperCase();
  if (s === 'PENDING') return 'badge-amber';
  if (s === 'IN_REVIEW') return 'badge-blue';
  if (s === 'RESPONDED') return 'badge-green';
  if (s === 'FINALIZED') return 'badge-gray';
  return 'badge-gray';
}

/** Última transcrição carregada (para exportar/baixar JSON). */
let lastChatTranscriptPayload = null;

/** Metadados do convite aberto no modal (pré-preenchimento). */
let lastNotifyContext = { instanceId: '', clientEmailGuess: '', osLabel: '', templateName: '' };

function formatChatTranscriptText(data) {
  if (!data || typeof data !== 'object') return '';
  const lines = [];
  lines.push(evT('ev_chat_line_instance', { id: data.evaluationInstanceId || '—' }));
  lines.push(evT('ev_chat_line_os', { os: data.osNumber || '—', ex: data.executionId || '—' }));
  lines.push(evT('ev_chat_line_people', { tech: data.techEmail || '—', client: data.clientEmail || '—' }));
  lines.push(evT('ev_chat_line_room', { room: data.roomId || '—' }));
  lines.push(evT('ev_chat_line_window', { from: data.windowFrom || '—', to: data.windowTo || '—' }));
  lines.push('');
  if (Array.isArray(data.warnings) && data.warnings.length) {
    lines.push(evT('ev_chat_warnings'), ...data.warnings.map((w) => `  • ${w}`), '');
  }
  const msgs = data.messages || [];
  if (!msgs.length) {
    lines.push(evT('ev_chat_no_msgs'));
  } else {
    lines.push(evT('ev_chat_msgs_header', { n: msgs.length }), '');
    msgs.forEach((m) => {
      const head = evT('ev_chat_msg_head', {
        at: m.createdAt,
        name: m.senderName,
        id: m.senderId,
        type: m.type,
      });
      const body = m.content ? String(m.content) : '';
      const media = m.mediaUrl ? `\n  ${evT('ev_chat_media', { url: m.mediaUrl })}` : '';
      lines.push(head + (body ? `\n  ${body.replace(/\n/g, '\n  ')}` : '') + media, '');
    });
  }
  return lines.join('\n');
}

function renderChatTranscriptModal(data) {
  lastChatTranscriptPayload = data;
  const meta = document.getElementById('chat-transcript-meta');
  const warn = document.getElementById('chat-transcript-warn');
  const body = document.getElementById('chat-transcript-body');
  if (meta) {
    meta.innerHTML = evT('ev_chat_meta_html', {
      os: esc(data.osNumber || '—'),
      room: esc(data.roomId || '—'),
      n: esc((data.messages || []).length),
    });
  }
  if (warn) {
    const w = data.warnings || [];
    if (w.length) {
      warn.style.display = 'block';
      warn.textContent = w.join(' ');
    } else {
      warn.style.display = 'none';
      warn.textContent = '';
    }
  }
  if (body) {
    body.textContent = formatChatTranscriptText(data);
  }
}

function downloadChatTranscriptJson() {
  if (!lastChatTranscriptPayload) return;
  const slug = String(lastChatTranscriptPayload.osNumber || lastChatTranscriptPayload.evaluationInstanceId || 'transcript').replace(/[^\w.-]+/g, '_');
  const blob = new Blob([JSON.stringify(lastChatTranscriptPayload, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chat-auditoria-${slug}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function openChatTranscriptFromDispute(disputeId) {
  const data = await CONFIG.get(
    '/admin/evaluations/disputes/' + encodeURIComponent(disputeId) + '/chat-transcript'
  );
  if (!data || data.error) {
    alert(data?.error || evT('ev_alert_transcript'));
    return;
  }
  renderChatTranscriptModal(data);
  openModal('chat-transcript-overlay');
}

async function openChatTranscriptFromInstance(instanceId) {
  const data = await CONFIG.get(
    '/admin/evaluations/instances/' + encodeURIComponent(instanceId) + '/chat-transcript'
  );
  if (!data || data.error) {
    alert(data?.error || evT('ev_alert_transcript'));
    return;
  }
  renderChatTranscriptModal(data);
  openModal('chat-transcript-overlay');
}

function tenantQuery() {
  const v = document.getElementById('filter-tenant')?.value || '';
  return v ? `?tenantId=${encodeURIComponent(v)}` : '';
}

function showTab(name) {
  document.querySelectorAll('.eval-tab').forEach((b) => {
    b.classList.toggle('eval-tab-active', b.dataset.tab === name);
  });
  document.querySelectorAll('.eval-tab-panel').forEach((p) => {
    p.classList.toggle('is-visible', p.dataset.panel === name);
  });
  paintEvaluationsContextBar();
}

function withSurveyLang(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('lang', getAdminUiLocale());
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pré-visualização no iframe: tem de ser **mesma origem** que esta página.
 * Se usarmos `clientSurveyFullUrl` de outro host/porta (ex.: ADMIN_PANEL_PUBLIC_BASE_URL),
 * o browser bloqueia o iframe (política de frame / origem cruzada).
 */
function showSurveyPreview(url) {
  const wrap = document.getElementById('eval-survey-preview');
  const iframe = document.getElementById('eval-survey-iframe');
  if (!wrap || !iframe || !url) return;
  iframe.src = withSurveyLang(url);
  wrap.hidden = false;
  requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

/** URL do formulário na mesma origem do painel — adequada a iframes (requer token). */
function buildSameOriginSurveyPreviewUrl(publicToken) {
  const o = typeof window !== 'undefined' ? window.location.origin : '';
  if (!publicToken || !o || !/^https?:\/\//i.test(o)) return '';
  return withSurveyLang(`${o}/evaluation-survey.html?token=${encodeURIComponent(publicToken)}`);
}

function hideSurveyPreview() {
  const wrap = document.getElementById('eval-survey-preview');
  const iframe = document.getElementById('eval-survey-iframe');
  if (iframe) iframe.src = 'about:blank';
  if (wrap) wrap.hidden = true;
}

function tplLogoUrlLooksPublic(u) {
  const s = String(u || '').trim();
  return /^https:\/\//i.test(s) || /^http:\/\/localhost/i.test(s) || /^http:\/\/127\.0\.0\.1/i.test(s);
}

function updateTplLogoPreview() {
  const input = document.getElementById('tpl-survey-logo');
  const wrap = document.getElementById('tpl-survey-logo-preview-wrap');
  const img = document.getElementById('tpl-survey-logo-preview-img');
  if (!input || !wrap || !img) return;
  const u = input.value.trim();
  if (tplSurveyLogoPreviewAbort) {
    tplSurveyLogoPreviewAbort.abort();
    tplSurveyLogoPreviewAbort = null;
  }
  if (u && tplLogoUrlLooksPublic(u)) {
    tplSurveyLogoPreviewAbort = new AbortController();
    const { signal } = tplSurveyLogoPreviewAbort;
    img.addEventListener('load', () => { wrap.style.display = 'block'; }, { once: true, signal });
    img.addEventListener('error', () => { wrap.style.display = 'none'; }, { once: true, signal });
    img.src = u;
  } else {
    wrap.style.display = 'none';
    img.removeAttribute('src');
  }
}

function hideTplInlinePreview() {
  const wrap = document.getElementById('tpl-inline-preview-wrap');
  const iframe = document.getElementById('tpl-inline-preview-iframe');
  if (iframe) iframe.src = 'about:blank';
  if (wrap) wrap.hidden = true;
}

function openTemplateSurveyPreviewFromModal() {
  if (!canManageEvaluationTemplates) return;
  const id = document.getElementById('tpl-edit-id')?.value?.trim();
  if (!id) {
    alert(evT('ev_tpl_preview_need_save'));
    return;
  }
  const wrap = document.getElementById('tpl-inline-preview-wrap');
  const iframe = document.getElementById('tpl-inline-preview-iframe');
  if (!wrap || !iframe) return;
  const o = typeof window !== 'undefined' ? window.location.origin : '';
  if (!o || !/^https?:/i.test(o)) return;
  const lang = getAdminUiLocale();
  iframe.src = `${o}/evaluation-survey.html?previewTemplate=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`;
  wrap.hidden = false;
  requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function openModal(overlayId) {
  document.getElementById(overlayId)?.classList.add('is-open');
}
function closeModal(overlayId) {
  document.getElementById(overlayId)?.classList.remove('is-open');
}

function addQuestionRow(q) {
  const wrap = document.getElementById('tpl-questions');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'q-row';
  row.dataset.qid = q?.id || '';
  row.innerHTML = `
    <input type="hidden" class="q-id" value="${esc(q?.id || '')}" />
    <div class="q-row-grid">
      <input type="text" class="form-control q-text" placeholder="${esc(evT('ev_q_placeholder'))}" value="${esc(q?.text || '')}" />
      <select class="form-control q-type">${Q_TYPES.map((t) => `<option value="${t}" ${(q?.type || 'RATING') === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input type="number" class="form-control q-weight" min="0.1" step="0.1" value="${esc(q?.weight ?? 1)}" title="${esc(evT('ev_q_weight_title'))}" />
      <label class="q-req" style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text3);white-space:nowrap"><input type="checkbox" class="q-required" ${q?.required !== false ? 'checked' : ''}/> ${esc(evT('ev_q_required'))}</label>
      <button type="button" class="btn btn-sm q-del" style="color:var(--red)">✕</button>
      <input type="text" class="form-control q-cat" placeholder="${esc(evT('ev_q_cat_placeholder'))}" value="${esc(q?.categoryKey || '')}" />
    </div>
  `;
  row.querySelector('.q-del').onclick = () => row.remove();
  wrap.appendChild(row);
}

function collectQuestions() {
  const rows = document.querySelectorAll('#tpl-questions .q-row');
  const out = [];
  let i = 0;
  rows.forEach((row) => {
    const id = row.querySelector('.q-id')?.value?.trim() || '';
    const text = row.querySelector('.q-text')?.value?.trim() || evT('ev_collect_default_q');
    const type = row.querySelector('.q-type')?.value || 'RATING';
    const weight = Number(row.querySelector('.q-weight')?.value) || 1;
    const required = row.querySelector('.q-required')?.checked !== false;
    const categoryKey = row.querySelector('.q-cat')?.value?.trim() || null;
    out.push({
      ...(id ? { id } : {}),
      text,
      type,
      weight,
      required,
      categoryKey,
      sortOrder: i++,
    });
  });
  return out;
}

function triggerRulesFromForm() {
  const events = [];
  if (document.getElementById('tpl-rule-os-synced')?.checked) events.push('OS_SYNCED');
  return { events };
}

function applyTriggerToForm(rules) {
  const r = rules && typeof rules === 'object' ? rules : {};
  const ev = Array.isArray(r.events) ? r.events.map((e) => String(e).toUpperCase()) : [];
  const cb = document.getElementById('tpl-rule-os-synced');
  if (cb) cb.checked = ev.includes('OS_SYNCED');
}

async function loadTenantsIntoFilter() {
  const tenantSel = document.getElementById('filter-tenant');
  const tplTenant = document.getElementById('tpl-tenant');
  if (!tenantSel) return;
  if (!canCrossTenantEvaluations) {
    tenantSel.closest('.filter-field')?.setAttribute('style', 'display:none');
    if (tplTenant) {
      const singleId = resolvePanelTenantId();
      tplTenant.innerHTML = '';
      if (singleId) {
        let label = singleId.slice(0, 48);
        try {
          const raw = sessionStorage.getItem('brspark_panel_tenant');
          const t = raw ? JSON.parse(raw) : {};
          if (t && (t.name || t.email)) label = String(t.name || t.email).slice(0, 48);
        } catch {
          /* ignore */
        }
        const opt = document.createElement('option');
        opt.value = singleId;
        opt.textContent = label;
        tplTenant.appendChild(opt);
        tplTenant.value = singleId;
      } else {
        tplTenant.innerHTML = `<option value="">${esc(evT('ev_tenant_pick'))}</option>`;
      }
    }
    return;
  }
  const res = await CONFIG.get('/tenants?limit=500');
  const list = res?.data || res || [];
  tenantSel.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
  if (tplTenant) tplTenant.innerHTML = `<option value="">${esc(evT('ev_tenant_pick'))}</option>`;
  for (const t of list) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = (t.name || t.email || t.id).slice(0, 48);
    tenantSel.appendChild(o);
    if (tplTenant) {
      const o2 = o.cloneNode(true);
      tplTenant.appendChild(o2);
    }
  }
}

async function loadAnalytics() {
  const p = new URLSearchParams();
  const tv = document.getElementById('filter-tenant')?.value;
  if (tv) p.set('tenantId', tv);
  const qs = p.toString();
  const url = '/admin/evaluations/analytics' + (qs ? `?${qs}` : '');
  const a = await CONFIG.get(url);
  if (a?.error) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v ?? '—';
  };
  set('st-total', a.counts?.total);
  set('st-pend', a.counts?.pending);
  set('st-avg', a.averageTotalScore != null ? String(a.averageTotalScore) : null);
  set('st-crit', a.counts?.critical);
  set('st-rate', a.responseRatePercent != null ? String(a.responseRatePercent) : null);
  paintEvaluationsContextBar({
    total: a.counts?.total,
    pending: a.counts?.pending,
    average: a.averageTotalScore,
    critical: a.counts?.critical,
    responseRate: a.responseRatePercent,
  });

  const tb = document.getElementById('tbody-ranking');
  if (tb && Array.isArray(a.technicianRanking)) {
    const rows = a.technicianRanking;
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">${esc(evT('ev_no_data_period'))}</td></tr>`;
    } else {
      tb.innerHTML = rows
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${esc(r.email || '—')}</td><td>${esc(r.avgScore)}</td><td>${esc(r.count)}</td></tr>`
        )
        .join('');
    }
  }
}

function paintEvaluationsContextBar(metrics = null) {
  const bar = document.getElementById('ev-context-bar');
  if (!bar) return;
  const tenantLabel = document.getElementById('filter-tenant')?.selectedOptions?.[0]?.textContent || evT('ev_tenant_all');
  const tabKey =
    document.querySelector('.eval-tab.eval-tab-active')?.dataset?.tab || 'resumo';
  const activeTabLabel =
    document.querySelector('.eval-tab.eval-tab-active')?.textContent?.trim() || evT('ev_tab_resumo');
  const total = metrics?.total ?? document.getElementById('st-total')?.textContent ?? '—';
  const pending = metrics?.pending ?? document.getElementById('st-pend')?.textContent ?? '—';
  const average = metrics?.average ?? document.getElementById('st-avg')?.textContent ?? '—';
  const critical = metrics?.critical ?? document.getElementById('st-crit')?.textContent ?? '—';
  const rate = metrics?.responseRate ?? document.getElementById('st-rate')?.textContent ?? '—';

  const focusHint =
    tabKey === 'disputas'
      ? evT('ev_ctx_focus_disputes')
      : tabKey === 'instancias'
        ? evT('ev_ctx_focus_instances')
        : tabKey === 'templates'
          ? evT('ev_ctx_focus_templates')
          : tabKey === 'ranking'
            ? evT('ev_ctx_focus_ranking')
            : evT('ev_ctx_focus_resumo');

  bar.innerHTML = `
    <div class="eval-context-card">
      <div class="eval-context-card__eyebrow">${esc(evT('ev_ctx_eyebrow_scope'))}</div>
      <div class="eval-context-card__title">${esc(tenantLabel)}</div>
      <div class="eval-context-card__meta">${esc(evT('ev_ctx_scope_meta', { tab: activeTabLabel }))}</div>
    </div>
    <div class="eval-context-card">
      <div class="eval-context-card__eyebrow">${esc(evT('ev_ctx_eyebrow_kpis'))}</div>
      <div class="eval-context-card__chips">
        <span class="eval-context-chip">${evT('ev_ctx_chip_total', { n: String(total) })}</span>
        <span class="eval-context-chip">${evT('ev_ctx_chip_pend', { n: String(pending) })}</span>
        <span class="eval-context-chip">${evT('ev_ctx_chip_crit', { n: String(critical) })}</span>
        <span class="eval-context-chip">${evT('ev_ctx_chip_avg', { n: String(average) })}</span>
        <span class="eval-context-chip">${evT('ev_ctx_chip_rate', { n: String(rate) })}</span>
      </div>
    </div>
    <div class="eval-context-card">
      <div class="eval-context-card__eyebrow">${esc(evT('ev_ctx_eyebrow_focus'))}</div>
      <div class="eval-context-card__title">${esc(activeTabLabel)}</div>
      <div class="eval-context-card__meta">${esc(focusHint)}</div>
    </div>`;
}

async function loadDisputes() {
  const st = document.getElementById('dispute-status-filter')?.value || 'PENDING';
  const tv = document.getElementById('filter-tenant')?.value || '';
  const p = new URLSearchParams({ status: st });
  if (tv) p.set('tenantId', tv);
  const d = await CONFIG.get('/admin/evaluations/disputes?' + p.toString());
  const tb = document.getElementById('tbody-disputes');
  const items = d?.items || [];
  if (!tb) return;
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">${esc(evT('ev_no_records'))}</td></tr>`;
    return;
  }
  tb.innerHTML = items
    .map((x) => {
      const tech = esc(x.technician?.email || '');
      const os = esc(x.instance?.execution?.osNumber || '—');
      const score = x.instance?.score?.totalScore;
      const sc = score != null ? esc(evT('ev_note_prefix', { score })) : '';
      const full = esc(x.justification || '');
      return `<tr data-dispute-id="${esc(x.id)}" data-instance-id="${esc(x.instanceId)}">
        <td>
          <div class="list-cell-stack">
            <span class="list-cell-title">${tech || '—'}</span>
            <span class="list-cell-sub">OS ${os}${sc ? ` · ${sc}` : ''}</span>
          </div>
        </td>
        <td>
          <details>
            <summary style="cursor:pointer;color:var(--accent)">${esc(evT('ev_justify_view'))}</summary>
            <div style="margin-top:8px;white-space:pre-wrap">${full}</div>
          </details>
        </td>
        <td class="table-actions"><button type="button" class="btn btn-sm btn-chat-trans">${esc(evT('ev_btn_chat'))}</button></td>
        <td class="text-right table-actions">
          ${canManageEvaluationTemplates
            ? `<button type="button" class="btn btn-sm btn-primary btn-disp" data-a="MAINTAIN_EVAL">${esc(evT('ev_btn_maintain'))}</button>
          <button type="button" class="btn btn-sm btn-disp" data-a="ADJUSTED">${esc(evT('ev_btn_adjust'))}</button>
          <button type="button" class="btn btn-sm btn-disp" style="color:var(--red)" data-a="INVALIDATED">${esc(evT('ev_btn_invalidate'))}</button>`
            : `<span style="color:var(--text3);font-size:12px">—</span>`}
        </td></tr>`;
    })
    .join('');

  tb.querySelectorAll('tr[data-dispute-id] .btn-chat-trans').forEach((btn) => {
    btn.onclick = () => {
      const tr = btn.closest('tr');
      const disputeId = tr?.dataset.disputeId;
      if (disputeId) void openChatTranscriptFromDispute(disputeId);
    };
  });

  tb.querySelectorAll('tr[data-dispute-id] .btn-disp').forEach((btn) => {
    btn.onclick = () => {
      const tr = btn.closest('tr');
      const disputeId = tr?.dataset.disputeId;
      const action = btn.getAttribute('data-a');
      openDisputeModal(disputeId, action);
    };
  });
}

function openDisputeModal(disputeId, action) {
  if (!canManageEvaluationTemplates) return;
  document.getElementById('dispute-modal-id').value = disputeId;
  document.getElementById('dispute-modal-action').value = action;
  const adj = document.getElementById('dispute-adjust-wrap');
  if (adj) adj.style.display = action === 'ADJUSTED' ? 'block' : 'none';
  const title = document.getElementById('dispute-modal-title');
  if (title) {
    title.textContent =
      action === 'MAINTAIN_EVAL'
        ? evT('ev_dispute_title_maintain')
        : action === 'ADJUSTED'
          ? evT('ev_dispute_title_adjust')
          : evT('ev_dispute_title_invalidate');
  }
  document.getElementById('dispute-modal-note').value = '';
  document.getElementById('dispute-modal-score').value = '';
  openModal('dispute-modal-overlay');
}

async function submitDisputeModal() {
  if (!canManageEvaluationTemplates) return;
  const id = document.getElementById('dispute-modal-id').value;
  const action = document.getElementById('dispute-modal-action').value;
  const note = document.getElementById('dispute-modal-note').value.trim();
  const scoreRaw = document.getElementById('dispute-modal-score').value.trim();
  const body = { status: action, resolutionNote: note || evT('ev_resolution_default_note') };
  if (action === 'ADJUSTED') {
    const n = Number(scoreRaw);
    if (!Number.isFinite(n)) {
      alert(evT('ev_alert_adjust_score'));
      return;
    }
    body.adjustedTotalScore = n;
  }
  const res = await CONFIG.patch('/admin/evaluations/disputes/' + encodeURIComponent(id) + '/resolve', body);
  if (res?.error) {
    alert(res.error || evT('ev_alert_err'));
    return;
  }
  closeModal('dispute-modal-overlay');
  loadDisputes();
  loadAnalytics();
}

async function loadInstances() {
  hideSurveyPreview();
  const st = document.getElementById('instance-status-filter')?.value || '';
  const tv = document.getElementById('filter-tenant')?.value || '';
  const p = new URLSearchParams();
  if (tv) p.set('tenantId', tv);
  if (st) p.set('status', st);
  const qs = p.toString();
  const d = await CONFIG.get('/admin/evaluations/instances' + (qs ? `?${qs}` : ''));
  const tb = document.getElementById('tbody-inst');
  const items = d?.items || [];
  const origin = window.location.origin;
  if (!tb) return;
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">${esc(evT('ev_no_instances'))}</td></tr>`;
    return;
  }
  tb.innerHTML = items
    .map((x) => {
      const hrefRaw =
        x.clientSurveyFullUrl ||
        (x.publicToken ? `${origin}/evaluation-survey.html?token=${encodeURIComponent(x.publicToken)}` : '');
      const href = hrefRaw ? withSurveyLang(hrefRaw) : '';
      const enc = href ? encodeURIComponent(href) : '';
      const previewUrl = x.publicToken ? buildSameOriginSurveyPreviewUrl(x.publicToken) : '';
      const encPreview = previewUrl ? encodeURIComponent(previewUrl) : '';
      const urlCell = href
        ? `<input type="text" readonly class="form-control inst-url-input" value="${esc(href)}" aria-label="${esc(evT('ev_th_url'))}" />
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <a class="btn btn-sm btn-primary" href="${esc(href)}" target="_blank" rel="noopener">${esc(evT('ev_btn_open'))}</a>
            <button type="button" class="btn btn-sm btn-survey-copy" data-enc="${enc}">${esc(evT('ev_btn_copy_url'))}</button>
            <button type="button" class="btn btn-sm btn-survey-preview" data-preview="${encPreview}" ${!encPreview ? 'disabled' : ''}>${esc(evT('ev_btn_preview'))}</button>
          </div>`
        : '<span style="color:var(--text3)">—</span>';
      const regen =
        x.status === 'PENDING' && canManageEvaluationTemplates
          ? `<button type="button" class="btn btn-sm" data-regen="${esc(x.id)}">${esc(evT('ev_btn_regen'))}</button>`
          : '—';
      const clientMail = (x.clientEmailGuess && String(x.clientEmailGuess).trim()) || '';
      const clientCell = clientMail
        ? `<span class="list-cell-title" style="font-size:13px">${esc(clientMail)}</span>`
        : `<span style="color:var(--text3);font-size:12px">${esc(evT('ev_client_email_unknown'))}</span>`;
      const canNotify = x.status === 'PENDING' && href && canManageEvaluationTemplates;
      const notifyBtn = canNotify
        ? `<button type="button" class="btn btn-sm btn-primary btn-notify-invite" data-nid="${esc(x.id)}" data-em="${encodeURIComponent(clientMail)}" data-os="${esc(x.osNumber || '')}" data-tpl="${esc(x.templateName || '')}">${esc(evT('ev_btn_send_invite'))}</button>`
        : '';
      return `<tr data-instance-id="${esc(x.id)}">
        <td>
          <div class="list-cell-stack">
            <span class="list-cell-title">${esc(x.templateName)}</span>
            <span class="list-cell-sub">${esc(x.technicianEmail)} · OS ${esc(x.osNumber || '—')}</span>
          </div>
        </td>
        <td>${clientCell}</td>
        <td><span class="badge ${instanceBadgeClass(x.status)}">${esc(instanceStatusLabel(x.status))}</span></td>
        <td>${urlCell}</td>
        <td class="table-actions">${regen}</td>
        <td class="text-right table-actions" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${notifyBtn}<button type="button" class="btn btn-sm btn-inst-chat">${esc(evT('ev_btn_chat'))}</button></td>
      </tr>`;
    })
    .join('');
  tb.querySelectorAll('button[data-regen]').forEach((btn) => {
    btn.onclick = async () => {
      if (!canManageEvaluationTemplates) return;
      await CONFIG.post('/admin/evaluations/instances/' + btn.getAttribute('data-regen') + '/regenerate-token', {});
      loadInstances();
    };
  });

  tb.querySelectorAll('.btn-notify-invite').forEach((btn) => {
    btn.onclick = () => {
      if (!canManageEvaluationTemplates) return;
      const rawEm = btn.getAttribute('data-em') || '';
      let em = '';
      try {
        em = rawEm ? decodeURIComponent(rawEm) : '';
      } catch {
        em = rawEm;
      }
      openNotifyModal({
        instanceId: btn.getAttribute('data-nid') || '',
        clientEmailGuess: em,
        osLabel: btn.getAttribute('data-os') || '',
        templateName: btn.getAttribute('data-tpl') || '',
      });
    };
  });
}

function openNotifyModal(ctx) {
  lastNotifyContext = {
    instanceId: ctx.instanceId || '',
    clientEmailGuess: ctx.clientEmailGuess || '',
    osLabel: ctx.osLabel || '',
    templateName: ctx.templateName || '',
  };
  document.getElementById('notify-modal-instance-id').value = lastNotifyContext.instanceId;
  const emailIn = document.getElementById('notify-email-override');
  if (emailIn) emailIn.value = lastNotifyContext.clientEmailGuess;
  const meta = document.getElementById('notify-modal-meta');
  if (meta) {
    meta.textContent = evT('ev_notify_meta', {
      tpl: lastNotifyContext.templateName || '—',
      os: lastNotifyContext.osLabel || '—',
    });
  }
  const hint = document.getElementById('notify-email-hint');
  if (hint) {
    hint.textContent = lastNotifyContext.clientEmailGuess
      ? evT('ev_notify_email_detected')
      : evT('ev_notify_email_missing');
  }
  const foot = document.getElementById('notify-modal-foot');
  if (foot) foot.textContent = evT('ev_notify_foot_hint');
  const chE = document.getElementById('notify-ch-email');
  const chP = document.getElementById('notify-ch-push');
  if (chE) chE.checked = true;
  if (chP) chP.checked = false;
  openModal('notify-modal-overlay');
}

async function submitNotifyModal() {
  if (!canManageEvaluationTemplates) return;
  const id = document.getElementById('notify-modal-instance-id')?.value?.trim();
  if (!id) return;
  const emailTo = document.getElementById('notify-email-override')?.value?.trim() || '';
  const channels = [];
  if (document.getElementById('notify-ch-email')?.checked) channels.push('email');
  if (document.getElementById('notify-ch-push')?.checked) channels.push('push');
  if (!channels.length) {
    alert(evT('ev_notify_need_channel'));
    return;
  }
  const body = { channels, ...(emailTo ? { emailTo } : {}) };
  const res = await CONFIG.post('/admin/evaluations/instances/' + encodeURIComponent(id) + '/notify', body);
  if (res?.error) {
    alert(res.error);
    return;
  }
  closeModal('notify-modal-overlay');
  const r = res?.results || {};
  const parts = [];
  if (r.email?.ok) parts.push(evT('ev_notify_ok_email'));
  if (r.push?.ok) parts.push(evT('ev_notify_ok_push'));
  if (r.push?.skipped && r.push?.reason) parts.push(evT('ev_notify_push_skip', { reason: r.push.reason }));
  alert(parts.length ? parts.join('\n\n') : evT('ev_notify_ok_generic'));
  loadInstances();
}

async function loadTemplatesTable() {
  const url = '/admin/evaluations/templates' + tenantQuery();
  const rows = await CONFIG.get(url);
  const tb = document.getElementById('tbody-tpl');
  const list = Array.isArray(rows) ? rows : [];
  if (!tb) return;
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">${esc(evT('ev_no_templates'))}</td></tr>`;
    return;
  }
  tb.innerHTML = list
    .map(
      (t) =>
        `<tr>
      <td>
        <div class="list-cell-stack">
          <span class="list-cell-title">${esc(t.name)}</span>
          <span class="list-cell-sub">${esc(t.tenant?.name || t.tenantId || '—')}</span>
        </div>
      </td>
      <td>${esc(t.type)}</td>
      <td class="table-num">${esc(t._count?.questions)}</td>
      <td class="table-num">${esc(t._count?.instances)}</td>
      <td><span class="badge ${t.active ? 'badge-green' : 'badge-gray'}">${t.active ? 'Ativo' : 'Inativo'}</span></td>
      <td class="text-right table-actions">
        ${canManageEvaluationTemplates
          ? `<button type="button" class="btn btn-sm btn-primary btn-edit-tpl" data-id="${esc(t.id)}">${esc(evT('ev_btn_edit'))}</button>`
          : `<span style="color:var(--text3);font-size:12px">—</span>`}
      </td>
    </tr>`
    )
    .join('');
  tb.querySelectorAll('.btn-edit-tpl').forEach((btn) => {
    btn.onclick = () => openTemplateModal(btn.getAttribute('data-id'));
  });
}

async function openTemplateModal(id) {
  if (!canManageEvaluationTemplates) return;
  document.getElementById('tpl-questions').innerHTML = '';
  const tenantSel = document.getElementById('tpl-tenant');
  const title = document.getElementById('tpl-modal-title');
  if (id) {
    const t = await CONFIG.get('/admin/evaluations/templates/' + encodeURIComponent(id));
    if (t?.error) {
      alert(t.error);
      return;
    }
    title.textContent = evT('ev_tpl_title_edit');
    document.getElementById('tpl-edit-id').value = t.id;
    document.getElementById('tpl-name').value = t.name || '';
    document.getElementById('tpl-type').value = t.type || 'CLIENT';
    document.getElementById('tpl-active').checked = !!t.active;
    if (tenantSel) {
      tenantSel.value = t.tenantId || '';
      tenantSel.disabled = true;
    }
    applyTriggerToForm(t.triggerRules);
    (t.questions || []).forEach((q) => addQuestionRow(q));
    document.getElementById('tpl-instances-hint').textContent =
      t._count?.instances > 0 ? evT('ev_tpl_instances_hint', { n: t._count.instances }) : '';
    const logoIn = document.getElementById('tpl-survey-logo');
    const preIn = document.getElementById('tpl-msg-pre');
    const postIn = document.getElementById('tpl-msg-post');
    if (logoIn) logoIn.value = t.surveyLogoUrl || '';
    if (preIn) preIn.value = t.surveyMessagePre || '';
    if (postIn) postIn.value = t.surveyMessagePost || '';
    updateTplLogoPreview();
    hideTplInlinePreview();
  } else {
    title.textContent = evT('ev_tpl_title_new');
    document.getElementById('tpl-edit-id').value = '';
    document.getElementById('tpl-name').value = '';
    document.getElementById('tpl-type').value = 'CLIENT';
    document.getElementById('tpl-active').checked = true;
    applyTriggerToForm({ events: ['OS_SYNCED'] });
    if (tenantSel) {
      tenantSel.disabled = false;
      const ft = document.getElementById('filter-tenant')?.value;
      if (ft) tenantSel.value = ft;
      else if (!canCrossTenantEvaluations) {
        const tid = resolvePanelTenantId();
        if (tid) tenantSel.value = tid;
      }
      if (!canCrossTenantEvaluations && resolvePanelTenantId()) {
        tenantSel.disabled = true;
      }
    }
    document.getElementById('tpl-instances-hint').textContent = '';
    const logoIn = document.getElementById('tpl-survey-logo');
    const preIn = document.getElementById('tpl-msg-pre');
    const postIn = document.getElementById('tpl-msg-post');
    if (logoIn) logoIn.value = '';
    if (preIn) preIn.value = '';
    if (postIn) postIn.value = '';
    updateTplLogoPreview();
    hideTplInlinePreview();
    addQuestionRow({ text: evT('ev_default_q1'), type: 'RATING', categoryKey: 'qualidade', weight: 1 });
    addQuestionRow({ text: evT('ev_default_q2'), type: 'RATING', categoryKey: 'prazo', weight: 1 });
    addQuestionRow({ text: evT('ev_default_q3'), type: 'RATING', categoryKey: 'atendimento', weight: 1 });
  }
  openModal('tpl-modal-overlay');
}

async function saveTemplateModal() {
  if (!canManageEvaluationTemplates) return;
  const editId = document.getElementById('tpl-edit-id').value.trim();
  const name = document.getElementById('tpl-name').value.trim();
  const type = document.getElementById('tpl-type').value;
  const active = document.getElementById('tpl-active').checked;
  let tenantId = document.getElementById('tpl-tenant')?.value?.trim() || '';
  if (!editId && !tenantId) {
    tenantId = resolvePanelTenantId() || '';
  }
  const questions = collectQuestions();
  if (!name) {
    alert(evT('ev_alert_name_tpl'));
    return;
  }
  if (!editId && !tenantId) {
    alert(evT('ev_alert_tenant'));
    return;
  }
  if (!questions.length) {
    alert(evT('ev_alert_questions'));
    return;
  }
  const triggerRules = triggerRulesFromForm();
  const surveyLogoUrl = document.getElementById('tpl-survey-logo')?.value?.trim() ?? '';
  const surveyMessagePre = document.getElementById('tpl-msg-pre')?.value ?? '';
  const surveyMessagePost = document.getElementById('tpl-msg-post')?.value ?? '';
  if (editId) {
    const res = await CONFIG.patch('/admin/evaluations/templates/' + encodeURIComponent(editId), {
      name,
      active,
      triggerRules,
      questions,
      surveyLogoUrl,
      surveyMessagePre,
      surveyMessagePost,
    });
    if (res?.error) {
      alert(res.error);
      return;
    }
  } else {
    const res = await CONFIG.post('/admin/evaluations/templates', {
      tenantId,
      name,
      type,
      active,
      triggerRules,
      questions,
      surveyLogoUrl,
      surveyMessagePre,
      surveyMessagePost,
    });
    if (res?.error) {
      alert(res.error);
      return;
    }
  }
  closeModal('tpl-modal-overlay');
  loadTemplatesTable();
  loadAnalytics();
}

async function refreshAll() {
  await Promise.all([loadAnalytics(), loadDisputes(), loadInstances(), loadTemplatesTable()]);
}

export async function bootEvaluationsPage() {
  applyEvaluationsStaticI18n();
  await initPage();
  await loadTenantsIntoFilter();

  document.querySelectorAll('.eval-tab').forEach((b) => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });
  document.getElementById('btn-refresh')?.addEventListener('click', refreshAll);
  document.getElementById('filter-tenant')?.addEventListener('change', refreshAll);
  document.getElementById('dispute-status-filter')?.addEventListener('change', loadDisputes);
  document.getElementById('instance-status-filter')?.addEventListener('change', loadInstances);

  document.getElementById('btn-new-template')?.addEventListener('click', () => openTemplateModal(null));
  document.getElementById('btn-new-template')?.toggleAttribute('hidden', !canManageEvaluationTemplates);
  document.getElementById('tpl-add-question')?.addEventListener('click', () => {
    if (!canManageEvaluationTemplates) return;
    addQuestionRow({ type: 'RATING' });
  });
  document.getElementById('tpl-modal-save')?.addEventListener('click', saveTemplateModal);
  document.getElementById('tpl-survey-logo')?.addEventListener('input', updateTplLogoPreview);
  document.getElementById('btn-tpl-preview-survey')?.addEventListener('click', () => {
    if (!canManageEvaluationTemplates) return;
    openTemplateSurveyPreviewFromModal();
  });
  document.getElementById('tpl-modal-cancel')?.addEventListener('click', () => closeModal('tpl-modal-overlay'));
  document.getElementById('tpl-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'tpl-modal-overlay') closeModal('tpl-modal-overlay');
  });

  document.getElementById('dispute-modal-cancel')?.addEventListener('click', () => closeModal('dispute-modal-overlay'));
  document.getElementById('dispute-modal-confirm')?.addEventListener('click', submitDisputeModal);
  document.getElementById('dispute-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'dispute-modal-overlay') closeModal('dispute-modal-overlay');
  });

  document.getElementById('chat-transcript-close')?.addEventListener('click', () => closeModal('chat-transcript-overlay'));
  document.getElementById('chat-transcript-json')?.addEventListener('click', downloadChatTranscriptJson);
  document.getElementById('chat-transcript-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'chat-transcript-overlay') closeModal('chat-transcript-overlay');
  });

  document.getElementById('tbody-inst')?.addEventListener('click', (e) => {
    const chatInst = e.target.closest('.btn-inst-chat');
    if (chatInst) {
      const tr = chatInst.closest('tr');
      const iid = tr?.dataset.instanceId;
      if (iid) void openChatTranscriptFromInstance(iid);
      return;
    }
    const copyBtn = e.target.closest('.btn-survey-copy');
    const prevBtn = e.target.closest('.btn-survey-preview');
    if (copyBtn?.getAttribute('data-enc')) {
      const u = decodeURIComponent(copyBtn.getAttribute('data-enc'));
      navigator.clipboard.writeText(u).then(
        () => {
          const t = copyBtn.textContent;
          copyBtn.textContent = evT('ev_copied');
          setTimeout(() => {
            copyBtn.textContent = t;
          }, 1600);
        },
        () => alert(evT('ev_alert_copy_fail'))
      );
      return;
    }
    const prevEnc = prevBtn?.getAttribute('data-preview');
    if (prevBtn && prevEnc) {
      showSurveyPreview(decodeURIComponent(prevEnc));
    }
  });

  document.getElementById('eval-survey-preview-close')?.addEventListener('click', hideSurveyPreview);

  document.getElementById('notify-modal-cancel')?.addEventListener('click', () => closeModal('notify-modal-overlay'));
  document.getElementById('notify-modal-send')?.addEventListener('click', () => void submitNotifyModal());
  document.getElementById('notify-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'notify-modal-overlay') closeModal('notify-modal-overlay');
  });

  showTab('resumo');
  await refreshAll();
}
