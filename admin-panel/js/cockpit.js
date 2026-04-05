import { initPage } from './sidebar.js';
import { CONFIG }   from './config.js';

await initPage();

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
                label: 'Payloads (kb/s)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: gradientBlue,
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.3
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: { grid: { display: false, color: '#1f2937' }, ticks: { color: '#6b7280', font: {size: 9} } },
            y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: {size: 9} } }
        },
        animation: { duration: 0 }
    }
};

const liveChart = new Chart(ctx, chartConfig);
const historyWindow = 30; // 30 points of data => 15 minutes of 30s ticks

let lastPayloadTotal = 0;

// ── Update Logic ──────────────────────────────────────────────
async function updateCockpit() {
    try {
        const response = await CONFIG.get('/cockpit/health');
        if (!response || response.status !== 'ok') return;
        
        const d = response.data;
        
        // --- 1. Top Row: Network ---
        // Throughput RPM (requests per minute based on active sessions)
        document.getElementById('metric-rpm').innerText = d.memory.syncAttempts; // Simplified to total attempts since boot
        document.getElementById('metric-volume').innerText = (d.memory.payloadSizeTotalKB / 1024).toFixed(3);
        document.getElementById('metric-failures').innerText = d.memory.syncFailures;
        document.getElementById('metric-error-rate').innerText = d.memory.failureRate + '%';
        
        const up = d.uptimeSeconds;
        let upStr = `${up}s`;
        if (up > 60) upStr = `${Math.floor(up/60)}m ${up%60}s`;
        if (up > 3600) upStr = `${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m`;
        document.getElementById('metric-uptime').innerText = upStr;

        // --- 2. Middle Row: DB Workflow ---
        // On devices = RECEIVED + ACCEPTED + IN_PROGRESS
        document.getElementById('metric-os-devices').innerText = d.database.onDevicesTasks;
        
        // Cloud Queue = PENDING (Waiting to be pulled)
        document.getElementById('metric-os-queue').innerText = d.database.pendingTasks;
        
        // Historical Finalized
        document.getElementById('metric-os-done').innerText = d.database.historicalSyncs;

        // --- 3. Fleet & Users ---
        document.getElementById('metric-fleet-active').innerText = d.memory.activeDevicesCount;
        document.getElementById('metric-total-workers').innerText = d.database.activeUsers;

        // --- 4. Live Chart Delta ---
        const now = new Date();
        const label = now.getMinutes().toString().padStart(2,'0') + ':' + now.getSeconds().toString().padStart(2,'0');
        
        const currentPayload = parseFloat(d.memory.payloadSizeTotalKB);
        let diff = currentPayload - lastPayloadTotal;
        if(diff < 0) diff = 0; // if server restarted
        lastPayloadTotal = currentPayload;
        
        if (liveChart.data.labels.length > historyWindow) {
            liveChart.data.labels.shift();
            liveChart.data.datasets[0].data.shift();
        }
        liveChart.data.labels.push(label);
        liveChart.data.datasets[0].data.push(diff.toFixed(2));
        liveChart.update();

        // --- 5. Terminal Logs ---
        const consoleBox = document.getElementById('error-console');
        if (d.memory.lastErrors.length === 0) {
            // keep default text or just show a ping
            consoleBox.innerHTML = `<div style="color:#22c55e;">[SYS] Healthy tick ${now.toISOString()}</div>`;
        } else {
            consoleBox.innerHTML = d.memory.lastErrors.map(err => {
                const ts = new Date(err.ts).toLocaleTimeString('pt-BR');
                return `<div class="terminal-row">
                          <span class="err-ts">[${ts}]</span>
                          <span class="err-dev">&lt;DEV_${err.deviceId || 'anon'}&gt;</span>
                          <span class="err-msg">FATAL: ${err.error}</span>
                        </div>`;
            }).join('');
        }

        document.getElementById('last-update').innerText = `DATA SYNCED: ${now.toLocaleTimeString('pt-BR')}`;
    } catch (e) {
        console.warn('Erro ao atualizar Cockpit', e);
        document.getElementById('last-update').innerText = 'CONNECTION LOST. RECONNECTING...';
        document.getElementById('last-update').style.color = 'var(--accent-red)';
    }
}

// ── Iniciar Polling ───────────────────────────────────────────
updateCockpit(); 
setInterval(updateCockpit, 15000); // 15 seconds polling for Datadog feel
