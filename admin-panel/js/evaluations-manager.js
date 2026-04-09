/**
 * Painel Qualidade — Avaliações: KPIs, disputas, instâncias, templates, ranking.
 */
import { initPage } from './sidebar.js';
import { CONFIG } from './config.js';

const Q_TYPES = ['RATING', 'NPS', 'BOOLEAN', 'TEXT', 'MULTIPLE_CHOICE'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
}

function showSurveyPreview(url) {
  const wrap = document.getElementById('eval-survey-preview');
  const iframe = document.getElementById('eval-survey-iframe');
  if (!wrap || !iframe || !url) return;
  iframe.src = url;
  wrap.hidden = false;
  requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function hideSurveyPreview() {
  const wrap = document.getElementById('eval-survey-preview');
  const iframe = document.getElementById('eval-survey-iframe');
  if (iframe) iframe.src = 'about:blank';
  if (wrap) wrap.hidden = true;
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
      <input type="text" class="form-control q-text" placeholder="Texto da pergunta" value="${esc(q?.text || '')}" />
      <select class="form-control q-type">${Q_TYPES.map((t) => `<option value="${t}" ${(q?.type || 'RATING') === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input type="number" class="form-control q-weight" min="0.1" step="0.1" value="${esc(q?.weight ?? 1)}" title="Peso" />
      <label class="q-req" style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text3);white-space:nowrap"><input type="checkbox" class="q-required" ${q?.required !== false ? 'checked' : ''}/> obrig.</label>
      <button type="button" class="btn btn-sm q-del" style="color:var(--red)">✕</button>
      <input type="text" class="form-control q-cat" placeholder="categoryKey (ex.: qualidade, prazo) — usado na média por categoria" value="${esc(q?.categoryKey || '')}" />
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
    const text = row.querySelector('.q-text')?.value?.trim() || 'Pergunta';
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
  const res = await CONFIG.get('/tenants?limit=500');
  const list = res?.data || res || [];
  tenantSel.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
  if (tplTenant) tplTenant.innerHTML = '<option value="">— Escolha o tenant —</option>';
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

  const tb = document.getElementById('tbody-ranking');
  if (tb && Array.isArray(a.technicianRanking)) {
    const rows = a.technicianRanking;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">Sem dados no período.</td></tr>';
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
    tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">Nenhum registo.</td></tr>';
    return;
  }
  tb.innerHTML = items
    .map((x) => {
      const tech = esc(x.technician?.email || '');
      const os = esc(x.instance?.execution?.osNumber || '—');
      const score = x.instance?.score?.totalScore;
      const sc = score != null ? ` <small style="color:var(--text3)">(nota ${esc(score)})</small>` : '';
      const full = esc(x.justification || '');
      return `<tr data-dispute-id="${esc(x.id)}" data-instance-id="${esc(x.instanceId)}">
        <td>${tech}</td><td>${os}${sc}</td>
        <td style="max-width:400px"><details><summary style="cursor:pointer;color:var(--accent)">Ver justificativa</summary><div style="margin-top:8px;white-space:pre-wrap;font-size:12px;color:var(--text2)">${full}</div></details></td>
        <td style="text-align:right;white-space:nowrap">
          <button type="button" class="btn btn-sm btn-primary btn-disp" data-a="MAINTAIN_EVAL">Manter</button>
          <button type="button" class="btn btn-sm btn-disp" data-a="ADJUSTED">Ajustar nota</button>
          <button type="button" class="btn btn-sm btn-disp" style="color:var(--red)" data-a="INVALIDATED">Invalidar</button>
        </td></tr>`;
    })
    .join('');

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
  document.getElementById('dispute-modal-id').value = disputeId;
  document.getElementById('dispute-modal-action').value = action;
  const adj = document.getElementById('dispute-adjust-wrap');
  if (adj) adj.style.display = action === 'ADJUSTED' ? 'block' : 'none';
  const title = document.getElementById('dispute-modal-title');
  if (title) {
    title.textContent =
      action === 'MAINTAIN_EVAL'
        ? 'Manter avaliação'
        : action === 'ADJUSTED'
          ? 'Ajustar nota global'
          : 'Invalidar avaliação';
  }
  document.getElementById('dispute-modal-note').value = '';
  document.getElementById('dispute-modal-score').value = '';
  openModal('dispute-modal-overlay');
}

async function submitDisputeModal() {
  const id = document.getElementById('dispute-modal-id').value;
  const action = document.getElementById('dispute-modal-action').value;
  const note = document.getElementById('dispute-modal-note').value.trim();
  const scoreRaw = document.getElementById('dispute-modal-score').value.trim();
  const body = { status: action, resolutionNote: note || 'Painel qualidade' };
  if (action === 'ADJUSTED') {
    const n = Number(scoreRaw);
    if (!Number.isFinite(n)) {
      alert('Indique uma nota numérica para ajuste.');
      return;
    }
    body.adjustedTotalScore = n;
  }
  const res = await CONFIG.patch('/admin/evaluations/disputes/' + encodeURIComponent(id) + '/resolve', body);
  if (res?.error) {
    alert(res.error || 'Erro');
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
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sem instâncias.</td></tr>';
    return;
  }
  tb.innerHTML = items
    .map((x) => {
      const href =
        x.clientSurveyFullUrl ||
        (x.publicToken ? `${origin}/evaluation-survey.html?token=${encodeURIComponent(x.publicToken)}` : '');
      const enc = href ? encodeURIComponent(href) : '';
      const urlCell = href
        ? `<input type="text" readonly class="form-control inst-url-input" value="${esc(href)}" aria-label="URL do formulário web" />
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <a class="btn btn-sm btn-primary" href="${esc(href)}" target="_blank" rel="noopener">Abrir</a>
            <button type="button" class="btn btn-sm btn-survey-copy" data-enc="${enc}">Copiar URL</button>
            <button type="button" class="btn btn-sm btn-survey-preview" data-enc="${enc}">Pré-visualizar</button>
          </div>`
        : '<span style="color:var(--text3)">—</span>';
      const regen =
        x.status === 'PENDING'
          ? `<button type="button" class="btn btn-sm" data-regen="${esc(x.id)}">Novo token</button>`
          : '—';
      return `<tr><td>${esc(x.status)}</td><td>${esc(x.templateName)}</td><td>${esc(x.technicianEmail)}</td><td>${esc(x.osNumber || '—')}</td><td style="min-width:260px;max-width:420px">${urlCell}</td><td style="text-align:right;white-space:nowrap">${regen}</td></tr>`;
    })
    .join('');
  tb.querySelectorAll('button[data-regen]').forEach((btn) => {
    btn.onclick = async () => {
      await CONFIG.post('/admin/evaluations/instances/' + btn.getAttribute('data-regen') + '/regenerate-token', {});
      loadInstances();
    };
  });
}

async function loadTemplatesTable() {
  const url = '/admin/evaluations/templates' + tenantQuery();
  const rows = await CONFIG.get(url);
  const tb = document.getElementById('tbody-tpl');
  const list = Array.isArray(rows) ? rows : [];
  if (!tb) return;
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sem templates.</td></tr>';
    return;
  }
  tb.innerHTML = list
    .map(
      (t) =>
        `<tr>
      <td>${esc(t.name)}</td>
      <td>${esc(t.type)}</td>
      <td>${esc(t.tenant?.name || t.tenantId)}</td>
      <td>${esc(t._count?.questions)}</td>
      <td>${esc(t._count?.instances)}</td>
      <td style="text-align:right;white-space:nowrap">
        <button type="button" class="btn btn-sm btn-primary btn-edit-tpl" data-id="${esc(t.id)}">Editar</button>
      </td>
    </tr>`
    )
    .join('');
  tb.querySelectorAll('.btn-edit-tpl').forEach((btn) => {
    btn.onclick = () => openTemplateModal(btn.getAttribute('data-id'));
  });
}

async function openTemplateModal(id) {
  document.getElementById('tpl-questions').innerHTML = '';
  const tenantSel = document.getElementById('tpl-tenant');
  const title = document.getElementById('tpl-modal-title');
  if (id) {
    const t = await CONFIG.get('/admin/evaluations/templates/' + encodeURIComponent(id));
    if (t?.error) {
      alert(t.error);
      return;
    }
    title.textContent = 'Editar template';
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
      t._count?.instances > 0
        ? `Este template tem ${t._count.instances} instância(s). Não pode remover perguntas já respondidas.`
        : '';
  } else {
    title.textContent = 'Novo template';
    document.getElementById('tpl-edit-id').value = '';
    document.getElementById('tpl-name').value = '';
    document.getElementById('tpl-type').value = 'CLIENT';
    document.getElementById('tpl-active').checked = true;
    applyTriggerToForm({ events: ['OS_SYNCED'] });
    if (tenantSel) {
      tenantSel.disabled = false;
      const ft = document.getElementById('filter-tenant')?.value;
      if (ft) tenantSel.value = ft;
    }
    document.getElementById('tpl-instances-hint').textContent = '';
    addQuestionRow({ text: 'Qualidade do serviço', type: 'RATING', categoryKey: 'qualidade', weight: 1 });
    addQuestionRow({ text: 'Cumprimento de prazos', type: 'RATING', categoryKey: 'prazo', weight: 1 });
    addQuestionRow({ text: 'Atendimento', type: 'RATING', categoryKey: 'atendimento', weight: 1 });
  }
  openModal('tpl-modal-overlay');
}

async function saveTemplateModal() {
  const editId = document.getElementById('tpl-edit-id').value.trim();
  const name = document.getElementById('tpl-name').value.trim();
  const type = document.getElementById('tpl-type').value;
  const active = document.getElementById('tpl-active').checked;
  const tenantId = document.getElementById('tpl-tenant')?.value;
  const questions = collectQuestions();
  if (!name) {
    alert('Indique o nome do template.');
    return;
  }
  if (!editId && !tenantId) {
    alert('Escolha o tenant.');
    return;
  }
  if (!questions.length) {
    alert('Adicione pelo menos uma pergunta.');
    return;
  }
  const triggerRules = triggerRulesFromForm();
  if (editId) {
    const res = await CONFIG.patch('/admin/evaluations/templates/' + encodeURIComponent(editId), {
      name,
      active,
      triggerRules,
      questions,
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
  document.getElementById('tpl-add-question')?.addEventListener('click', () => addQuestionRow({ type: 'RATING' }));
  document.getElementById('tpl-modal-save')?.addEventListener('click', saveTemplateModal);
  document.getElementById('tpl-modal-cancel')?.addEventListener('click', () => closeModal('tpl-modal-overlay'));
  document.getElementById('tpl-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'tpl-modal-overlay') closeModal('tpl-modal-overlay');
  });

  document.getElementById('dispute-modal-cancel')?.addEventListener('click', () => closeModal('dispute-modal-overlay'));
  document.getElementById('dispute-modal-confirm')?.addEventListener('click', submitDisputeModal);
  document.getElementById('dispute-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'dispute-modal-overlay') closeModal('dispute-modal-overlay');
  });

  document.getElementById('tbody-inst')?.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-survey-copy');
    const prevBtn = e.target.closest('.btn-survey-preview');
    if (copyBtn?.getAttribute('data-enc')) {
      const u = decodeURIComponent(copyBtn.getAttribute('data-enc'));
      navigator.clipboard.writeText(u).then(
        () => {
          const t = copyBtn.textContent;
          copyBtn.textContent = 'Copiado!';
          setTimeout(() => {
            copyBtn.textContent = t;
          }, 1600);
        },
        () => alert('Não foi possível copiar automaticamente. Selecione o texto na caixa acima e use Ctrl+C / ⌘C.')
      );
      return;
    }
    if (prevBtn?.getAttribute('data-enc')) {
      showSurveyPreview(decodeURIComponent(prevBtn.getAttribute('data-enc')));
    }
  });

  document.getElementById('eval-survey-preview-close')?.addEventListener('click', hideSurveyPreview);

  showTab('resumo');
  await refreshAll();
}
