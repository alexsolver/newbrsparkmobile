/**
 * Modal guiado: onboarding de prestador por tenant.
 * Grava em Tenant.features.providerAffiliationOnboarding / providerOnboardingDidit.
 *
 * Campos integrados: alinhar chaves com admin-panel/backend/src/lib/providerAffiliationRegistrationSnapshot.js
 */
const PROFILE_KEYS = ['name', 'email', 'phone', 'avatarUrl'];

const INTEGRATED_FIELD_DEFS = [
  { key: 'address', group: 'user' },
  { key: 'personalDocuments', group: 'user' },
  { key: 'professionalDocuments', group: 'technician' },
  { key: 'cft', group: 'technician' },
  { key: 'specialty', group: 'technician' },
  { key: 'skills', group: 'technician' },
  { key: 'workSchedule', group: 'technician' },
  { key: 'serviceCoverage', group: 'technician' },
  { key: 'serviceLocations', group: 'technician' },
];

let preservedCustomFields = [];

export function createTenantProviderOnboardModal(deps) {
  const { CONFIG, mpT, escHtml, openModal, closeModal } = deps;

  const t = (k) => mpT(k);

  const root = document.getElementById('tenant-onboard-ui-root');
  const errEl = document.getElementById('tenant-onboard-inline-error');
  const hidTenant = document.getElementById('tenant-onboard-tenant-id');

  function showErr(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function buildStaticForm() {
    if (!root || root.dataset.built === '1') return;
    root.dataset.built = '1';
    root.innerHTML = '';

    const intro = el('p', 'text-muted', escHtml(t('ten_ob_intro')));
    intro.style.cssText = 'font-size:13px;line-height:1.45;margin-bottom:14px';
    root.appendChild(intro);

    const secProfile = el('div', 'form-group');
    secProfile.appendChild(el('div', 'form-label', escHtml(t('ten_ob_section_profile'))));
    const gridPf = el('div', '');
    gridPf.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
    PROFILE_KEYS.forEach((k) => {
      const lab = el('label', '', `<input type="checkbox" data-ob-pf="${escHtml(k)}" style="margin-right:6px"/><span>${escHtml(t('ten_ob_pf_' + k))}</span>`);
      lab.style.cssText = 'font-size:13px;align-items:center;display:flex';
      gridPf.appendChild(lab);
    });
    secProfile.appendChild(gridPf);
    root.appendChild(secProfile);

    const secInt = el('div', 'form-group');
    secInt.appendChild(el('div', 'form-label', escHtml(t('ten_ob_section_integrated'))));
    const hintInt = el('p', 'text-muted', escHtml(t('ten_ob_integrated_hint')));
    hintInt.style.cssText = 'font-size:11px;line-height:1.4;margin-bottom:10px';
    secInt.appendChild(hintInt);

    const subUser = el('div', 'form-label', escHtml(t('ten_ob_section_integrated_user')));
    subUser.style.cssText = 'font-size:12px;font-weight:600;margin:8px 0 6px;color:var(--text2)';
    secInt.appendChild(subUser);
    const gridUser = el('div', '');
    gridUser.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
    INTEGRATED_FIELD_DEFS.filter((d) => d.group === 'user').forEach((d) => {
      const lab = el(
        'label',
        '',
        `<input type="checkbox" data-ob-int="${escHtml(d.key)}" style="margin-right:6px"/><span>${escHtml(t('ten_ob_int_' + d.key))}</span>`,
      );
      lab.style.cssText = 'font-size:13px;align-items:flex-start;display:flex';
      gridUser.appendChild(lab);
    });
    secInt.appendChild(gridUser);

    const subTech = el('div', 'form-label', escHtml(t('ten_ob_section_integrated_tech')));
    subTech.style.cssText = 'font-size:12px;font-weight:600;margin:12px 0 6px;color:var(--text2)';
    secInt.appendChild(subTech);
    const gridTech = el('div', '');
    gridTech.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
    INTEGRATED_FIELD_DEFS.filter((d) => d.group === 'technician').forEach((d) => {
      const lab = el(
        'label',
        '',
        `<input type="checkbox" data-ob-int="${escHtml(d.key)}" style="margin-right:6px"/><span>${escHtml(t('ten_ob_int_' + d.key))}</span>`,
      );
      lab.style.cssText = 'font-size:13px;align-items:flex-start;display:flex';
      gridTech.appendChild(lab);
    });
    secInt.appendChild(gridTech);
    root.appendChild(secInt);

    const secFace = el('div', 'form-group');
    secFace.appendChild(el('div', 'form-label', escHtml(t('ten_ob_section_verify'))));
    const skip = el('label', '', `<input type="checkbox" id="ob-skip-face" style="margin-right:8px"/><span>${escHtml(t('ten_ob_skip_face'))}</span>`);
    skip.style.fontSize = '13px';
    secFace.appendChild(skip);
    const hintFace = el('p', 'text-muted', escHtml(t('ten_ob_skip_face_hint')));
    hintFace.style.cssText = 'font-size:11px;margin-top:6px;line-height:1.35';
    secFace.appendChild(hintFace);
    root.appendChild(secFace);

    const secDidit = el('div', 'form-group');
    secDidit.appendChild(el('div', 'form-label', escHtml(t('ten_ob_section_didit'))));
    const rowD = el('div', '');
    rowD.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center';
    rowD.innerHTML = `<label style="font-size:13px;display:flex;align-items:center;gap:8px"><input type="checkbox" id="ob-didit-en"/>${escHtml(t('ten_ob_didit_enable'))}</label>`;
    secDidit.appendChild(rowD);
    const wf = el('input', 'form-control');
    wf.id = 'ob-didit-wf';
    wf.placeholder = t('ten_ob_didit_workflow_ph');
    wf.style.maxWidth = '420px';
    secDidit.appendChild(wf);
    const hintD = el('p', 'text-muted', escHtml(t('ten_ob_didit_hint')));
    hintD.style.cssText = 'font-size:11px;margin-top:6px;line-height:1.35';
    secDidit.appendChild(hintD);
    root.appendChild(secDidit);
  }

  function readIncludeIntegratedRegistrationFields() {
    const out = [];
    if (!root) return out;
    root.querySelectorAll('input[data-ob-int]').forEach((cb) => {
      if (cb.checked) {
        const k = cb.getAttribute('data-ob-int');
        if (k) out.push(k);
      }
    });
    return out;
  }

  function readIncludeProfileFields() {
    const out = [];
    PROFILE_KEYS.forEach((k) => {
      const cb = root.querySelector(`[data-ob-pf="${k}"]`);
      if (cb && cb.checked) out.push(k);
    });
    return out;
  }

  function fillForm(data) {
    const paff = data.providerAffiliationOnboarding || {};
    const didit = data.providerOnboardingDidit || {};
    preservedCustomFields = Array.isArray(paff.customFields) ? [...paff.customFields] : [];
    const oldLeg = document.getElementById('ob-legacy-custom-notice');
    if (oldLeg) oldLeg.remove();
    if (preservedCustomFields.length && root) {
      const leg = el('p', 'text-muted', escHtml(t('ten_ob_legacy_custom_notice')));
      leg.id = 'ob-legacy-custom-notice';
      leg.style.cssText = 'font-size:11px;margin-top:14px;line-height:1.35';
      root.appendChild(leg);
    }
    PROFILE_KEYS.forEach((k) => {
      const cb = root.querySelector(`[data-ob-pf="${k}"]`);
      if (cb) cb.checked = Array.isArray(paff.includeProfileFields) && paff.includeProfileFields.includes(k);
    });
    const intKeys = new Set(
      Array.isArray(paff.includeIntegratedRegistrationFields) ? paff.includeIntegratedRegistrationFields : [],
    );
    INTEGRATED_FIELD_DEFS.forEach((d) => {
      const cb = root.querySelector(`input[data-ob-int="${d.key}"]`);
      if (cb) cb.checked = intKeys.has(d.key);
    });
    const skip = document.getElementById('ob-skip-face');
    if (skip) skip.checked = !!paff.skipFaceVerificationOnSubmit;
    const en = document.getElementById('ob-didit-en');
    if (en) en.checked = !!didit.enabled;
    const wf = document.getElementById('ob-didit-wf');
    if (wf) wf.value = didit.workflowId != null ? String(didit.workflowId) : '';
  }

  async function open(tenantId) {
    buildStaticForm();
    showErr('');
    if (hidTenant) hidTenant.value = tenantId;
    openModal('tenant-onboard-modal');
    try {
      const data = await CONFIG.get(`/tenants/${encodeURIComponent(tenantId)}/provider-affiliation-onboarding-config`);
      if (!data || data.error) {
        showErr(data?.error || t('ten_onboard_err_load'));
        return;
      }
      fillForm(data);
    } catch (e) {
      showErr(e instanceof Error ? e.message : t('ten_onboard_err_load'));
    }
  }

  async function save() {
    const tenantId = hidTenant?.value;
    if (!tenantId || !root) return;
    showErr('');
    const providerAffiliationOnboarding = {
      includeProfileFields: readIncludeProfileFields(),
      includeIntegratedRegistrationFields: readIncludeIntegratedRegistrationFields(),
      skipFaceVerificationOnSubmit: !!document.getElementById('ob-skip-face')?.checked,
      customFields: preservedCustomFields,
    };
    const providerOnboardingDidit = {
      enabled: !!document.getElementById('ob-didit-en')?.checked,
      workflowId: String(document.getElementById('ob-didit-wf')?.value || '').trim() || undefined,
    };
    if (!providerOnboardingDidit.enabled) delete providerOnboardingDidit.workflowId;
    const out = await CONFIG.patch(
      `/tenants/${encodeURIComponent(tenantId)}/provider-affiliation-onboarding-config`,
      { providerAffiliationOnboarding, providerOnboardingDidit },
    );
    if (!out || out.error) {
      showErr(out?.error || t('ten_onboard_save_fail'));
      return;
    }
    window.alert(t('ten_onboard_saved'));
    closeModal('tenant-onboard-modal');
  }

  return { open, save, buildStaticForm };
}
