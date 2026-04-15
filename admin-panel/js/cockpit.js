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

async function updateCockpit() {
  try {
    const response = await CONFIG.get('/cockpit/health');
    if (!response || response.status !== 'ok') return;

    const d = response.data;
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
  } catch (e) {
    console.warn(cockpitT('cp_console_warn'), e);
    const lu = document.getElementById('last-update');
    lu.innerText = cockpitT('cp_conn_lost');
    lu.style.color = 'var(--accent-red)';
  }
}

updateCockpit();
setInterval(updateCockpit, 15000);
