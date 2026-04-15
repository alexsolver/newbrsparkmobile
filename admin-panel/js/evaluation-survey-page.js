import { esvT, applySurveyStaticI18n } from './evaluation-survey-i18n.js';

applySurveyStaticI18n();

const API = window.location.origin + '/api';
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const state = { form: null, answers: {} };

function showErr(msg) {
  const e = document.getElementById('err');
  e.style.display = msg ? 'block' : 'none';
  e.textContent = msg || '';
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
      b.onclick = () => {
        state.answers[id] = { value: v };
        row.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i + 1 === v));
      };
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
      b.onclick = () => {
        state.answers[id] = { value: v };
        row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.textContent) === v));
      };
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
      b.onclick = () => {
        state.answers[id] = { value: val };
        row.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      };
      row.appendChild(b);
    });
    wrap.appendChild(row);
  } else if (q.type === 'TEXT') {
    const ta = document.createElement('textarea');
    ta.placeholder = esvT('esv_ph_text');
    ta.oninput = () => {
      state.answers[id] = { text: ta.value };
    };
    wrap.appendChild(ta);
  } else {
    const ta = document.createElement('textarea');
    ta.placeholder = esvT('esv_ph_other');
    ta.oninput = () => {
      state.answers[id] = { text: ta.value };
    };
    wrap.appendChild(ta);
  }
  return wrap;
}

async function load() {
  if (!token) {
    document.getElementById('sub').textContent = esvT('esv_invalid_link');
    return;
  }
  try {
    const res = await fetch(API + '/evaluations/public/form?token=' + encodeURIComponent(token));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || esvT('esv_err_load'));
    state.form = data;
    document.getElementById('sub').textContent =
      (data.templateName || '') + (data.osNumber ? esvT('esv_os_prefix') + data.osNumber : '');
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
    comment.appendChild(ta);
    root.appendChild(comment);
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = esvT('esv_submit');
    btn.onclick = () => submit(ta.value);
    root.appendChild(btn);
  } catch (e) {
    document.getElementById('sub').textContent = '';
    showErr(e.message || esvT('esv_fail_load'));
  }
}

async function submit(comment) {
  showErr('');
  const qs = state.form.questions || [];
  for (const q of qs) {
    if (!q.required) continue;
    if (state.answers[q.id] == null || state.answers[q.id] === '') {
      showErr(esvT('esv_required'));
      return;
    }
  }
  const btn = document.querySelector('.btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(API + '/evaluations/public/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, answers: state.answers, comment: comment || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || esvT('esv_err_submit'));
    document.getElementById('form-root').style.display = 'none';
    document.getElementById('sub').style.display = 'none';
    document.getElementById('title').style.display = 'none';
    document.getElementById('done').style.display = 'block';
  } catch (e) {
    showErr(e.message || esvT('esv_err_submit'));
    if (btn) btn.disabled = false;
  }
}

void load();
