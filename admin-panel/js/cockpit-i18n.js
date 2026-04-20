/**
 * Cockpit global (sync / operações), pt-BR e en-US.
 */
import { getAdminUiLocale } from './user-pages-i18n.js';
import { mpT } from './menu-pages-i18n.js';

const M = {
  'pt-BR': {
    cp_pageTitle: 'BrSpark Admin, Cockpit global',
    cp_bc_panel: 'Painel',
    cp_bc_page: 'Cockpit global',
    cp_hero_title: 'Cockpit global, operações',
    cp_hero_sub: 'Visão em tempo quase real de sincronização, quadro global de OS/RT (todas as empresas), pipeline e telemetria.',
    cp_last_sync: 'Sincronizando…',
    cp_sec_board: 'Quadro OS e RT, todas as empresas',
    cp_board_intro:
      'Totais no banco (FT e tarefas de rotina), sem limite de linhas, equivalente ao resumo que existia na Central de operações.',
    cp_ct_total: 'Total no quadro',
    cp_cf_total: 'FT + RT (todas)',
    cp_ct_pending: 'Não iniciadas',
    cp_cf_pending: 'Status PENDING',
    cp_ct_progress: 'Em campo',
    cp_cf_progress: 'Recebida / aceita / em execução / pausa',
    cp_ct_completed: 'Concluídas',
    cp_cf_completed: 'Concluída ou sincronizada',
    cp_ct_cancelled: 'Canceladas',
    cp_cf_cancelled: 'Status CANCELLED',
    cp_ct_errors: 'Erros',
    cp_cf_errors: 'Demais status (ex.: rejeitada)',
    cp_sec_net: 'Rede (ingress) e saúde do núcleo',
    cp_ct_rpm: 'Taxa de sync (tempo real)',
    cp_cf_rpm: 'Throughput em tempo real',
    cp_ct_volume: 'Largura de banda (entrada)',
    cp_cf_volume: 'Volume da sessão atual',
    cp_ct_failures: 'Falhas de eventos',
    cp_err_rate: 'Taxa de erro:',
    cp_ct_uptime: 'Uptime do núcleo',
    cp_cf_uptime: 'API broker:',
    cp_uptime_ok: '100% OK',
    cp_sec_fsm: 'Operações de campo (FSM)',
    cp_ct_devices: 'Pipeline: nos dispositivos',
    cp_cf_devices: 'Em andamento / aguardando sync',
    cp_ct_queue: 'Pipeline: fila na nuvem',
    cp_cf_queue: 'Aguardando download (não reivindicadas)',
    cp_ct_done: 'Histórico finalizado',
    cp_cf_done: 'Total OS fechadas com sucesso (DB)',
    cp_fleet_title: 'Análise da frota',
    cp_fleet_connected: 'DISPOSITIVOS CONECTADOS HOJE',
    cp_fleet_workers: 'TOTAL DE TÉCNICOS CADASTRADOS',
    cp_chart_title: 'Fluxo de telemetria (pacotes/min)',
    cp_chart_dataset: 'Payload (kb/s)',
    cp_sec_dlq: 'Fila morta (DLQ) e logs de perda',
    cp_dlq_wait: '[SYS] Aguardando quedas de pacotes e rejeições não tratadas…',
    cp_pulse_ok: '[SYS] Pulso OK {iso}',
    cp_fatal: 'FATAL: {msg}',
    cp_synced_at: 'Dados sincronizados: {time}',
    cp_conn_lost: 'Conexão perdida. Reconectando…',
    cp_console_warn: 'Erro ao atualizar Cockpit',
  },
  'en-US': {
    cp_pageTitle: 'BrSpark Admin, Global cockpit',
    cp_bc_panel: 'Home',
    cp_bc_page: 'Global cockpit',
    cp_hero_title: 'Global cockpit, operations',
    cp_hero_sub:
      'Near–real-time view of sync, global WO/RT board (all companies), pipeline and telemetry.',
    cp_last_sync: 'Syncing…',
    cp_sec_board: 'WO & RT board, all companies',
    cp_board_intro:
      'Database totals (FT and routine tasks), no row cap, same summary as in Operations Center.',
    cp_ct_total: 'Board total',
    cp_cf_total: 'FT + RT (all)',
    cp_ct_pending: 'Not started',
    cp_cf_pending: 'PENDING status',
    cp_ct_progress: 'In the field',
    cp_cf_progress: 'Received / accepted / in progress / pause',
    cp_ct_completed: 'Completed',
    cp_cf_completed: 'Completed or synced',
    cp_ct_cancelled: 'Cancelled',
    cp_cf_cancelled: 'CANCELLED status',
    cp_ct_errors: 'Errors',
    cp_cf_errors: 'Other statuses (e.g. rejected)',
    cp_sec_net: 'Network (ingress) & core health',
    cp_ct_rpm: 'Sync rate (live)',
    cp_cf_rpm: 'Live throughput',
    cp_ct_volume: 'Bandwidth (ingress)',
    cp_cf_volume: 'Current session volume',
    cp_ct_failures: 'Event failures',
    cp_err_rate: 'Error rate:',
    cp_ct_uptime: 'Core uptime',
    cp_cf_uptime: 'API broker:',
    cp_uptime_ok: '100% OK',
    cp_sec_fsm: 'Field operations (FSM)',
    cp_ct_devices: 'Pipeline: on devices',
    cp_cf_devices: 'In progress / awaiting sync',
    cp_ct_queue: 'Pipeline: cloud queue',
    cp_cf_queue: 'Awaiting download (unclaimed)',
    cp_ct_done: 'Completed history',
    cp_cf_done: 'Total WOs closed successfully (DB)',
    cp_fleet_title: 'Fleet analysis',
    cp_fleet_connected: 'DEVICES CONNECTED TODAY',
    cp_fleet_workers: 'REGISTERED TECHNICIANS',
    cp_chart_title: 'Telemetry flow (packets/min)',
    cp_chart_dataset: 'Payload (kb/s)',
    cp_sec_dlq: 'Dead letter queue (DLQ) & loss logs',
    cp_dlq_wait: '[SYS] Waiting for packet drops and unhandled rejections…',
    cp_pulse_ok: '[SYS] Pulse OK {iso}',
    cp_fatal: 'FATAL: {msg}',
    cp_synced_at: 'Data synced: {time}',
    cp_conn_lost: 'Connection lost. Reconnecting…',
    cp_console_warn: 'Error updating Cockpit',
  },
};

function interpolate(str, vars) {
  let out = String(str ?? '');
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
  }
  return out;
}

export function cockpitT(key, vars) {
  const loc = getAdminUiLocale();
  const pack = M[loc] || M['pt-BR'];
  const raw = pack[key] != null ? pack[key] : M['pt-BR'][key] != null ? M['pt-BR'][key] : key;
  return vars ? interpolate(raw, vars) : raw;
}

export function applyCockpitStaticI18n() {
  const loc = getAdminUiLocale();
  try {
    document.documentElement.lang = loc === 'en-US' ? 'en-US' : 'pt-BR';
  } catch {
    /* ignore */
  }
  document.title = cockpitT('cp_pageTitle');
  const set = (id, k, vars) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = vars ? cockpitT(k, vars) : cockpitT(k);
  };
  const bcPanel = document.getElementById('mpc-bc-panel');
  if (bcPanel) bcPanel.textContent = mpT('common_bc_panel');
  set('mpc-bc-here', 'cp_bc_page');
  set('mpc-hero-title', 'cp_hero_title');
  set('mpc-hero-sub', 'cp_hero_sub');
  set('last-update', 'cp_last_sync');
  set('cp-sec-board', 'cp_sec_board');
  set('cp-board-intro', 'cp_board_intro');
  const cards = [
    ['cp-ct-total', 'cp_ct_total'],
    ['cp-cf-total', 'cp_cf_total'],
    ['cp-ct-pending', 'cp_ct_pending'],
    ['cp-cf-pending', 'cp_cf_pending'],
    ['cp-ct-progress', 'cp_ct_progress'],
    ['cp-cf-progress', 'cp_cf_progress'],
    ['cp-ct-completed', 'cp_ct_completed'],
    ['cp-cf-completed', 'cp_cf_completed'],
    ['cp-ct-cancelled', 'cp_ct_cancelled'],
    ['cp-cf-cancelled', 'cp_cf_cancelled'],
    ['cp-ct-errors', 'cp_ct_errors'],
    ['cp-cf-errors', 'cp_cf_errors'],
    ['cp-sec-net', 'cp_sec_net'],
    ['cp-ct-rpm', 'cp_ct_rpm'],
    ['cp-cf-rpm', 'cp_cf_rpm'],
    ['cp-ct-volume', 'cp_ct_volume'],
    ['cp-cf-volume', 'cp_cf_volume'],
    ['cp-ct-failures', 'cp_ct_failures'],
    ['cp-err-rate-lbl', 'cp_err_rate'],
    ['cp-ct-uptime', 'cp_ct_uptime'],
    ['cp-cf-uptime', 'cp_cf_uptime'],
    ['cp-uptime-ok', 'cp_uptime_ok'],
    ['cp-sec-fsm', 'cp_sec_fsm'],
    ['cp-ct-devices', 'cp_ct_devices'],
    ['cp-cf-devices', 'cp_cf_devices'],
    ['cp-ct-queue', 'cp_ct_queue'],
    ['cp-cf-queue', 'cp_cf_queue'],
    ['cp-ct-done', 'cp_ct_done'],
    ['cp-cf-done', 'cp_cf_done'],
    ['cp-fleet-title', 'cp_fleet_title'],
    ['cp-fleet-connected-lbl', 'cp_fleet_connected'],
    ['cp-fleet-workers-lbl', 'cp_fleet_workers'],
    ['cp-chart-title', 'cp_chart_title'],
    ['cp-sec-dlq', 'cp_sec_dlq'],
  ];
  for (const [id, k] of cards) set(id, k);
  const dlqPh = document.getElementById('cp-dlq-placeholder');
  if (dlqPh) dlqPh.textContent = cockpitT('cp_dlq_wait');
}
