/**
 * Ligações do markup estático de checklists.html sem onclick/onkeyup inline (CSP).
 * Chamar após checklists-builder.js (funções em window.*).
 */

function bindModalBackdrop(id, handler) {
  const el = document.getElementById(id);
  if (!el || el.dataset.fbBackdropBound === '1') return;
  el.dataset.fbBackdropBound = '1';
  el.addEventListener('click', (e) => {
    if (e.target === el) void handler();
  });
}

function hideIconPickerModal() {
  const m = document.getElementById('icon-picker-modal');
  if (m) m.style.display = 'none';
}

function dispatchFbCmd(cmd, ev, argRaw) {
  const w = typeof window !== 'undefined' ? window : {};
  switch (cmd) {
    case 'openTemplateFormIconPicker':
      if (typeof w.openTemplateFormIconPicker === 'function') w.openTemplateFormIconPicker(ev);
      return;
    case 'setMobilePreviewFillSim':
      if (typeof w.setMobilePreviewFillSim === 'function') w.setMobilePreviewFillSim(argRaw || 'full');
      return;
    case 'confirmIconSelectionEmpty':
      if (typeof w.confirmIconSelection === 'function') w.confirmIconSelection('');
      return;
    case 'ariaCopilotCloseSchemaPreview':
      if (typeof w.ariaCopilotCloseSchemaPreview === 'function') {
        w.ariaCopilotCloseSchemaPreview(argRaw === 'true');
      }
      return;
    case 'hideIconPickerModal':
      hideIconPickerModal();
      return;
    case 'ariaCopilotPickExcelFile':
      if (typeof w.ariaCopilotPickExcelFile === 'function') void w.ariaCopilotPickExcelFile();
      return;
    case 'ariaCopilotReprocessSchemaPreview':
      if (typeof w.ariaCopilotReprocessSchemaPreview === 'function') void w.ariaCopilotReprocessSchemaPreview();
      return;
    default: {
      const fn = w[cmd];
      if (typeof fn === 'function') void fn();
    }
  }
}

export function initFbMarkupDelegation() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.fbMarkupDeleg === '1') return;
  document.documentElement.dataset.fbMarkupDeleg = '1';

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const host = t.closest('[data-fb-cmd]');
    if (!host) return;
    const cmd = host.getAttribute('data-fb-cmd');
    if (!cmd) return;
    const arg = host.getAttribute('data-fb-arg');
    dispatchFbCmd(cmd, e, arg);
  });

  bindModalBackdrop('mobile-preview-overlay', () => {
    if (typeof window.toggleMobilePreview === 'function') window.toggleMobilePreview();
  });
  bindModalBackdrop('forms-list-modal', () => {
    if (typeof window.closeFormsBrowser === 'function') window.closeFormsBrowser();
  });
  bindModalBackdrop('new-folder-modal', () => {
    if (typeof window.cancelNewFolderModal === 'function') window.cancelNewFolderModal();
  });
  bindModalBackdrop('global-geofence-modal', () => {
    if (typeof window.closeGlobalGeofenceModal === 'function') window.closeGlobalGeofenceModal();
  });
  bindModalBackdrop('expected-form-duration-modal', () => {
    if (typeof window.closeExpectedFormDurationModal === 'function') window.closeExpectedFormDurationModal();
  });
  bindModalBackdrop('fb-app-layout-modal', () => {
    if (typeof window.closeAppLayoutModal === 'function') window.closeAppLayoutModal();
  });
  bindModalBackdrop('section-step-edit-modal', () => {
    if (typeof window.closeSectionStepEditModal === 'function') window.closeSectionStepEditModal();
  });
  bindModalBackdrop('copilot-schema-preview-modal', () => {
    if (typeof window.ariaCopilotCloseSchemaPreview === 'function') {
      window.ariaCopilotCloseSchemaPreview(false);
    }
  });
  bindModalBackdrop('template-history-modal', () => {
    if (typeof window.closeChecklistVersionHistory === 'function') window.closeChecklistVersionHistory();
  });

  document.getElementById('fb-form-active')?.addEventListener('change', (e) => {
    const el = e.target;
    const on = el instanceof HTMLInputElement ? el.checked : false;
    window.onFbFormActiveToggle?.(on);
  });
  document.getElementById('form-search')?.addEventListener('keyup', () => {
    window.filterFormsList?.();
  });
  document.getElementById('forms-filter-hide-archived')?.addEventListener('change', () => {
    window.onFormsFilterArchivedChange?.();
  });
  document.getElementById('section-step-edit-title')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.applySectionStepEditModal?.();
    }
  });
  document.getElementById('icon-search')?.addEventListener('keyup', (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement) window.filterIcons?.(el.value);
  });
  document.getElementById('icon-lib-select')?.addEventListener('change', () => {
    window.switchIconLibrary?.();
  });
  document.getElementById('icon-color')?.addEventListener('change', () => {
    window.updateIconGridColors?.();
  });
  document.getElementById('ai-copilot-input')?.addEventListener('keydown', (e) => {
    window.ariaCopilotInputKeydown?.(e);
  });
  document.getElementById('copilot-excel-file')?.addEventListener('change', (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement) void window.ariaCopilotAnalyzeExcelFile?.(el);
  });
}
