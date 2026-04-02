/**
 * app.js — BrSpark Admin Panel App Utilities & Mock Data
 */

import { Auth } from './auth.js';

// ── Mock Data ──────────────────────────────────────────────
export const MOCK = {
  stats: {
    tenants: 142,
    activeUsers: 1_843,
    assets: 28_591,
    stockItems: 9_207,
    alerts: 14,
    revenue: 'R$ 48.200',
  },

  tenants: [
    { id: 'T001', name: 'Benedito Imóveis',    plan: 'Pro',      users: 8,  assets: 412, status: 'active',    created: '2024-01-15' },
    { id: 'T002', name: 'Coastal Ventures',    plan: 'Enterprise', users: 34, assets: 1820, status: 'active', created: '2024-02-03' },
    { id: 'T003', name: 'Rede Hospitalar SP',  plan: 'Enterprise', users: 91, assets: 6502, status: 'active', created: '2023-11-20' },
    { id: 'T004', name: 'Fazenda Monte Alto',  plan: 'Basic',    users: 3,  assets: 87,  status: 'active',    created: '2024-03-01' },
    { id: 'T005', name: 'TechFleet Logística', plan: 'Pro',      users: 12, assets: 834, status: 'suspended', created: '2024-01-30' },
    { id: 'T006', name: 'Casa Verde Airbnb',   plan: 'Basic',    users: 2,  assets: 23,  status: 'trial',     created: '2025-03-10' },
    { id: 'T007', name: 'Clínica Bem Estar',   plan: 'Pro',      users: 18, assets: 299, status: 'active',    created: '2024-06-14' },
    { id: 'T008', name: 'Porto Seco Nordeste', plan: 'Enterprise', users: 56, assets: 3401, status: 'active', created: '2023-09-08' },
  ],

  alerts: [
    { id: 1, type: 'red',   title: '14 itens com estoque crítico',  sub: 'Rede Hospitalar SP — 7 módulos afetados',  time: 'Agora' },
    { id: 2, type: 'amber', title: '3 apólices vencendo em 7 dias', sub: 'Coastal Ventures, TechFleet, Casa Verde',   time: '2h atrás' },
    { id: 3, type: 'amber', title: 'Uso de storage 87%',            sub: 'Limite do plano Enterprise quase atingido', time: '5h atrás' },
    { id: 4, type: 'blue',  title: 'Novo tenant cadastrado',        sub: 'Casa Verde Airbnb — Plano Basic trial',     time: 'Ontem' },
  ],

  activity: [
    { icon: '🏢', bg: 'rgba(249,115,22,0.12)', text: '<strong>Casa Verde Airbnb</strong> iniciou período de trial', time: '18 min atrás' },
    { icon: '📦', bg: 'rgba(239,68,68,0.12)',   text: 'Alerta de estoque crítico em <strong>Rede Hospitalar SP</strong>', time: '1h atrás' },
    { icon: '🔐', bg: 'rgba(16,185,129,0.12)',  text: '<strong>admin@brspark.com</strong> acessou o painel', time: '2h atrás' },
    { icon: '💳', bg: 'rgba(245,158,11,0.12)',  text: 'Pagamento confirmado — <strong>Coastal Ventures</strong> Enterprise', time: '3h atrás' },
    { icon: '⚠️', bg: 'rgba(245,158,11,0.12)',  text: 'TechFleet Logística suspenso por inadimplência', time: '6h atrás' },
    { icon: '🔧', bg: 'rgba(249,115,22,0.12)', text: 'Atualização v2.4.1 implantada com sucesso', time: 'Ontem 22:15' },
  ],

  flags: [
    { icon: '📦', name: 'Módulo de Estoque',       key: 'stock',     desc: 'Gestão de almoxarifado e movimentações', enabled: true },
    { icon: '<i data-lucide="shield" style="width:16px;height:16px;vertical-align:middle;margin-right:8px"></i>', name: 'Módulo de Seguros',       key: 'insurance', desc: 'Apólices e cobertura de bens',           enabled: true },
    { icon: '🔐', name: 'Cofre (Vault)',            key: 'vault',     desc: 'Armazenamento de credenciais seguras',   enabled: true },
    { icon: '🤖', name: 'Consultor AI',             key: 'ai',        desc: 'Assistente inteligente por bem',         enabled: true },
    { icon: '📄', name: 'Módulo de Documentos',    key: 'docs',      desc: 'Upload e gestão de arquivos por bem',    enabled: true },
    { icon: '📊', name: 'Relatórios Avançados',    key: 'reports',   desc: 'Exportação CSV e análise de custos',     enabled: false },
    { icon: '📡', name: 'Sync em Tempo Real',       key: 'realtime',  desc: 'Sincronização cloud em tempo real',      enabled: false },
    { icon: '🌐', name: 'Multi-idioma',             key: 'i18n',      desc: 'Suporte a EN, ES e PT-BR',               enabled: true },
  ],
};

// ── Helpers ────────────────────────────────────────────────
export function formatNumber(n) {
  return n.toLocaleString('pt-BR');
}

export function planBadge(plan) {
  const map = { Basic: 'badge-gray', Pro: 'badge-blue', Enterprise: 'badge-accent' };
  return `<span class="badge ${map[plan] || 'badge-gray'}">${plan}</span>`;
}

export function statusBadge(status) {
  const map = {
    active:    ['badge-green', '● Ativo'],
    suspended: ['badge-red',   '● Suspenso'],
    trial:     ['badge-amber', '◐ Trial'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Sidebar active state ───────────────────────────────────
export function initSidebar() {
  const email = Auth.getEmail();
  const emailEls = document.querySelectorAll('.admin-email');
  emailEls.forEach(el => el.textContent = email);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', Auth.logout.bind(Auth));

  // Mark active nav item based on current page
  const page = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    if (el.dataset.page === page) el.classList.add('active');
  });
}
