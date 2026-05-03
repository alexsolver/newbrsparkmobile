/**
 * Imagens geradas por HTML: fallback sem `onerror` inline (CSP).
 * Usar `data-ops-img-err` + `opsBindImgErrorHandlers(root)` após `innerHTML`,
 * ou `initOpsImgErrorObserver()` uma vez na página.
 */

function escAttrFull(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {string} fallbackUrl */
export function opsImgErrFallbackAttrs(fallbackUrl) {
  return ` data-ops-img-err="fallback" data-ops-img-fallback-src="${escAttrFull(fallbackUrl)}"`;
}

const U_300 = 'https://placehold.co/400x300?text=Foto';
const U_220 = 'https://placehold.co/400x220/f1f5f9/64748b?text=Foto+indispon%C3%ADvel';
const U_320_160 = 'https://placehold.co/320x160/f1f5f9/64748b?text=Foto+indispon%C3%ADvel';
const U_560_320 = 'https://placehold.co/560x320/f1f5f9/64748b?text=Foto+indispon%C3%ADvel';

export const OPS_IMG_ATTR_FB_300 = opsImgErrFallbackAttrs(U_300);
export const OPS_IMG_ATTR_FB_220 = opsImgErrFallbackAttrs(U_220);
export const OPS_IMG_ATTR_FB_320_160 = opsImgErrFallbackAttrs(U_320_160);
export const OPS_IMG_ATTR_FB_560_320 = opsImgErrFallbackAttrs(U_560_320);
export const OPS_IMG_ATTR_HIDE = ' data-ops-img-err="hide"';
export const OPS_IMG_ATTR_REVEAL_NEXT = ' data-ops-img-err="reveal-next"';

export function opsImgAttrAvatar(letter) {
  const L = String(letter == null ? '?' : letter).slice(0, 1);
  return ` data-ops-img-err="avatar" data-ops-img-avatar-letter="${escAttrFull(L)}"`;
}

export function opsBindImgErrorHandlers(root) {
  if (!root) return;
  const bindOne = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.opsImgErrBound === '1') return;
    if (!img.hasAttribute('data-ops-img-err')) return;
    img.dataset.opsImgErrBound = '1';
    img.addEventListener(
      'error',
      () => {
        const mode = img.getAttribute('data-ops-img-err');
        if (mode === 'fallback') {
          const fb = img.getAttribute('data-ops-img-fallback-src');
          img.removeAttribute('data-ops-img-fallback-src');
          img.removeAttribute('data-ops-img-err');
          img.removeAttribute('data-ops-img-err-bound');
          if (fb) img.src = fb;
          return;
        }
        if (mode === 'hide') {
          img.removeAttribute('data-ops-img-err');
          img.removeAttribute('data-ops-img-err-bound');
          img.style.display = 'none';
          return;
        }
        if (mode === 'reveal-next') {
          img.removeAttribute('data-ops-img-err');
          img.removeAttribute('data-ops-img-err-bound');
          img.style.display = 'none';
          const nxt = img.nextElementSibling;
          if (nxt instanceof HTMLElement) nxt.style.display = 'block';
          return;
        }
        if (mode === 'avatar') {
          const letter = img.getAttribute('data-ops-img-avatar-letter') || '?';
          img.removeAttribute('data-ops-img-err');
          img.removeAttribute('data-ops-img-avatar-letter');
          img.removeAttribute('data-ops-img-err-bound');
          img.style.display = 'none';
          const parent = img.parentElement;
          if (parent) {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:14px;font-weight:900;';
            span.textContent = letter;
            parent.replaceChildren(span);
          }
        }
      },
      { once: true },
    );
  };
  if (root instanceof HTMLImageElement && root.hasAttribute('data-ops-img-err')) bindOne(root);
  if (root.querySelectorAll) root.querySelectorAll('img[data-ops-img-err]').forEach(bindOne);
}

export function initOpsImgErrorObserver() {
  if (typeof document === 'undefined' || !document.body) return;
  if (document.body.dataset.opsImgErrMo === '1') return;
  document.body.dataset.opsImgErrMo = '1';
  const mo = new MutationObserver((records) => {
    for (const rec of records) {
      for (const n of rec.addedNodes) {
        if (n.nodeType === 1) opsBindImgErrorHandlers(n);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
