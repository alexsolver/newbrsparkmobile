/**
 * Edição completa de usuário (admin) — dados, endereço, prestador, documentos multi-location, horários.
 */
import { initPage } from './sidebar.js';
import { CONFIG, getEffectivePanelCapabilities } from './config.js';
import {
  getAdminUiLocale,
  setAdminUiLocale,
  t,
  getDocTypeRowsForLocale,
  weekdaysForLocale,
  applyUserEditStaticPageI18n,
  applyAddressFieldLabelsForCountry,
} from './user-pages-i18n.js';
import { adminIntlLocale } from './admin-i18n-resolve.js';

/** Atualizado em `bootUserEditPage` para acionar indicador «não guardado» */
const dirtyHooks = { mark: () => {}, refreshWorkspace: () => {} };
let ueSkillsWidgetBound = false;
/** E-mail técnico no `User.email` da linha vs. o mostrado no painel (conta de login real / +brspark). */
let ueBaselineRowEmail = '';
let ueBaselineDisplayEmail = '';
/** Definido em `bootUserEditPage` — atualiza a secção de ponto após alterar a galeria facial. */
let bumpUserRefFaceState = null;
/** Tenant com `locale.countryCode === 'BR'` — mostra vínculo CLT/PJ no registro de horas. */
let ueTenantCountryBr = false;
const userEditPanelCaps = new Set(getEffectivePanelCapabilities());
const isLimitedTenantManager = userEditPanelCaps.has('tenant.users.write.limited');
const isTenantUserAdmin =
  userEditPanelCaps.has('tenant.users.write.self') || userEditPanelCaps.has('tenant.users.write.any');
const isPlatformUserAdmin = userEditPanelCaps.has('platform.users.write');

function readWtBrRegimeFromDom() {
  const wrap = document.getElementById('wt-br-regime-wrap');
  if (!wrap) return 'CLT';
  const sel = wrap.querySelector('input[name="f-wt-br-regime"]:checked');
  return sel && String(sel.value).toUpperCase() === 'PJ' ? 'PJ' : 'CLT';
}

function updateWtBrRegimeRow() {
  const wrap = document.getElementById('wt-br-regime-wrap');
  const fWt = document.getElementById('f-work-time');
  if (!wrap) return;
  const show = ueTenantCountryBr && fWt && fWt.checked;
  wrap.hidden = !show;
  let ro = false;
  try {
    ro = isUserEditReadonly();
  } catch {
    ro = false;
  }
  wrap.querySelectorAll('input[name="f-wt-br-regime"]').forEach((inp) => {
    inp.disabled = ro;
  });
  wrap.querySelectorAll('.wt-br-lbl').forEach((lbl) => {
    if (lbl instanceof HTMLElement) {
      lbl.style.pointerEvents = ro ? 'none' : '';
      lbl.style.opacity = ro ? '0.65' : '';
    }
  });
}

function markDirty() {
  dirtyHooks.mark();
  dirtyHooks.refreshWorkspace();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function humanLoginEmailDisplay(u) {
  const fromApi = u?.loginEmailNorm;
  if (fromApi && String(fromApi).trim()) return String(fromApi).trim();
  const an = u?.appAccount?.emailNorm;
  if (an && String(an).trim()) return String(an).trim();
  return String(u?.email || '').trim();
}

function syncUserEditEmailBaselines(u) {
  ueBaselineRowEmail = String(u?.email || '').trim();
  ueBaselineDisplayEmail = humanLoginEmailDisplay(u);
}

const NAV_CTX_KEY = 'brspark_user_edit_nav';
const DUP_DRAFT_KEY = 'brspark_user_duplicate_draft';
const COLLAPSIBLE_SECTION_SUMMARIES = {
  'sec-face': 'Fotos base e situação da biometria.',
  'sec-docs-p': 'Documentos civis e pessoais do colaborador.',
  'sec-docs-pro': 'Certificações, NR, ASO e anexos operacionais.',
  'sec-horarios': 'Turnos e disponibilidade por dia.',
  'sec-regioes': 'Cobertura geográfica e bases habilitadas.',
  'sec-provider-affiliations': 'Vínculo com empresas (convites e estado).',
  'sec-ops': 'Sessão ativa, notas internas e preferências.',
  'sec-audit': 'Histórico recente de ações administrativas.',
};

function panelTenantIdUserEdit() {
  try {
    if (sessionStorage.getItem('brspark_panel_mode') === 'tenant') {
      const row = JSON.parse(sessionStorage.getItem('brspark_panel_tenant') || '{}');
      return row.id || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function formatUeDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(adminIntlLocale(getAdminUiLocale()), { dateStyle: 'short', timeStyle: 'short' });
}

function providerAffStatusLabel(status) {
  const u = String(status || '').toUpperCase();
  const key =
    {
      INVITED: 'ue_paffStInvited',
      REQUESTED: 'ue_paffStRequested',
      ACTIVE: 'ue_paffStActive',
      INACTIVE: 'ue_paffStInactive',
      SUSPENDED: 'ue_paffStSuspended',
      REJECTED: 'ue_paffStRejected',
    }[u] || null;
  return key ? t(key) : u || '—';
}

/**
 * Não use `button.disabled` quando falta ProviderIdentity: o browser não dispara clique (parece
 * "botão morto"). Usamos `data-ue-paff-has-pi` + estilo; o handler mostra o alerta.
 */
function syncPaffInviteButtonFromPayload(payload) {
  const invBtn = document.getElementById('ue-paff-invite-btn');
  const body = document.getElementById('ue-paff-body');
  const hasPi = !!(payload?.providerIdentity);
  if (body) body.setAttribute('data-ue-paff-has-pi', hasPi ? '1' : '0');
  if (!invBtn) return;
  if (isUserEditReadonly()) return;
  const needPi = !hasPi;
  invBtn.disabled = false;
  invBtn.title = needPi ? t('ue_paffInviteNeedPi') : '';
  invBtn.classList.toggle('ue-paff-invite--no-pi', needPi);
  invBtn.style.opacity = needPi ? '0.82' : '';
  invBtn.setAttribute('aria-disabled', needPi ? 'true' : 'false');
}

/** Clic no texto dentro do `<button>` → `target` pode ser nó de texto (sem `closest`). */
function uePaffDomElementFromTarget(clickTarget) {
  if (!clickTarget) return null;
  return clickTarget.nodeType === 1 ? clickTarget : clickTarget.parentElement || null;
}

function setUePaffInlineError(message) {
  const errEl = document.getElementById('ue-paff-error');
  if (!errEl || !message) return;
  errEl.style.display = '';
  errEl.textContent = message;
  try {
    errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {
    /* ignore */
  }
}

function clearUePaffInlineError() {
  const errEl = document.getElementById('ue-paff-error');
  if (!errEl) return;
  errEl.style.display = 'none';
  errEl.textContent = '';
}

const UE_PAFF_DED_WD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
let uePaffDedCtx = { userId: '', affId: '' };

function closeUePaffDedicatedExclusiveModal() {
  const ov = document.getElementById('ue-paff-ded-overlay');
  if (ov) ov.classList.remove('open');
}

function normalizeTimeHmForInput(v) {
  const s = String(v || '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return '08:00';
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function uePaffDedRowHtml(weekday, start, end) {
  const wd0 = UE_PAFF_DED_WD.includes(weekday) ? weekday : 'mon';
  const opts = UE_PAFF_DED_WD.map(
    (w) => `<option value="${w}"${w === wd0 ? ' selected' : ''}>${esc(t(`ue_paffDedDay_${w}`))}</option>`,
  ).join('');
  const st = normalizeTimeHmForInput(start);
  const en = normalizeTimeHmForInput(end);
  return `<tr data-ue-ded-row>
    <td><select class="form-control form-control-sm ue-ded-wd">${opts}</select></td>
    <td><input class="form-control form-control-sm ue-ded-start" type="time" value="${esc(st)}" /></td>
    <td><input class="form-control form-control-sm ue-ded-end" type="time" value="${esc(en)}" /></td>
    <td><button type="button" class="btn btn-sm btn-outline ue-ded-rm">${esc(t('ue_paffDedRemove'))}</button></td>
  </tr>`;
}

function ensureUePaffDedModalBound() {
  if (window.__brsparkUePaffDedBound) return;
  window.__brsparkUePaffDedBound = true;
  document.getElementById('ue-paff-ded-close')?.addEventListener('click', () => closeUePaffDedicatedExclusiveModal());
  document.getElementById('ue-paff-ded-cancel')?.addEventListener('click', () => closeUePaffDedicatedExclusiveModal());
  document.getElementById('ue-paff-ded-overlay')?.addEventListener('click', (ev) => {
    if (ev.target && ev.target.id === 'ue-paff-ded-overlay') closeUePaffDedicatedExclusiveModal();
  });
  document.getElementById('ue-paff-ded-tbody')?.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('.ue-ded-rm');
    if (!b) return;
    ev.preventDefault();
    b.closest('tr')?.remove();
  });
  document.getElementById('ue-paff-ded-add')?.addEventListener('click', () => {
    const tb = document.getElementById('ue-paff-ded-tbody');
    if (!tb) return;
    tb.insertAdjacentHTML('beforeend', uePaffDedRowHtml('mon', '08:00', '18:00'));
  });
  document.getElementById('ue-paff-ded-save')?.addEventListener('click', () => void saveUePaffDedicatedExclusiveModal());
}

async function saveUePaffDedicatedExclusiveModal() {
  const tzEl = document.getElementById('ue-paff-ded-tz');
  const tb = document.getElementById('ue-paff-ded-tbody');
  if (!tzEl || !tb) return;
  const weeklyWindows = [];
  for (const tr of tb.querySelectorAll('tr[data-ue-ded-row]')) {
    const wd = tr.querySelector('.ue-ded-wd')?.value;
    const st = tr.querySelector('.ue-ded-start')?.value;
    const en = tr.querySelector('.ue-ded-end')?.value;
    if (wd && st && en) weeklyWindows.push({ weekday: wd, start: st, end: en });
  }
  const body = { timezone: String(tzEl.value || 'UTC').trim(), weeklyWindows };
  const res = await CONFIG.patch(
    `/users/${encodeURIComponent(uePaffDedCtx.userId)}/provider-affiliations/${encodeURIComponent(uePaffDedCtx.affId)}/dedicated-exclusive`,
    body,
  ).catch(() => null);
  if (res?.error) {
    alert(res.error);
    return;
  }
  if (!res?.ok) {
    alert(t('ue_paffGenericErr'));
    return;
  }
  closeUePaffDedicatedExclusiveModal();
  await refreshUserEditProviderAffiliations();
  alert(t('ue_paffDedicatedSaved'));
}

async function openUePaffDedicatedExclusiveModal(affId) {
  ensureUePaffDedModalBound();
  const uid = String(uePaffLastUserId || '').trim();
  if (!uid || !affId) return;
  const hint = document.getElementById('ue-paff-ded-hint');
  const tzEl = document.getElementById('ue-paff-ded-tz');
  const tb = document.getElementById('ue-paff-ded-tbody');
  const thDay = document.getElementById('ue-paff-ded-th-day');
  const thStart = document.getElementById('ue-paff-ded-th-start');
  const thEnd = document.getElementById('ue-paff-ded-th-end');
  const thAct = document.getElementById('ue-paff-ded-th-act');
  const title = document.getElementById('ue-paff-ded-title');
  const lblTz = document.getElementById('ue-paff-ded-lbl-tz');
  if (title) title.textContent = t('ue_paffDedicatedModalTitle');
  if (hint) hint.textContent = t('ue_paffDedHint');
  if (lblTz) lblTz.textContent = t('ue_paffDedLblTz');
  if (thDay) thDay.textContent = t('ue_paffDedThDay');
  if (thStart) thStart.textContent = t('ue_paffDedThStart');
  if (thEnd) thEnd.textContent = t('ue_paffDedThEnd');
  if (thAct) thAct.textContent = t('ue_paffDedThAct');
  const addBtn = document.getElementById('ue-paff-ded-add');
  if (addBtn) addBtn.textContent = t('ue_paffDedAddLine');
  const data = await CONFIG.get(`/users/${encodeURIComponent(uid)}/provider-affiliations`).catch(() => null);
  if (!data || data.error) {
    alert(data?.error || t('ue_paffLoadErr'));
    return;
  }
  const row = (data.affiliations || []).find((r) => String(r.id) === String(affId));
  if (!row) {
    alert(t('ue_paffDedicatedNotFound'));
    return;
  }
  if (String(row.relationshipType || '').toUpperCase() !== 'DEDICATED') {
    alert(t('ue_paffDedicatedNeedRel'));
    return;
  }
  uePaffDedCtx = { userId: uid, affId: String(affId) };
  const raw = parseJsonSafe(row.tenantScheduleJson, {});
  const block = raw && typeof raw === 'object' ? raw.dedicatedExclusive : null;
  const tz = block && block.timezone ? String(block.timezone).trim() : 'America/Sao_Paulo';
  const wins = Array.isArray(block?.weeklyWindows) ? block.weeklyWindows : [];
  if (tzEl) tzEl.value = tz;
  if (tb) {
    tb.innerHTML = wins.length
      ? wins
          .map((w) =>
            uePaffDedRowHtml(
              String(w.weekday || 'mon')
                .toLowerCase()
                .slice(0, 3),
              w.start,
              w.end,
            ),
          )
          .join('')
      : uePaffDedRowHtml('mon', '08:00', '18:00');
  }
  document.getElementById('ue-paff-ded-overlay')?.classList.add('open');
}

async function handleUePaffAffiliationAction(actBtn) {
  if (isUserEditReadonly()) {
    setUePaffInlineError(t('ue_paffReadonlyBlock'));
    return;
  }
  const affId = actBtn.getAttribute('data-aff');
  const act = actBtn.getAttribute('data-act');
  if (!affId || !act) return;
  if (act === 'dedicated-windows') {
    await openUePaffDedicatedExclusiveModal(affId);
    return;
  }
  if (act === 'activate') {
    const blockKyc = actBtn.getAttribute('data-ue-paff-kyc-block') === '1';
    const blockPf = actBtn.getAttribute('data-ue-paff-pf-block') === '1';
    if (blockKyc || blockPf) {
      const parts = [];
      if (blockKyc) parts.push(t('ue_paffActivateNeedKyc'));
      if (blockPf) parts.push(t('ue_paffActivateNeedProviderFirst'));
      const msg = parts.join('\n\n');
      setUePaffInlineError(msg);
      alert(msg);
      return;
    }
  }
  if (act === 'end' && !confirm(t('ue_paffEndConfirm'))) return;
  clearUePaffInlineError();
  const noteEl = document.getElementById('ue-paff-note');
  const note = noteEl ? String(noteEl.value || '').trim() : '';
  const path =
    act === 'activate'
      ? `/providers/affiliations/${encodeURIComponent(affId)}/activate`
      : `/providers/affiliations/${encodeURIComponent(affId)}/end`;
  const body = note ? { note } : {};
  try {
    const res = await CONFIG.post(path, body).catch(() => null);
    if (res?.error) {
      setUePaffInlineError(res.error);
      alert(res.error);
      return;
    }
    if (!res?.ok) {
      const msg = res?.error || t('ue_paffGenericErr');
      setUePaffInlineError(msg);
      alert(msg);
      return;
    }
    await refreshUserEditProviderAffiliations();
  } catch (e) {
    console.error('[ue-paff-act]', e);
    const msg = e?.message || t('ue_paffGenericErr');
    setUePaffInlineError(msg);
    alert(msg);
  }
}

/**
 * Clic na secção: revisão onboarding global / Ativar / Encerrar / convite.
 */
async function onUePaffSectionUnifiedClick(ev) {
  const el = uePaffDomElementFromTarget(ev.target);
  const obBtn = el?.closest?.('.ue-paff-ob-act');
  if (obBtn) {
    ev.preventDefault();
    await handleUePaffOnboardingReviewAction(obBtn);
    return;
  }
  const actBtn = el?.closest?.('.ue-paff-act');
  if (actBtn) {
    ev.preventDefault();
    await handleUePaffAffiliationAction(actBtn);
    return;
  }
  await onUePaffSectionClickForInvite(ev);
}

function paintProviderOnboardingReview(payload) {
  const wrap = document.getElementById('ue-paff-onboarding-wrap');
  const summary = document.getElementById('ue-paff-ob-summary');
  const prior = document.getElementById('ue-paff-ob-revision-prior');
  const revisionWrap = document.getElementById('ue-paff-ob-revision-wrap');
  const actions = document.getElementById('ue-paff-ob-actions');
  const noteEl = document.getElementById('ue-paff-ob-revision-note');
  if (!wrap || !summary) return;
  const pi = payload?.providerIdentity;
  const app = payload?.onboardingApplication;
  if (!pi) {
    wrap.hidden = true;
    return;
  }
  const st = app ? String(app.status || '').toUpperCase() : '';
  const kycOk = String(pi.kycStatus || '').toUpperCase() === 'APPROVED';
  if (st === 'SUBMITTED' && !kycOk) {
    wrap.hidden = false;
    const sub = app?.submittedAt ? formatUeDateTime(app.submittedAt) : '—';
    summary.textContent = String(t('ue_paffObSummarySubmitted')).replace(/\{submitted\}/g, sub);
    if (prior) {
      prior.style.display = 'none';
      prior.textContent = '';
    }
    if (revisionWrap) revisionWrap.style.display = '';
    if (actions) actions.style.display = '';
    if (noteEl) noteEl.value = '';
    return;
  }
  if (st === 'NEEDS_REVISION') {
    wrap.hidden = false;
    summary.textContent = t('ue_paffObSummaryNeedsRevision');
    if (prior) {
      const rn = app?.revisionNote ? String(app.revisionNote).trim() : '';
      if (rn) {
        prior.style.display = '';
        prior.textContent = `${t('ue_paffObPriorNotePrefix')} ${rn}`.slice(0, 4000);
      } else {
        prior.style.display = 'none';
        prior.textContent = '';
      }
    }
    if (revisionWrap) revisionWrap.style.display = 'none';
    if (actions) actions.style.display = 'none';
    return;
  }
  wrap.hidden = true;
}

async function handleUePaffOnboardingReviewAction(btn) {
  if (isUserEditReadonly()) {
    setUePaffInlineError(t('ue_paffReadonlyBlock'));
    return;
  }
  const uid = uePaffLastUserId;
  const act = btn.getAttribute('data-ob-act');
  if (!uid || !act) return;
  if (act === 'reject' && !confirm(t('ue_paffObRejectConfirm'))) return;
  const noteEl = document.getElementById('ue-paff-ob-revision-note');
  const note = noteEl ? String(noteEl.value || '').trim() : '';
  if (act === 'revision' && !note) {
    alert(t('ue_paffObRevisionNoteRequired'));
    return;
  }
  clearUePaffInlineError();
  let path = '';
  /** @type {Record<string, unknown>} */
  let body = {};
  if (act === 'approve') {
    path = `/users/${encodeURIComponent(uid)}/provider-onboarding/approve`;
  } else if (act === 'revision') {
    path = `/users/${encodeURIComponent(uid)}/provider-onboarding/request-revision`;
    body = { note };
  } else if (act === 'reject') {
    path = `/users/${encodeURIComponent(uid)}/provider-onboarding/reject`;
    body = note ? { note } : {};
  } else {
    return;
  }
  try {
    const res = await CONFIG.post(path, body).catch(() => null);
    if (res?.error) {
      setUePaffInlineError(res.error);
      alert(res.error);
      return;
    }
    if (!res?.ok) {
      const msg = res?.error || t('ue_paffGenericErr');
      setUePaffInlineError(msg);
      alert(msg);
      return;
    }
    if (act === 'approve') alert(t('ue_paffObApprovedOk'));
    await refreshUserEditProviderAffiliations();
  } catch (e) {
    console.error('[ue-paff-ob]', e);
    const msg = e?.message || t('ue_paffGenericErr');
    setUePaffInlineError(msg);
    alert(msg);
  }
}

function paintProviderAffiliationsSection(payload) {
  const tbody = document.getElementById('ue-paff-tbody');
  const empty = document.getElementById('ue-paff-empty');
  const kycBox = document.getElementById('ue-paff-kyc');
  if (!tbody) return;

  const pi = payload?.providerIdentity;
  const rows = Array.isArray(payload?.affiliations) ? payload.affiliations : [];

  if (kycBox) {
    if (pi) {
      kycBox.style.display = '';
      const ks = esc(String(pi.kycStatus || '').toUpperCase());
      const gs = esc(String(pi.globalStatus || '—'));
      // `ue_paffKycLine` inclui <strong> fixo do i18n; só os valores vêm do API (escapados).
      kycBox.innerHTML = t('ue_paffKycLine').replace(/\{kyc\}/g, ks).replace(/\{global\}/g, gs);
    } else {
      kycBox.style.display = 'none';
      kycBox.textContent = '';
    }
  }

  if (!rows.length) {
    tbody.innerHTML = '';
    if (empty) {
      empty.style.display = '';
      empty.textContent = t('ue_paffEmpty');
    }
    syncPaffInviteButtonFromPayload(payload);
    paintProviderOnboardingReview(payload);
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = rows
    .map((row) => {
      const name = row.tenant?.name || row.tenantId || '—';
      const rel = String(row.relationshipType || 'DEDICATED').toUpperCase();
      const relLab =
        rel === 'OWNER'
          ? t('ue_paffRelOwner')
          : rel === 'DEDICATED' || rel === 'PARTNER'
            ? t('ue_paffRelDedicated')
            : rel;
      const st = String(row.status || '').toUpperCase();
      const dates = [
        row.invitedAt ? `${t('ue_paffDtInvited')}: ${esc(formatUeDateTime(row.invitedAt))}` : '',
        row.activatedAt ? `${t('ue_paffDtActive')}: ${esc(formatUeDateTime(row.activatedAt))}` : '',
        row.endedAt ? `${t('ue_paffDtEnded')}: ${esc(formatUeDateTime(row.endedAt))}` : '',
      ]
        .filter(Boolean)
        .join('<br/>');
      const note = row.note ? esc(String(row.note).slice(0, 160)) + (String(row.note).length > 160 ? '…' : '') : '—';
      const canAct = !isUserEditReadonly();
      const lineKyc = String(row.providerIdentityKycStatus || '')
        .toUpperCase()
        .trim();
      const mergedKyc = String(pi?.kycStatus || '')
        .toUpperCase()
        .trim();
      /** Vínculo pode estar noutra PI do mesmo AppAccount: não usar só `lineKyc` (ex.: PENDING) quando o KYC aprovado está na identidade fundida. */
      const rowKycOk =
        lineKyc !== 'REJECTED' && (lineKyc === 'APPROVED' || mergedKyc === 'APPROVED');
      const pfOk = row.providerFirstNetworkEnabled !== false;
      const blockKyc = !rowKycOk;
      const blockPf = !pfOk;
      let actions = '';
      if (canAct && pi && (st === 'INVITED' || st === 'REQUESTED')) {
        /** Não usar `disabled`: o browser não dispara clique — parece «botão morto» (igual ao convite). */
        let extraCls = '';
        let blockAttr = '';
        if (blockKyc) {
          extraCls += ' ue-paff-act--need-kyc';
          blockAttr += ` data-ue-paff-kyc-block="1"`;
        }
        if (blockPf) {
          extraCls += ' ue-paff-act--need-pf';
          blockAttr += ` data-ue-paff-pf-block="1"`;
        }
        const titleParts = [];
        if (blockKyc) titleParts.push(t('ue_paffActivateNeedKyc'));
        if (blockPf) titleParts.push(t('ue_paffActivateNeedProviderFirst'));
        const titleAttr = titleParts.length ? ` title="${esc(titleParts.join(' — '))}"` : '';
        actions += `<button type="button" class="btn btn-sm btn-primary ue-paff-act${extraCls}" data-aff="${esc(row.id)}" data-act="activate"${blockAttr}${titleAttr}>${esc(t('ue_paffBtnActivate'))}</button> `;
      }
      if (canAct && pi && st === 'ACTIVE' && rel === 'DEDICATED') {
        actions += `<button type="button" class="btn btn-sm btn-outline ue-paff-act" data-aff="${esc(
          row.id,
        )}" data-act="dedicated-windows">${esc(t('ue_paffDedicatedWindowsBtn'))}</button> `;
      }
      if (canAct && pi && (st === 'INVITED' || st === 'REQUESTED') && (blockKyc || blockPf)) {
        const hintParts = [];
        if (blockKyc) hintParts.push(t('ue_paffHintKycShort'));
        if (blockPf) hintParts.push(t('ue_paffHintPfShort'));
        actions += `<div class="ue-paff-row-hint" role="note">${hintParts
          .map((h) => `<div>${esc(h)}</div>`)
          .join('')}</div>`;
      }
      if (canAct && (st === 'ACTIVE' || st === 'INVITED' || st === 'REQUESTED' || st === 'SUSPENDED')) {
        actions += `<button type="button" class="btn btn-sm btn-secondary ue-paff-act" data-aff="${esc(row.id)}" data-act="end">${esc(t('ue_paffBtnEnd'))}</button>`;
      }
      if (!actions) actions = `<span style="color:var(--text3);font-size:12px">—</span>`;
      return `<tr>
        <td><strong>${esc(name)}</strong><div style="font-size:11px;color:var(--text3);margin-top:2px"><code>${esc(row.tenantId)}</code></div></td>
        <td>${esc(relLab)}</td>
        <td>${esc(providerAffStatusLabel(st))}</td>
        <td style="font-size:12px;line-height:1.35">${dates || '—'}</td>
        <td style="font-size:12px;max-width:220px;word-break:break-word">${note}</td>
        <td class="ue-paff-td-actions">${actions}</td>
      </tr>`;
    })
    .join('');

  /* Ativar / Encerrar: ver `onUePaffSectionUnifiedClick` (delegado em #sec-provider-affiliations). */

  syncPaffInviteButtonFromPayload(payload);
  paintProviderOnboardingReview(payload);
}

let uePaffLastUserId = '';

/**
 * Clic no «Enviar convite» (delegado em #sec-provider-affiliations — sobrevive a re-render e evita
 * bind perdido se o botão ainda não existia no 1.º passo).
 */
async function onUePaffSectionClickForInvite(e) {
  // Clic no texto do botão → `target` pode ser nó de texto (sem `closest`).
  // Não nomear `t` — sombreia `t()` de user-pages-i18n e quebra todos os `alert(t('…'))` (async falha em silêncio).
  const from = uePaffDomElementFromTarget(e.target);
  const btn = from && from.closest ? from.closest('#ue-paff-invite-btn') : null;
  if (!btn || String(btn.getAttribute('id') || '') !== 'ue-paff-invite-btn') return;
  e.preventDefault();
  if (isUserEditReadonly()) {
    alert(t('ue_paffReadonlyBlock'));
    return;
  }
  if (btn.disabled) return;
  const body = document.getElementById('ue-paff-body');
  if (body?.getAttribute('data-ue-paff-has-pi') === '0') {
    alert(t('ue_paffInviteNeedPi'));
    return;
  }
  const section = document.getElementById('sec-provider-affiliations');
  const email = String(
    section?.dataset?.uePaffInviteEmail || document.getElementById('f-email')?.value || ''
  ).trim();
  const tid = panelTenantIdUserEdit() || String(document.getElementById('ue-paff-tenant')?.value || '').trim();
  const rel = String(document.getElementById('ue-paff-rel')?.value || 'DEDICATED').toUpperCase();
  const note = String(document.getElementById('ue-paff-note')?.value || '').trim();
  if (!tid) {
    alert(t('ue_paffNeedTenant'));
    return;
  }
  if (!email) {
    alert(t('ue_paffNeedEmail'));
    return;
  }
  btn.disabled = true;
  let res;
  try {
    res = await CONFIG.post('/providers/affiliations/invite', {
      email,
      tenantId: tid,
      relationshipType: 'DEDICATED',
      note: note || undefined,
    }).catch(() => null);
  } finally {
    btn.disabled = false;
  }
  if (res?.error) {
    alert(res.error);
    return;
  }
  if (!res?.affiliationId && !res?.ok) {
    alert(res?.error || t('ue_paffInviteErr'));
    return;
  }
  const accept = res.acceptUrl ? `\n\n${res.acceptUrl}` : '';
  const n = res.notify || {};
  const skipReason = n.emailSkippedReason ? String(n.emailSkippedReason).slice(0, 260) : '';
  const emailLine =
    n.emailSent === true
      ? `\n\nE-mail ao prestador: enviado (${n.emailProvider || 'ok'}). Verifique spam.`
      : n.emailSkipped
        ? `\n\nE-mail: não enviado (${n.emailProvider || '—'}). ${skipReason || 'Configure Microsoft Graph, MailerSend ou Nylas no servidor.'}`
        : n.emailError
          ? `\n\nE-mail: falhou — ${String(n.emailError).slice(0, 200)}`
          : '';
  const pushTok = typeof n.pushTokenCount === 'number' ? n.pushTokenCount : null;
  const pushErrExpo = n.pushFirstError ? String(n.pushFirstError).slice(0, 160) : '';
  const pushLine =
    typeof n.pushSent === 'number'
      ? n.pushSent > 0
        ? `\n\nPush: ${n.pushSent} aceite(s) pela Expo.${n.pushErrors ? ` Falhas: ${n.pushErrors}.` : ''} App → Organizações e parcerias.`
        : pushTok && pushTok > 0
          ? `\n\nPush: ${pushTok} token(s), 0 entregues.${pushErrExpo ? ` Expo: ${pushErrExpo}` : ' Verifique tokens inválidos.'}`
          : '\n\nPush: sem token Expo no dispositivo do prestador.'
      : '';
  alert(t('ue_paffInviteOk') + accept + emailLine + pushLine);
  await refreshUserEditProviderAffiliations();
}

async function refreshUserEditProviderAffiliations() {
  const id = uePaffLastUserId;
  const loading = document.getElementById('ue-paff-loading');
  const errEl = document.getElementById('ue-paff-error');
  const body = document.getElementById('ue-paff-body');
  const noPi = document.getElementById('ue-paff-no-pi');
  if (!id) return;
  if (loading) {
    loading.hidden = false;
    loading.textContent = t('ue_paffLoading');
  }
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  const data = await CONFIG.get(`/users/${encodeURIComponent(id)}/provider-affiliations`).catch(() => null);
  if (loading) loading.hidden = true;
  if (!data || data.error) {
    if (errEl) {
      errEl.style.display = '';
      errEl.textContent = data?.error || t('ue_paffLoadErr');
    }
    return;
  }
  if (body) body.hidden = false;
  if (noPi) {
    noPi.hidden = !!data.providerIdentity;
    noPi.textContent = t('ue_paffNoIdentity');
  }
  paintProviderAffiliationsSection(data);
}

async function loadCompanyTenantsForPaffSelect() {
  const sel = document.getElementById('ue-paff-tenant');
  if (!sel) return;
  const scoped = panelTenantIdUserEdit();
  if (scoped) {
    sel.innerHTML = `<option value="${esc(scoped)}">${esc(t('ue_paffTenantCurrent'))}</option>`;
    sel.value = scoped;
    return;
  }
  const res = await CONFIG.get('/tenants?limit=300');
  const list = res?.data || res || [];
  const rows = Array.isArray(list) ? list : [];
  const companies = rows.filter((t) => String(t.kind || 'COMPANY').toUpperCase() === 'COMPANY');
  sel.innerHTML =
    `<option value="">${esc(t('ue_paffTenantPick'))}</option>` +
    companies
      .map((t) => `<option value="${esc(t.id)}">${esc(t.name || t.slug || t.id)}</option>`)
      .join('');
}

async function initUserEditProviderAffiliations(userId, u) {
  const section = document.getElementById('sec-provider-affiliations');
  if (!section) return;
  uePaffLastUserId = String(userId || '').trim();
  const email = humanLoginEmailDisplay(u);
  const intro = document.getElementById('ue-paff-intro');
  if (intro) intro.innerHTML = t('ue_paffIntro_html');

  const tenantWrap = document.getElementById('ue-paff-tenant-wrap');
  if (tenantWrap) {
    tenantWrap.style.display = panelTenantIdUserEdit() ? 'none' : '';
  }

  if (section.dataset.uePaffUnifiedDeleg !== '1') {
    section.dataset.uePaffUnifiedDeleg = '1';
    section.addEventListener('click', (ev) => {
      void onUePaffSectionUnifiedClick(ev);
    });
  }
  section.dataset.uePaffInviteEmail = String(email || '').trim();

  await loadCompanyTenantsForPaffSelect();
  await refreshUserEditProviderAffiliations();
}

function docKindFromTbodyId(tbodyId) {
  return tbodyId && String(tbodyId).includes('docs-pro') ? 'professional' : 'personal';
}

function docTypeOptionsHtml(selectedType, kind) {
  const rows = getDocTypeRowsForLocale(kind);
  const sel = String(selectedType ?? '').trim();
  const keys = new Set(rows.map(([v]) => v));
  const orphan =
    sel && !keys.has(sel)
      ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>`
      : '';
  const body = rows
    .map(
      ([val, lab]) =>
        `<option value="${esc(val)}" ${sel === val ? 'selected' : ''}>${esc(lab)}</option>`
    )
    .join('');
  return orphan + body;
}

function docValidityBadge(validFrom, validTo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = validTo ? new Date(String(validTo).slice(0, 10)) : null;
  const from = validFrom ? new Date(String(validFrom).slice(0, 10)) : null;
  if (to && !Number.isNaN(to.getTime())) {
    to.setHours(0, 0, 0, 0);
    if (to < today) {
      return `<span class="ue-doc-badge ue-doc-badge--err">${esc(t('docExpired'))}</span>`;
    }
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    if (to <= soon) {
      return `<span class="ue-doc-badge ue-doc-badge--warn">${esc(t('docExpiring'))}</span>`;
    }
    return `<span class="ue-doc-badge ue-doc-badge--ok">${esc(t('docValidOk'))}</span>`;
  }
  if (from && !Number.isNaN(from.getTime()) && from > today) {
    return `<span class="ue-doc-badge ue-doc-badge--muted">${esc(t('docUnknown'))}</span>`;
  }
  return `<span class="ue-doc-badge ue-doc-badge--muted">${esc(t('docUnknown'))}</span>`;
}

function setUserEditSectionCollapsed(section, collapsed) {
  if (!(section instanceof HTMLElement)) return;
  section.dataset.ueCollapsed = collapsed ? 'true' : 'false';
  const toggle = section.querySelector('.ue-section-toggle');
  if (toggle instanceof HTMLElement) {
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.innerHTML = collapsed
      ? `<ion-icon name="chevron-down-outline"></ion-icon><span>Expandir</span>`
      : `<ion-icon name="chevron-up-outline"></ion-icon><span>Recolher</span>`;
  }
}

function expandUserEditSectionByHash() {
  const hash = String(window.location.hash || '').trim();
  if (!hash.startsWith('#')) return;
  const section = document.querySelector(hash);
  if (!(section instanceof HTMLElement)) return;
  if (section.classList.contains('ue-section')) {
    setUserEditSectionCollapsed(section, false);
  }
}

function highlightActiveUserEditSection(sectionId) {
  document.querySelectorAll('.ue-nav a[href^="#"]').forEach((link) => {
    if (!(link instanceof HTMLElement)) return;
    link.classList.toggle('is-active', link.getAttribute('href') === `#${sectionId}`);
  });
  document.querySelectorAll('.ue-section').forEach((section) => {
    if (!(section instanceof HTMLElement)) return;
    section.classList.toggle('is-active', section.id === sectionId);
  });
}

function setupUserEditSectionObserver() {
  const sections = [...document.querySelectorAll('.ue-section')].filter((section) => section instanceof HTMLElement);
  if (!sections.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target instanceof HTMLElement) {
        highlightActiveUserEditSection(visible.target.id);
      }
    },
    {
      root: document.querySelector('.ue-scroll'),
      threshold: [0.2, 0.45, 0.7],
      rootMargin: '-18% 0px -55% 0px',
    },
  );
  sections.forEach((section) => observer.observe(section));
}

function setupUserEditProgressiveSections() {
  document.querySelectorAll('.ue-section').forEach((section) => {
    if (!(section instanceof HTMLElement)) return;
    const header = section.querySelector('.panel-header');
    const title = section.querySelector('.panel-title');
    if (!(header instanceof HTMLElement) || !(title instanceof HTMLElement)) return;
    const collapsible = section.dataset.ueDefaultCollapsed === 'true';
    if (!collapsible) return;
    if (!header.querySelector('.ue-section-summary')) {
      const summary = document.createElement('div');
      summary.className = 'ue-section-summary';
      summary.textContent = COLLAPSIBLE_SECTION_SUMMARIES[section.id] || 'Conteúdo avançado.';
      header.appendChild(summary);
    }
    if (!header.querySelector('.ue-section-toggle')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ue-section-toggle';
      btn.addEventListener('click', () => {
        const collapsed = section.dataset.ueCollapsed !== 'false';
        setUserEditSectionCollapsed(section, !collapsed);
      });
      header.appendChild(btn);
    }
    setUserEditSectionCollapsed(section, true);
  });
  document.querySelectorAll('.ue-nav a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => {
      const id = String(link.getAttribute('href') || '').replace(/^#/, '');
      if (id) highlightActiveUserEditSection(id);
    });
  });
  expandUserEditSectionByHash();
  highlightActiveUserEditSection((String(window.location.hash || '').replace(/^#/, '')) || 'sec-dados');
  setupUserEditSectionObserver();
  window.addEventListener('hashchange', expandUserEditSectionByHash);
}

function refreshDocValidityInTable(tbodyId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.querySelectorAll('tr[data-doc-id]').forEach((tr) => {
    const vf = tr.querySelector('.doc-from')?.value || '';
    const vt = tr.querySelector('.doc-to')?.value || '';
    const cell = tr.querySelector('.doc-valid-wrap');
    if (cell) cell.innerHTML = docValidityBadge(vf, vt);
  });
}

function bindDocTableDelegation(tbodyId, userId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  if (tb.dataset.docDeleg !== '1') {
    tb.dataset.docDeleg = '1';
    tb.addEventListener('click', (e) => {
      const btn = e.target.closest('.doc-upload-btn');
      if (!btn || !tb.contains(btn)) return;
      e.preventDefault();
      btn.closest('tr')?.querySelector('.doc-file')?.click();
    });
    tb.addEventListener('change', (e) => {
      const tgt = e.target;
      if (tgt.matches('.doc-from, .doc-to, .doc-type')) {
        refreshDocValidityInTable(tbodyId);
        markDirty();
      }
      if (tgt.matches('.doc-file')) {
        const uid = tb.dataset.docUploadUserId;
        if (!uid) return;
        const file = tgt.files && tgt.files[0];
        tgt.value = '';
        if (!file) return;
        const tr = tgt.closest('tr');
        const attInp = tr?.querySelector('.doc-attach');
        const ubtn = tr?.querySelector('.doc-upload-btn');
        const prevLbl = ubtn ? ubtn.textContent : '';
        if (ubtn) {
          ubtn.textContent = t('ue_docUploading');
          ubtn.disabled = true;
        }
        void (async () => {
          try {
            const b64 = await fileToBase64(file);
            const res = await CONFIG.post(`/users/${encodeURIComponent(uid)}/document-attachment`, {
              fileBase64: b64,
              mimeType: file.type || 'application/octet-stream',
              fileName: file.name || 'upload',
            });
            if (res?.url && attInp) {
              attInp.value = res.url;
              markDirty();
            } else {
              alert(res?.error || t('ue_docUploadErr'));
            }
          } catch {
            alert(t('ue_docUploadErr'));
          } finally {
            if (ubtn) {
              ubtn.disabled = false;
              ubtn.textContent = prevLbl || t('ue_docUploadBtn');
            }
          }
        })();
      }
    });
    tb.addEventListener('input', (e) => {
      if (e.target.matches('.doc-idnum, .doc-issuer, .doc-notes, .doc-attach')) markDirty();
    });
  }
  if (userId) tb.dataset.docUploadUserId = userId;
}

function rid() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function getQueryId() {
  const p = new URLSearchParams(window.location.search);
  return p.get('id') || '';
}

/** Query `readonly=1` ou `ro=1` — ficha sem edição (só consulta). */
export function isUserEditReadonly() {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = (p.get('readonly') || p.get('ro') || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

function applyUserEditReadonlyIfNeeded() {
  if (!isUserEditReadonly()) return;
  document.documentElement.classList.add('ue-readonly-mode');
  const crumb = document.getElementById('ue-crumb-name');
  if (crumb) crumb.textContent = t('ue_readonlyCrumb');
  try {
    const base = document.title.replace(/\s+—\s+.*$/, '').trim();
    document.title = `${base} — ${t('ue_readonlyCrumb')}`;
  } catch {
    /* ignore */
  }

  const tb = document.querySelector('.ue-page-toolbar');
  if (tb && !document.getElementById('ue-readonly-banner')) {
    const banner = document.createElement('div');
    banner.id = 'ue-readonly-banner';
    banner.className = 'ue-readonly-banner hint-box';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<strong>${esc(t('ue_readonlyBannerTitle'))}</strong> ${esc(t('ue_readonlyBannerBody'))}`;
    tb.insertAdjacentElement('afterend', banner);
  }

  ['btn-save', 'btn-save-stay', 'btn-discard'].forEach((hid) => {
    const el = document.getElementById(hid);
    if (el) el.hidden = true;
  });
  ['act-duplicate', 'act-role-matrix'].forEach((hid) => {
    document.getElementById(hid)?.setAttribute('hidden', 'hidden');
  });

  const scroll = document.querySelector('.ue-scroll');
  if (scroll) {
    scroll.querySelectorAll('input, select, textarea, button').forEach((el) => {
      // Manter o botão de convite clicável para o handler (delegado) mostrar o aviso de só leitura;
      // `button[disabled]` não dispara clique — parecia "nada acontece".
      if (el.id === 'ue-paff-invite-btn') return;
      el.disabled = true;
    });
  }
}

/**
 * Substitui o conteúdo da ficha por um estado de erro (URL sem id ou API).
 * Remove `ue-edit-html` para o scroll da página voltar a funcionar.
 */
function renderUserEditFatalUI(variant, detail) {
  const conf =
    variant === 'missingId'
      ? {
          title: t('ue_fatalMissingTitle'),
          description: t('ue_fatalMissingBody'),
          icon: 'link-outline',
          iconColor: 'var(--color-status-info-fg, var(--blue))',
        }
      : {
          title: t('ue_fatalNotFoundTitle'),
          description: t('ue_fatalNotFoundBody'),
          icon: 'person-remove-outline',
          iconColor: 'var(--amber)',
        };

  document.documentElement.classList.remove('ue-edit-html');
  document.documentElement.classList.add('ue-edit-error-html');

  const root = document.getElementById('page-root');
  if (!root) return;

  const detailHtml =
    variant === 'notFound' && detail && String(detail).trim()
      ? `<p class="ue-edit-error-detail" role="status">${esc(String(detail).trim().slice(0, 500))}</p>`
      : '';

  root.innerHTML = `
    <div class="main-content ue-edit-error-main">
      <div class="topbar topbar--data">
        <nav class="topbar-breadcrumb" aria-label="Trilha">
          <a href="dashboard.html" style="color:inherit;text-decoration:none;font-weight:600">${esc(t('ul_breadcrumb'))}</a>
          <span class="topbar-breadcrumb-sep">/</span>
          <a href="users.html" style="color:inherit;text-decoration:none;font-weight:600">${esc(t('ul_breadcrumbUsers'))}</a>
          <span class="topbar-breadcrumb-sep">/</span>
          <span>${esc(t('ue_fatalEdit'))}</span>
        </nav>
      </div>
      <div class="data-toolbar" style="margin:0 28px 16px">
        <div class="data-toolbar-main"></div>
        <div class="data-toolbar-actions">
          <a href="users.html" class="btn btn-outline btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">
            <ion-icon name="arrow-back-outline" style="font-size:17px;vertical-align:-3px"></ion-icon>
            ${esc(t('ue_fatalBackList'))}
          </a>
        </div>
      </div>
      <div class="page-body ue-edit-error-body">
        <div class="data-shell ue-edit-error-card fade-in">
          <div class="empty-state-pro" style="padding:36px 28px 40px">
            <ion-icon name="${conf.icon}" style="font-size:52px;color:${conf.iconColor};opacity:0.88"></ion-icon>
            <div class="empty-state-pro-title">${esc(conf.title)}</div>
            <p class="empty-state-pro-sub">${esc(conf.description)}</p>
            ${detailHtml}
            <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
              <a href="users.html" class="btn btn-primary">${esc(t('ue_fatalGoUsers'))}</a>
              <a href="dashboard.html" class="btn btn-outline">${esc(t('ue_fatalDashboard'))}</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function parseJsonSafe(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}

function renderDocRows(tbodyId, docs, locations, userId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  const kind = docKindFromTbodyId(tbodyId);
  const list = Array.isArray(docs) ? docs : [];
  const locOpts = getLocationMultiselectOptionsHtml(locations);
  tb.innerHTML = list.length
    ? list.map((d) => docRowHtml(d, locOpts, kind)).join('')
    : docEmptyStateHtml();
  tb.querySelectorAll('.doc-del').forEach((btn) => {
    btn.onclick = () => {
      btn.closest('tr')?.remove();
      if (!tb.querySelector('tr:not(.doc-empty)')) {
        tb.innerHTML = docEmptyStateHtml();
      }
      markDirty();
    };
  });
  syncDocLocsMultiselectSelections(tb);
  refreshDocValidityInTable(tbodyId);
  bindDocTableDelegation(tbodyId, userId);
}

function docEmptyStateHtml() {
  return `<tr class="doc-empty"><td colspan="9" class="ue-doc-empty-cell">${esc(t('ue_docEmpty'))}</td></tr>`;
}

function docRowHtml(d, locOptsHtml, kind = 'personal') {
  const id = d.id || rid();
  const locIds = Array.isArray(d.locationIds) ? d.locationIds : [];
  const locAttr = esc(locIds.join('|'));
  return `<tr data-doc-id="${esc(id)}">
    <td colspan="9" class="ue-doc-card-cell"><input type="hidden" class="doc-id" value="${esc(id)}" />
      <div class="ue-doc-card">
        <div class="ue-doc-card__head">
          <div class="ue-doc-card__head-main">
            <div class="ue-inline-kicker">Documento</div>
            <div class="ue-doc-card__title-row">
              <select class="form-control doc-type ue-doc-card__type">${docTypeOptionsHtml(d.docType, kind)}</select>
              <div class="doc-valid-wrap">${docValidityBadge(d.validFrom, d.validTo)}</div>
            </div>
          </div>
          <button type="button" class="btn btn-sm doc-del ue-doc-card__remove">${esc(t('ue_docRemove'))}</button>
        </div>
        <div class="ue-doc-card__grid">
          <div class="form-group">
            <label class="form-label">Identificador</label>
            <input class="form-control doc-idnum" placeholder="${esc(t('ue_docPhNumber'))}" value="${esc(d.identifier || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Órgão emissor</label>
            <input class="form-control doc-issuer" placeholder="${esc(t('ue_docPhIssuer'))}" value="${esc(d.issuingBody || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Emissão</label>
            <input class="form-control doc-from" type="date" value="${esc((d.validFrom || '').slice(0, 10))}" />
          </div>
          <div class="form-group">
            <label class="form-label">Validade</label>
            <input class="form-control doc-to" type="date" value="${esc((d.validTo || '').slice(0, 10))}" />
          </div>
          <div class="form-group ue-doc-card__locs">
            <label class="form-label">Bases</label>
            <select class="form-control doc-locs" multiple size="3" title="${esc(t('ue_docLocsTitle'))}" data-initial-locs="${locAttr}">${locOptsHtml}</select>
            <div class="ue-doc-card__microcopy">${esc(t('ue_docLocsHint'))}</div>
          </div>
          <div class="form-group ue-doc-attach-cell">
            <label class="form-label">Anexo</label>
            <input class="form-control doc-attach" placeholder="${esc(t('ue_docPhAttach'))}" value="${esc(d.attachmentUrl || d.fileUrl || '')}" />
            <input type="file" class="doc-file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" style="display:none" />
            <button type="button" class="btn btn-sm btn-outline doc-upload-btn">${esc(t('ue_docUploadBtn'))}</button>
          </div>
          <div class="form-group ue-doc-card__notes">
            <label class="form-label">Notas internas</label>
            <input class="form-control doc-notes" placeholder="${esc(t('ue_docPhNotes'))}" value="${esc(d.notes || '')}" />
          </div>
        </div>
      </div>
    </td>
  </tr>`;
}

function collectDocTable(tbodyId) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return [];
  const out = [];
  tb.querySelectorAll('tr[data-doc-id]').forEach((tr) => {
    const sel = tr.querySelector('.doc-locs');
    const locs = sel ? [...sel.selectedOptions].map((o) => o.value) : [];
    out.push({
      id: tr.querySelector('.doc-id')?.value || rid(),
      docType: tr.querySelector('.doc-type')?.value || 'Outro',
      identifier: tr.querySelector('.doc-idnum')?.value?.trim() || null,
      validFrom: tr.querySelector('.doc-from')?.value || null,
      validTo: tr.querySelector('.doc-to')?.value || null,
      issuingBody: tr.querySelector('.doc-issuer')?.value?.trim() || null,
      notes: tr.querySelector('.doc-notes')?.value?.trim() || null,
      attachmentUrl: tr.querySelector('.doc-attach')?.value?.trim() || null,
      locationIds: locs,
    });
  });
  return out;
}

/** Um turno guardado em workScheduleJson */
function slotFromRaw(s) {
  const start = s.start || '08:00';
  const end = s.end || '18:00';
  let enabled;
  if (typeof s.enabled === 'boolean') enabled = s.enabled;
  else enabled = !!(s.start || s.end || s.enabled === true);
  return {
    id: s.id || rid(),
    enabled,
    start,
    end,
    locationIds: Array.isArray(s.locationIds) ? [...s.locationIds] : [],
    serviceAreaCircles: parseServiceAreaCirclesFromSlotRaw(s.serviceAreaCircles),
  };
}

function parseServiceAreaCirclesFromSlotRaw(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const lat = Number(c.latitude);
    const lng = Number(c.longitude);
    let r = Number(c.radiusKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r)) continue;
    r = Math.min(500, Math.max(0.5, r));
    out.push({
      id: String(c.id || rid()),
      latitude: lat,
      longitude: lng,
      radiusKm: r,
    });
    if (out.length >= 20) break;
  }
  return out;
}

/** Legado: dia = { enabled, start, end } | novo: dia = [{ ...turnos }] */
function normalizeDayToSlots(raw) {
  if (Array.isArray(raw)) {
    const slots = raw.map((s) => slotFromRaw(s));
    return slots.length
      ? slots
      : [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] }];
  }
  if (raw && typeof raw === 'object') {
    return [slotFromRaw(raw)];
  }
  return [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] }];
}

function slotRowHtml(slot) {
  const locIds = Array.isArray(slot.locationIds) ? slot.locationIds : [];
  const locAttr = esc(locIds.join('|'));
  const circles = Array.isArray(slot.serviceAreaCircles) ? slot.serviceAreaCircles : [];
  const circlesAttr = encodeURIComponent(JSON.stringify(circles));
  const en = slot.enabled;
  return `<div class="sched-slot" data-slot-id="${esc(slot.id)}" data-sch-loc-ids="${locAttr}" data-sch-circles="${circlesAttr}" style="display:grid;grid-template-columns:auto minmax(88px,1fr) minmax(88px,1fr) minmax(140px,2.2fr) auto;gap:8px;align-items:start;margin-bottom:8px">
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;padding-top:8px;white-space:nowrap"><input type="checkbox" class="sch-en" ${en ? 'checked' : ''}/> ${esc(t('ue_schActiveLbl'))}</label>
    <div><span style="font-size:10px;color:var(--text3)">${esc(t('ue_schStart'))}</span><input type="time" class="form-control sch-start" value="${esc(slot.start || '08:00')}" style="padding:6px;font-size:12px;width:100%" /></div>
    <div><span style="font-size:10px;color:var(--text3)">${esc(t('ue_schEnd'))}</span><input type="time" class="form-control sch-end" value="${esc(slot.end || '18:00')}" style="padding:6px;font-size:12px;width:100%" /></div>
    <div class="sch-locs-cell" style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <span style="font-size:10px;color:var(--text3)">${esc(t('ue_schLocsInSlot'))}</span>
      <div class="sch-locs-chips"></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button type="button" class="btn btn-sm btn-secondary sch-locs-open-map">${esc(t('ue_schLocsMapBtn'))}</button>
        <span style="font-size:10px;color:var(--text3)">${esc(t('ue_schLocsHintShort'))}</span>
      </div>
      <div class="sch-slot-circles-summary" style="font-size:10px;color:var(--text3)"></div>
    </div>
    <button type="button" class="btn btn-sm btn-ghost sch-rm-slot" style="margin-top:18px" title="${esc(t('ue_schRemoveTitle'))}">✕</button>
  </div>`;
}

function getSchSlotLocIdsFromEl(slotEl) {
  if (!slotEl) return [];
  const raw = slotEl.getAttribute('data-sch-loc-ids') || '';
  return raw.split('|').map((s) => s.trim()).filter(Boolean);
}

function setSchSlotLocIdsOnEl(slotEl, ids) {
  const uniq = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
  slotEl.setAttribute('data-sch-loc-ids', uniq.join('|'));
  renderSchSlotLocsChips(slotEl);
}

function getSchSlotCirclesFromEl(slotEl) {
  if (!slotEl) return [];
  try {
    const raw = slotEl.getAttribute('data-sch-circles');
    if (!raw) return [];
    const arr = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(arr) ? parseServiceAreaCirclesFromSlotRaw(arr) : [];
  } catch {
    return [];
  }
}

function setSchSlotCirclesOnEl(slotEl, circles) {
  if (!slotEl) return;
  const normalized = parseServiceAreaCirclesFromSlotRaw(Array.isArray(circles) ? circles : []);
  slotEl.setAttribute('data-sch-circles', encodeURIComponent(JSON.stringify(normalized)));
  renderSchSlotCirclesSummary(slotEl);
}

function renderSchSlotCirclesSummary(slotEl) {
  const el = slotEl?.querySelector?.('.sch-slot-circles-summary');
  if (!el) return;
  const n = getSchSlotCirclesFromEl(slotEl).length;
  el.textContent = n ? t('ue_schSlotCirclesSummary', { n: String(n) }) : '';
}

function renderSchSlotLocsChips(slotEl) {
  const chips = slotEl?.querySelector('.sch-locs-chips');
  if (!chips) return;
  chips.replaceChildren();
  const ids = getSchSlotLocIdsFromEl(slotEl);
  if (!ids.length) {
    const sp = document.createElement('span');
    sp.className = 'ue-skills-empty sch-locs-empty';
    sp.textContent = t('ue_schLocsEmpty');
    chips.appendChild(sp);
  } else {
  for (const id of ids) {
    const loc = cachedLocations.find((l) => String(l.id) === String(id));
    const label = loc ? serviceLocationLabel(loc) : id;
    const wrap = document.createElement('span');
    wrap.className = 'ue-skill-chip sch-loc-chip';
    const txt = document.createElement('span');
    txt.textContent = label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ue-skill-chip-remove sch-loc-chip-rm';
    btn.textContent = '×';
    btn.setAttribute('aria-label', t('ue_schLocRemove'));
    btn.onclick = () => {
      if (isUserEditReadonly()) return;
      setSchSlotLocIdsOnEl(
        slotEl,
        getSchSlotLocIdsFromEl(slotEl).filter((x) => x !== id),
      );
      markDirty();
    };
    wrap.appendChild(txt);
    wrap.appendChild(btn);
    chips.appendChild(wrap);
  }
  }
  renderSchSlotCirclesSummary(slotEl);
}

function syncSchSlotsLocsUi(root) {
  if (!root) return;
  root.querySelectorAll('.sched-slot').forEach((el) => {
    renderSchSlotLocsChips(el);
    renderSchSlotCirclesSummary(el);
  });
}

let schSlotLocsModalMap = null;
let schSlotLocsModalTileLayer = null;
let schSlotLocsModalMarkers = [];
let schSlotLocsModalPin = null;
let schSlotLocsModalDraft = new Set();
/** Rascunho de círculos { id, latitude, longitude, radiusKm } no modal do turno */
let schSlotLocsModalCircles = [];
/** { id, circle: L.Circle, marker: L.Marker } — limpar antes de redesenhar o mapa */
let schSlotLocsModalCircleLayers = [];
let schSlotLocsModalSlotEl = null;
let schSlotLocsModalSearch = '';
let schSlotLocsModalBound = false;
const SCH_SLOT_MAX_CIRCLES = 20;

function getFilteredSchSlotModalLocations() {
  const q = String(schSlotLocsModalSearch || '').trim().toLowerCase();
  if (!q) return cachedLocations;
  return cachedLocations.filter((location) => serviceLocationSearchText(location).includes(q));
}

function closeSchSlotLocsModal() {
  document.getElementById('sch-slot-locs-modal')?.classList.remove('open');
  schSlotLocsModalSlotEl = null;
  schSlotLocsModalCircles = [];
}

function ensureSchSlotLocsModalMap() {
  const L = getLeafletGlobal();
  const el = document.getElementById('sch-slot-locs-map');
  if (!L || !el) return null;
  if (!schSlotLocsModalMap) {
    schSlotLocsModalMap = L.map(el, { zoomControl: true, attributionControl: true }).setView([-15.788, -47.879], 5);
    schSlotLocsModalTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(schSlotLocsModalMap);
  }
  setTimeout(() => schSlotLocsModalMap?.invalidateSize(), 0);
  return schSlotLocsModalMap;
}

function toggleSchSlotLocsDraft(id) {
  const sid = String(id || '');
  if (!sid) return;
  if (schSlotLocsModalDraft.has(sid)) schSlotLocsModalDraft.delete(sid);
  else schSlotLocsModalDraft.add(sid);
  refreshSchSlotModalMeta();
  renderSchSlotLocsModalList();
  renderSchSlotLocsModalMap();
}

function refreshSchSlotModalMeta() {
  const metaEl = document.getElementById('sch-slot-locs-meta');
  if (!metaEl) return;
  const rows = getFilteredSchSlotModalLocations();
  metaEl.textContent = t('ue_schSlotLocsMeta', {
    bases: String(rows.length),
    selected: String(schSlotLocsModalDraft.size),
    circles: String(schSlotLocsModalCircles.length),
  });
}

function renderSchSlotCirclesModalList() {
  const wrap = document.getElementById('sch-slot-locs-circles-list');
  if (!wrap) return;
  if (!schSlotLocsModalCircles.length) {
    wrap.innerHTML = `<div class="ue-coverage-empty">${esc(t('ue_schSlotCirclesModalEmpty'))}</div>`;
    return;
  }
  wrap.innerHTML = schSlotLocsModalCircles
    .map(
      (c, i) => `<div class="sch-slot-circle-row" data-circle-id="${esc(c.id)}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;margin-bottom:6px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
      <span style="font-weight:800;font-size:12px">#${i + 1}</span>
      <label style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px;white-space:nowrap">${esc(t('ue_schSlotCircleRadius'))}
        <input type="number" class="form-control sch-slot-circle-r" min="0.5" max="500" step="0.5" value="${esc(String(c.radiusKm))}" style="width:88px;padding:4px 8px" data-circle-id="${esc(c.id)}" />
        <span>km</span>
      </label>
      <span style="font-size:10px;color:var(--text3)">${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}</span>
      <button type="button" class="btn btn-sm btn-ghost sch-slot-circle-rm" data-circle-id="${esc(c.id)}">${esc(t('ue_schSlotCircleRemove'))}</button>
    </div>`,
    )
    .join('');
  wrap.querySelectorAll('.sch-slot-circle-r').forEach((inp) => {
    inp.addEventListener('change', () => {
      const id = inp.getAttribute('data-circle-id');
      const v = Number(inp.value);
      const c = schSlotLocsModalCircles.find((x) => String(x.id) === String(id));
      if (!c || !Number.isFinite(v)) return;
      c.radiusKm = Math.min(500, Math.max(0.5, v));
      const layer = schSlotLocsModalCircleLayers.find((l) => String(l.id) === String(id));
      if (layer?.circle) layer.circle.setRadius(c.radiusKm * 1000);
      refreshSchSlotModalMeta();
    });
  });
  wrap.querySelectorAll('.sch-slot-circle-rm').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-circle-id');
      schSlotLocsModalCircles = schSlotLocsModalCircles.filter((x) => String(x.id) !== String(id));
      renderSchSlotCirclesModalList();
      refreshSchSlotModalMeta();
      renderSchSlotLocsModalMap();
    });
  });
}

function addSchSlotModalCircle() {
  if (isUserEditReadonly()) return;
  if (schSlotLocsModalCircles.length >= SCH_SLOT_MAX_CIRCLES) {
    alert(t('ue_schSlotCirclesMax'));
    return;
  }
  const map = ensureSchSlotLocsModalMap();
  let lat;
  let lng;
  if (schSlotLocsModalPin) {
    const ll = schSlotLocsModalPin.getLatLng();
    lat = ll.lat;
    lng = ll.lng;
  } else if (map) {
    const c = map.getCenter();
    lat = c.lat;
    lng = c.lng;
  } else {
    return;
  }
  schSlotLocsModalCircles.push({ id: rid(), latitude: lat, longitude: lng, radiusKm: 10 });
  renderSchSlotCirclesModalList();
  refreshSchSlotModalMeta();
  renderSchSlotLocsModalMap();
}

function renderSchSlotLocsModalList() {
  const listEl = document.getElementById('sch-slot-locs-list');
  if (!listEl) return;
  refreshSchSlotModalMeta();
  const rows = getFilteredSchSlotModalLocations();
  listEl.innerHTML = rows.length
    ? rows
        .map((location) => {
          const id = String(location.id);
          const active = schSlotLocsModalDraft.has(id);
          const disabled = !isValidLocationCoordinate(location) ? ' ue-coverage-list-row--disabled' : '';
          return `<button type="button" class="ue-coverage-list-row${active ? ' is-active' : ''}${disabled}" data-sch-slot-loc="${esc(id)}">
            <span class="ue-coverage-list-row__title">${esc(serviceLocationLabel(location))}</span>
            <span class="ue-coverage-list-row__meta">${esc(location.address || 'Sem endereço cadastrado')}${!isValidLocationCoordinate(location) ? ' · sem coordenadas' : ''}</span>
          </button>`;
        })
        .join('')
    : '<div class="ue-coverage-empty">Nenhuma base encontrada.</div>';
  listEl.querySelectorAll('[data-sch-slot-loc]').forEach((btn) => {
    btn.addEventListener('click', () => toggleSchSlotLocsDraft(btn.getAttribute('data-sch-slot-loc') || ''));
  });
}

function clearSchSlotModalCircleLayers(map) {
  if (!map) return;
  schSlotLocsModalCircleLayers.forEach(({ circle, marker }) => {
    try {
      circle.remove();
    } catch {
      /* */
    }
    try {
      marker.remove();
    } catch {
      /* */
    }
  });
  schSlotLocsModalCircleLayers = [];
}

function refitSchSlotModalMapBounds(L, map) {
  if (!L || !map) return;
  const b = L.latLngBounds([]);
  let any = false;
  schSlotLocsModalMarkers.forEach((m) => {
    b.extend(m.getLatLng());
    any = true;
  });
  schSlotLocsModalCircleLayers.forEach(({ circle }) => {
    try {
      b.extend(circle.getBounds());
      any = true;
    } catch {
      /* */
    }
  });
  if (!any && schSlotLocsModalPin) {
    b.extend(schSlotLocsModalPin.getLatLng());
    any = true;
  }
  if (any) {
    try {
      map.fitBounds(b, { padding: [28, 28], maxZoom: 14 });
    } catch {
      const c = b.getCenter();
      map.setView(c, 12);
    }
  } else {
    fitLeafletMapToPoints(map, []);
  }
}

function renderSchSlotLocsModalMap() {
  const L = getLeafletGlobal();
  const map = ensureSchSlotLocsModalMap();
  if (!L || !map) return;
  clearSchSlotModalCircleLayers(map);
  schSlotLocsModalMarkers.forEach((m) => m.remove());
  schSlotLocsModalMarkers = [];
  const mapRows = (cachedLocations || []).filter((location) => isValidLocationCoordinate(location));
  mapRows.forEach((location) => {
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const active = schSlotLocsModalDraft.has(String(location.id));
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`<strong>${esc(serviceLocationLabel(location))}</strong>`);
    marker.on('click', () => toggleSchSlotLocsDraft(String(location.id)));
    if (active) marker.openPopup();
    schSlotLocsModalMarkers.push(marker);
  });
  schSlotLocsModalCircles.forEach((c) => {
    const lat = Number(c.latitude);
    const lng = Number(c.longitude);
    let rKm = Number(c.radiusKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(rKm)) return;
    rKm = Math.min(500, Math.max(0.5, rKm));
    const circle = L.circle([lat, lng], {
      radius: rKm * 1000,
      color: '#e97316',
      weight: 2,
      fillColor: '#e97316',
      fillOpacity: 0.14,
    }).addTo(map);
    const centerMarker = L.marker([lat, lng], { draggable: !isUserEditReadonly() }).addTo(map);
    centerMarker.bindTooltip(t('ue_schSlotCircleDragHint'), { permanent: false });
    centerMarker.on('dragend', () => {
      const ll = centerMarker.getLatLng();
      c.latitude = ll.lat;
      c.longitude = ll.lng;
      circle.setLatLng(ll);
      renderSchSlotCirclesModalList();
    });
    schSlotLocsModalCircleLayers.push({ id: c.id, circle, marker: centerMarker });
  });
  if (schSlotLocsModalPin) {
    try {
      schSlotLocsModalPin.bringToFront();
    } catch {
      /* */
    }
  }
  refitSchSlotModalMapBounds(L, map);
}

function moveSchSlotModalPin(lat, lng, zoom = 13) {
  const L = getLeafletGlobal();
  const map = ensureSchSlotLocsModalMap();
  if (!L || !map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  map.setView([lat, lng], zoom);
  if (schSlotLocsModalPin) {
    schSlotLocsModalPin.setLatLng([lat, lng]);
  } else {
    schSlotLocsModalPin = L.marker([lat, lng], { draggable: !isUserEditReadonly() }).addTo(map);
    schSlotLocsModalPin.bindPopup('<strong>Referência</strong><br>Centro da cidade ou GPS');
    schSlotLocsModalPin.on('dragend', () => {
      const ll = schSlotLocsModalPin.getLatLng();
      map.panTo(ll);
    });
  }
  try {
    schSlotLocsModalPin?.bringToFront?.();
  } catch {
    /* */
  }
}

async function nominatimSchSlotCity(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const arr = await res.json().catch(() => []);
  const first = Array.isArray(arr) && arr[0];
  if (!first || first.lat == null || first.lon == null) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function openSchSlotLocsModal(slotEl) {
  if (isUserEditReadonly() || !slotEl) return;
  schSlotLocsModalSlotEl = slotEl;
  schSlotLocsModalDraft = new Set(getSchSlotLocIdsFromEl(slotEl));
  schSlotLocsModalCircles = getSchSlotCirclesFromEl(slotEl).map((c) => ({ ...c }));
  schSlotLocsModalSearch = '';
  const sInp = document.getElementById('sch-slot-locs-search');
  if (sInp) sInp.value = '';
  const cInp = document.getElementById('sch-slot-locs-city');
  if (cInp) cInp.value = '';
  if (schSlotLocsModalPin) {
    try {
      schSlotLocsModalPin.remove();
    } catch {
      /* */
    }
    schSlotLocsModalPin = null;
  }
  renderSchSlotCirclesModalList();
  renderSchSlotLocsModalList();
  renderSchSlotLocsModalMap();
  document.getElementById('sch-slot-locs-modal')?.classList.add('open');
  setTimeout(() => {
    schSlotLocsModalMap?.invalidateSize();
    const selected = [...schSlotLocsModalDraft]
      .map((id) => cachedLocations.find((l) => String(l.id) === String(id)))
      .filter((l) => l && isValidLocationCoordinate(l));
    if (selected.length) {
      const avLat = selected.reduce((s, l) => s + Number(l.latitude), 0) / selected.length;
      const avLng = selected.reduce((s, l) => s + Number(l.longitude), 0) / selected.length;
      moveSchSlotModalPin(avLat, avLng, 11);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => moveSchSlotModalPin(pos.coords.latitude, pos.coords.longitude, 13),
        () => {},
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 },
      );
    }
  }, 220);
}

function applySchSlotLocsModal() {
  if (!schSlotLocsModalSlotEl) return;
  setSchSlotLocIdsOnEl(schSlotLocsModalSlotEl, [...schSlotLocsModalDraft]);
  setSchSlotCirclesOnEl(schSlotLocsModalSlotEl, schSlotLocsModalCircles);
  closeSchSlotLocsModal();
  markDirty();
}

function bindSchSlotLocsModalUx() {
  if (schSlotLocsModalBound) return;
  schSlotLocsModalBound = true;
  const modal = document.getElementById('sch-slot-locs-modal');
  document.getElementById('sch-slot-locs-close')?.addEventListener('click', closeSchSlotLocsModal);
  document.getElementById('sch-slot-locs-cancel')?.addEventListener('click', closeSchSlotLocsModal);
  document.getElementById('sch-slot-locs-apply')?.addEventListener('click', () => applySchSlotLocsModal());
  modal?.addEventListener('click', (ev) => {
    if (ev.target === modal) closeSchSlotLocsModal();
  });
  document.getElementById('sch-slot-locs-search')?.addEventListener('input', () => {
    schSlotLocsModalSearch = document.getElementById('sch-slot-locs-search')?.value || '';
    renderSchSlotLocsModalList();
    renderSchSlotLocsModalMap();
  });
  document.getElementById('sch-slot-locs-geocode')?.addEventListener('click', async () => {
    const inp = document.getElementById('sch-slot-locs-city');
    const q = inp?.value || '';
    try {
      const hit = await nominatimSchSlotCity(q);
      if (!hit) {
        alert(t('ue_schSlotLocsGeocodeFail'));
        return;
      }
      moveSchSlotModalPin(hit.lat, hit.lng, 12);
    } catch {
      alert(t('ue_schSlotLocsGeocodeFail'));
    }
  });
  document.getElementById('sch-slot-locs-gps')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert(t('ue_schSlotLocsGpsNo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        moveSchSlotModalPin(pos.coords.latitude, pos.coords.longitude, 14);
      },
      () => {
        alert(t('ue_schSlotLocsGpsDenied'));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
  document.getElementById('sch-slot-locs-add-circle')?.addEventListener('click', () => addSchSlotModalCircle());
}

function bindScheduleSlotUI(locations) {
  const root = document.getElementById('schedule-rows');
  if (!root || root.dataset.schBound === '1') return;
  root.dataset.schBound = '1';
  bindSchSlotLocsModalUx();
  root.addEventListener('click', (e) => {
    const mapBtn = e.target.closest('.sch-locs-open-map');
    if (mapBtn) {
      const slotEl = mapBtn.closest('.sched-slot');
      if (slotEl) openSchSlotLocsModal(slotEl);
      return;
    }
    const addBtn = e.target.closest('.sch-add-slot');
    if (addBtn) {
      const day = addBtn.getAttribute('data-day');
      const container = root.querySelector(`.sched-slots[data-day="${day}"]`);
      if (!container) return;
      const slot = { id: rid(), enabled: true, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] };
      container.insertAdjacentHTML('beforeend', slotRowHtml(slot));
      syncSchSlotsLocsUi(container.lastElementChild);
      return;
    }
    const rm = e.target.closest('.sch-rm-slot');
    if (rm) {
      const slotEl = rm.closest('.sched-slot');
      const dayWrap = slotEl?.closest('.sched-day');
      if (!slotEl || !dayWrap) return;
      slotEl.remove();
      const container = dayWrap.querySelector('.sched-slots');
      if (container && !container.querySelector('.sched-slot')) {
        const slot = { id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] };
        container.innerHTML = slotRowHtml(slot);
        syncSchSlotsLocsUi(container);
      }
    }
  });
}

function renderSchedule(workScheduleJson, locations) {
  const locs = Array.isArray(locations) ? locations : [];
  const w = parseJsonSafe(workScheduleJson, {});
  const wrap = document.getElementById('schedule-rows');
  if (!wrap) return;
  const DAYS = weekdaysForLocale();
  wrap.innerHTML = DAYS.map(({ key, label }) => {
    const slots = normalizeDayToSlots(w[key]);
    const slotsHtml = slots.map((s) => slotRowHtml(s)).join('');
    return `<div class="sched-day" data-day="${key}" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-weight:700;font-size:13px;min-width:92px">${label}</span>
        <button type="button" class="btn btn-sm btn-primary sch-add-slot" data-day="${key}">${esc(t('ue_schAddSlotBtn'))}</button>
      </div>
      <div class="sched-slots" data-day="${key}">${slotsHtml}</div>
    </div>`;
  }).join('');
  syncSchSlotsLocsUi(wrap);
  bindScheduleSlotUI(locs);
}

function collectSchedule() {
  const o = {};
  const root = document.getElementById('schedule-rows');
  weekdaysForLocale().forEach(({ key }) => {
    const slots = [];
    (root?.querySelectorAll(`.sched-day[data-day="${key}"] .sched-slot`) ?? []).forEach((slotEl) => {
      const en = slotEl.querySelector('.sch-en')?.checked;
      const start = slotEl.querySelector('.sch-start')?.value || '08:00';
      const end = slotEl.querySelector('.sch-end')?.value || '18:00';
      const locationIds = getSchSlotLocIdsFromEl(slotEl);
      const serviceAreaCircles = getSchSlotCirclesFromEl(slotEl);
      slots.push({
        id: slotEl.dataset.slotId || rid(),
        enabled: !!en,
        start,
        end,
        locationIds,
        serviceAreaCircles,
      });
    });
    o[key] = slots.length
      ? slots
      : [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] }];
  });
  return o;
}

function publicUploadUrl(relativeOrAbsolute) {
  const p = String(relativeOrAbsolute || '');
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const base = CONFIG.API_BASE.replace(/\/api\/?$/i, '');
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

/** MIME confiável para o backend (muitos telemóveis deixam `file.type` vazio ou «octet-stream»). */
function resolveFaceUploadMime(file) {
  const t = String(file?.type || '').toLowerCase().trim();
  if (/^image\/(jpeg|jpg|png|webp)$/i.test(t)) return t === 'image/jpg' ? 'image/jpeg' : t;
  if (t === 'image/heic' || t === 'image/heif') return 'image/heic';
  const n = String(file?.name || '').toLowerCase();
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.heic') || n.endsWith('.heif')) return 'image/heic';
  return t || '';
}

let cachedLocations = [];
let cachedLocationsLoadError = '';
/** Cache do HTML das `<option>` de bases (evita reconstruir N×M strings por render da tabela de documentos / horários). */
let _locationMultiselectOptsKey = '';
let _locationMultiselectOptsHtml = '';
let coverageMainMap = null;
let coverageMainTileLayer = null;
let coverageMainCircle = null;
let coverageMainCenterMarker = null;
let coverageMainLocationMarkers = [];
let coverageModalMap = null;
let coverageModalTileLayer = null;
let coverageModalMarkers = [];
let coverageModalDraftSelected = new Set();
let coverageModalSearch = '';

function getLeafletGlobal() {
  return typeof window !== 'undefined' && window.L ? window.L : null;
}

function normalizeCoverageCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getCoverageCenterFromDom() {
  const lat = normalizeCoverageCoord(document.getElementById('t-coverage-lat')?.value);
  const lng = normalizeCoverageCoord(document.getElementById('t-coverage-lng')?.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

function getCoverageRadiusKmFromDom() {
  const radius = Number(document.getElementById('t-coverage-radius-km')?.value);
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

function getSelectedServiceLocationIds() {
  const sel = document.getElementById('t-service-locs');
  return sel ? [...sel.selectedOptions].map((o) => o.value) : [];
}

function isValidLocationCoordinate(location) {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function formatCoverageCoordLine(center) {
  if (!center) return 'Nenhum centro definido.';
  return `${Number(center.latitude).toFixed(5)}, ${Number(center.longitude).toFixed(5)}`;
}

function serviceLocationLabel(location) {
  const name = String(location?.name || '').trim() || 'Base sem nome';
  const type = String(location?.type || '').trim();
  return type ? `${name} (${type})` : name;
}

function serviceLocationSearchText(location) {
  return [location?.name, location?.type, location?.address, location?.tenant?.name]
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function getFilteredCoverageLocations() {
  const q = String(coverageModalSearch || '').trim().toLowerCase();
  if (!q) return cachedLocations;
  return cachedLocations.filter((location) => serviceLocationSearchText(location).includes(q));
}

function updateServiceLocationSelect(selectedIds, filterText = '') {
  const sel = document.getElementById('t-service-locs');
  if (!sel) return;
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String));
  const filter = String(filterText || '').trim().toLowerCase();
  const rows = cachedLocations.filter((location) => {
    if (!filter) return true;
    return serviceLocationSearchText(location).includes(filter);
  });
  sel.innerHTML = rows
    .map((location) => {
      const selectedAttr = selected.has(String(location.id)) ? ' selected' : '';
      return `<option value="${esc(location.id)}"${selectedAttr}>${esc(serviceLocationLabel(location))}</option>`;
    })
    .join('');
}

function syncCoverageHiddenSelect(selectedIds) {
  const filterEl = document.getElementById('t-service-locs-filter');
  updateServiceLocationSelect(selectedIds, filterEl?.value || '');
}

function getCoverageSelectedLocations() {
  const selected = new Set(getSelectedServiceLocationIds());
  return cachedLocations.filter((location) => selected.has(String(location.id)));
}

function fitLeafletMapToPoints(map, points, fallback = [-15.788, -47.879], fallbackZoom = 5) {
  if (!map) return;
  if (Array.isArray(points) && points.length) {
    map.fitBounds(points, { padding: [24, 24] });
    return;
  }
  map.setView(fallback, fallbackZoom);
}

function ensureCoverageMainMap() {
  const L = getLeafletGlobal();
  const el = document.getElementById('ue-coverage-map');
  if (!L || !el) return null;
  if (!coverageMainMap) {
    coverageMainMap = L.map(el, { zoomControl: true, attributionControl: true }).setView([-15.788, -47.879], 5);
    coverageMainTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(coverageMainMap);
    coverageMainMap.on('click', (event) => {
      if (isUserEditReadonly()) return;
      document.getElementById('t-coverage-lat').value = String(event.latlng.lat);
      document.getElementById('t-coverage-lng').value = String(event.latlng.lng);
      refreshCoverageUi({ fit: false });
      markDirty();
    });
  }
  setTimeout(() => coverageMainMap?.invalidateSize(), 0);
  return coverageMainMap;
}

function renderCoverageMainMap() {
  const L = getLeafletGlobal();
  const map = ensureCoverageMainMap();
  const statusEl = document.getElementById('ue-coverage-map-status');
  if (!L || !map) {
    if (statusEl) statusEl.textContent = 'Mapa indisponível neste navegador.';
    return;
  }

  coverageMainLocationMarkers.forEach((marker) => marker.remove());
  coverageMainLocationMarkers = [];

  const selectedLocations = getCoverageSelectedLocations();
  const selectedIds = new Set(selectedLocations.map((location) => String(location.id)));
  const center = getCoverageCenterFromDom();
  const radiusKm = getCoverageRadiusKmFromDom();
  const bounds = [];

  cachedLocations.forEach((location) => {
    if (!isValidLocationCoordinate(location)) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const selected = selectedIds.has(String(location.id));
    const marker = L.circleMarker([lat, lng], {
      radius: selected ? 8 : 6,
      color: selected ? '#f97316' : '#64748b',
      weight: selected ? 3 : 2,
      fillColor: selected ? '#f97316' : '#cbd5e1',
      fillOpacity: selected ? 0.95 : 0.9,
    })
      .addTo(map)
      .bindPopup(`<strong>${esc(serviceLocationLabel(location))}</strong>${location.address ? `<br>${esc(location.address)}` : ''}`);
    coverageMainLocationMarkers.push(marker);
    if (selected) bounds.push([lat, lng]);
  });

  if (coverageMainCenterMarker) {
    coverageMainCenterMarker.remove();
    coverageMainCenterMarker = null;
  }
  if (coverageMainCircle) {
    coverageMainCircle.remove();
    coverageMainCircle = null;
  }

  if (center) {
    coverageMainCenterMarker = L.marker([center.latitude, center.longitude], { draggable: !isUserEditReadonly() }).addTo(map);
    coverageMainCenterMarker.bindPopup('<strong>Centro operacional</strong>');
    coverageMainCenterMarker.on('dragend', () => {
      const latlng = coverageMainCenterMarker.getLatLng();
      document.getElementById('t-coverage-lat').value = String(latlng.lat);
      document.getElementById('t-coverage-lng').value = String(latlng.lng);
      refreshCoverageUi({ fit: false });
      markDirty();
    });
    bounds.push([center.latitude, center.longitude]);
    if (radiusKm > 0) {
      coverageMainCircle = L.circle([center.latitude, center.longitude], {
        radius: radiusKm * 1000,
        color: '#2563eb',
        fillColor: '#60a5fa',
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);
    }
  }

  if (statusEl) {
    if (cachedLocationsLoadError) statusEl.textContent = cachedLocationsLoadError;
    else if (!selectedLocations.length) statusEl.textContent = 'Nenhuma base selecionada ainda. Use o botão acima para escolher no mapa.';
    else if (!center) statusEl.textContent = 'Bases selecionadas. Agora defina um centro clicando no mapa ou usando o botão de referência.';
    else statusEl.textContent = `Cobertura aplicada a ${selectedLocations.length} base(s).`;
  }

  fitLeafletMapToPoints(map, bounds);
}

function renderCoverageSummary() {
  const summaryEl = document.getElementById('ue-coverage-summary');
  const chipListEl = document.getElementById('ue-coverage-selected-bases');
  const coordsEl = document.getElementById('ue-coverage-coords');
  if (!summaryEl || !chipListEl || !coordsEl) return;

  const selectedLocations = getCoverageSelectedLocations();
  const center = getCoverageCenterFromDom();
  const radiusKm = getCoverageRadiusKmFromDom();

  summaryEl.innerHTML = `
    <div class="ue-coverage-summary__grid">
      <div class="ue-coverage-summary__item">
        <span class="ue-coverage-summary__label">Bases atendidas</span>
        <strong>${esc(String(selectedLocations.length))}</strong>
      </div>
      <div class="ue-coverage-summary__item">
        <span class="ue-coverage-summary__label">Raio operacional</span>
        <strong>${esc(radiusKm > 0 ? `${radiusKm} km` : 'Não definido')}</strong>
      </div>
      <div class="ue-coverage-summary__item">
        <span class="ue-coverage-summary__label">Centro</span>
        <strong>${esc(center ? 'Definido' : 'Pendente')}</strong>
      </div>
    </div>
  `;
  coordsEl.textContent = formatCoverageCoordLine(center);
  chipListEl.innerHTML = selectedLocations.length
    ? selectedLocations
        .map((location) => `<span class="ue-coverage-chip">${esc(String(location.name || 'Base'))}</span>`)
        .join('')
    : '<span class="ue-coverage-empty">Nenhuma base selecionada.</span>';
}

function refreshCoverageUi({ fit = true } = {}) {
  syncCoverageHiddenSelect(getSelectedServiceLocationIds());
  renderCoverageSummary();
  if (fit) renderCoverageMainMap();
  else {
    renderCoverageMainMap();
    if (coverageMainMap) coverageMainMap.invalidateSize();
  }
  dirtyHooks.refreshWorkspace();
}

function closeCoverageBasesModal() {
  const modal = document.getElementById('coverage-bases-modal');
  if (modal) modal.classList.remove('open');
}

function ensureCoverageModalMap() {
  const L = getLeafletGlobal();
  const el = document.getElementById('coverage-modal-map');
  if (!L || !el) return null;
  if (!coverageModalMap) {
    coverageModalMap = L.map(el, { zoomControl: true, attributionControl: true }).setView([-15.788, -47.879], 5);
    coverageModalTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(coverageModalMap);
  }
  setTimeout(() => coverageModalMap?.invalidateSize(), 0);
  return coverageModalMap;
}

function toggleCoverageModalDraftLocation(locationId) {
  const id = String(locationId || '');
  if (!id) return;
  if (coverageModalDraftSelected.has(id)) coverageModalDraftSelected.delete(id);
  else coverageModalDraftSelected.add(id);
  renderCoverageModalList();
  renderCoverageModalMap();
}

function renderCoverageModalList() {
  const listEl = document.getElementById('coverage-modal-list');
  const metaEl = document.getElementById('coverage-modal-meta');
  if (!listEl || !metaEl) return;
  const rows = getFilteredCoverageLocations();
  metaEl.textContent = `${rows.length} base(s) na busca · ${coverageModalDraftSelected.size} selecionada(s)`;
  listEl.innerHTML = rows.length
    ? rows
        .map((location) => {
          const id = String(location.id);
          const active = coverageModalDraftSelected.has(id);
          const disabled = !isValidLocationCoordinate(location) ? ' ue-coverage-list-row--disabled' : '';
          return `<button type="button" class="ue-coverage-list-row${active ? ' is-active' : ''}${disabled}" data-coverage-loc="${esc(id)}">
            <span class="ue-coverage-list-row__title">${esc(serviceLocationLabel(location))}</span>
            <span class="ue-coverage-list-row__meta">${esc(location.address || 'Sem endereço cadastrado')}${!isValidLocationCoordinate(location) ? ' · sem coordenadas' : ''}</span>
          </button>`;
        })
        .join('')
    : '<div class="ue-coverage-empty">Nenhuma base encontrada para esse filtro.</div>';
  listEl.querySelectorAll('[data-coverage-loc]').forEach((btn) => {
    btn.addEventListener('click', () => toggleCoverageModalDraftLocation(btn.getAttribute('data-coverage-loc') || ''));
  });
}

function renderCoverageModalMap() {
  const L = getLeafletGlobal();
  const map = ensureCoverageModalMap();
  if (!L || !map) return;
  coverageModalMarkers.forEach((marker) => marker.remove());
  coverageModalMarkers = [];
  const rows = getFilteredCoverageLocations();
  const bounds = [];
  rows.forEach((location) => {
    if (!isValidLocationCoordinate(location)) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const active = coverageModalDraftSelected.has(String(location.id));
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`<strong>${esc(serviceLocationLabel(location))}</strong>${location.address ? `<br>${esc(location.address)}` : ''}`);
    marker.on('click', () => toggleCoverageModalDraftLocation(String(location.id)));
    if (active) marker.openPopup();
    coverageModalMarkers.push(marker);
    bounds.push([lat, lng]);
  });
  fitLeafletMapToPoints(map, bounds);
}

function openCoverageBasesModal() {
  const modal = document.getElementById('coverage-bases-modal');
  const searchEl = document.getElementById('coverage-modal-search');
  if (!modal) return;
  coverageModalDraftSelected = new Set(getSelectedServiceLocationIds());
  coverageModalSearch = '';
  if (searchEl) searchEl.value = '';
  renderCoverageModalList();
  renderCoverageModalMap();
  modal.classList.add('open');
}

function bindCoverageUx() {
  const openBtn = document.getElementById('btn-coverage-open-modal');
  const centerBtn = document.getElementById('btn-coverage-center-selected');
  const clearCenterBtn = document.getElementById('btn-coverage-clear-center');
  const radiusEl = document.getElementById('t-coverage-radius-km');
  const notesEl = document.getElementById('t-coverage-notes');
  const closeBtn = document.getElementById('coverage-bases-close');
  const cancelBtn = document.getElementById('coverage-bases-cancel');
  const applyBtn = document.getElementById('coverage-bases-apply');
  const modal = document.getElementById('coverage-bases-modal');
  const searchEl = document.getElementById('coverage-modal-search');
  const sectionToggle = document.querySelector('#sec-regioes .ue-section-toggle');

  openBtn?.addEventListener('click', () => {
    if (isUserEditReadonly()) return;
    openCoverageBasesModal();
  });
  centerBtn?.addEventListener('click', () => {
    if (isUserEditReadonly()) return;
    const rows = getCoverageSelectedLocations().filter(isValidLocationCoordinate);
    if (!rows.length) {
      alert('Selecione pelo menos uma base com coordenadas para definir a referência.');
      return;
    }
    const avgLat = rows.reduce((sum, location) => sum + Number(location.latitude), 0) / rows.length;
    const avgLng = rows.reduce((sum, location) => sum + Number(location.longitude), 0) / rows.length;
    document.getElementById('t-coverage-lat').value = String(avgLat);
    document.getElementById('t-coverage-lng').value = String(avgLng);
    refreshCoverageUi({ fit: true });
    markDirty();
  });
  clearCenterBtn?.addEventListener('click', () => {
    if (isUserEditReadonly()) return;
    document.getElementById('t-coverage-lat').value = '';
    document.getElementById('t-coverage-lng').value = '';
    refreshCoverageUi({ fit: true });
    markDirty();
  });
  radiusEl?.addEventListener('input', () => {
    refreshCoverageUi({ fit: false });
    markDirty();
  });
  notesEl?.addEventListener('input', markDirty);
  searchEl?.addEventListener('input', () => {
    coverageModalSearch = searchEl.value || '';
    renderCoverageModalList();
    renderCoverageModalMap();
  });
  closeBtn?.addEventListener('click', closeCoverageBasesModal);
  cancelBtn?.addEventListener('click', closeCoverageBasesModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeCoverageBasesModal();
  });
  sectionToggle?.addEventListener('click', () => {
    setTimeout(() => refreshCoverageUi({ fit: false }), 180);
  });
  applyBtn?.addEventListener('click', () => {
    syncCoverageHiddenSelect([...coverageModalDraftSelected]);
    closeCoverageBasesModal();
    refreshCoverageUi({ fit: true });
    markDirty();
  });
}

function getLocationMultiselectOptionsHtml(locations) {
  const list = Array.isArray(locations) ? locations : [];
  const key = list.map((l) => l.id).join('\u001e');
  if (key === _locationMultiselectOptsKey && _locationMultiselectOptsHtml) return _locationMultiselectOptsHtml;
  _locationMultiselectOptsKey = key;
  _locationMultiselectOptsHtml = list
    .map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${esc(l.type)})</option>`)
    .join('');
  return _locationMultiselectOptsHtml;
}

function syncDocLocsMultiselectSelections(root) {
  if (!root) return;
  root.querySelectorAll('select.doc-locs').forEach((sel) => {
    const raw = sel.getAttribute('data-initial-locs') || '';
    const ids = new Set(raw.split('|').map((s) => s.trim()).filter(Boolean));
    [...sel.options].forEach((o) => {
      o.selected = ids.has(o.value);
    });
  });
}


let faceEnrollmentList = [];
let faceUserId = '';
/** Alinhado a admin-panel/backend/src/lib/faceEnrollmentPrimary.js */
const REGISTRATION_PRIMARY_FACE_ID = 'fe_reg_primary';

function isPrimaryRegistrationFace(p) {
  return !!(p && typeof p === 'object' && (p.registrationPrimary === true || p.id === REGISTRATION_PRIMARY_FACE_ID));
}

function sortFaceEnrollmentForDisplay(list) {
  if (!Array.isArray(list)) return [];
  const prim = list.filter(isPrimaryRegistrationFace);
  const rest = list.filter((p) => p && !isPrimaryRegistrationFace(p));
  return [...prim, ...rest];
}
/** Já existe TechnicianProfile (mostrar bloco técnico mesmo com papel ainda não migrado a PROVIDER) */
let hasTechnicianProfile = false;

function normalizeRoleForForm(r) {
  if (r === 'ADMIN') return 'TENANT_ADMIN';
  return r || 'USER';
}

function syncTechPanelVisibility() {
  const roleEl = document.getElementById('f-role');
  const panel = document.getElementById('tech-panel');
  if (!roleEl || !panel) return;
  const show = roleEl.value === 'PROVIDER' || hasTechnicianProfile;
  panel.style.display = show ? 'block' : 'none';
  dirtyHooks.refreshWorkspace();
}

function renderFaceGallery() {
  const el = document.getElementById('face-gallery');
  if (!el) return;
  const ordered = sortFaceEnrollmentForDisplay(faceEnrollmentList);
  if (!ordered.length) {
    el.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:var(--text3);padding:8px 0">${esc(t('ue_faceGalleryEmpty'))}</div>`;
    return;
  }
  el.innerHTML = ordered
    .map((p) => {
      const primary = isPrimaryRegistrationFace(p);
      const rm = primary
        ? `<span class="face-card-protected" title="${esc(t('ue_faceProtectedTitle'))}">${esc(t('ue_faceProtectedBadge'))}</span>`
        : `<button type="button" class="btn btn-sm btn-danger face-rm" data-photo-id="${esc(p.id)}">${esc(t('ue_docRemove'))}</button>`;
      return `<div class="face-card${primary ? ' face-card--primary' : ''}" data-photo-id="${esc(p.id)}">
      ${primary ? `<div class="face-card-ribbon">${esc(t('ue_faceRibbonPrimary'))}</div>` : ''}
      <img src="${esc(publicUploadUrl(p.url))}" alt="" loading="lazy" decoding="async" />
      ${rm}
    </div>`;
    })
    .join('');
  el.querySelectorAll('.face-rm').forEach((btn) => {
    btn.onclick = () => removeFacePhoto(btn.getAttribute('data-photo-id'));
  });
}

async function removeFacePhoto(photoId) {
  if (!photoId || !faceUserId) return;
  const row = faceEnrollmentList.find((x) => x && x.id === photoId);
  if (row && isPrimaryRegistrationFace(row)) {
    alert(t('ue_facePrimaryRemoveBlock'));
    return;
  }
  if (!confirm(t('ue_faceRemoveConfirm'))) return;
  const res = await CONFIG.del(
    `/users/${encodeURIComponent(faceUserId)}/face-enrollment/${encodeURIComponent(photoId)}`
  );
  if (res?.error) {
    alert(res.error);
    return;
  }
  faceEnrollmentList = Array.isArray(res.photos)
    ? sortFaceEnrollmentForDisplay(res.photos)
    : sortFaceEnrollmentForDisplay(faceEnrollmentList.filter((x) => x.id !== photoId));
  renderFaceGallery();
  if (bumpUserRefFaceState && res.comprefaceRecognitionSync != null) {
    bumpUserRefFaceState({
      faceEnrollmentPhotos: faceEnrollmentList,
      comprefaceRecognitionSync: res.comprefaceRecognitionSync,
    });
  }
  if (res.comprefaceSync && res.comprefaceSync.ok === false && res.comprefaceSync.error) {
    alert(res.comprefaceSync.error);
  }
}

function normalizeSkillToken(raw) {
  return String(raw || '')
    .replace(/[,;\n\t]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getSkillsChipsRoot() {
  return document.getElementById('t-skills-chips');
}

function getSkillsAddInput() {
  return document.getElementById('t-skills-add');
}

/** Lista atual de habilidades (ordem dos chips). */
function getSkillsFromDom() {
  const root = getSkillsChipsRoot();
  if (!root) return [];
  return [...root.querySelectorAll('.ue-skill-chip')]
    .map((el) => normalizeSkillToken(el.dataset.skill || ''))
    .filter(Boolean);
}

function renderSkillChips(skills) {
  const root = getSkillsChipsRoot();
  if (!root) return;
  const list = Array.isArray(skills) ? [...skills] : [];
  const uniq = [];
  const seen = new Set();
  for (const s of list) {
    const n = normalizeSkillToken(s);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(n);
  }
  root.replaceChildren();
  if (!uniq.length) {
    const sp = document.createElement('span');
    sp.className = 'ue-skills-empty';
    sp.id = 't-skills-empty';
    sp.textContent = t('ue_skillsEmpty');
    root.appendChild(sp);
    return;
  }
  for (const skill of uniq) {
    const wrap = document.createElement('span');
    wrap.className = 'ue-skill-chip';
    wrap.dataset.skill = skill;
    const txt = document.createElement('span');
    txt.textContent = skill;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ue-skill-chip-remove';
    btn.textContent = '×';
    btn.setAttribute('aria-label', t('ue_skillRemove'));
    btn.onclick = () => {
      if (isUserEditReadonly()) return;
      const next = getSkillsFromDom().filter((x) => x !== skill);
      renderSkillChips(next);
      markDirty();
    };
    wrap.appendChild(txt);
    wrap.appendChild(btn);
    root.appendChild(wrap);
  }
}

function addSkillFromAddInput() {
  if (isUserEditReadonly()) return;
  const inp = getSkillsAddInput();
  if (!inp) return;
  const parts = String(inp.value || '')
    .split(/[,;\n]/)
    .map((x) => normalizeSkillToken(x))
    .filter(Boolean);
  if (!parts.length) return;
  let cur = getSkillsFromDom();
  let added = false;
  for (const token of parts) {
    if (cur.some((x) => x.toLowerCase() === token.toLowerCase())) continue;
    cur = [...cur, token];
    added = true;
  }
  if (added) {
    renderSkillChips(cur);
    markDirty();
  }
  inp.value = '';
}

function bindSkillsWidgetOnce() {
  if (ueSkillsWidgetBound) return;
  const addBtn = document.getElementById('t-skills-add-btn');
  const inp = getSkillsAddInput();
  if (!addBtn || !inp) return;
  ueSkillsWidgetBound = true;
  addBtn.addEventListener('click', () => addSkillFromAddInput());
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSkillFromAddInput();
    }
  });
}

function buildUserPatchPayload() {
  const skillsJson = getSkillsFromDom();
  const coverageLat = Number(document.getElementById('t-coverage-lat')?.value);
  const coverageLng = Number(document.getElementById('t-coverage-lng')?.value);
  const coverageRadiusKm = Number(document.getElementById('t-coverage-radius-km')?.value);
  const coverageNotes = document.getElementById('t-coverage-notes')?.value || '';
  const hasCoverage =
    Number.isFinite(coverageLat) &&
    Number.isFinite(coverageLng) &&
    Number.isFinite(coverageRadiusKm) &&
    coverageRadiusKm > 0;
  const selRole = document.getElementById('f-role')?.value || 'USER';
  const isProviderRole = selRole === 'PROVIDER';
  const includeTechnician = isProviderRole || hasTechnicianProfile;
  const plRaw = (document.getElementById('f-preferred-locale')?.value || '').trim();
  const notes = document.getElementById('f-admin-notes')?.value ?? '';

  const rawFormEmail = (document.getElementById('f-email')?.value ?? '').trim();
  const formNorm = rawFormEmail.toLowerCase();
  const displayNorm = String(ueBaselineDisplayEmail ?? '').toLowerCase();
  const emailForApi =
    displayNorm && formNorm === displayNorm
      ? ueBaselineRowEmail
      : rawFormEmail.toLowerCase();

  return {
    name: (document.getElementById('f-name')?.value ?? '').trim(),
    email: emailForApi,
    employeeMatricula: (document.getElementById('f-employee-matricula')?.value || '').trim() || null,
    phone: (document.getElementById('f-phone')?.value ?? '').trim() || null,
    role: selRole,
    avatarUrl: (document.getElementById('f-avatar')?.value ?? '').trim() || null,
    isActive: !!document.getElementById('f-active')?.checked,
    workTimeTrackingEnabled: !!document.getElementById('f-work-time')?.checked,
    ...(function wtBrPayload() {
      const wtOn = !!document.getElementById('f-work-time')?.checked;
      if (!ueTenantCountryBr) return {};
      if (!wtOn) return { workTimeBrazilRegime: null };
      return { workTimeBrazilRegime: readWtBrRegimeFromDom() === 'PJ' ? 'PJ' : 'CLT' };
    })(),
    addressJson: {
      line1: (document.getElementById('a-line1')?.value ?? '').trim() || null,
      line2: (document.getElementById('a-line2')?.value ?? '').trim() || null,
      district: (document.getElementById('a-district')?.value ?? '').trim() || null,
      city: (document.getElementById('a-city')?.value ?? '').trim() || null,
      state: (document.getElementById('a-state')?.value ?? '').trim() || null,
      postalCode: (document.getElementById('a-postal')?.value ?? '').trim() || null,
      countryCode: (document.getElementById('a-country')?.value ?? '').trim() || 'BR',
    },
    personalDocuments: collectDocTable('tbody-docs-personal'),
    preferredChatLocale: plRaw || null,
    adminInternalNotes: isManagerPanelSession() ? undefined : notes.trim() === '' ? null : notes,
    isProvider: isProviderRole,
    technician: includeTechnician
      ? {
          status: document.getElementById('t-status')?.value || 'PENDING',
          cft: (document.getElementById('t-cft')?.value ?? '').trim() || null,
          specialty: (document.getElementById('t-specialty')?.value ?? '').trim() || null,
          score: Number(document.getElementById('t-score')?.value) || 5,
          workScheduleJson: collectSchedule(),
          skillsJson,
          serviceCoverageGeoJson: hasCoverage
            ? {
                homeBase: {
                  latitude: coverageLat,
                  longitude: coverageLng,
                  address: document.getElementById('a-line1').value.trim() || null,
                  city: document.getElementById('a-city').value.trim() || null,
                  state: document.getElementById('a-state').value.trim() || null,
                  postalCode: document.getElementById('a-postal').value.trim() || null,
                  countryCode: document.getElementById('a-country').value.trim() || 'BR',
                },
                radiusKm: coverageRadiusKm,
                notes: coverageNotes.trim() || null,
              }
            : null,
          professionalDocuments: collectDocTable('tbody-docs-pro'),
        }
      : undefined,
  };
}

function isAdminLevel(role) {
  const r = String(role || '').toUpperCase();
  return r === 'TENANT_ADMIN' || r === 'SAAS_ADMIN' || r === 'ADMIN';
}

function needsElevateConfirm(prevRole, nextRole) {
  const p = normalizeRoleForForm(prevRole);
  const n = String(nextRole || '').toUpperCase();
  if (!isAdminLevel(p) && isAdminLevel(n)) return true;
  if (isAdminLevel(p) && n === 'SAAS_ADMIN' && p !== 'SAAS_ADMIN') return true;
  return false;
}

function openElevateConfirmModal(expectedEmail) {
  return new Promise((resolve) => {
    const ov = document.getElementById('elevate-role-modal');
    const inp = document.getElementById('elevate-email-input');
    const tEl = document.getElementById('elevate-modal-title');
    const bEl = document.getElementById('elevate-modal-body');
    if (!ov || !inp) return resolve(true);
    if (tEl) tEl.textContent = t('elevateTitle');
    if (bEl) bEl.textContent = t('elevateBody');
    inp.value = '';
    ov.classList.add('open');
    const close = (ok) => {
      ov.classList.remove('open');
      resolve(ok);
    };
    const onClose = () => close(false);
    document.querySelectorAll('[data-close-elevate]').forEach((b) => {
      b.onclick = onClose;
    });
    const conf = document.getElementById('elevate-confirm-btn');
    if (conf) {
      conf.onclick = () => {
        if (String(inp.value).trim().toLowerCase() !== String(expectedEmail).trim().toLowerCase()) {
          alert(t('elevateMismatch'));
          return;
        }
        close(true);
      };
    }
    ov.onclick = (ev) => {
      if (ev.target === ov) close(false);
    };
  });
}

function paintSummaryBar(u) {
  const bar = document.getElementById('ue-summary-bar');
  if (!bar) return;
  const locFmt = adminIntlLocale(getAdminUiLocale());
  const fmt = (d) =>
    d ? new Date(d).toLocaleString(locFmt, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const role = normalizeRoleForForm(u.role);
  const tp = u.technicianProfile;
  const tpSt = tp ? String(tp.status || '').toUpperCase() : '';
  const chips = [
    `<span class="ue-sum-chip"><strong>${esc(t('summaryId'))}</strong> <code style="font-size:11px">${esc(u.id)}</code></span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summaryTenant'))}</strong> ${esc(u.tenant?.name || u.tenantId || '—')}</span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summaryRole'))}</strong> ${esc(role)}</span>`,
    `<span class="ue-sum-chip">${u.isActive ? esc(t('summaryActive')) : esc(t('summaryInactive'))}</span>`,
    tp
      ? `<span class="ue-sum-chip"><strong>${esc(t('summaryProvider'))}</strong> ${esc(tpSt || '—')}</span>`
      : '',
    `<span class="ue-sum-chip"><strong>${esc(t('summaryLastLogin'))}</strong> ${esc(fmt(u.lastLogin))}</span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summaryWorkTime'))}</strong> ${u.workTimeTrackingEnabled ? '✓' : '—'}</span>`,
    `<span class="ue-sum-chip"><strong>${esc(t('summarySession'))}</strong> ${
      u.currentSessionId ? esc(String(u.currentSessionId).slice(0, 14)) + '…' : esc(t('summarySessionNone'))
    }</span>`,
  ].filter(Boolean);
  bar.innerHTML = chips.join('');
}

function countEnabledScheduleSlots(schedule) {
  if (!schedule || typeof schedule !== 'object') return 0;
  return Object.values(schedule).reduce((acc, day) => {
    if (!Array.isArray(day)) return acc;
    return acc + day.filter((slot) => slot && slot.enabled).length;
  }, 0);
}

function workspaceCardHtml({ href, eyebrow, title, meta, chips, tone }) {
  return `<a class="ue-workspace-card ue-workspace-tone--${esc(tone || 'muted')}" href="${esc(href)}">
    <div class="ue-workspace-card__top">
      <div>
        <div class="ue-workspace-card__eyebrow">${esc(eyebrow)}</div>
        <div class="ue-workspace-card__title">${esc(title)}</div>
      </div>
    </div>
    <div class="ue-workspace-card__meta">${esc(meta)}</div>
    <div class="ue-workspace-card__chips">${chips.map((chip) => `<span class="ue-workspace-card__chip">${esc(chip)}</span>`).join('')}</div>
    <div class="ue-workspace-card__cta">Abrir bloco</div>
  </a>`;
}

function paintWorkspaceBar(currentUser) {
  const bar = document.getElementById('ue-workspace-bar');
  if (!bar) return;
  const role = normalizeRoleForForm(document.getElementById('f-role')?.value || currentUser?.role || 'USER');
  const payload = buildUserPatchPayload();
  const technician = payload.technician || null;
  const providerEnabled = role === 'PROVIDER' || !!technician;
  const technicianStatus = String(technician?.status || currentUser?.technicianProfile?.status || '').toUpperCase();
  const providerTitle = !providerEnabled
    ? 'Sem operação como prestador'
    : technicianStatus === 'ACTIVE'
      ? 'Pronto para receber OS'
      : technicianStatus === 'PENDING'
        ? 'Cadastro operacional pendente'
        : technicianStatus === 'SUSPENDED'
          ? 'Prestador suspenso'
          : 'Perfil operacional inativo';
  const providerTone = !providerEnabled
    ? 'muted'
    : technicianStatus === 'ACTIVE'
      ? 'good'
      : technicianStatus === 'PENDING'
        ? 'warn'
        : 'muted';
  const providerSkills = Array.isArray(technician?.skillsJson) ? technician.skillsJson.length : 0;
  const providerCoverageRadius = Number(technician?.serviceCoverageGeoJson?.radiusKm || 0);
  const providerShifts = countEnabledScheduleSlots(technician?.workScheduleJson);

  const personalDocs = Array.isArray(payload.personalDocuments) ? payload.personalDocuments.length : 0;
  const professionalDocs = Array.isArray(technician?.professionalDocuments) ? technician.professionalDocuments.length : 0;
  const faceCount = Array.isArray(faceEnrollmentList) ? faceEnrollmentList.length : 0;
  const workTimeEnabled = !!payload.workTimeTrackingEnabled;
  const complianceTitle = workTimeEnabled && faceCount > 0
    ? 'Base operacional consistente'
    : workTimeEnabled
      ? 'Ponto ativo com atenção na biometria'
      : personalDocs + professionalDocs > 0 || faceCount > 0
        ? 'Evidências cadastradas parcialmente'
        : 'Sem evidências operacionais';
  const complianceTone = workTimeEnabled && faceCount > 0
    ? 'good'
    : workTimeEnabled || personalDocs + professionalDocs > 0 || faceCount > 0
      ? 'warn'
      : 'muted';

  const sessionActive = !!currentUser?.currentSessionId;
  const emailVerified = !!currentUser?.emailVerifiedAt;
  const notesFilled = !!String(document.getElementById('f-admin-notes')?.value || '').trim();
  const locale = String(document.getElementById('f-preferred-locale')?.value || '').trim() || 'Padrão';
  const adminTitle = !emailVerified
    ? 'Conta pede atenção administrativa'
    : sessionActive
      ? 'Usuário com sessão ativa'
      : 'Conta administrativamente estável';
  const adminTone = !emailVerified ? 'warn' : sessionActive ? 'info' : 'muted';

  const cards = [
    workspaceCardHtml({
      href: '#sec-tecnico',
      eyebrow: 'Prestador',
      title: providerTitle,
      meta: providerEnabled
        ? 'Use este bloco para ajustar despacho, habilitação técnica e cobertura operacional.'
        : 'Ative o papel de prestador apenas para usuários que realmente operam ordens de serviço.',
      chips: [
        `Papel: ${role}`,
        `Status: ${providerEnabled ? technicianStatus || 'PENDING' : 'não habilitado'}`,
        `${providerSkills} habilidade(s)`,
        providerCoverageRadius > 0 ? `${providerCoverageRadius} km de raio` : 'Cobertura indefinida',
        `${providerShifts} turno(s) ativo(s)`,
      ],
      tone: providerTone,
    }),
    workspaceCardHtml({
      href: '#sec-face',
      eyebrow: 'Compliance',
      title: complianceTitle,
      meta: 'Biometria, ponto e documentos ficam concentrados aqui para evitar varrer a ficha inteira.',
      chips: [
        workTimeEnabled ? 'Ponto habilitado' : 'Ponto desligado',
        `${faceCount} foto(s) faciais`,
        `${personalDocs} doc(s) pessoais`,
        `${professionalDocs} doc(s) profissionais`,
      ],
      tone: complianceTone,
    }),
    workspaceCardHtml({
      href: '#sec-ops',
      eyebrow: 'Administração',
      title: adminTitle,
      meta: 'Sessão, verificação de e-mail, notas internas e idioma preferido ficam neste bloco final.',
      chips: [
        sessionActive ? 'Sessão ativa' : 'Sem sessão',
        emailVerified ? 'E-mail verificado' : 'E-mail pendente',
        notesFilled ? 'Notas preenchidas' : 'Sem notas',
        `Idioma: ${locale}`,
      ],
      tone: adminTone,
    }),
  ];
  bar.innerHTML = cards.join('');
}

function paintTechSummary(currentUser) {
  const box = document.getElementById('ue-tech-summary');
  if (!box) return;
  const role = normalizeRoleForForm(document.getElementById('f-role')?.value || currentUser?.role || 'USER');
  const payload = buildUserPatchPayload();
  const technician = payload.technician || null;
  const enabled = role === 'PROVIDER' || !!technician;
  if (!enabled) {
    box.innerHTML = `
      <div class="ue-tech-summary__card ue-tech-summary__card--muted">
        <div class="ue-tech-summary__eyebrow">Prestador</div>
        <div class="ue-tech-summary__title">Perfil técnico não habilitado</div>
        <div class="ue-tech-summary__meta">Mude o papel da conta para <strong>Prestador</strong> quando este usuário realmente operar ordens de serviço.</div>
      </div>`;
    return;
  }

  const status = String(technician?.status || currentUser?.technicianProfile?.status || 'PENDING').toUpperCase();
  const scoreNum = Number(technician?.score ?? currentUser?.technicianProfile?.score ?? 5);
  const score = Number.isFinite(scoreNum) ? scoreNum.toFixed(1) : '5.0';
  const specialty = String(technician?.specialty || currentUser?.technicianProfile?.specialty || '').trim() || 'Sem especialidade principal';
  const cft = String(technician?.cft || currentUser?.technicianProfile?.cft || '').trim() || 'Não informado';
  const skills = Array.isArray(technician?.skillsJson) ? technician.skillsJson : [];
  const coverageRadiusKm = Number(technician?.serviceCoverageGeoJson?.radiusKm || 0);
  const coverageCenter = technician?.serviceCoverageGeoJson?.homeBase || null;
  const shifts = countEnabledScheduleSlots(technician?.workScheduleJson);
  const tone =
    status === 'ACTIVE' ? 'good' : status === 'PENDING' ? 'warn' : status === 'SUSPENDED' ? 'danger' : 'muted';
  const readiness =
    status === 'ACTIVE'
      ? 'Pronto para operação'
      : status === 'PENDING'
        ? 'Aguardando ativação operacional'
        : status === 'SUSPENDED'
          ? 'Operação bloqueada temporariamente'
          : 'Sem despacho ativo';

  box.innerHTML = `
    <div class="ue-tech-summary__card ue-tech-summary__card--${esc(tone)}">
      <div class="ue-tech-summary__eyebrow">Status operacional</div>
      <div class="ue-tech-summary__title">${esc(readiness)}</div>
      <div class="ue-tech-summary__meta">Especialidade: <strong>${esc(specialty)}</strong></div>
      <div class="ue-tech-summary__chips">
        <span class="ue-tech-summary__chip">Status: ${esc(status)}</span>
        <span class="ue-tech-summary__chip">Score: ${esc(score)}</span>
        <span class="ue-tech-summary__chip">Raio: ${esc(coverageRadiusKm > 0 ? `${coverageRadiusKm} km` : 'não definido')}</span>
        <span class="ue-tech-summary__chip">Turnos: ${esc(String(shifts))}</span>
      </div>
    </div>
    <div class="ue-tech-summary__card">
      <div class="ue-tech-summary__eyebrow">Qualificação</div>
      <div class="ue-tech-summary__title">${esc(cft)}</div>
      <div class="ue-tech-summary__meta">${
        coverageCenter && Number.isFinite(Number(coverageCenter.latitude)) && Number.isFinite(Number(coverageCenter.longitude))
          ? `Centro: ${esc(`${Number(coverageCenter.latitude).toFixed(5)}, ${Number(coverageCenter.longitude).toFixed(5)}`)}`
          : 'Centro geográfico ainda não definido.'
      }</div>
      <div class="ue-tech-summary__chips">
        <span class="ue-tech-summary__chip">${skills.length} habilidade(s)</span>
        <span class="ue-tech-summary__chip">${esc(specialty)}</span>
      </div>
    </div>`;
}

async function loadUserAudit(userId) {
  const tb = document.getElementById('ue-audit-tbody');
  if (!tb) return;
  tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">${esc(t('ue_auditLoading'))}</td></tr>`;
  const res = await CONFIG.get(`/users/${encodeURIComponent(userId)}/admin-activity?limit=40`).catch(() => null);
  if (!res || res.error) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red);padding:16px">${esc(t('auditLoadErr'))}</td></tr>`;
    return;
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">${esc(t('auditEmpty'))}</td></tr>`;
    return;
  }
  const loc = adminIntlLocale(getAdminUiLocale());
  tb.innerHTML = rows
    .map((log) => {
      const dt = log.createdAt ? new Date(log.createdAt).toLocaleString(loc) : '—';
      const adm = log.admin?.email || log.admin?.name || '—';
      const meta = log.metadata != null ? JSON.stringify(log.metadata).slice(0, 220) : '';
      return `<tr>
        <td style="white-space:nowrap;font-size:11px;color:var(--text3)">${esc(dt)}</td>
        <td style="font-weight:600">${esc(log.action || '')}</td>
        <td style="font-size:11px">${esc(adm)}</td>
        <td style="font-size:10px;color:var(--text3);word-break:break-all">${esc(meta)}</td>
      </tr>`;
    })
    .join('');
}

function fillRoleMatrixModal() {
  const body = document.getElementById('role-matrix-body');
  if (!body) return;
  body.innerHTML = `<p style="margin-bottom:10px">${esc(t('ue_roleMatrixIntro'))}</p>
      <ul style="padding-left:18px;margin:0">
        <li>${esc(t('ue_roleMatrixLiUser'))}</li>
        <li>${esc(t('ue_roleMatrixLiProv'))}</li>
        <li>${esc(t('ue_roleMatrixLiMgr'))}</li>
        <li>${esc(t('ue_roleMatrixLiTenant'))}</li>
        <li>${esc(t('ue_roleMatrixLiSaas'))}</li>
      </ul>`;
}

function applyUserEditToolbarI18n() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('ue-back-list-txt', t('backList'));
  set('ue-more-actions-txt', t('moreActions'));
  set('btn-save', t('save'));
  set('btn-save-stay', t('saveStay'));
  set('btn-discard', t('discard'));
  set('ue-unsaved-badge', t('unsaved'));
  set('ue-locale-label', t('localeLabel'));
  set('act-copy-link', t('copyLink'));
  set('act-export-json', t('exportJson'));
  set('act-duplicate', t('duplicate'));
  set('act-role-matrix', t('roleMatrix'));
  set('act-open-audit', t('openAuditPage'));
  set('ue-avatar-upload-txt', t('ue_avatarUploadBtn'));
  const locSel = document.getElementById('ue-panel-locale');
  if (locSel) locSel.value = getAdminUiLocale();
  document.querySelectorAll('.ue-doc-sit-th').forEach((th) => {
    th.textContent = t('docSituation');
  });
  document.getElementById('lbl-mfa') && (document.getElementById('lbl-mfa').textContent = t('mfaTitle'));
  document.getElementById('ue-mfa-hint') && (document.getElementById('ue-mfa-hint').textContent = t('mfaBody'));
  document.getElementById('lbl-email-ver') && (document.getElementById('lbl-email-ver').textContent = t('emailVerifyTitle'));
  document.getElementById('ue-emailver-hint') && (document.getElementById('ue-emailver-hint').textContent = t('emailVerifyBody'));
  set('btn-email-ver-send', t('ue_emailVerSendBtn'));
  set('btn-email-ver-mark', t('ue_emailVerMarkBtn'));
  document.getElementById('lbl-admin-notes') && (document.getElementById('lbl-admin-notes').textContent = t('internalNotes'));
  document.getElementById('hint-admin-notes') && (document.getElementById('hint-admin-notes').textContent = t('internalNotesHint'));
  document.getElementById('lbl-preferred-locale') && (document.getElementById('lbl-preferred-locale').textContent = t('appLocale'));
  document.getElementById('hint-preferred-locale') && (document.getElementById('hint-preferred-locale').textContent = t('appLocaleHint'));
  document.getElementById('role-matrix-title') && (document.getElementById('role-matrix-title').textContent = t('roleMatrixTitle'));
}

function paintAddressCountryHint() {
  const hint = document.getElementById('addr-country-hint');
  if (!hint) return;
  const c = String(document.getElementById('a-country')?.value || '').trim().toUpperCase();
  const useEnStyleAddrHints = getAdminUiLocale() === 'en-US' || getAdminUiLocale() === 'es-ES';
  if (useEnStyleAddrHints) {
    hint.textContent =
      c === 'BR'
        ? t('ue_addrHintBR')
        : c === 'US'
          ? t('ue_addrHintUS')
          : t('ue_addrHintGeneric');
  } else {
    hint.textContent = c === 'US' || c === 'CA' ? t('ue_addrHintNonBR') : t('ue_addrHintDefault');
  }
}

function paintAddressFieldUi() {
  paintAddressCountryHint();
  applyAddressFieldLabelsForCountry();
}

function paintEmailVerificationUx(u) {
  const hint = document.getElementById('ue-emailver-hint');
  const sendBtn = document.getElementById('btn-email-ver-send');
  const markBtn = document.getElementById('btn-email-ver-mark');
  if (!hint) return;
  const iso = u && u.emailVerifiedAt;
  if (iso) {
    const loc = adminIntlLocale(getAdminUiLocale());
    const d = new Date(iso);
    const fmt = Number.isNaN(d.getTime()) ? '' : d.toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
    hint.textContent = t('ue_emailVerVerified').replace(/\{date\}/g, fmt || String(iso));
    if (sendBtn) sendBtn.hidden = true;
    if (markBtn) markBtn.hidden = true;
  } else {
    hint.textContent = t('ue_emailVerPendingDesc');
    if (sendBtn) sendBtn.hidden = false;
    if (markBtn) {
      markBtn.hidden = isLimitedTenantManager;
    }
  }
}

function isManagerPanelSession() {
  return isLimitedTenantManager;
}

/** Papéis elevados na ficha: esconde opções e bloqueia alteração conforme o papel do painel. */
function applyUserEditSensitiveFieldRbac(targetUser) {
  const sel = document.getElementById('f-role');
  const notes = document.getElementById('f-admin-notes');
  const resetRole = () => {
    if (!sel) return;
    [...sel.options].forEach((o) => {
      o.hidden = false;
      o.disabled = false;
    });
    sel.disabled = false;
    sel.removeAttribute('title');
  };
  const clearNotesRbac = () => {
    if (!notes) return;
    notes.readOnly = false;
    notes.classList.remove('ue-rbac-readonly-field');
    notes.removeAttribute('title');
  };
  resetRole();
  clearNotesRbac();
  if (!targetUser) return;

  const targetRole = normalizeRoleForForm(targetUser.role);

  if (sel) {
    if (isLimitedTenantManager) {
      ['TENANT_ADMIN', 'SAAS_ADMIN'].forEach((val) => {
        const o = sel.querySelector(`option[value="${val}"]`);
        if (o) o.hidden = true;
      });
      if (targetRole === 'TENANT_ADMIN' || targetRole === 'SAAS_ADMIN') {
        sel.disabled = true;
        sel.title = t('ue_rbacRoleFieldLocked');
      }
    } else if (isTenantUserAdmin && !isPlatformUserAdmin) {
      const o = sel.querySelector('option[value="SAAS_ADMIN"]');
      if (o) o.hidden = true;
      if (targetRole === 'SAAS_ADMIN') {
        sel.disabled = true;
        sel.title = t('ue_rbacRoleFieldLocked');
      }
    }
  }

  if (notes && isLimitedTenantManager) {
    notes.readOnly = true;
    notes.classList.add('ue-rbac-readonly-field');
    notes.title = t('ue_rbacAdminNotesReadonly');
  }
}

export async function bootUserEditPage() {
  await initPage();
  const id = getQueryId();
  if (!id) {
    renderUserEditFatalUI('missingId');
    return;
  }

  const u = await CONFIG.get('/users/' + encodeURIComponent(id));
  if (!u || u.error) {
    renderUserEditFatalUI('notFound', u && u.error != null ? u.error : '');
    return;
  }

  const locationsRes = await CONFIG.get('/locations?tenantId=' + encodeURIComponent(u.tenantId));
  cachedLocationsLoadError = '';
  cachedLocations = Array.isArray(locationsRes) ? locationsRes : [];
  if (!Array.isArray(locationsRes)) {
    cachedLocationsLoadError = String(locationsRes?.error || 'Não foi possível carregar as bases deste tenant.');
  }

  applyUserEditToolbarI18n();
  applyUserEditStaticPageI18n();
  setupUserEditProgressiveSections();
  bindCoverageUx();
  bindSkillsWidgetOnce();
  const backList = document.getElementById('ue-back-list');
  if (backList) backList.href = 'users.html?resume=1';

  let uRef = u;
  syncUserEditEmailBaselines(uRef);
  let baselineOriginalRole = normalizeRoleForForm(u.role);
  let initialPayloadJson = '';
  /** Evita bloquear o thread no clique (JSON grande / muitos campos). */
  let dirtyDebounceTimer = null;
  const refreshDirty = () => {
    if (dirtyDebounceTimer != null) clearTimeout(dirtyDebounceTimer);
    dirtyDebounceTimer = setTimeout(() => {
      dirtyDebounceTimer = null;
      try {
        const cur = JSON.stringify(buildUserPatchPayload());
        const dirty = cur !== initialPayloadJson;
        const disc = document.getElementById('btn-discard');
        if (disc) disc.hidden = !dirty;
        const badge = document.getElementById('ue-unsaved-badge');
        if (badge) badge.hidden = !dirty;
      } catch (e) {
        console.error('[user-edit] refreshDirty', e);
      }
    }, 64);
  };
  dirtyHooks.mark = () => refreshDirty();
  dirtyHooks.refreshWorkspace = () => {
    paintWorkspaceBar(uRef);
    paintTechSummary(uRef);
  };

  const emailShown = ueBaselineDisplayEmail || humanLoginEmailDisplay(u);
  document.getElementById('ue-title').textContent = u.name || emailShown;
  const subBits = [u.tenant?.name, u.tenant?.email].filter(Boolean);
  document.getElementById('ue-sub').textContent =
    subBits.length ? subBits.join(' · ') : (u.tenantId || '—');
  const crumb = document.getElementById('ue-crumb-name');
  if (crumb) {
    const display = String(u.name || emailShown || 'Editar').trim() || 'Editar';
    crumb.textContent = display.length > 36 ? `${display.slice(0, 33)}…` : display;
  }

  document.getElementById('f-name').value = u.name || '';
  document.getElementById('f-email').value = emailShown;
  const fMat = document.getElementById('f-employee-matricula');
  if (fMat) fMat.value = u.employeeMatricula != null ? String(u.employeeMatricula) : '';
  document.getElementById('f-phone').value = u.phone || '';
  document.getElementById('f-role').value = normalizeRoleForForm(u.role);
  document.getElementById('f-avatar').value = u.avatarUrl || '';
  document.getElementById('f-active').checked = !!u.isActive;

  const fAdminNotes = document.getElementById('f-admin-notes');
  if (fAdminNotes) fAdminNotes.value = u.adminInternalNotes != null ? String(u.adminInternalNotes) : '';
  const fPrefLoc = document.getElementById('f-preferred-locale');
  if (fPrefLoc) fPrefLoc.value = u.preferredChatLocale || '';

  paintSummaryBar(u);
  paintWorkspaceBar(u);
  paintTechSummary(u);
  await initUserEditProviderAffiliations(id, u);

  const sess = document.getElementById('ue-session-info');
  if (sess) {
    const sid = u.currentSessionId ? String(u.currentSessionId) : '';
    const did = u.currentDeviceId ? String(u.currentDeviceId) : '';
    sess.innerHTML = sid || did
      ? `<div><strong>sessionId</strong> <code style="font-size:11px">${esc(sid || '—')}</code></div><div style="margin-top:6px"><strong>deviceId</strong> <code style="font-size:11px">${esc(did || '—')}</code></div>`
      : `<span style="color:var(--text3)">${esc(t('summarySessionNone'))}</span>`;
  }
  const btnDisc = document.getElementById('btn-disconnect');
  if (btnDisc) {
    btnDisc.onclick = async () => {
      if (!confirm(t('ue_disconnectConfirm'))) return;
      const r = await CONFIG.post(`/users/${encodeURIComponent(id)}/disconnect`, {}).catch(() => null);
      if (r?.ok) {
        alert(t('disconnectOk'));
        const u2 = await CONFIG.get('/users/' + encodeURIComponent(id));
        if (u2 && !u2.error) {
          uRef = u2;
          syncUserEditEmailBaselines(u2);
          const fe = document.getElementById('f-email');
          if (fe) fe.value = ueBaselineDisplayEmail;
          paintSummaryBar(u2);
          paintWorkspaceBar(u2);
          paintEmailVerificationUx(u2);
          if (sess) {
            sess.innerHTML = `<span style="color:var(--text3)">${esc(t('summarySessionNone'))}</span>`;
          }
        }
      } else alert(r?.error || t('ue_disconnectGenericErr'));
    };
  }

  paintEmailVerificationUx(u);

  const btnVerSend = document.getElementById('btn-email-ver-send');
  const btnVerMark = document.getElementById('btn-email-ver-mark');
  if (btnVerSend && !btnVerSend.dataset.ueBound) {
    btnVerSend.dataset.ueBound = '1';
    btnVerSend.addEventListener('click', async () => {
      if (isUserEditReadonly()) return;
      btnVerSend.disabled = true;
      const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/send-email-verification`, {}).catch(() => null);
      btnVerSend.disabled = false;
      if (res?.ok) {
        const detail = String(
          res.email?.error || res.email?.reason || (res.email?.skipped ? 'Nylas' : '') || '?',
        );
        const msg = res.email?.sent
          ? t('ue_emailVerSentOk')
          : t('ue_emailVerSentWarn').replace(/\{detail\}/g, detail);
        alert(msg + (res.verificationUrl ? `\n\n${res.verificationUrl}` : ''));
      } else alert(res?.error || t('ue_emailVerSendErr'));
    });
  }
  if (btnVerMark && !btnVerMark.dataset.ueBound) {
    btnVerMark.dataset.ueBound = '1';
    btnVerMark.addEventListener('click', async () => {
      if (isUserEditReadonly()) return;
      if (!confirm(t('ue_emailVerMarkConfirm'))) return;
      const res = await CONFIG.patch(`/users/${encodeURIComponent(id)}`, { emailVerifiedAt: true }).catch(() => null);
      if (res && !res.error) {
        uRef = res;
        syncUserEditEmailBaselines(res);
        const fe = document.getElementById('f-email');
        if (fe) fe.value = ueBaselineDisplayEmail;
        paintWorkspaceBar(res);
        paintEmailVerificationUx(res);
        alert(t('ue_emailVerMarkOk'));
      } else alert(res?.error || t('ue_emailVerMarkErr'));
    });
  }

  void loadUserAudit(id);

  ueTenantCountryBr =
    String(u.tenant?.locale?.countryCode || '')
      .trim()
      .toUpperCase() === 'BR';

  const fWt = document.getElementById('f-work-time');
  if (fWt) fWt.checked = !!u.workTimeTrackingEnabled;
  const wtInternalId = document.getElementById('ue-wt-internal-id');
  if (wtInternalId && u.id) {
    wtInternalId.textContent =
      'ID no servidor (mesmo que a sessão do app usa): ' + String(u.id);
  }

  const rClt = document.getElementById('wt-br-r-clt');
  const rPj = document.getElementById('wt-br-r-pj');
  const wtBrSeg = document.querySelector('#wt-br-regime-wrap .wt-br-regime-seg');
  if (rClt && rPj) {
    if (String(u.workTimeBrazilRegime || '').toUpperCase() === 'PJ') rPj.checked = true;
    else rClt.checked = true;
  }
  if (wtBrSeg && !wtBrSeg.dataset.ueWtBrBound) {
    wtBrSeg.dataset.ueWtBrBound = '1';
    wtBrSeg.addEventListener('change', (ev) => {
      ev.stopPropagation();
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || t.name !== 'f-wt-br-regime') return;
      if (isUserEditReadonly()) return;
      markDirty();
    });
  }
  if (fWt && !fWt.dataset.ueWtBrSync) {
    fWt.dataset.ueWtBrSync = '1';
    fWt.addEventListener('change', () => {
      updateWtBrRegimeRow();
      markDirty();
    });
  }
  updateWtBrRegimeRow();

  const wtHint = document.getElementById('wt-user-hint');
  const wtFace = document.getElementById('wt-face-status');
  const paintWorkTimeHints = (userRow, wtSet) => {
    if (!wtHint) return;
    if (!wtSet || wtSet.error) {
      wtHint.textContent = t('ue_wtPolicyLoadErr');
      return;
    }
    const parts = [];
    if (!wtSet.moduleEnabled) parts.push(t('ue_wtHintModuleOff'));
    const photos = Array.isArray(userRow.faceEnrollmentPhotos) ? userRow.faceEnrollmentPhotos : [];
    const cfOk = userRow.comprefaceRecognitionSync && String(userRow.comprefaceRecognitionSync.status) === 'synced';
    let faceMatriculaWarn = false;
    if (wtSet.requireFaceOnEveryPunch) {
      if (photos.length === 0) {
        parts.push(t('ue_wtHintFaceNoPhotos'));
        faceMatriculaWarn = true;
      } else if (!cfOk) {
        parts.push(t('ue_wtHintFaceMatchNotSynced'));
        faceMatriculaWarn = true;
      }
    }
    if (
      faceMatriculaWarn &&
      String(userRow.technicianProfile?.status || '').toUpperCase() === 'ACTIVE'
    ) {
      parts.push(t('ue_wtHintTechActive'));
    }
    wtHint.innerHTML =
      parts.length > 0
        ? `<strong>${esc(t('ue_wtHintAttentionPrefix'))}</strong> ${parts.map((p) => esc(p)).join('<br><br>')}`
        : `<strong>${esc(t('ue_wtHintPolicyPrefix'))}</strong> ${esc(t('ue_wtHintPolicyOk'))}`;
    if (wtFace) {
      const n = photos.length;
      const linePhotos = n ? t('ue_wtFacePhotosCount').replace(/\{n\}/g, String(n)) : t('ue_wtFaceNoPhotos');
      wtFace.innerHTML = `<span style="color:var(--text)">${esc(t('ue_wtFaceMatricula'))}</span> ${esc(linePhotos)}`;
    }
  };

  const wtSet = await CONFIG.get('/work-time/settings?tenantId=' + encodeURIComponent(u.tenantId)).catch(() => null);
  paintWorkTimeHints(u, wtSet);
  bumpUserRefFaceState = (partial) => {
    uRef = { ...uRef, ...partial };
    paintWorkTimeHints(uRef, wtSet);
    paintWorkspaceBar(uRef);
  };

  faceUserId = id;
  faceEnrollmentList = sortFaceEnrollmentForDisplay(parseJsonSafe(u.faceEnrollmentPhotos, []));
  if (!Array.isArray(faceEnrollmentList)) faceEnrollmentList = [];
  renderFaceGallery();
  paintWorkspaceBar(uRef);

  const faceIdentityHint = document.getElementById('face-identity-admin-hint');
  if (faceIdentityHint) {
    const tpActive = String(u.technicianProfile?.status || '').toUpperCase() === 'ACTIVE';
    if (tpActive) {
      faceIdentityHint.style.display = 'block';
      faceIdentityHint.textContent = t('ue_faceIdentityActive');
    } else {
      faceIdentityHint.style.display = 'none';
      faceIdentityHint.textContent = '';
    }
  }

  const reWrap = document.getElementById('ue-face-reenroll-wrap');
  const reStatus = document.getElementById('ue-face-reenroll-status');
  const reNoteTa = document.getElementById('ue-face-reenroll-note');
  const btnReOpen = document.getElementById('ue-face-reenroll-open');
  const btnReClear = document.getElementById('ue-face-reenroll-clear');
  const hoursSel = document.getElementById('ue-face-reenroll-hours');
  const paintFaceReenrollStatus = () => {
    if (!reWrap || !reStatus) return;
    const tp = uRef.technicianProfile;
    const active = String(tp?.status || '').toUpperCase() === 'ACTIVE';
    if (!active) {
      reWrap.hidden = true;
      return;
    }
    reWrap.hidden = false;
    const until = tp?.faceReenrollmentUntil;
    if (until && new Date(until).getTime() > Date.now()) {
      const loc = adminIntlLocale(getAdminUiLocale());
      reStatus.textContent = t('ue_faceReenrollStatusOpen').replace(
        '{date}',
        new Date(until).toLocaleString(loc || undefined),
      );
    } else {
      reStatus.textContent = t('ue_faceReenrollStatusClosed');
    }
  };
  paintFaceReenrollStatus();
  const setReReadonly = () => {
    const ro = isUserEditReadonly();
    if (btnReOpen) btnReOpen.disabled = ro;
    if (btnReClear) btnReClear.disabled = ro;
    if (hoursSel) hoursSel.disabled = ro;
    if (reNoteTa) reNoteTa.disabled = ro;
  };
  setReReadonly();
  if (btnReOpen) {
    btnReOpen.onclick = async () => {
      try {
        const hours = hoursSel ? parseInt(String(hoursSel.value || '72'), 10) || 72 : 72;
        const note = reNoteTa && String(reNoteTa.value || '').trim() ? String(reNoteTa.value).trim() : undefined;
        const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/face-reenrollment-window`, {
          hours,
          ...(note ? { note } : {}),
        });
        if (!res || res.error) {
          alert(res?.error || 'Falha ao abrir janela.');
          return;
        }
        if (uRef.technicianProfile) {
          uRef.technicianProfile.faceReenrollmentUntil = res.faceReenrollmentUntil;
          uRef.technicianProfile.faceReenrollmentNote = res.faceReenrollmentNote || null;
        }
        paintFaceReenrollStatus();
        alert(t('ue_faceReenrollOpenedOk'));
      } catch (e) {
        console.error(e);
        alert(String(e && e.message ? e.message : 'Erro'));
      }
    };
  }
  if (btnReClear) {
    btnReClear.onclick = async () => {
      try {
        const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/face-reenrollment-window`, { clear: true });
        if (!res || res.error) {
          alert(res?.error || 'Falha.');
          return;
        }
        if (uRef.technicianProfile) {
          uRef.technicianProfile.faceReenrollmentUntil = null;
          uRef.technicianProfile.faceReenrollmentNote = null;
        }
        if (reNoteTa) reNoteTa.value = '';
        paintFaceReenrollStatus();
        alert(t('ue_faceReenrollClearedOk'));
      } catch (e) {
        console.error(e);
        alert(String(e && e.message ? e.message : 'Erro'));
      }
    };
  }

  const btnFacePick = document.getElementById('btn-face-pick');
  const faceFileInput = document.getElementById('face-file-input');
  const faceUploadStatus = document.getElementById('face-upload-status');
  if (btnFacePick && faceFileInput) {
    btnFacePick.onclick = () => faceFileInput.click();
    faceFileInput.onchange = async (ev) => {
      const files = [...(ev.target.files || [])];
      ev.target.value = '';
      let prog = null;
      for (const file of files) {
        const mime = resolveFaceUploadMime(file);
        if (mime === 'image/heic' || mime === 'image/heif') {
          alert(t('ue_faceHeicAlert').replace(/\{file\}/g, file.name || ''));
          continue;
        }
        if (mime && !/^image\/(jpeg|png|webp)$/i.test(mime)) {
          alert(t('ue_faceFormatAlert').replace(/\{file\}/g, file.name || t('ue_faceFileFallback')));
          continue;
        }
        if (faceUploadStatus) faceUploadStatus.textContent = t('ue_faceUploadingFile').replace(/\{file\}/g, file.name || '');
        prog = document.getElementById('face-upload-progress');
        if (prog) {
          prog.hidden = false;
          prog.setAttribute('aria-busy', 'true');
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const comma = dataUrl.indexOf(',');
          const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
          const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/face-enrollment`, {
            fileBase64: b64,
            mimeType: mime || 'application/octet-stream',
          });
          if (res == null) break;
          if (res?.error) {
            alert(res.error);
            break;
          }
          if (Array.isArray(res.photos)) faceEnrollmentList = sortFaceEnrollmentForDisplay(res.photos);
          renderFaceGallery();
          if (bumpUserRefFaceState && res.comprefaceRecognitionSync != null) {
            bumpUserRefFaceState({
              faceEnrollmentPhotos: res.photos,
              comprefaceRecognitionSync: res.comprefaceRecognitionSync,
            });
          }
          if (res.comprefaceSync && res.comprefaceSync.ok === false && res.comprefaceSync.error) {
            alert(res.comprefaceSync.error);
          }
        } catch (e) {
          console.error('[face-enrollment]', e);
          alert(t('ue_faceUploadFail'));
          break;
        } finally {
          if (prog) {
            prog.hidden = true;
            prog.removeAttribute('aria-busy');
          }
        }
      }
      if (faceUploadStatus) faceUploadStatus.textContent = '';
    };
  }

  const addr = parseJsonSafe(u.addressJson, {});
  document.getElementById('a-line1').value = addr.line1 || '';
  document.getElementById('a-line2').value = addr.line2 || '';
  document.getElementById('a-district').value = addr.district || '';
  document.getElementById('a-city').value = addr.city || '';
  document.getElementById('a-state').value = addr.state || '';
  document.getElementById('a-postal').value = addr.postalCode || '';
  document.getElementById('a-country').value = addr.countryCode || 'BR';
  paintAddressFieldUi();
  const aCountry = document.getElementById('a-country');
  if (aCountry && !aCountry.dataset.ueHintBound) {
    aCountry.dataset.ueHintBound = '1';
    aCountry.addEventListener('input', () => {
      paintAddressFieldUi();
      markDirty();
    });
  }

  const tp = u.technicianProfile;
  hasTechnicianProfile = !!tp;
  syncTechPanelVisibility();
  const fr = document.getElementById('f-role');
  if (fr && !fr.dataset.ueRoleBound) {
    fr.dataset.ueRoleBound = '1';
    fr.addEventListener('change', () => {
      syncTechPanelVisibility();
      markDirty();
    });
  }
  if (tp) {
    document.getElementById('t-status').value = tp.status || 'PENDING';
    document.getElementById('t-cft').value = tp.cft || '';
    document.getElementById('t-specialty').value = tp.specialty || '';
    document.getElementById('t-score').value = String(tp.score ?? 5);
    let skills = parseJsonSafe(tp.skillsJson, []);
    if (typeof skills === 'string') {
      skills = String(skills)
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
    } else if (!Array.isArray(skills)) {
      skills = [];
    }
    renderSkillChips(skills);
    const tskIn = getSkillsAddInput();
    if (tskIn) tskIn.value = '';
    renderSchedule(tp.workScheduleJson, cachedLocations);
    const cov = parseJsonSafe(tp.serviceCoverageGeoJson, null);
    const homeBase = cov && typeof cov === 'object' ? cov.homeBase || null : null;
    document.getElementById('t-coverage-lat').value =
      homeBase && Number.isFinite(Number(homeBase.latitude)) ? String(homeBase.latitude) : '';
    document.getElementById('t-coverage-lng').value =
      homeBase && Number.isFinite(Number(homeBase.longitude)) ? String(homeBase.longitude) : '';
    document.getElementById('t-coverage-radius-km').value =
      cov && Number.isFinite(Number(cov.radiusKm)) ? String(cov.radiusKm) : '';
    document.getElementById('t-coverage-notes').value = cov?.notes ? String(cov.notes) : '';
    const svc = parseJsonSafe(tp.serviceLocationIds, []);
    syncCoverageHiddenSelect(Array.isArray(svc) ? svc : []);
    renderDocRows('tbody-docs-pro', parseJsonSafe(tp.professionalDocuments, []), cachedLocations, u.id);
  } else {
    renderSkillChips([]);
    const tskIn0 = getSkillsAddInput();
    if (tskIn0) tskIn0.value = '';
    renderSchedule({}, cachedLocations);
    document.getElementById('t-coverage-lat').value = '';
    document.getElementById('t-coverage-lng').value = '';
    document.getElementById('t-coverage-radius-km').value = '';
    document.getElementById('t-coverage-notes').value = '';
    syncCoverageHiddenSelect([]);
    renderDocRows('tbody-docs-pro', [], cachedLocations, u.id);
  }

  refreshCoverageUi({ fit: true });

  renderDocRows('tbody-docs-personal', parseJsonSafe(u.personalDocuments, []), cachedLocations, u.id);

  const schRoot = document.getElementById('schedule-rows');
  if (schRoot && !schRoot.dataset.ueDirty) {
    schRoot.dataset.ueDirty = '1';
    schRoot.addEventListener('change', markDirty);
    schRoot.addEventListener('click', (e) => {
      if (e.target.closest('.sch-add-slot, .sch-rm-slot')) markDirty();
    });
  }

  document.getElementById('btn-add-doc-p').onclick = () => {
    const tb = document.getElementById('tbody-docs-personal');
    const empty = tb.querySelector('.doc-empty');
    if (empty) empty.remove();
    const locOptsNew = getLocationMultiselectOptionsHtml(cachedLocations);
    tb.insertAdjacentHTML('beforeend', docRowHtml({ id: rid(), docType: 'CPF' }, locOptsNew, 'personal'));
    syncDocLocsMultiselectSelections(tb.lastElementChild);
    const tr = tb.querySelector('tr:last-child');
    tr.querySelector('.doc-del').onclick = (e) => {
      e.target.closest('tr')?.remove();
      markDirty();
    };
    tr.querySelector('.doc-type')?.addEventListener('change', markDirty);
    refreshDocValidityInTable('tbody-docs-personal');
    markDirty();
  };
  document.getElementById('btn-add-doc-pro').onclick = () => {
    const tb = document.getElementById('tbody-docs-pro');
    const empty = tb.querySelector('.doc-empty');
    if (empty) empty.remove();
    const locOptsNewP = getLocationMultiselectOptionsHtml(cachedLocations);
    tb.insertAdjacentHTML('beforeend', docRowHtml({ id: rid(), docType: 'ASO' }, locOptsNewP, 'professional'));
    syncDocLocsMultiselectSelections(tb.lastElementChild);
    const tr = tb.querySelector('tr:last-child');
    tr.querySelector('.doc-del').onclick = (e) => {
      e.target.closest('tr')?.remove();
      markDirty();
    };
    tr.querySelector('.doc-type')?.addEventListener('change', markDirty);
    refreshDocValidityInTable('tbody-docs-pro');
    markDirty();
  };

  ['f-name', 'f-email', 'f-phone', 'f-avatar', 'f-active', 'f-work-time', 'f-admin-notes', 'f-preferred-locale'].forEach(
    (fid) => {
      const el = document.getElementById(fid);
      if (!el || el.dataset.ueDirty) return;
      el.dataset.ueDirty = '1';
      el.addEventListener('change', markDirty);
      el.addEventListener('input', markDirty);
    }
  );
  document.querySelectorAll('#sec-endereco .form-control, #sec-tecnico .form-control, #sec-tecnico select').forEach((el) => {
    if (el.dataset.ueDirty) return;
    el.dataset.ueDirty = '1';
    el.addEventListener('change', markDirty);
    el.addEventListener('input', markDirty);
  });
  paintWorkspaceBar(uRef);

  let matriculaTimer = null;
  const fMatricula = document.getElementById('f-employee-matricula');
  const matHint = document.createElement('div');
  /** Não reutilizar `ue-matricula-hint` — já existe o parágrafo estático no HTML (id duplicado quebrava o DOM). */
  matHint.id = 'ue-matricula-live-status';
  matHint.style.cssText = 'font-size:11px;margin-top:6px;color:var(--text3)';
  if (fMatricula && !fMatricula.dataset.ueMat) {
    fMatricula.dataset.ueMat = '1';
    fMatricula.insertAdjacentElement('afterend', matHint);
    const checkMat = async () => {
      const raw = (fMatricula.value || '').trim();
      if (!raw) {
        matHint.textContent = '';
        return;
      }
      const res = await CONFIG.get(
        `/users?tenantId=${encodeURIComponent(u.tenantId)}&q=${encodeURIComponent(raw)}&limit=8`
      ).catch(() => null);
      const rows = Array.isArray(res?.data) ? res.data : [];
      const other = rows.find((x) => x.id !== id);
      matHint.style.color = other ? 'var(--red)' : 'var(--green)';
      matHint.textContent = other ? t('matriculaDup') : t('matriculaOk');
    };
    fMatricula.addEventListener('blur', () => {
      clearTimeout(matriculaTimer);
      matriculaTimer = setTimeout(checkMat, 200);
    });
    fMatricula.addEventListener('input', () => {
      matHint.textContent = '';
      markDirty();
    });
  }

  const locPanel = document.getElementById('ue-panel-locale');
  if (locPanel && !locPanel.dataset.ueBound) {
    locPanel.dataset.ueBound = '1';
    locPanel.addEventListener('change', () => {
      setAdminUiLocale(locPanel.value);
      window.location.reload();
    });
  }

  const moreBtn = document.getElementById('btn-more-actions');
  const moreDrop = document.getElementById('ue-more-dropdown');
  const closeMoreMenu = () => {
    const d = document.getElementById('ue-more-dropdown');
    if (d) d.hidden = true;
    const b = document.getElementById('btn-more-actions');
    if (b) b.setAttribute('aria-expanded', 'false');
  };
  if (moreBtn && moreDrop && !moreBtn.dataset.ueBound) {
    moreBtn.dataset.ueBound = '1';
    moreBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const open = moreDrop.hidden;
      moreDrop.hidden = !open;
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (!document.documentElement.dataset.ueUserEditMoreMenuCloser) {
      document.documentElement.dataset.ueUserEditMoreMenuCloser = '1';
      document.addEventListener('click', closeMoreMenu);
    }
  }

  document.getElementById('act-copy-link')?.addEventListener('click', () => {
    const ro = isUserEditReadonly() ? '&readonly=1' : '';
    const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(id)}${ro}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => alert(t('ue_copyLinkOk')))
      .catch(() => prompt(t('ue_copyLinkPrompt'), url));
    closeMoreMenu();
  });
  document.getElementById('act-export-json')?.addEventListener('click', () => {
    const snap = { exportedAt: new Date().toISOString(), userId: id, payload: buildUserPatchPayload() };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `user-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    closeMoreMenu();
  });
  document.getElementById('act-duplicate')?.addEventListener('click', () => {
    try {
      const draft = {
        tenantId: u.tenantId,
        role: document.getElementById('f-role').value,
        name: `${(document.getElementById('f-name').value || '').trim()}${t('ue_duplicateNameSuffix')}`,
        phone: document.getElementById('f-phone').value || '',
        preferredChatLocale: document.getElementById('f-preferred-locale')?.value || '',
      };
      sessionStorage.setItem(DUP_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
    window.location.href = 'users.html';
  });
  document.getElementById('act-role-matrix')?.addEventListener('click', () => {
    fillRoleMatrixModal();
    document.getElementById('role-matrix-modal')?.classList.add('open');
    closeMoreMenu();
  });
  document.querySelectorAll('[data-close-matrix]').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('role-matrix-modal')?.classList.remove('open'));
  });

  const btnAv = document.getElementById('btn-avatar-upload');
  const inpAv = document.getElementById('ue-avatar-file');
  const txtAv = document.getElementById('ue-avatar-upload-txt');
  if (btnAv && inpAv && !btnAv.dataset.ueBound) {
    btnAv.dataset.ueBound = '1';
    btnAv.addEventListener('click', () => {
      if (isUserEditReadonly()) return;
      inpAv.click();
    });
    inpAv.addEventListener('change', () => {
      const f = inpAv.files && inpAv.files[0];
      inpAv.value = '';
      if (!f || isUserEditReadonly()) return;
      const n = (f.name || '').toLowerCase();
      if (n.endsWith('.heic') || n.endsWith('.heif')) {
        alert(t('ue_avatarHeic'));
        return;
      }
      const prev = txtAv ? txtAv.textContent : '';
      if (txtAv) txtAv.textContent = t('ue_avatarUploading');
      btnAv.disabled = true;
      void (async () => {
        try {
          const b64 = await fileToBase64(f);
          const res = await CONFIG.post(`/users/${encodeURIComponent(id)}/avatar-attachment`, {
            fileBase64: b64,
            mimeType: f.type || 'application/octet-stream',
            fileName: f.name || 'upload',
          });
          const finp = document.getElementById('f-avatar');
          if (res?.url && finp) {
            finp.value = res.url;
            markDirty();
          } else {
            alert(res?.error || t('ue_avatarUploadErr'));
          }
        } catch {
          alert(t('ue_avatarUploadErr'));
        } finally {
          btnAv.disabled = false;
          if (txtAv) txtAv.textContent = prev || t('ue_avatarUploadBtn');
        }
      })();
    });
  }

  const navRaw = sessionStorage.getItem(NAV_CTX_KEY);
  let navCtx = null;
  try {
    navCtx = navRaw ? JSON.parse(navRaw) : null;
  } catch {
    navCtx = null;
  }
  if (navCtx && Array.isArray(navCtx.ids) && navCtx.ids.length) {
    const idx = navCtx.ids.indexOf(id);
    const wrap = document.getElementById('ue-nav-arrows');
    const prev = document.getElementById('ue-prev-user');
    const next = document.getElementById('ue-next-user');
    if (wrap && prev && next && idx >= 0) {
      wrap.hidden = false;
      prev.title = t('prevUser');
      next.title = t('nextUser');
      const roQS = isUserEditReadonly() ? '&readonly=1' : '';
      if (idx > 0) prev.href = `user-edit.html?id=${encodeURIComponent(navCtx.ids[idx - 1])}${roQS}`;
      else prev.href = '#';
      prev.style.opacity = idx > 0 ? '1' : '0.35';
      prev.onclick = (e) => {
        if (idx <= 0) e.preventDefault();
      };
      if (idx < navCtx.ids.length - 1) next.href = `user-edit.html?id=${encodeURIComponent(navCtx.ids[idx + 1])}${roQS}`;
      else next.href = '#';
      next.style.opacity = idx < navCtx.ids.length - 1 ? '1' : '0.35';
      next.onclick = (e) => {
        if (idx >= navCtx.ids.length - 1) e.preventDefault();
      };
    }
  }

  applyUserEditSensitiveFieldRbac(u);
  initialPayloadJson = JSON.stringify(buildUserPatchPayload());
  refreshDirty();
  applyUserEditReadonlyIfNeeded();

  if (!window.__brsparkUeEditBeforeUnload) {
    window.__brsparkUeEditBeforeUnload = true;
    window.addEventListener('beforeunload', (e) => {
      if (isUserEditReadonly()) return;
      try {
        const cur = JSON.stringify(buildUserPatchPayload());
        const dirty = cur !== initialPayloadJson;
        if (dirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      } catch {
        /* ignore */
      }
    });
  }

  document.getElementById('btn-discard').onclick = () => {
    if (!confirm(t('ue_discardConfirm'))) return;
    window.location.reload();
  };

  async function doSave(stay) {
    if (isUserEditReadonly()) return;
    if (isManagerPanelSession() && String(uRef.role || '').toUpperCase() === 'SAAS_ADMIN') {
      alert(t('ue_rbacCannotEditSaasUser'));
      return;
    }
    const body = buildUserPatchPayload();
    if (!body.name || !body.email) {
      alert(t('ue_saveNeedNameEmail'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      alert(t('ue_saveEmailInvalid'));
      return;
    }
    const newRole = body.role;
    if (needsElevateConfirm(baselineOriginalRole, newRole)) {
      const ok = await openElevateConfirmModal(humanLoginEmailDisplay(uRef));
      if (!ok) return;
    }
    const res = await CONFIG.patch('/users/' + encodeURIComponent(id), body);
    if (res?.error) {
      alert(res.error);
      return;
    }
    baselineOriginalRole = normalizeRoleForForm(res.role);
    uRef = res;
    syncUserEditEmailBaselines(res);
    const feEmail = document.getElementById('f-email');
    if (feEmail) feEmail.value = ueBaselineDisplayEmail;
    if (fAdminNotes) fAdminNotes.value = res.adminInternalNotes != null ? String(res.adminInternalNotes) : '';
    if (fPrefLoc) fPrefLoc.value = res.preferredChatLocale || '';
    paintSummaryBar(res);
    paintWorkspaceBar(res);
    paintEmailVerificationUx(res);
    paintWorkTimeHints(res, wtSet);
    void loadUserAudit(id);
    initialPayloadJson = JSON.stringify(buildUserPatchPayload());
    refreshDirty();
    if (stay) {
      alert(t('ue_saveOk'));
    } else {
      window.location.href = 'users.html?resume=1';
    }
  }

  document.getElementById('btn-save').onclick = () => doSave(false);
  document.getElementById('btn-save-stay').onclick = () => doSave(true);
}
