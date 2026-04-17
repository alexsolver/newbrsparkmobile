/**
 * Chat corporativo no painel admin — alinhado ao app móvel (salas, filtros, arquivadas locais, convites, grupos, ops).
 */
import { CONFIG } from './config.js';
import { getAdminUiLocale } from './user-pages-i18n.js';

const ARCHIVED_KEY = 'brspark_panel_archived_chat_rooms';
const VIEWER_LOCALE_KEY = 'brspark_panel_chat_viewer_locale';
const VIEWER_LOCALE_OPTIONS = ['pt-BR', 'en-US', 'es-ES'];

const FILTERS = [
  { id: 'ALL', label: 'Todas' },
  { id: 'UNREAD', label: 'Não lidas' },
  { id: 'GROUPS', label: 'Grupos' },
  { id: 'ARCHIVED', label: 'Arquivadas' },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const n = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!Number.isFinite(n)) return '';
  const diff = Date.now() - n;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(n).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function taskOsLabel(row) {
  if (row.osNumber && String(row.osNumber).trim()) return String(row.osNumber).trim();
  if (row.routineTaskNumber && String(row.routineTaskNumber).trim()) return String(row.routineTaskNumber).trim();
  return String(row.executionId || '').slice(0, 8);
}

function roleLabel(role) {
  const norm = String(role || '').trim().toUpperCase();
  if (norm === 'MANAGER') return 'Gestor';
  if (norm === 'TENANT_ADMIN') return 'Admin do tenant';
  if (norm === 'SAAS_ADMIN') return 'Admin SaaS';
  if (norm === 'PROVIDER') return 'Prestador';
  if (norm === 'USER') return 'Usuário';
  return norm || 'Usuário';
}

function loadArchived() {
  try {
    const raw = localStorage.getItem(ARCHIVED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveArchived(ids) {
  try {
    localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

async function apiFetchJson(path, opts = {}) {
  const res = await fetch(`${CONFIG.API_BASE}${path}`, {
    ...opts,
    headers: { ...CONFIG.headers(), ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    window.location.href = 'index.html';
    return { __401: true };
  }
  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = { error: 'Resposta inválida.' };
  }
  return { res, data };
}

export function initAdminChatPage() {
  const layout = document.getElementById('admin-chat-app');
  const listScroll = document.getElementById('admin-chat-list-scroll');
  const filtersEl = document.getElementById('admin-chat-filters');
  const placeholder = document.getElementById('admin-chat-list-placeholder');
  const totalUnreadEl = document.getElementById('admin-chat-total-unread');
  const threadTitle = document.getElementById('admin-chat-thread-title');
  const msgsEl = document.getElementById('admin-chat-msgs');
  const inputEl = document.getElementById('admin-chat-input');
  const sendBtn = document.getElementById('admin-chat-send');
  const backBtn = document.getElementById('admin-chat-back');
  const pickImg = document.getElementById('admin-chat-pick-img');
  const fileEl = document.getElementById('admin-chat-file');
  const composeEl = document.getElementById('admin-chat-compose');
  const lockedEl = document.getElementById('admin-chat-locked');
  const groupSettingsBtn = document.getElementById('admin-chat-group-settings');
  const localeSel = document.getElementById('admin-chat-locale');
  const modal = document.getElementById('admin-chat-modal');
  const modalClose = document.getElementById('admin-chat-modal-close');
  const btnNew = document.getElementById('admin-chat-btn-new');
  const settingsModal = document.getElementById('admin-chat-settings-modal');
  const settingsClose = document.getElementById('admin-chat-settings-close');
  const settingsMembers = document.getElementById('admin-chat-settings-members');
  const saveMembersBtn = document.getElementById('admin-chat-save-members');
  const userSearchEl = document.getElementById('admin-chat-user-search');
  const userResultsEl = document.getElementById('admin-chat-user-results');

  const myEmail = (sessionStorage.getItem('brspark_admin_email') || '').trim().toLowerCase();
  const myRole = (sessionStorage.getItem('brspark_admin_role') || '').trim().toUpperCase();
  const isManager = myRole === 'MANAGER';

  function normalizeViewerLocale(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const hit = VIEWER_LOCALE_OPTIONS.find((x) => x.toLowerCase() === raw.toLowerCase());
    return hit || '';
  }

  function readViewerLocale() {
    const saved = normalizeViewerLocale(localStorage.getItem(VIEWER_LOCALE_KEY));
    if (saved) return saved;
    const fromUi = normalizeViewerLocale(getAdminUiLocale());
    return fromUi || 'pt-BR';
  }

  function writeViewerLocale(next) {
    try {
      localStorage.setItem(VIEWER_LOCALE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const state = {
    filter: 'ALL',
    archived: loadArchived(),
    rooms: [],
    pending: [],
    contacts: [],
    opsThreads: [],
    mode: 'list',
    corpRoomId: '',
    corpMeta: null,
    opsExecutionId: '',
    messages: [],
    lastTs: 0,
    pollTimer: null,
    messagingState: null,
    pendingImageFile: null,
    groupSelected: [],
    modalTab: 'GROUP',
    settingsMembersSel: [],
    contactSearch: '',
    viewerLocale: readViewerLocale(),
  };

  function toast(msg) {
    window.alert(msg);
  }

  function updateBackVisibility() {
    if (!backBtn) return;
    const desktop = window.matchMedia('(min-width: 961px)').matches;
    backBtn.hidden = desktop || state.mode === 'list';
  }

  function setLayoutOpen(isOpen) {
    if (!layout) return;
    layout.classList.toggle('chat-room-open', isOpen);
    updateBackVisibility();
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  async function loadAllLists() {
    const [r1, r2, r3, r4] = await Promise.all([
      apiFetchJson('/chat/rooms'),
      apiFetchJson('/chat/contacts/pending'),
      apiFetchJson('/chat/contacts'),
      fetch(`${CONFIG.API_BASE}/operations/my-ops-chat-threads`, { headers: CONFIG.headers() }).then(async (res) => {
        if (res.status === 401) {
          window.location.href = 'index.html';
          return { threads: [] };
        }
        if (!res.ok) return { threads: [] };
        return res.json();
      }),
    ]);
    if (r1.data && r1.data.__401) return;
    state.rooms = Array.isArray(r1.data) ? r1.data : [];
    state.pending = Array.isArray(r2.data) ? r2.data : [];
    state.contacts = Array.isArray(r3.data) ? r3.data : [];
    state.opsThreads = Array.isArray(r4.threads) ? r4.threads : [];
  }

  function filteredRooms() {
    return state.rooms.filter((room) => {
      const isArchived = state.archived.has(room.id);
      if (state.filter === 'ARCHIVED') return isArchived;
      if (isArchived) return false;
      if (state.filter === 'UNREAD') return (room.unreadCount ?? 0) > 0;
      if (state.filter === 'GROUPS') return room.isGroup;
      return true;
    });
  }

  function renderFilters() {
    if (!filtersEl) return;
    const rooms = state.rooms;
    const unreadN = rooms.filter((r) => !state.archived.has(r.id) && (r.unreadCount ?? 0) > 0).length;
    const archN = state.archived.size;
    filtersEl.innerHTML = FILTERS.map((f) => {
      let badge = 0;
      if (f.id === 'UNREAD') badge = unreadN;
      if (f.id === 'ARCHIVED') badge = archN;
      const active = state.filter === f.id ? 'is-active' : '';
      const b =
        badge > 0
          ? `<span style="margin-left:6px;padding:1px 6px;border-radius:8px;background:var(--accent);color:#fff;font-size:10px;font-weight:800">${badge > 99 ? '99+' : badge}</span>`
          : '';
      return `<button type="button" class="admin-chat-filter-chip ${active}" data-filter="${f.id}">${esc(f.label)}${b}</button>`;
    }).join('');
    filtersEl.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.getAttribute('data-filter') || 'ALL';
        renderFilters();
        renderRoomList();
      });
    });
  }

  function renderRoomList() {
    if (!listScroll) return;
    const frag = document.createDocumentFragment();
    const wrap = document.createElement('div');

    const totalUnread = state.rooms.filter((r) => !state.archived.has(r.id)).reduce((s, r) => s + (r.unreadCount ?? 0), 0);
    if (totalUnreadEl) {
      if (totalUnread > 0) {
        totalUnreadEl.style.display = 'inline-block';
        totalUnreadEl.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
      } else {
        totalUnreadEl.style.display = 'none';
      }
    }

    let html = '';

    if (state.filter === 'ALL' && state.opsThreads.length) {
      html += `<div style="padding:8px 14px;font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Mensagens da operação (gestor)</div>`;
      for (const row of state.opsThreads) {
        const label = esc(taskOsLabel(row));
        const preview = esc(String(row.lastPreview || '').trim() || '—');
        const who =
          String(row.lastSenderKind || '').toUpperCase() === 'GESTOR'
            ? 'Gestor: '
            : String(row.lastSenderKind || '').toUpperCase() === 'TECH'
              ? 'Técnico: '
              : '';
        const ts = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : 0;
        html += `<div class="admin-chat-room-row" data-ops-id="${esc(row.executionId)}">
          <div class="admin-chat-av" style="background:#1d4ed8"><ion-icon name="briefcase-outline" style="color:#fff;font-size:20px"></ion-icon></div>
          <div class="admin-chat-room-meta">
            <div class="admin-chat-room-top">
              <span class="admin-chat-room-name">${label}</span>
              <span class="admin-chat-room-time">${esc(timeAgo(ts))}</span>
            </div>
            <div class="admin-chat-room-prev">${who}${preview}</div>
          </div>
        </div>`;
      }
    }

    if (state.filter === 'ALL' && state.pending.length) {
      for (const p of state.pending) {
        const u = p.user || {};
        const name = esc(u.name || p.requesterId || '');
        html += `<div class="admin-chat-pending">
          <div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text)">Pedido de contato — ${name}</div>
          <div class="admin-chat-pending-row">
            <div class="admin-chat-av" style="background:#f59e0b;width:36px;height:36px;font-size:13px">${esc((name || '?')[0] || '?')}</div>
            <div style="flex:1"></div>
            <button type="button" class="btn btn-sm btn-outline" data-contact-reject="${esc(p.id)}">Recusar</button>
            <button type="button" class="btn btn-sm btn-primary" data-contact-accept="${esc(p.id)}">Aceitar</button>
          </div>
        </div>`;
      }
    }

    const rooms = filteredRooms();
    if (!html && !rooms.length) {
      html = `<div style="padding:28px;text-align:center;color:var(--text3);font-weight:600;line-height:1.5">
        ${
          state.filter === 'ARCHIVED'
            ? 'Nenhuma conversa arquivada.'
            : state.filter === 'UNREAD'
              ? 'Nenhuma mensagem não lida.'
              : state.filter === 'GROUPS'
                ? 'Nenhum grupo ainda.'
                : 'Sem conversas. Use «Nova» para convidar ou criar um grupo.'
        }
      </div>`;
    } else {
      for (const item of rooms) {
        const unread = item.unreadCount ?? 0;
        const avColor = esc(item.avatarColor || '#2563eb');
        const avInner = item.avatarUrl
          ? `<img src="${esc(item.avatarUrl)}" alt="" />`
          : item.isGroup
            ? `<ion-icon name="people" style="color:#fff;font-size:20px"></ion-icon>`
            : esc(
                String(item.name || 'C')
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'C',
              );
        const prev = item.lastMessage
          ? `${item.lastSender ? esc(item.lastSender) + ': ' : ''}${esc(item.lastMessage)}`
          : item.isGroup
            ? `${item.memberCount} membros`
            : 'Nova conversa';
        const pill =
          unread > 0
            ? `<span class="admin-chat-unread-pill">${unread > 99 ? '99+' : unread}</span>`
            : '';
        const arch = state.archived.has(item.id);
        html += `<div class="admin-chat-room-row ${arch ? 'is-arch-hint' : ''}" data-room-id="${esc(item.id)}"
          data-room-name="${esc(item.name || 'Chat')}"
          data-room-color="${avColor}"
          data-avatar-url="${esc(item.avatarUrl || '')}"
          data-is-group="${item.isGroup ? '1' : ''}">
          <div class="admin-chat-av" style="background:${avColor}">${avInner}</div>
          <div class="admin-chat-room-meta">
            <div class="admin-chat-room-top">
              <span class="admin-chat-room-name" style="${unread ? 'font-weight:900' : ''}">${esc(item.name || 'Chat')}</span>
              <span class="admin-chat-room-time">${esc(timeAgo(item.lastMessageAt))}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
              <span class="admin-chat-room-prev" style="${unread ? 'font-weight:700;color:var(--text)' : ''}">${prev}</span>
              ${pill}
            </div>
            <div style="margin-top:8px;display:flex;gap:8px">
              <button type="button" class="btn btn-ghost btn-sm" data-archive-toggle="${esc(item.id)}">${arch ? 'Desarquivar' : 'Arquivar'}</button>
            </div>
          </div>
        </div>`;
      }
    }

    wrap.innerHTML = html;
    listScroll.innerHTML = '';
    listScroll.appendChild(wrap);

    wrap.querySelectorAll('[data-ops-id]').forEach((el) => {
      el.addEventListener('click', () => openOpsThread(el.getAttribute('data-ops-id') || ''));
    });
    wrap.querySelectorAll('[data-room-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target instanceof Element && ev.target.closest('[data-archive-toggle]')) return;
        const id = el.getAttribute('data-room-id') || '';
        openCorpRoom(id, {
          name: el.getAttribute('data-room-name') || 'Chat',
          color: el.getAttribute('data-room-color') || '#2563eb',
          avatarUrl: el.getAttribute('data-avatar-url') || '',
          isGroup: el.getAttribute('data-is-group') === '1',
        });
      });
    });
    wrap.querySelectorAll('[data-archive-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-archive-toggle') || '';
        if (state.archived.has(id)) state.archived.delete(id);
        else state.archived.add(id);
        saveArchived(state.archived);
        renderFilters();
        renderRoomList();
      });
    });
    wrap.querySelectorAll('[data-contact-accept]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-contact-accept');
        const { res } = await apiFetchJson(`/chat/contacts/${encodeURIComponent(id)}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'ACCEPTED' }),
        });
        if (res?.ok) {
          await loadAllLists();
          renderFilters();
          renderRoomList();
        } else toast('Não foi possível aceitar o pedido.');
      });
    });
    wrap.querySelectorAll('[data-contact-reject]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-contact-reject');
        const { res } = await apiFetchJson(`/chat/contacts/${encodeURIComponent(id)}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'REJECTED' }),
        });
        if (res?.ok) {
          await loadAllLists();
          renderFilters();
          renderRoomList();
        } else toast('Não foi possível recusar o pedido.');
      });
    });

    if (placeholder) placeholder.style.display = 'none';
    if (layout) layout.removeAttribute('aria-busy');
  }

  function renderMessages() {
    if (!msgsEl) return;
    msgsEl.innerHTML = state.messages
      .map((m) => {
        const mine = String(m.senderId || '').toLowerCase() === myEmail;
        const body =
          m.type === 'image' && m.mediaUrl
            ? `<div><img src="${esc(m.mediaUrl)}" alt="" style="max-width:100%;max-height:220px;border-radius:8px;display:block" /></div>${m.content ? `<div style="margin-top:6px">${esc(m.displayContent || m.content)}</div>` : ''}`
            : esc(m.displayContent || m.content || '');
        const tm = new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `<div class="admin-chat-bubble-row ${mine ? 'is-mine' : ''}">
          <div class="admin-chat-bubble">${body}${m.pending ? ' <em>(a enviar…)</em>' : ''}</div>
          <div class="admin-chat-bubble-meta">${esc(m.senderName || '')} · ${esc(tm)}</div>
        </div>`;
      })
      .join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function contactMatchesQuery(contact, query) {
    if (!query) return true;
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const role = roleLabel(contact.role).toLowerCase();
    return [contact.name, contact.email, contact.role, role].some((part) =>
      String(part || '')
        .trim()
        .toLowerCase()
        .includes(q),
    );
  }

  async function startDirectConversation(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return;
    const selected = state.contacts.find((c) => String(c.email || '').trim().toLowerCase() === normalized);
    if (!selected) {
      toast('Usuário não encontrado na lista do tenant.');
      return;
    }
    const { res, data } = await apiFetchJson('/chat/rooms', {
      method: 'POST',
      body: JSON.stringify({ isGroup: false, userIds: [normalized] }),
    });
    if (!res?.ok || !data?.id) {
      toast((data && data.error) || 'Não foi possível abrir a conversa.');
      return;
    }
    closeModal();
    await loadAllLists();
    renderFilters();
    renderRoomList();
    const existingRoom = state.rooms.find((room) => room.id === data.id);
    await openCorpRoom(data.id, {
      name: existingRoom?.name || selected.name || selected.email || 'Chat',
      color: existingRoom?.avatarColor || '#2563eb',
      avatarUrl: existingRoom?.avatarUrl || selected.avatarUrl || '',
      isGroup: false,
    });
  }

  function renderTenantUsers() {
    if (!userResultsEl) return;
    if (!state.contacts.length) {
      userResultsEl.innerHTML =
        '<div class="admin-chat-user-empty">Nenhum usuário ativo disponível neste tenant.</div>';
      return;
    }
    const rows = state.contacts.filter((contact) => contactMatchesQuery(contact, state.contactSearch));
    if (!rows.length) {
      userResultsEl.innerHTML =
        '<div class="admin-chat-user-empty">Nenhum usuário encontrado com esse filtro.</div>';
      return;
    }
    userResultsEl.innerHTML = rows
      .map((contact) => {
        const email = String(contact.email || '').trim().toLowerCase();
        const name = String(contact.name || '').trim() || email || 'Usuário';
        const initials = esc(
          name
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'U',
        );
        const role = roleLabel(contact.role);
        const avatar = contact.avatarUrl
          ? `<img src="${esc(contact.avatarUrl)}" alt="" />`
          : initials;
        return `<div class="admin-chat-user-row">
          <div class="admin-chat-av" style="background:var(--accent)">${avatar}</div>
          <div class="admin-chat-user-main">
            <div class="admin-chat-user-top">
              <strong class="admin-chat-user-name">${esc(name)}</strong>
              <span class="admin-chat-user-role">${esc(role)}</span>
            </div>
            <div class="admin-chat-user-meta">${esc(email)}</div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-direct-chat="${esc(email)}">Abrir chat</button>
        </div>`;
      })
      .join('');
    userResultsEl.querySelectorAll('[data-direct-chat]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await startDirectConversation(btn.getAttribute('data-direct-chat') || '');
      });
    });
  }

  async function refreshMessagingState() {
    if (!state.corpRoomId || state.mode !== 'corp') {
      state.messagingState = null;
      return;
    }
    const { res, data } = await apiFetchJson(`/chat/rooms/${encodeURIComponent(state.corpRoomId)}/messaging-state`);
    if (res?.ok && data && typeof data === 'object') state.messagingState = data;
    else state.messagingState = null;
    updateComposeLock();
  }

  function updateComposeLock() {
    if (!lockedEl || !composeEl || !pickImg || !inputEl || !sendBtn) return;
    if (state.mode === 'ops') {
      lockedEl.hidden = true;
      composeEl.style.opacity = '';
      pickImg.disabled = false;
      inputEl.disabled = false;
      sendBtn.disabled = false;
      return;
    }
    const st = state.messagingState;
    const locked = st && st.technicianClientGated && !st.messagingActive;
    if (locked) {
      lockedEl.hidden = false;
      lockedEl.textContent =
        'Este chat só fica ativo após o início do deslocamento e com a OS em atendimento. Pode ler as mensagens anteriores.';
      pickImg.disabled = true;
      inputEl.disabled = true;
      sendBtn.disabled = true;
      composeEl.style.opacity = '0.85';
    } else {
      lockedEl.hidden = true;
      pickImg.disabled = false;
      inputEl.disabled = false;
      sendBtn.disabled = false;
      composeEl.style.opacity = '';
    }
  }

  async function loadCorpMessages(initial = false) {
    if (!state.corpRoomId) return;
    const loc = state.viewerLocale || 'pt-BR';
    const q = new URLSearchParams();
    q.set('since', String(initial ? 0 : state.lastTs));
    if (loc) q.set('viewerLocale', loc);
    const { res, data } = await apiFetchJson(`/chat/rooms/${encodeURIComponent(state.corpRoomId)}/messages?${q}`);
    if (!res?.ok || !Array.isArray(data)) return;
    if (initial) {
      state.messages = data.slice().sort((a, b) => a.timestamp - b.timestamp);
    } else {
      const ids = new Set(state.messages.map((m) => m.id));
      for (const m of data) {
        if (!ids.has(m.id)) state.messages.push(m);
      }
      state.messages.sort((a, b) => a.timestamp - b.timestamp);
    }
    if (state.messages.length) state.lastTs = state.messages[state.messages.length - 1].timestamp;
    renderMessages();
  }

  async function loadOpsMessages() {
    if (!state.opsExecutionId) return;
    const q = new URLSearchParams();
    const loc = state.viewerLocale || 'pt-BR';
    if (loc) q.set('viewerLocale', loc);
    const { res, data } = await apiFetchJson(
      `/operations/tasks/${encodeURIComponent(state.opsExecutionId)}/ops-chat${q.toString() ? `?${q.toString()}` : ''}`,
    );
    if (!res?.ok || !data || !Array.isArray(data.messages)) return;
    const rows = data.messages;
    state.messages = rows.map((m) => ({
      id: m.id,
      roomId: state.opsExecutionId,
      senderId: m.senderEmail,
      senderName:
        String(m.senderKind || '').toUpperCase() === 'GESTOR'
          ? 'Gestor'
          : String(m.senderEmail || '').toLowerCase() === myEmail
            ? 'Você'
            : 'Técnico',
      type: 'text',
      content: m.body,
      displayContent: m.displayBody || m.body,
      timestamp: new Date(m.createdAt).getTime(),
      pending: false,
    }));
    if (state.messages.length) state.lastTs = state.messages[state.messages.length - 1].timestamp;
    renderMessages();
  }

  async function openCorpRoom(id, meta) {
    stopPoll();
    state.mode = 'corp';
    state.corpRoomId = id;
    state.corpMeta = meta;
    state.opsExecutionId = '';
    state.messages = [];
    state.lastTs = 0;
    state.pendingImageFile = null;
    if (fileEl) fileEl.value = '';
    threadTitle.textContent = meta.name || 'Chat';
    groupSettingsBtn.hidden = !meta.isGroup;
    setLayoutOpen(true);
    msgsEl.innerHTML = '<div style="color:var(--text3);font-weight:600">Carregando…</div>';
    await apiFetchJson(`/chat/rooms/${encodeURIComponent(id)}/read`, { method: 'PUT', body: '{}' });
    await refreshMessagingState();
    await loadCorpMessages(true);
    state.pollTimer = setInterval(async () => {
      await refreshMessagingState();
      await loadCorpMessages(false);
    }, 3000);
    updateComposeLock();
    await loadAllLists();
    renderRoomList();
  }

  async function openOpsThread(executionId) {
    stopPoll();
    state.mode = 'ops';
    state.opsExecutionId = executionId;
    state.corpRoomId = '';
    state.corpMeta = null;
    state.messages = [];
    state.lastTs = 0;
    state.messagingState = null;
    updateComposeLock();
    const row = state.opsThreads.find((t) => t.executionId === executionId);
    threadTitle.textContent = row ? `Gestor · ${taskOsLabel(row)}` : 'Chat da operação';
    groupSettingsBtn.hidden = true;
    setLayoutOpen(true);
    await loadOpsMessages();
    stopPoll();
    state.pollTimer = setInterval(loadOpsMessages, 3000);
  }

  function closeThread() {
    stopPoll();
    state.mode = 'list';
    state.corpRoomId = '';
    state.opsExecutionId = '';
    state.messages = [];
    state.messagingState = null;
    threadTitle.textContent = 'Selecione uma conversa';
    msgsEl.innerHTML = '';
    groupSettingsBtn.hidden = true;
    lockedEl.hidden = true;
    setLayoutOpen(false);
    loadAllLists().then(() => {
      renderFilters();
      renderRoomList();
    });
  }

  async function sendCorp() {
    const text = (inputEl.value || '').trim();
    if (!state.corpRoomId) return;
    await refreshMessagingState();
    updateComposeLock();
    if (inputEl.disabled) {
      toast('Este chat ainda não está ativo para envio.');
      return;
    }
    if (!text && !state.pendingImageFile) return;

    let mediaUrl;
    if (state.pendingImageFile) {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const r = String(reader.result || '');
          const i = r.indexOf(',');
          resolve(i >= 0 ? r.slice(i + 1) : r);
        };
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(state.pendingImageFile);
      });
      const ext = (state.pendingImageFile.type || 'image/jpeg').split('/')[1] || 'jpg';
      const path = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const up = await apiFetchJson('/storage/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: state.pendingImageFile.type || 'image/jpeg',
          name: path,
          path,
        }),
      });
      if (!up.res?.ok || !up.data?.url) {
        toast('Falha ao enviar a imagem. Tente outra foto ou verifique o armazenamento.');
        return;
      }
      mediaUrl = up.data.url;
    }

    const payload = state.pendingImageFile
      ? { type: 'image', content: text || undefined, mediaUrl }
      : { type: 'text', content: text };

    const { res, data } = await apiFetchJson(`/chat/rooms/${encodeURIComponent(state.corpRoomId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res?.ok) {
      toast((data && data.error) || 'Não foi possível enviar.');
      return;
    }
    inputEl.value = '';
    state.pendingImageFile = null;
    if (fileEl) fileEl.value = '';
    state.messages.push(data);
    state.lastTs = data.timestamp;
    renderMessages();
  }

  async function sendOps() {
    const text = (inputEl.value || '').trim();
    if (!state.opsExecutionId || !text) return;
    const q = new URLSearchParams();
    const loc = state.viewerLocale || 'pt-BR';
    if (loc) q.set('viewerLocale', loc);
    const { res, data } = await apiFetchJson(
      `/operations/tasks/${encodeURIComponent(state.opsExecutionId)}/ops-chat${q.toString() ? `?${q.toString()}` : ''}`,
      {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      },
    );
    if (!res?.ok) {
      toast((data && data.error) || 'Não foi possível enviar.');
      return;
    }
    inputEl.value = '';
    await loadOpsMessages();
  }

  sendBtn.addEventListener('click', () => {
    if (state.mode === 'corp') void sendCorp();
    else if (state.mode === 'ops') void sendOps();
  });

  if (localeSel) {
    localeSel.value = state.viewerLocale;
    localeSel.addEventListener('change', async () => {
      const next = normalizeViewerLocale(localeSel.value) || 'pt-BR';
      state.viewerLocale = next;
      localeSel.value = next;
      writeViewerLocale(next);
      if (state.mode === 'corp' && state.corpRoomId) {
        state.lastTs = 0;
        await loadCorpMessages(true);
      } else if (state.mode === 'ops' && state.opsExecutionId) {
        state.lastTs = 0;
        await loadOpsMessages();
      }
    });
  }

  backBtn.addEventListener('click', closeThread);

  pickImg.addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', () => {
    const f = fileEl.files && fileEl.files[0];
    state.pendingImageFile = f || null;
    if (f && state.mode === 'ops') {
      toast('No chat da operação só é possível enviar texto.');
      state.pendingImageFile = null;
      fileEl.value = '';
    }
  });

  function openModal() {
    state.modalTab = isManager ? 'GROUP' : 'ADD';
    state.groupSelected = [];
    state.contactSearch = '';
    document.getElementById('admin-chat-group-name').value = '';
    document.getElementById('admin-chat-invite-email').value = '';
    if (userSearchEl) userSearchEl.value = '';
    modal.hidden = false;
    syncModalTabs();
    renderModalMembers();
    renderTenantUsers();
  }

  function closeModal() {
    modal.hidden = true;
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  btnNew.addEventListener('click', openModal);

  function syncModalTabs() {
    if (!isManager) state.modalTab = 'ADD';
    const tabs = modal.querySelectorAll('.admin-chat-modal-tabs [data-tab]');
    tabs.forEach((t) => {
      const tab = t.getAttribute('data-tab') || '';
      if (!isManager && tab === 'GROUP') {
        t.hidden = true;
      } else {
        t.hidden = false;
      }
      t.classList.toggle('is-active', t.getAttribute('data-tab') === state.modalTab);
    });
    document.getElementById('admin-chat-modal-panel-group').hidden = state.modalTab !== 'GROUP' || !isManager;
    document.getElementById('admin-chat-modal-panel-add').hidden = state.modalTab !== 'ADD';
    if (state.modalTab === 'ADD') renderTenantUsers();
  }

  modal.querySelectorAll('.admin-chat-modal-tabs [data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.modalTab = btn.getAttribute('data-tab') || 'GROUP';
      syncModalTabs();
    });
  });

  userSearchEl?.addEventListener('input', () => {
    state.contactSearch = userSearchEl.value || '';
    renderTenantUsers();
  });

  function renderModalMembers() {
    const box = document.getElementById('admin-chat-group-members');
    if (!box) return;
    if (!state.contacts.length) {
      box.innerHTML = '<div style="padding:12px;color:var(--text3);font-weight:600">Nenhum usuário ativo disponível neste tenant.</div>';
      return;
    }
    box.innerHTML = state.contacts
      .map((c) => {
        const em = String(c.email || '').trim();
        const checked = state.groupSelected.includes(em) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border);cursor:pointer">
          <input type="checkbox" data-gm-email="${esc(em)}" ${checked} />
          <div><div style="font-weight:800">${esc(c.name || em)}</div><div style="font-size:12px;color:var(--text3)">${esc(em)} · ${esc(roleLabel(c.role))}</div></div>
        </label>`;
      })
      .join('');
    box.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const em = cb.getAttribute('data-gm-email');
        if (cb.checked) {
          if (!state.groupSelected.includes(em)) state.groupSelected.push(em);
        } else {
          state.groupSelected = state.groupSelected.filter((x) => x !== em);
        }
      });
    });
  }

  document.getElementById('admin-chat-create-group').addEventListener('click', async () => {
    if (!isManager) {
      toast('Somente gestores podem criar grupos.');
      return;
    }
    const name = document.getElementById('admin-chat-group-name').value.trim();
    if (!name) return toast('Indique o nome do grupo.');
    if (!state.groupSelected.length) return toast('Selecione pelo menos um membro.');
    const { res, data } = await apiFetchJson('/chat/rooms', {
      method: 'POST',
      body: JSON.stringify({ isGroup: true, name, userIds: state.groupSelected }),
    });
    if (!res?.ok) {
      toast((data && data.error) || 'Não foi possível criar o grupo.');
      return;
    }
    closeModal();
    await loadAllLists();
    renderFilters();
    renderRoomList();
    openCorpRoom(data.id, {
      name: data.name || name,
      color: data.avatarColor || '#2563eb',
      avatarUrl: data.avatarUrl || '',
      isGroup: true,
    });
  });

  document.getElementById('admin-chat-send-invite').addEventListener('click', async () => {
    const email = document.getElementById('admin-chat-invite-email').value.trim().toLowerCase();
    if (!email.includes('@')) return toast('E-mail inválido.');
    const { res, data } = await apiFetchJson('/chat/contacts/request', {
      method: 'POST',
      body: JSON.stringify({ contactEmail: email }),
    });
    if (!res?.ok) {
      toast((data && data.error) || 'Não foi possível enviar o convite.');
      return;
    }
    toast('Convite enviado.');
    closeModal();
    await loadAllLists();
    renderFilters();
    renderRoomList();
  });

  function closeSettings() {
    settingsModal.hidden = true;
  }
  settingsClose.addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  groupSettingsBtn.addEventListener('click', () => {
    if (!state.corpRoomId || !state.corpMeta?.isGroup) return;
    const room = state.rooms.find((r) => r.id === state.corpRoomId);
    const members = (room && room.members) || [];
    state.settingsMembersSel = members.map((m) => String(m.userId || m.email || '').trim()).filter(Boolean);
    const byEmail = new Map(state.contacts.map((c) => [String(c.email || '').trim().toLowerCase(), c]));
    for (const m of members) {
      const em = String(m.userId || m.email || '').trim().toLowerCase();
      if (em && !byEmail.has(em)) byEmail.set(em, { email: em, name: em });
    }
    const rows = [...byEmail.values()];
    rows.sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'pt-BR'));
    settingsMembers.innerHTML = rows
      .map((c) => {
        const em = String(c.email || '').trim();
        const checked = state.settingsMembersSel.some((x) => x.toLowerCase() === em.toLowerCase()) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border);cursor:pointer">
          <input type="checkbox" data-sm-email="${esc(em)}" ${checked} />
          <div><div style="font-weight:800">${esc(c.name || em)}</div><div style="font-size:12px;color:var(--text3)">${esc(em)}${c.role ? ` · ${esc(roleLabel(c.role))}` : ''}</div></div>
        </label>`;
      })
      .join('');
    settingsMembers.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const em = String(cb.getAttribute('data-sm-email') || '').trim();
        const low = em.toLowerCase();
        if (cb.checked) {
          if (!state.settingsMembersSel.some((x) => String(x).trim().toLowerCase() === low)) state.settingsMembersSel.push(em);
        } else {
          state.settingsMembersSel = state.settingsMembersSel.filter((x) => String(x).trim().toLowerCase() !== low);
        }
      });
    });
    settingsModal.hidden = false;
  });

  saveMembersBtn.addEventListener('click', async () => {
    if (!state.corpRoomId) return;
    const { res, data } = await apiFetchJson(`/chat/rooms/${encodeURIComponent(state.corpRoomId)}/members`, {
      method: 'PUT',
      body: JSON.stringify({ userIds: state.settingsMembersSel }),
    });
    if (!res?.ok) {
      toast((data && data.error) || 'Não foi possível salvar.');
      return;
    }
    closeSettings();
    await loadAllLists();
    renderRoomList();
  });

  window.addEventListener('resize', () => {
    if (!layout) return;
    if (state.mode === 'list') {
      layout.classList.remove('chat-room-open');
    } else {
      layout.classList.add('chat-room-open');
    }
    updateBackVisibility();
  });

  (async () => {
    await loadAllLists();
    renderFilters();
    renderRoomList();
  })();
}
