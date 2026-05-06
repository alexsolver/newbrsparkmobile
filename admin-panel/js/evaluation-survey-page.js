import { esvT, applySurveyStaticI18n } from './evaluation-survey-i18n.js';
import { ensureAdminApiDetected, resolveApiBase } from './config.js';

applySurveyStaticI18n();

/** Base da API (ex.: http://127.0.0.1:3001/api) */
let apiBase = '';
const urlParams = new URLSearchParams(window.location.search);
const state = {
  form: null,
  answers: {},
  previewMode: false,
  token: null,
};

function showErr(msg) {
  const e = document.getElementById('err');
  e.style.display = msg ? 'block' : 'none';
  e.textContent = msg || '';
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

function applyBranding(data) {
  const logoWrap = document.getElementById('survey-logo-wrap');
  const preEl = document.getElementById('survey-pre');
  const brand = document.getElementById('survey-brand');
  if (logoWrap) {
    logoWrap.innerHTML = '';
    logoWrap.style.display = 'none';
    const u = data.surveyLogoUrl && String(data.surveyLogoUrl).trim();
    if (u && isHttpUrl(u)) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener(
        'error',
        () => {
          logoWrap.style.display = 'none';
        },
        { once: true },
      );
      img.addEventListener(
        'load',
        () => {
          logoWrap.style.display = 'block';
        },
        { once: true },
      );
      img.src = u;
      logoWrap.appendChild(img);
      logoWrap.style.display = 'block';
    }
  }
  if (preEl) {
    const pre = data.surveyMessagePre != null ? String(data.surveyMessagePre) : '';
    if (pre.trim()) {
      preEl.textContent = pre;
      preEl.style.display = 'block';
    } else {
      preEl.textContent = '';
      preEl.style.display = 'none';
    }
  }
  if (brand) {
    const showPre = preEl && preEl.style.display === 'block';
    const showLogo = logoWrap && logoWrap.innerHTML !== '';
    brand.style.display = showPre || showLogo ? 'block' : 'none';
  }
}

function renderQuestion(q) {
  const id = q.id;
  const wrap = document.createElement('div');
  wrap.className = 'card';
  const lab = document.createElement('label');
  lab.className = 'q';
  lab.textContent = (q.required ? '* ' : '') + q.text;
  wrap.appendChild(lab);

  if (q.type === 'RATING') {
    const row = document.createElement('div');
    row.className = 'stars';
    for (let v = 1; v <= 5; v++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(v);
      b.addEventListener('click', () => {
        state.answers[id] = { value: v };
        row.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i + 1 === v));
      });
      row.appendChild(b);
    }
    wrap.appendChild(row);
  } else if (q.type === 'NPS') {
    const row = document.createElement('div');
    row.className = 'nps';
    for (let v = 0; v <= 10; v++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(v);
      b.addEventListener('click', () => {
        state.answers[id] = { value: v };
        row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.textContent) === v));
      });
      row.appendChild(b);
    }
    wrap.appendChild(row);
  } else if (q.type === 'BOOLEAN') {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    [
      [esvT('esv_yes'), true],
      [esvT('esv_no'), false],
    ].forEach(([label, val]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.width = 'auto';
      b.style.padding = '0 16px';
      b.style.height = '44px';
      b.style.borderRadius = '12px';
      b.style.border = '2px solid var(--border)';
      b.style.background = 'var(--card)';
      b.style.fontWeight = '800';
      b.style.cursor = 'pointer';
      b.addEventListener('click', () => {
        state.answers[id] = { value: val };
        row.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
  } else if (q.type === 'TEXT') {
    const ta = document.createElement('textarea');
    ta.placeholder = esvT('esv_ph_text');
    ta.addEventListener('input', () => {
      state.answers[id] = { text: ta.value };
    });
    wrap.appendChild(ta);
  } else {
    const ta = document.createElement('textarea');
    ta.placeholder = esvT('esv_ph_other');
    ta.addEventListener('input', () => {
      state.answers[id] = { text: ta.value };
    });
    wrap.appendChild(ta);
  }
  return wrap;
}

function renderSurveyUi(data) {
  state.form = data;
  state.answers = {};
  const sub = document.getElementById('sub');
  if (sub) {
    sub.textContent =
      (data.templateName || '') + (data.osNumber ? esvT('esv_os_prefix') + data.osNumber : '');
    sub.style.display = 'block';
  }
  const root = document.getElementById('form-root');
  root.innerHTML = '';
  (data.questions || []).forEach((q) => root.appendChild(renderQuestion(q)));
  const comment = document.createElement('div');
  comment.className = 'card';
  const cl = document.createElement('label');
  cl.className = 'q';
  cl.textContent = esvT('esv_comment_lbl');
  comment.appendChild(cl);
  const ta = document.createElement('textarea');
  ta.id = 'comment';
  ta.placeholder = esvT('esv_comment_ph');
  if (state.previewMode) {
    ta.disabled = true;
    ta.placeholder = '';
  }
  comment.appendChild(ta);
  root.appendChild(comment);
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = state.previewMode ? esvT('esv_preview_btn') : esvT('esv_submit');
  btn.disabled = !!state.previewMode;
  btn.addEventListener('click', () => submit(ta.value));
  root.appendChild(btn);

  applyBranding(data);

  const banner = document.getElementById('survey-preview-banner');
  if (banner) {
    banner.style.display = state.previewMode ? 'block' : 'none';
    banner.textContent = state.previewMode ? esvT('esv_preview_banner') : '';
  }
}

async function load() {
  const previewTemplateId = urlParams.get('previewTemplate');
  state.token = urlParams.get('token');

  if (previewTemplateId) {
    state.previewMode = true;
    const jwt =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('aria_admin_token') : '';
    if (!jwt) {
      document.getElementById('sub').textContent = '';
      showErr(esvT('esv_preview_need_login'));
      return;
    }
    try {
      const res = await fetch(
        `${apiBase}/admin/evaluations/templates/${encodeURIComponent(previewTemplateId)}/preview-form`,
        { headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || esvT('esv_err_load'));
      const title = document.getElementById('title');
      if (title) {
        title.textContent = `${esvT('esv_title')} ${esvT('esv_preview_badge')}`;
      }
      renderSurveyUi(data);
    } catch (e) {
      document.getElementById('sub').textContent = '';
      showErr(e.message || esvT('esv_fail_load'));
    }
    return;
  }

  if (!state.token) {
    document.getElementById('sub').textContent = esvT('esv_invalid_link');
    return;
  }
  try {
    const res = await fetch(
      `${apiBase}/evaluations/public/form?token=${encodeURIComponent(state.token)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || esvT('esv_err_load'));
    renderSurveyUi(data);
  } catch (e) {
    document.getElementById('sub').textContent = '';
    showErr(e.message || esvT('esv_fail_load'));
  }
}

async function submit(comment) {
  if (state.previewMode) return;
  showErr('');
  const qs = state.form.questions || [];
  for (const q of qs) {
    if (!q.required) continue;
    if (state.answers[q.id] == null || state.answers[q.id] === '') {
      showErr(esvT('esv_required'));
      return;
    }
  }
  const btn = document.querySelector('#form-root .btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${apiBase}/evaluations/public/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: state.token,
        answers: state.answers,
        comment: comment || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || esvT('esv_err_submit'));
    document.getElementById('form-root').style.display = 'none';
    document.getElementById('sub').style.display = 'none';
    const title = document.getElementById('title');
    if (title) title.style.display = 'none';
    const brand = document.getElementById('survey-brand');
    if (brand) brand.style.display = 'none';
    const banner = document.getElementById('survey-preview-banner');
    if (banner) banner.style.display = 'none';
    const done = document.getElementById('done');
    const thanks =
      state.form && state.form.surveyMessagePost && String(state.form.surveyMessagePost).trim()
        ? String(state.form.surveyMessagePost).trim()
        : esvT('esv_thanks');
    done.textContent = thanks;
    done.style.display = 'block';
  } catch (e) {
    showErr(e.message || esvT('esv_err_submit'));
    if (btn) btn.disabled = false;
  }
}

async function boot() {
  try {
    await ensureAdminApiDetected();
  } catch {
    /* continua */
  }
  apiBase = resolveApiBase();
  await load();
}

void boot();
