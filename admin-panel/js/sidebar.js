/**
 * sidebar.js — shared sidebar HTML injected on every page
 */

import {
  ensureAdminApiDetected,
  restoreAdminSessionBundleIfNeeded,
  persistAdminSessionBundleFromSessionStorage,
  clearAdminSessionFully,
} from './config.js';

const SIDEBAR_COLLAPSED_KEY = 'brspark_admin_sidebar_collapsed';

/**
 * Novo separador não herda `sessionStorage` — copia chaves de sessão do separador que abriu esta página
 * (mesma origem), para links com `target="_blank"` + `rel="opener"` continuarem autenticados.
 */
function seedAdminSessionFromOpenerIfNeeded() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (sessionStorage.getItem('brspark_admin_token')) return;
    const op = window.opener;
    if (!op || op.closed) return;
    const src = op.sessionStorage;
    if (!src) return;
    const keys = [
      'brspark_admin_token',
      'brspark_admin_email',
      'brspark_admin_name',
      'brspark_admin_role',
      'brspark_panel_mode',
      'brspark_panel_tenant',
    ];
    for (const k of keys) {
      try {
        const v = src.getItem(k);
        if (v != null && v !== '') sessionStorage.setItem(k, v);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* origem diferente / política do browser */
  }
}

export function isSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

export function setSidebarCollapsed(collapsed) {
  if (collapsed) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
    document.body.classList.add('sidebar-collapsed');
  } else {
    localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
    document.body.classList.remove('sidebar-collapsed');
  }
  const btn = document.getElementById('sidebar-toggle');
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    btn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
  }
}

export const NAV_ITEMS = [
  { page: 'dashboard.html',     icon: 'grid-outline',       label: 'Dashboard',           section: null },
  { page: 'tenants.html',       icon: 'business-outline',   label: 'Tenants',              section: 'Gestão' },
  { page: 'users.html',         icon: 'people-outline',     label: 'Usuários',              section: null },
  { page: 'technician-applications.html', icon: 'person-add-outline', label: 'Cadastro prestador', section: null },
  { page: 'checklists.html',    icon: 'list-circle-outline',label: 'Forms Builder',   section: 'Operações' },
  { page: 'operations.html',    icon: 'git-branch-outline', label: 'Central de Operações', section: null },
  { page: 'routine-tasks.html', icon: 'repeat-outline',     label: 'RT — Tarefas de rotina', section: null },
  { page: 'reports.html',       icon: 'document-text-outline', label: 'Relatórios PDF', section: null },
  { page: 'evaluations.html',   icon: 'star-half-outline',     label: 'Avaliações',           section: null },
  { page: 'cockpit.html',       icon: 'pulse-outline',      label: 'Sync Cockpit',         section: null },
  { page: 'locations.html',     icon: 'location-outline',   label: 'Multi-Location',        section: 'Multi-Location' },
  { page: 'i18n.html',          icon: 'globe-outline',      label: 'Config. Regionais',     section: null },
  { page: 'metatags.html',      icon: 'pricetags-outline',  label: 'Metatags',              section: 'Plataforma' },
  { page: 'subscriptions.html', icon: 'card-outline',       label: 'Assinaturas',          section: null },
  { page: 'plans.html',         icon: 'layers-outline',     label: 'Planos (pacotes)',     section: null },
  { page: 'integrations.html',  icon: 'flash-outline',       label: 'Integrações',           section: null },
  { page: 'notifications.html', icon: 'notifications-outline', label: 'Notificações',          section: null },
  { page: 'compliance.html',      icon: 'shield-checkmark-outline', label: 'LGPD & Compliance',   section: null },
  { page: 'data-collection.html', icon: 'pulse-outline',            label: 'Coleta de Dados',      section: null },
  { page: 'work-time.html',       icon: 'finger-print-outline',     label: 'Registro de horas',    section: null },
  { page: 'telemetry.html',       icon: 'navigate-circle-outline',  label: 'Telemetria',            section: null },
  { page: 'api-docs.html',      icon: 'document-text-outline',   label: 'API Docs',              section: null },
  { page: 'audit.html',         icon: 'time-outline',       label: 'Auditoria',             section: 'Sistema' },
  { page: 'system.html',        icon: 'settings-outline',   label: 'Configurações',         section: null },
];

/** Papéis com menu completo no painel. */
export const FULL_PANEL_MENU_ROLES = new Set(['SAAS_ADMIN', 'TENANT_ADMIN']);

/**
 * Páginas visíveis ao perfil Gestor (MANAGER) — grupos menu Gestão + Operações.
 * (Sem Dashboard, Plataforma, Multi-Location, Sistema, etc.)
 */
export const MANAGER_PANEL_PAGES = new Set([
  'tenants.html',
  'users.html',
  'user-edit.html',
  'subscriptions.html',
  'plans.html',
  'checklists.html',
  'operations.html',
  'routine-tasks.html',
  'reports.html',
  'evaluations.html',
  'cockpit.html',
  'technician-applications.html',
  'work-time.html',
]);

export function getStoredPanelRole() {
  return (sessionStorage.getItem('brspark_admin_role') || '').trim();
}

export function navItemsForRole(role) {
  const r = String(role || '').trim();
  if (!r || FULL_PANEL_MENU_ROLES.has(r)) return NAV_ITEMS;
  if (r === 'MANAGER') return NAV_ITEMS.filter((item) => MANAGER_PANEL_PAGES.has(item.page));
  return NAV_ITEMS;
}

/** Página HTML atual (ex.: user-edit.html) permitida para o papel? */
export function isPanelPageAllowed(role, pathOrFile) {
  const file = String(pathOrFile || '').split('/').pop() || '';
  const normalized = file.endsWith('.html') ? file : `${file}.html`;
  const r = String(role || '').trim();
  if (!r || FULL_PANEL_MENU_ROLES.has(r)) return true;
  if (r === 'MANAGER') return MANAGER_PANEL_PAGES.has(normalized);
  return true;
}

export function defaultLandingPageForRole(role) {
  return String(role || '').trim() === 'MANAGER' ? 'tenants.html' : 'dashboard.html';
}

function logout() {
  clearAdminSessionFully();
  window.location.href = 'index.html';
}

export function renderSidebar(alertCount = 3) {
  const page = window.location.pathname.split('/').pop().replace('.html','') || 'dashboard';
  const currentPage = page.endsWith('.html') ? page : page + '.html';
  const email = sessionStorage.getItem('brspark_admin_email') || 'admin@brspark.com';
  const displayName = sessionStorage.getItem('brspark_admin_name') || '';
  const panelMode = sessionStorage.getItem('brspark_panel_mode') || 'global';
  let tenantLine = '';
  try {
    const raw = sessionStorage.getItem('brspark_panel_tenant');
    if (raw && panelMode === 'tenant') {
      const t = JSON.parse(raw);
      tenantLine = `<div class="sidebar-tenant-chip">${t.name || ''} <span style="opacity:0.75">· ${t.slug || ''}</span></div>`;
    }
  } catch {
    /* ignore */
  }
  const initials = (displayName || email).slice(0, 2).toUpperCase();
  const footerTitle = displayName || (panelMode === 'tenant' ? 'Usuário' : 'Administrador');

  const role = getStoredPanelRole();
  const items = navItemsForRole(role);
  let lastSection = null;
  const navHtml = items.map(item => {
    let sectionHtml = '';
    if (item.section && item.section !== lastSection) {
      sectionHtml = `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section;
    }
    const pageKey = currentPage.replace('.html','');
    const itemKey = item.page.replace('.html','');
    const active =
      pageKey === itemKey ||
      (pageKey === 'user-edit' && item.page === 'users.html') ||
      (pageKey === 'technician-applications' && item.page === 'technician-applications.html')
        ? 'active'
        : '';
    const badge = item.page === 'audit.html' ? `<span class="nav-badge">${alertCount}</span>` : '';
    return `${sectionHtml}
      <a href="${item.page}" class="nav-item ${active}" data-page="${item.page}" title="${item.label.replace(/"/g, '&quot;')}">
        <ion-icon name="${item.icon}" class="nav-icon" style="font-size:18px"></ion-icon>
        <span>${item.label}</span>
        ${badge}
      </a>`;
  }).join('');

  const collapsed = isSidebarCollapsed();
  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-header-row">
          <a href="${defaultLandingPageForRole(role)}" class="sidebar-brand" title="BrSpark — Início">
            <img src="img/logo.png" alt="BrSpark">
          </a>
          <button type="button" class="sidebar-toggle" id="sidebar-toggle"
            aria-label="${collapsed ? 'Expandir menu' : 'Recolher menu'}"
            aria-expanded="${collapsed ? 'false' : 'true'}"
            title="${collapsed ? 'Expandir menu' : 'Recolher menu'}">
            <ion-icon name="chevron-back-outline"></ion-icon>
          </button>
        </div>
        ${tenantLine}
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="admin-profile" id="logout-btn" title="Sair">
          <div class="admin-avatar">${initials}</div>
          <div class="admin-info">
            <div class="admin-name">${footerTitle.replace(/</g, '&lt;')}</div>
            <div class="admin-email">${email.replace(/</g, '&lt;')}</div>
          </div>
          <ion-icon name="log-out-outline" style="font-size:18px;color:var(--text3)"></ion-icon>
        </div>
      </div>
    </aside>`;
}

export async function initPage() {
  await ensureAdminApiDetected();
  seedAdminSessionFromOpenerIfNeeded();
  restoreAdminSessionBundleIfNeeded();

  if (!sessionStorage.getItem('brspark_admin_token')) {
    window.location.href = 'index.html';
    return;
  }

  const pathFile = window.location.pathname.split('/').pop() || 'dashboard.html';
  const currentHtml = pathFile.includes('.') ? pathFile : `${pathFile}.html`;
  const panelRole = getStoredPanelRole();
  if (!isPanelPageAllowed(panelRole, currentHtml)) {
    window.location.href = defaultLandingPageForRole(panelRole);
    return;
  }

  // Inject Ionicons scripts
  if (!document.querySelector('script[src*="ionicons"]')) {
    const s1 = document.createElement('script');
    s1.type = 'module';
    s1.src = 'https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js';
    document.head.appendChild(s1);
    
    const s2 = document.createElement('script');
    s2.nomodule = true;
    s2.src = 'https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js';
    document.head.appendChild(s2);
  }

  document.body.insertAdjacentHTML('afterbegin', renderSidebar());
  if (isSidebarCollapsed() && window.matchMedia('(min-width: 769px)').matches) {
    document.body.classList.add('sidebar-collapsed');
  }
  document.getElementById('logout-btn').addEventListener('click', logout);

  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    });
  }

  window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => {
    if (!e.matches) {
      document.body.classList.remove('sidebar-collapsed');
    } else if (isSidebarCollapsed()) {
      document.body.classList.add('sidebar-collapsed');
    }
  });

  persistAdminSessionBundleFromSessionStorage();
}
