/**
 * sidebar.js — shared sidebar HTML injected on every page
 */

export const NAV_ITEMS = [
  { page: 'dashboard.html',     icon: 'grid-outline',       label: 'Dashboard',           section: null },
  { page: 'tenants.html',       icon: 'business-outline',   label: 'Tenants',              section: 'Gestão' },
  { page: 'users.html',         icon: 'people-outline',     label: 'Usuários',              section: null },
  { page: 'subscriptions.html', icon: 'card-outline',       label: 'Assinaturas',          section: null },
  { page: 'checklists.html',    icon: 'list-circle-outline',label: 'Forms Builder',   section: 'Operações' },
  { page: 'operations.html',    icon: 'git-branch-outline', label: 'Central de Operações', section: null },
  { page: 'cockpit.html',       icon: 'pulse-outline',      label: 'Sync Cockpit',         section: null },
  { page: 'locations.html',     icon: 'location-outline',   label: 'Multi-Location',        section: 'Multi-Location' },
  { page: 'i18n.html',          icon: 'globe-outline',      label: 'Config. Regionais',     section: null },
  { page: 'metatags.html',      icon: 'pricetags-outline',  label: 'Metatags',              section: 'Plataforma' },
  { page: 'integrations.html',  icon: 'flash-outline',       label: 'Integrações',           section: null },
  { page: 'notifications.html', icon: 'notifications-outline', label: 'Notificações',          section: null },
  { page: 'compliance.html',      icon: 'shield-checkmark-outline', label: 'LGPD & Compliance',   section: null },
  { page: 'data-collection.html', icon: 'pulse-outline',            label: 'Coleta de Dados',      section: null },
  { page: 'telemetry.html',       icon: 'navigate-circle-outline',  label: 'Telemetria',            section: null },
  { page: 'api-docs.html',      icon: 'document-text-outline',   label: 'API Docs',              section: null },
  { page: 'audit.html',         icon: 'time-outline',       label: 'Auditoria',             section: 'Sistema' },
  { page: 'system.html',        icon: 'settings-outline',   label: 'Configurações',         section: null },
];

function logout() {
  sessionStorage.removeItem('brspark_admin_token');
  sessionStorage.removeItem('brspark_admin_email');
  window.location.href = 'index.html';
}

export function renderSidebar(alertCount = 3) {
  const page = window.location.pathname.split('/').pop().replace('.html','') || 'dashboard';
  const currentPage = page.endsWith('.html') ? page : page + '.html';
  const email = sessionStorage.getItem('brspark_admin_email') || 'admin@brspark.com';
  const initials = email.slice(0, 2).toUpperCase();

  let lastSection = null;
  const navHtml = NAV_ITEMS.map(item => {
    let sectionHtml = '';
    if (item.section && item.section !== lastSection) {
      sectionHtml = `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section;
    }
    const pageKey = currentPage.replace('.html','');
    const itemKey = item.page.replace('.html','');
    const active = pageKey === itemKey ? 'active' : '';
    const badge = item.page === 'audit.html' ? `<span class="nav-badge">${alertCount}</span>` : '';
    return `${sectionHtml}
      <a href="${item.page}" class="nav-item ${active}" data-page="${item.page}">
        <ion-icon name="${item.icon}" class="nav-icon" style="font-size:18px"></ion-icon>
        <span>${item.label}</span>
        ${badge}
      </a>`;
  }).join('');

  return `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <img src="img/logo.png" alt="BrSpark Logo">
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="admin-profile" id="logout-btn" title="Sair">
          <div class="admin-avatar">${initials}</div>
          <div class="admin-info">
            <div class="admin-name">Administrador</div>
            <div class="admin-email">${email}</div>
          </div>
          <ion-icon name="log-out-outline" style="font-size:18px;color:var(--text3)"></ion-icon>
        </div>
      </div>
    </aside>`;
}

export function initPage() {
  if (!sessionStorage.getItem('brspark_admin_token')) {
    window.location.href = 'index.html';
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
  document.getElementById('logout-btn').addEventListener('click', logout);
}
