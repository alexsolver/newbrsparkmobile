import { initPage } from './sidebar.js';
import { CONFIG } from './config.js';
import { getAdminUiLocale } from './user-pages-i18n.js';
import { cockpitT, applyCockpitStaticI18n } from './cockpit-i18n.js';

await initPage();
applyCockpitStaticI18n();

const timeLocale = () => (getAdminUiLocale() === 'en-US' ? 'en-US' : 'pt-BR');

// ── Chart.js Setup (Datadog Theme) ────────────────────────────────────────────
const ctx = document.getElementById('liveChart').getContext('2d');

const gradientBlue = ctx.createLinearGradient(0, 0, 0, 200);
gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.05)');

const chartConfig = {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: cockpitT('cp_chart_dataset'),
        data: [],
        borderColor: '#3b82f6',
        backgroundColor: gradientBlue,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.3,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false, color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 9 } } },
      y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 9 } } },
    },
    animation: { duration: 0 },
  },
};

const liveChart = new Chart(ctx, chartConfig);
const historyWindow = 30;

let lastPayloadTotal = 0;
let lastCockpitData = null;
let lastCockpitAt = null;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatUptimeSeconds(up) {
  const n = Number(up) || 0;
  let upStr = `${n}s`;
  if (n > 60) upStr = `${Math.floor(n / 60)}m ${n % 60}s`;
  if (n > 3600) upStr = `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
  return upStr;
}

const MODAL_TITLE_KEYS = {
  'board-total': 'cp_ct_total',
  'board-pending': 'cp_ct_pending',
  'board-progress': 'cp_ct_progress',
  'board-completed': 'cp_ct_completed',
  'board-cancelled': 'cp_ct_cancelled',
  'board-errors': 'cp_ct_errors',
  'net-rpm': 'cp_ct_rpm',
  'net-volume': 'cp_ct_volume',
  'net-failures': 'cp_ct_failures',
  'net-uptime': 'cp_ct_uptime',
  integ: 'cp_ct_integ',
  storage: 'cp_ct_storage',
  'fsm-devices': 'cp_ct_devices',
  'fsm-queue': 'cp_ct_queue',
  'fsm-done': 'cp_ct_done',
};

function modalRow(label, value, focus) {
  const f = focus ? ' cp-modal-row--focus' : '';
  return `<div class="cp-modal-row${f}"><span class="cp-modal-k">${escapeHtml(label)}</span><span class="cp-modal-v">${escapeHtml(value)}</span></div>`;
}

function storageHealthLabel(health) {
  const hk =
    { ok: 'cp_storage_ok', warning: 'cp_storage_warn', error: 'cp_storage_err', none: 'cp_storage_none' }[health] ||
    'cp_storage_none';
  return cockpitT(hk);
}

function buildModalBody(key, d) {
  const ob = d.operationsBoard || {};
  const mem = d.memory || {};
  const db = d.database || {};
  const snap = d.integrationSnapshot || {};
  const ig = snap.integrations || {};
  const cs = snap.cloudStorage || {};

  const bh = {
    'board-total': 'total',
    'board-pending': 'pending',
    'board-progress': 'progress',
    'board-completed': 'completed',
    'board-cancelled': 'cancelled',
    'board-errors': 'errors',
  }[key];

  if (bh) {
    return [
      modalRow(cockpitT('cp_ml_board_total'), String(ob.total ?? '—'), bh === 'total'),
      modalRow(cockpitT('cp_ml_board_pending'), String(ob.pending ?? '—'), bh === 'pending'),
      modalRow(cockpitT('cp_ml_board_progress'), String(ob.progress ?? '—'), bh === 'progress'),
      modalRow(cockpitT('cp_ml_board_completed'), String(ob.completed ?? '—'), bh === 'completed'),
      modalRow(cockpitT('cp_ml_board_cancelled'), String(ob.cancelled ?? '—'), bh === 'cancelled'),
      modalRow(cockpitT('cp_ml_board_errors'), String(ob.errors ?? '—'), bh === 'errors'),
    ].join('');
  }

  if (key === 'net-rpm') {
    const kb = parseFloat(mem.payloadSizeTotalKB) || 0;
    return [
      modalRow(cockpitT('cp_ml_net_sync_attempts'), String(mem.syncAttempts ?? '—'), true),
      modalRow(cockpitT('cp_ml_net_sync_success'), String(mem.syncSuccess ?? '—'), false),
      modalRow(cockpitT('cp_ml_net_failure_rate'), `${mem.failureRate ?? '0'}%`, false),
      modalRow(cockpitT('cp_ml_net_payload_kb'), String(mem.payloadSizeTotalKB ?? '—'), false),
      modalRow(cockpitT('cp_ml_net_payload_mb'), `${(kb / 1024).toFixed(3)}`, false),
      modalRow(cockpitT('cp_ml_net_active_devices'), String(mem.activeDevicesCount ?? '—'), false),
    ].join('');
  }

  if (key === 'net-volume') {
    const kb = parseFloat(mem.payloadSizeTotalKB) || 0;
    return [
      modalRow(cockpitT('cp_ml_net_payload_mb'), `${(kb / 1024).toFixed(3)}`, true),
      modalRow(cockpitT('cp_ml_net_payload_kb'), String(mem.payloadSizeTotalKB ?? '—'), false),
      modalRow(cockpitT('cp_ml_net_sync_attempts'), String(mem.syncAttempts ?? '—'), false),
    ].join('');
  }

  if (key === 'net-failures') {
    const errs = Array.isArray(mem.lastErrors) ? mem.lastErrors : [];
    const errBlock =
      errs.length > 0
        ? `<pre class="cp-modal-pre">${escapeHtml(JSON.stringify(errs, null, 2))}</pre>`
        : `<p class="cp-modal-empty">${escapeHtml(cockpitT('cp_modal_no_errors'))}</p>`;
    return [
      modalRow(cockpitT('cp_ml_net_sync_attempts'), String(mem.syncAttempts ?? '—'), false),
      modalRow(cockpitT('cp_ml_net_sync_success'), String(mem.syncSuccess ?? '—'), false),
      modalRow(cockpitT('cp_ml_net_failure_rate'), `${mem.failureRate ?? '0'}%`, true),
      `<p class="cp-modal-k" style="margin:10px 0 6px">${escapeHtml(cockpitT('cp_ml_net_last_errors'))}</p>`,
      errBlock,
    ].join('');
  }

  if (key === 'net-uptime') {
    const ts = d.timestamp ? new Date(d.timestamp).toLocaleString(timeLocale()) : '—';
    return [
      modalRow(cockpitT('cp_ml_uptime'), formatUptimeSeconds(d.uptimeSeconds), true),
      modalRow(cockpitT('cp_ml_ts'), ts, false),
    ].join('');
  }

  if (key === 'integ') {
    return [
      modalRow(cockpitT('cp_ml_integ_active'), String(ig.active ?? '—'), false),
      modalRow(cockpitT('cp_ml_integ_total'), String(ig.total ?? '—'), false),
      modalRow(cockpitT('cp_ml_integ_issues'), String(ig.errorOrDisconnected ?? '—'), true),
    ].join('');
  }

  if (key === 'storage') {
    const tested = cs.lastTestedAt ? new Date(cs.lastTestedAt).toLocaleString(timeLocale()) : '—';
    return [
      modalRow(cockpitT('cp_ml_st_health'), storageHealthLabel(cs.health), true),
      modalRow(cockpitT('cp_ml_st_providers'), String(cs.providers ?? '—'), false),
      modalRow(cockpitT('cp_ml_st_active_ok'), String(cs.activeOk ?? '—'), false),
      modalRow(cockpitT('cp_ml_st_issues'), String(cs.issues ?? '—'), false),
      modalRow(cockpitT('cp_ml_st_last'), tested, false),
    ].join('');
  }

  const fsmHl = {
    'fsm-devices': 'onDevices',
    'fsm-queue': 'pending',
    'fsm-done': 'hist',
  }[key];
  if (fsmHl) {
    return [
      modalRow(cockpitT('cp_ml_db_devices'), String(db.onDevicesTasks ?? '—'), fsmHl === 'onDevices'),
      modalRow(cockpitT('cp_ml_db_pending'), String(db.pendingTasks ?? '—'), fsmHl === 'pending'),
      modalRow(cockpitT('cp_ml_db_hist'), String(db.historicalSyncs ?? '—'), fsmHl === 'hist'),
      modalRow(cockpitT('cp_ml_db_users'), String(db.activeUsers ?? '—'), false),
    ].join('');
  }

  return `<p class="cp-modal-empty">${escapeHtml(cockpitT('cp_modal_no_data'))}</p>`;
}

function openCpModal(key) {
  const root = document.getElementById('cp-modal-root');
  const titleEl = document.getElementById('cp-modal-title');
  const bodyEl = document.getElementById('cp-modal-body');
  const footEl = document.getElementById('cp-modal-foot');
  if (!root || !titleEl || !bodyEl) return;
  const titleKey = MODAL_TITLE_KEYS[key] || 'cp_bc_page';
  titleEl.textContent = cockpitT(titleKey);
  if (!lastCockpitData) {
    bodyEl.innerHTML = `<p class="cp-modal-empty">${escapeHtml(cockpitT('cp_modal_no_data'))}</p>`;
  } else {
    bodyEl.innerHTML = buildModalBody(key, lastCockpitData);
  }
  if (footEl) {
    footEl.textContent = lastCockpitAt
      ? cockpitT('cp_modal_foot', { time: lastCockpitAt.toLocaleString(timeLocale()) })
      : '';
  }
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  queueMicrotask(() => document.getElementById('cp-modal-close')?.focus());
}

function closeCpModal() {
  const root = document.getElementById('cp-modal-root');
  if (!root || root.hidden) return;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function updateCockpit() {
  try {
    const response = await CONFIG.get('/cockpit/health');
    if (!response || typeof response !== 'object') return;
    /** API: `{ status: 'ok', data }` ou payload plano (legado / proxy). */
    const d =
      response.data !== undefined && response.data !== null && typeof response.data === 'object'
        ? response.data
        : response;
    if (response.error && !d?.operationsBoard && !d?.memory) return;
    if (response.status != null && response.status !== 'ok') return;
    const ob = d.operationsBoard || {};
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.innerText = v != null ? String(v) : '0';
    };
    setTxt('ops-board-total', ob.total);
    setTxt('ops-board-pending', ob.pending);
    setTxt('ops-board-progress', ob.progress);
    setTxt('ops-board-completed', ob.completed);
    setTxt('ops-board-cancelled', ob.cancelled);
    setTxt('ops-board-errors', ob.errors);

    const snap = d.integrationSnapshot || {};
    const ig = snap.integrations || {};
    const cs = snap.cloudStorage || {};

    const frac = document.getElementById('metric-integ-fraction');
    if (frac) frac.textContent = `${ig.active ?? 0} / ${ig.total ?? 0}`;

    const issuesLine = document.getElementById('cp-integ-issues-line');
    const nIssues = ig.errorOrDisconnected ?? 0;
    if (issuesLine) {
      if (nIssues > 0) {
        issuesLine.style.display = 'block';
        issuesLine.textContent = cockpitT('cp_integ_issues', { n: nIssues });
      } else {
        issuesLine.style.display = 'none';
        issuesLine.textContent = '';
      }
    }

    const health = cs.health || 'none';
    const statusEl = document.getElementById('metric-storage-status');
    if (statusEl) {
      const hk =
        { ok: 'cp_storage_ok', warning: 'cp_storage_warn', error: 'cp_storage_err', none: 'cp_storage_none' }[health] ||
        'cp_storage_none';
      statusEl.textContent = cockpitT(hk);
      statusEl.style.color =
        health === 'ok'
          ? '#22d3ee'
          : health === 'warning'
            ? '#fbbf24'
            : health === 'error'
              ? '#f87171'
              : '#94a3b8';
    }

    const tested = document.getElementById('metric-storage-tested');
    if (tested) {
      tested.textContent = cs.lastTestedAt
        ? new Date(cs.lastTestedAt).toLocaleString(timeLocale())
        : '—';
    }

    document.getElementById('metric-rpm').innerText = d.memory.syncAttempts;
    document.getElementById('metric-volume').innerText = (d.memory.payloadSizeTotalKB / 1024).toFixed(3);
    document.getElementById('metric-failures').innerText = d.memory.syncFailures;
    document.getElementById('metric-error-rate').innerText = d.memory.failureRate + '%';

    const up = d.uptimeSeconds;
    let upStr = `${up}s`;
    if (up > 60) upStr = `${Math.floor(up / 60)}m ${up % 60}s`;
    if (up > 3600) upStr = `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`;
    document.getElementById('metric-uptime').innerText = upStr;

    document.getElementById('metric-os-devices').innerText = d.database.onDevicesTasks;
    document.getElementById('metric-os-queue').innerText = d.database.pendingTasks;
    document.getElementById('metric-os-done').innerText = d.database.historicalSyncs;

    document.getElementById('metric-fleet-active').innerText = d.memory.activeDevicesCount;
    document.getElementById('metric-total-workers').innerText = d.database.activeUsers;

    const now = new Date();
    const label =
      now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');

    const currentPayload = parseFloat(d.memory.payloadSizeTotalKB);
    let diff = currentPayload - lastPayloadTotal;
    if (diff < 0) diff = 0;
    lastPayloadTotal = currentPayload;

    if (liveChart.data.labels.length > historyWindow) {
      liveChart.data.labels.shift();
      liveChart.data.datasets[0].data.shift();
    }
    liveChart.data.labels.push(label);
    liveChart.data.datasets[0].data.push(diff.toFixed(2));
    if (liveChart.data.datasets[0].label !== cockpitT('cp_chart_dataset')) {
      liveChart.data.datasets[0].label = cockpitT('cp_chart_dataset');
    }
    liveChart.update();

    const consoleBox = document.getElementById('error-console');
    if (d.memory.lastErrors.length === 0) {
      consoleBox.innerHTML = `<div style="color:#22c55e;">${cockpitT('cp_pulse_ok', { iso: now.toISOString() })}</div>`;
    } else {
      consoleBox.innerHTML = d.memory.lastErrors
        .map((err) => {
          const ts = new Date(err.ts).toLocaleTimeString(timeLocale());
          return `<div class="terminal-row">
                          <span class="err-ts">[${ts}]</span>
                          <span class="err-dev">&lt;DEV_${err.deviceId || 'anon'}&gt;</span>
                          <span class="err-msg">${cockpitT('cp_fatal', { msg: String(err.error || '') })}</span>
                        </div>`;
        })
        .join('');
    }

    const lu = document.getElementById('last-update');
    lu.innerText = cockpitT('cp_synced_at', { time: now.toLocaleTimeString(timeLocale()) });
    lu.style.color = 'var(--accent-cyan)';
    lastCockpitData = d;
    lastCockpitAt = now;
  } catch (e) {
    console.warn(cockpitT('cp_console_warn'), e);
    const lu = document.getElementById('last-update');
    lu.innerText = cockpitT('cp_conn_lost');
    lu.style.color = 'var(--accent-red)';
  }
}

updateCockpit();
setInterval(updateCockpit, 15000);

const dash = document.querySelector('.dash-container');
if (dash) {
  dash.addEventListener('click', (e) => {
    const card = e.target.closest('[data-cp-card]');
    if (!card) return;
    openCpModal(card.getAttribute('data-cp-card'));
  });
  dash.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-cp-card]');
    if (!card || !dash.contains(card)) return;
    e.preventDefault();
    openCpModal(card.getAttribute('data-cp-card'));
  });
}
document.getElementById('cp-modal-backdrop')?.addEventListener('click', closeCpModal);
document.getElementById('cp-modal-close')?.addEventListener('click', closeCpModal);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const root = document.getElementById('cp-modal-root');
  if (root && !root.hidden) closeCpModal();
});
