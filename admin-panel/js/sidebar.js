/**
 * sidebar.js — shared sidebar HTML injected on every page
 */

import {
  ensureAdminApiDetected,
  restoreAdminSessionBundleIfNeeded,
  persistAdminSessionBundleFromSessionStorage,
  clearAdminSessionFully,
} from './config.js';
import { getAdminUiLocale, setAdminUiLocale, t } from './user-pages-i18n.js';

function impersonationBannerHtml() {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('brspark_impersonation_backup') : null;
    if (!raw) return '';
    const b = JSON.parse(raw);
    if (!b || !b.token) return '';
    const lab = String(b.targetLabel || '—').replace(/</g, '&lt;');
    return `<div class="sidebar-impersonation" role="status">
      <div class="sidebar-impersonation__txt">${String(t('imp_banner_prefix')).replace(/</g, '&lt;')}<strong>${lab}</strong>${String(t('imp_banner_suffix')).replace(/</g, '&lt;')}</div>
      <button type="button" class="btn btn-sm btn-outline sidebar-impersonation__btn" id="sidebar-end-impersonation-btn">${String(t('imp_end_btn')).replace(/</g, '&lt;')}</button>
    </div>`;
  } catch {
    return '';
  }
}

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
    btn.setAttribute('aria-label', collapsed ? t('nav_sidebar_expand') : t('nav_sidebar_collapse'));
    btn.title = collapsed ? t('nav_sidebar_expand') : t('nav_sidebar_collapse');
  }
}

export const NAV_ITEMS = [
  { page: 'dashboard.html', icon: 'grid-outline', labelKey: 'nav_dashboard', sectionKey: null },
  { page: 'tenants.html', icon: 'business-outline', labelKey: 'nav_tenants', sectionKey: 'nav_sec_mgmt' },
  { page: 'users.html', icon: 'people-outline', labelKey: 'nav_users', sectionKey: null },
  {
    page: 'technician-applications.html',
    icon: 'person-add-outline',
    labelKey: 'nav_tech_signup',
    sectionKey: null,
  },
  { page: 'checklists.html', icon: 'list-circle-outline', labelKey: 'nav_forms_builder', sectionKey: 'nav_sec_ops' },
  { page: 'operations.html', icon: 'git-branch-outline', labelKey: 'nav_operations', sectionKey: null },
  { page: 'routine-tasks.html', icon: 'repeat-outline', labelKey: 'nav_routine_tasks', sectionKey: null },
  { page: 'reports.html', icon: 'document-text-outline', labelKey: 'nav_reports_pdf', sectionKey: null },
  { page: 'evaluations.html', icon: 'star-half-outline', labelKey: 'nav_evaluations', sectionKey: null },
  { page: 'cockpit.html', icon: 'pulse-outline', labelKey: 'nav_cockpit', sectionKey: null },
  { page: 'locations.html', icon: 'location-outline', labelKey: 'nav_locations', sectionKey: 'nav_sec_multi' },
  { page: 'i18n.html', icon: 'globe-outline', labelKey: 'nav_i18n', sectionKey: null },
  { page: 'metatags.html', icon: 'pricetags-outline', labelKey: 'nav_metatags', sectionKey: 'nav_sec_plat' },
  { page: 'subscriptions.html', icon: 'card-outline', labelKey: 'nav_subscriptions', sectionKey: null },
  { page: 'plans.html', icon: 'layers-outline', labelKey: 'nav_plans', sectionKey: null },
  { page: 'integrations.html', icon: 'flash-outline', labelKey: 'nav_integrations', sectionKey: null },
  { page: 'notifications.html', icon: 'notifications-outline', labelKey: 'nav_notifications', sectionKey: null },
  { page: 'compliance.html', icon: 'shield-checkmark-outline', labelKey: 'nav_compliance', sectionKey: null },
  {
    page: 'tracking-chat-moderation.html',
    icon: 'chatbox-ellipses-outline',
    labelKey: 'nav_chat_mod',
    sectionKey: null,
  },
  { page: 'data-collection.html', icon: 'pulse-outline', labelKey: 'nav_data_collection', sectionKey: null },
  { page: 'work-time.html', icon: 'finger-print-outline', labelKey: 'nav_work_time', sectionKey: null },
  { page: 'telemetry.html', icon: 'navigate-circle-outline', labelKey: 'nav_telemetry', sectionKey: null },
  { page: 'api-docs.html', icon: 'document-text-outline', labelKey: 'nav_api_docs', sectionKey: null },
  { page: 'audit.html', icon: 'time-outline', labelKey: 'nav_audit', sectionKey: 'nav_sec_sys' },
  { page: 'system.html', icon: 'settings-outline', labelKey: 'nav_system', sectionKey: null },
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

/** Termina sessão do painel (usado na sidebar e na barra superior). */
export function adminPanelLogout() {
  clearAdminSessionFully();
  window.location.href = 'index.html';
}

/**
 * Barra superior do conteúdo: idioma + avatar/resumo da conta (todas as páginas com `.main-content > .topbar`).
 */
function injectGlobalTopbarActions() {
  const main = document.querySelector('.admin-layout > .main-content') || document.querySelector('.main-content');
  if (!main) return;
  const topbar = main.querySelector(':scope > .topbar');
  if (!topbar || topbar.querySelector('[data-brspark-app-topbar]')) return;

  const email = sessionStorage.getItem('brspark_admin_email') || '';
  const displayName = (sessionStorage.getItem('brspark_admin_name') || '').trim();
  const initialsSource = (displayName || email || '—').trim();
  const initials = initialsSource.slice(0, 2).toUpperCase() || '—';
  const shortName = (displayName || (email.includes('@') ? email.split('@')[0] : email) || '—').trim();

  const actions = document.createElement('div');
  actions.className = 'topbar-actions brspark-app-topbar';
  actions.setAttribute('data-brspark-app-topbar', '1');
  actions.innerHTML = `
    <label class="topbar-locale-wrap" for="brspark-topbar-locale">
      <span class="topbar-locale-icon" title="${String(t('localeLabel')).replace(/"/g, '&quot;')}" aria-hidden="true"><ion-icon name="language-outline"></ion-icon></span>
      <select id="brspark-topbar-locale" class="form-control topbar-locale-select">
        <option value="pt-BR">PT</option>
        <option value="en-US">EN</option>
        <option value="es-ES">ES</option>
      </select>
    </label>
    <details class="topbar-user-details" id="brspark-topbar-user-wrap">
      <summary class="topbar-user-trigger">
        <div class="topbar-user-avatar" id="brspark-topbar-avatar"></div>
        <div class="topbar-user-meta">
          <span class="topbar-user-name" id="brspark-topbar-name"></span>
          <span class="topbar-user-email" id="brspark-topbar-email"></span>
        </div>
      </summary>
      <div class="topbar-user-dropdown">
        <button type="button" class="btn btn-ghost btn-sm" id="brspark-topbar-logout-btn"></button>
      </div>
    </details>
  `;
  topbar.appendChild(actions);
  topbar.classList.add('topbar--with-chrome');

  const av = document.getElementById('brspark-topbar-avatar');
  const nm = document.getElementById('brspark-topbar-name');
  const em = document.getElementById('brspark-topbar-email');
  const locSel = document.getElementById('brspark-topbar-locale');
  const loBtn = document.getElementById('brspark-topbar-logout-btn');
  if (av) av.textContent = initials;
  if (nm) nm.textContent = shortName;
  if (em) em.textContent = email;
  if (locSel) {
    try {
      locSel.setAttribute('aria-label', t('localeLabel'));
      locSel.value = getAdminUiLocale();
      locSel.addEventListener('change', () => {
        setAdminUiLocale(locSel.value);
        window.location.reload();
      });
    } catch {
      /* ignore */
    }
  }
  if (loBtn) {
    loBtn.textContent = t('topbarLogout');
    loBtn.addEventListener('click', () => adminPanelLogout());
  }

  document.querySelectorAll('.ue-users-locale').forEach((el) => {
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
  });
}

export function renderSidebar(alertCount = 3) {
  const page = window.location.pathname.split('/').pop().replace('.html','') || 'dashboard';
  const currentPage = page.endsWith('.html') ? page : page + '.html';
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
  const role = getStoredPanelRole();
  const items = navItemsForRole(role);
  let lastSection = null;
  const navHtml = items.map(item => {
    let sectionHtml = '';
    const secKey = item.sectionKey || null;
    if (secKey && secKey !== lastSection) {
      sectionHtml = `<div class="nav-section-label">${t(secKey)}</div>`;
      lastSection = secKey;
    }
    const pageKey = currentPage.replace('.html','');
    const itemKey = item.page.replace('.html','');
    const active =
      pageKey === itemKey ||
      (pageKey === 'user-edit' && item.page === 'users.html') ||
      (pageKey === 'technician-applications' && item.page === 'technician-applications.html')
        ? 'active'
        : '';
    const lab = t(item.labelKey);
    const badge = item.page === 'audit.html' ? `<span class="nav-badge">${alertCount}</span>` : '';
    return `${sectionHtml}
      <a href="${item.page}" class="nav-item ${active}" data-page="${item.page}" title="${lab.replace(/"/g, '&quot;')}">
        <ion-icon name="${item.icon}" class="nav-icon" style="font-size:18px"></ion-icon>
        <span>${lab}</span>
        ${badge}
      </a>`;
  }).join('');

  const collapsed = isSidebarCollapsed();
  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-header-row">
          <a href="${defaultLandingPageForRole(role)}" class="sidebar-brand" title="${String(t('nav_home_title')).replace(/"/g, '&quot;')}">
            <img src="img/logo.png" alt="BrSpark">
          </a>
          <button type="button" class="sidebar-toggle" id="sidebar-toggle"
            aria-label="${collapsed ? String(t('nav_sidebar_expand')).replace(/"/g, '&quot;') : String(t('nav_sidebar_collapse')).replace(/"/g, '&quot;')}"
            aria-expanded="${collapsed ? 'false' : 'true'}"
            title="${collapsed ? String(t('nav_sidebar_expand')).replace(/"/g, '&quot;') : String(t('nav_sidebar_collapse')).replace(/"/g, '&quot;')}">
            <ion-icon name="chevron-back-outline"></ion-icon>
          </button>
        </div>
        ${tenantLine}
        ${impersonationBannerHtml()}
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
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

  /** Remove sidebars duplicados (sessões antigas / HMR) — um só `position:fixed` cobre o ecrã. */
  const existingAsides = document.querySelectorAll('body > aside.sidebar');
  if (existingAsides.length > 1) {
    for (let i = 1; i < existingAsides.length; i += 1) {
      existingAsides[i].remove();
    }
  }
  if (!document.querySelector('body > aside.sidebar')) {
    document.body.insertAdjacentHTML('afterbegin', renderSidebar());
  }
  if (isSidebarCollapsed() && window.matchMedia('(min-width: 769px)').matches) {
    document.body.classList.add('sidebar-collapsed');
  }
  const impBtn = document.getElementById('sidebar-end-impersonation-btn');
  if (impBtn && !impBtn.dataset.ueBound) {
    impBtn.dataset.ueBound = '1';
    impBtn.addEventListener('click', () => {
      let raw;
      try {
        raw = sessionStorage.getItem('brspark_impersonation_backup');
      } catch {
        raw = null;
      }
      if (!raw) return;
      let b;
      try {
        b = JSON.parse(raw);
      } catch {
        sessionStorage.removeItem('brspark_impersonation_backup');
        return;
      }
      if (!b || !b.token) {
        sessionStorage.removeItem('brspark_impersonation_backup');
        return;
      }
      sessionStorage.setItem('brspark_admin_token', b.token);
      sessionStorage.setItem('brspark_admin_email', b.email || '');
      sessionStorage.setItem('brspark_admin_name', b.name || '');
      sessionStorage.setItem('brspark_admin_role', b.role || '');
      if (b.panelMode) sessionStorage.setItem('brspark_panel_mode', b.panelMode);
      else sessionStorage.removeItem('brspark_panel_mode');
      if (b.panelTenant) sessionStorage.setItem('brspark_panel_tenant', b.panelTenant);
      else sessionStorage.removeItem('brspark_panel_tenant');
      sessionStorage.removeItem('brspark_impersonation_backup');
      persistAdminSessionBundleFromSessionStorage();
      window.location.href = defaultLandingPageForRole(b.role || '');
    });
  }

  const toggle = document.getElementById('sidebar-toggle');
  if (toggle && !toggle.dataset.ueBound) {
    toggle.dataset.ueBound = '1';
    toggle.addEventListener('click', () => {
      setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    });
  }

  if (!window.__brsparkSidebarMqlBound) {
    window.__brsparkSidebarMqlBound = true;
    window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => {
      if (!e.matches) {
        document.body.classList.remove('sidebar-collapsed');
      } else if (isSidebarCollapsed()) {
        document.body.classList.add('sidebar-collapsed');
      }
    });
  }

  persistAdminSessionBundleFromSessionStorage();

  try {
    injectGlobalTopbarActions();
  } catch (e) {
    console.warn('[admin] injectGlobalTopbarActions:', e);
  }
}
