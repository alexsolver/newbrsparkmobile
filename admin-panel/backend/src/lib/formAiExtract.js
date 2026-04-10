'use strict';

const ExcelJS = require('exceljs');

const MAX_CANONICAL_CHARS = 120_000;
const MAX_ROWS_PER_SHEET = 200;
const MAX_COLS = 40;

function cellToPlainString(cell) {
  if (cell == null) return '';
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (v.richText && Array.isArray(v.richText)) {
      return v.richText.map((p) => (p && p.text ? String(p.text) : '')).join('');
    }
    if (v.result != null) return String(v.result);
    if (v.hyperlink && v.text) return String(v.text);
  }
  return String(v);
}

const YES_NO_TOKENS = new Set([
  'sim',
  'não',
  'nao',
  'yes',
  'no',
  'y',
  'n',
  's',
  'true',
  'false',
  'verdadeiro',
  'falso',
  'ok',
  'nok',
  '1',
  '0',
  'x',
  '✓',
  '✔',
  'conforme',
  'não conforme',
  'nao conforme',
  'aprovado',
  'reprovado',
]);

function normalizeToken(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isBinaryYesNoSet(uniqueNorm) {
  if (uniqueNorm.length !== 2) return false;
  const [a, b] = uniqueNorm;
  return YES_NO_TOKENS.has(a) && YES_NO_TOKENS.has(b);
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const LOOKS_NUMERIC = /^-?\d+[.,]?\d*$/;

function looksLikeEmail(s) {
  return EMAIL_LIKE.test(String(s).trim());
}

function looksLikeNumber(s) {
  return LOOKS_NUMERIC.test(String(s).trim().replace(/\s/g, ''));
}

/** ISO-like or PT date fragments */
function looksLikeDate(s) {
  const t = String(s).trim();
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(t)) return true;
  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}/.test(t)) return true;
  return false;
}

/**
 * Perfil de uma coluna (cabeçalho = linha 1) para heurísticas de tipo de campo.
 * @typedef {{ sheet: string, colIndex: number, header: string, distinctCount: number, filledCount: number, repeatRatio: number, samples: string[], signal: string, suggestedOptionsLine: string }} ColumnSignal
 */

/**
 * @param {string} sheetName
 * @param {string[][]} matrix — linhas de células (já trimadas)
 * @returns {ColumnSignal[]}
 */
function profileColumnsFromMatrix(sheetName, matrix) {
  if (!matrix || matrix.length < 2) return [];
  const headerRow = matrix[0] || [];
  const dataRows = matrix.slice(1);
  const maxCol = Math.min(
    MAX_COLS,
    Math.max(headerRow.length, ...dataRows.map((r) => r.length), 0)
  );
  const profiles = [];

  for (let c = 0; c < maxCol; c++) {
    const header = String(headerRow[c] || '').trim();
    if (!header) continue;

    const vals = dataRows
      .map((r) => String(r[c] != null ? r[c] : '').trim())
      .filter((v) => v.length > 0);
    const normalized = vals.map((v) => v.replace(/\s+/g, ' ').trim());
    const unique = [...new Set(normalized)];

    if (vals.length < 2) {
      let sparseSignal = 'none';
      if (/(foto|fotografia|imagem|evid[eê]ncia|captura|picture|photo)/i.test(header)) {
        sparseSignal = 'photo_hint';
      } else if (/(telefone|tel\.?|celular|telem[oó]vel|contacto)/i.test(header)) {
        sparseSignal = 'phone_hint';
      } else if (/(e-?mail|correio)/i.test(header)) {
        sparseSignal = 'email_hint';
      } else if (/\bdata\b|data\//i.test(header)) {
        sparseSignal = 'date_hint';
      } else if (
        /(ean|gtin|sku|c[oó]digo\s*barras|barcode|serial|patrim[oô]nio|n[ºo°]?\s*ser(i[eê])?)/i.test(header)
      ) {
        sparseSignal = 'barcode_hint';
      }
      if (sparseSignal !== 'none') {
        profiles.push({
          sheet: sheetName,
          colIndex: c + 1,
          header,
          distinctCount: unique.length,
          filledCount: vals.length,
          repeatRatio: 1,
          samples: unique.slice(0, 10),
          signal: sparseSignal,
          suggestedOptionsLine: '',
        });
      }
      continue;
    }

    const distinct = unique.length;
    const filled = normalized.length;
    const repeatRatio = distinct / Math.max(filled, 1);

    const splits = normalized.map((v) =>
      v
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const avgParts = splits.reduce((a, x) => a + x.length, 0) / splits.length;
    const maxParts = Math.max(...splits.map((x) => x.length), 1);

    const uniqueNorm = unique.map(normalizeToken);
    let signal = 'none';
    let suggestedOptionsLine = '';

    const barcodeHeader = /(ean|gtin|sku|c[oó]digo\s*barras|barcode|serial|patrim[oô]nio|n[ºo°]?\s*ser(i[eê])?)/i.test(
      header
    );
    const barcodeLikeHits = normalized.filter((v) => {
      const x = String(v).replace(/\D/g, '');
      return x.length >= 8 && x.length <= 14;
    }).length;
    if (barcodeHeader && filled >= 3 && barcodeLikeHits / filled >= 0.45) {
      signal = 'barcode_hint';
    } else if (distinct === 2 && isBinaryYesNoSet(uniqueNorm)) {
      signal = 'yes_no';
      suggestedOptionsLine = unique.slice(0, 2).join(', ');
    } else if (
      avgParts >= 1.65 &&
      distinct >= 4 &&
      maxParts <= 8 &&
      filled >= 4
    ) {
      signal = 'multiselect_hint';
      const tokenSet = new Set();
      for (const sp of splits) {
        for (const t of sp) {
          const n = normalizeToken(t);
          if (n.length > 0 && n.length < 80) tokenSet.add(t.trim());
        }
      }
      const arr = [...tokenSet];
      suggestedOptionsLine = arr.slice(0, 24).join(', ');
    } else if (
      distinct >= 2 &&
      distinct <= 22 &&
      filled >= 4 &&
      repeatRatio <= 0.42
    ) {
      signal = 'dropdown';
      suggestedOptionsLine = unique.slice(0, 20).join(', ');
    } else if (
      distinct >= 2 &&
      distinct <= 14 &&
      filled >= 3 &&
      repeatRatio <= 0.55
    ) {
      signal = 'dropdown_weak';
      suggestedOptionsLine = unique.slice(0, 16).join(', ');
    }

    const emailHits = normalized.filter(looksLikeEmail).length;
    const numHits = normalized.filter(looksLikeNumber).length;
    const dateHits = normalized.filter(looksLikeDate).length;

    if (signal === 'none' && emailHits / filled >= 0.55) {
      signal = 'email_hint';
    } else if (signal === 'none' && numHits / filled >= 0.75) {
      signal = 'number_hint';
    } else if (signal === 'none' && dateHits / filled >= 0.45) {
      signal = 'date_hint';
    } else if (signal === 'none' && /telefone|tel\.?|celular|telem[oó]vel|contacto/i.test(header)) {
      signal = 'phone_hint';
    }

    if (
      signal === 'none' &&
      /foto|fotografia|evid[eê]ncia|imagem|captura|anexo\s*visual/i.test(header)
    ) {
      signal = 'photo_hint';
    }

    if (signal === 'dropdown_weak' && filled < 6) {
      signal = 'none';
      suggestedOptionsLine = '';
    }

    profiles.push({
      sheet: sheetName,
      colIndex: c + 1,
      header,
      distinctCount: distinct,
      filledCount: filled,
      repeatRatio: Math.round(repeatRatio * 100) / 100,
      samples: unique.slice(0, 10),
      signal,
      suggestedOptionsLine: suggestedOptionsLine.slice(0, 2000),
    });
  }
  return profiles;
}

function formatColumnSignalsForLlm(profiles) {
  if (!profiles || !profiles.length) {
    return '(Sem perfil de colunas — poucas linhas ou sem cabeçalho na linha 1.)';
  }
  const lines = [];
  lines.push(
    'Regras: se signal for "dropdown" ou "dropdown_weak", a coluna tem poucos valores repetidos — prefere tipo dropdown (lista) em vez de texto livre.'
  );
  lines.push(
    'Se "yes_no", usa yes_no. Se "multiselect_hint", células trazem vários valores separados por vírgula/ponto-e-vírgula — prefere multiselect.'
  );
  lines.push(
    'Se "barcode_hint", cabeçalho/valores sugerem identificador numérico (EAN/patrimônio) — prefere tipo barcode_scan nas opções.'
  );
  lines.push(
    'Se "photo_hint", o cabeçalho sugere evidência fotográfica — prefere photo ou photo_stamped conforme o contexto do usuário.'
  );
  lines.push('');
  for (const p of profiles) {
    if (p.signal === 'none' && !p.suggestedOptionsLine) continue;
    const samp = (p.samples || []).slice(0, 6).join(' | ');
    lines.push(
      `- Folha "${p.sheet}" | coluna ${p.colIndex} | cabeçalho "${p.header}" | signal=${p.signal} | ` +
        `${p.distinctCount} valores distintos em ${p.filledCount} células (repetição ${p.repeatRatio})` +
        (samp ? ` | amostra: ${samp}` : '') +
        (p.suggestedOptionsLine ? ` | valores sugeridos p/ lista: ${p.suggestedOptionsLine}` : '')
    );
  }
  return lines.join('\n');
}

/**
 * Extrai markdown + perfil de colunas num único load do workbook.
 * @returns {Promise<{ markdown: string, truncated: boolean, format: string, columnSignals: ColumnSignal[] }>}
 */
async function extractWorkbookForAi(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Buffer Excel vazio.');
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const parts = [];
  const allSignals = [];
  let truncated = false;

  wb.eachSheet((sheet) => {
    const sheetName = String(sheet.name || 'Sheet');
    parts.push('');
    parts.push(`## Folha: ${sheetName}`);
    const lastRow = Math.min(sheet.rowCount || 0, MAX_ROWS_PER_SHEET);
    if (sheet.rowCount > MAX_ROWS_PER_SHEET) truncated = true;

    const matrix = [];
    for (let r = 1; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      const cells = [];
      const colLimit = Math.min(sheet.columnCount || MAX_COLS, MAX_COLS);
      for (let c = 1; c <= colLimit; c++) {
        cells.push(cellToPlainString(row.getCell(c)).trim());
      }
      if (cells.every((s) => !s)) continue;
      parts.push(cells.join(' | '));
      matrix.push(cells);
    }

    const sig = profileColumnsFromMatrix(sheetName, matrix);
    allSignals.push(...sig);
  });

  let markdown = parts.join('\n').trim();
  if (markdown.length > MAX_CANONICAL_CHARS) {
    markdown = markdown.slice(0, MAX_CANONICAL_CHARS);
    truncated = true;
  }

  return {
    markdown,
    truncated,
    format: 'xlsx',
    columnSignals: allSignals,
  };
}

/**
 * @returns {{ markdown: string, truncated: boolean, format: string }}
 */
async function extractCanonicalFromXlsx(buffer) {
  const snap = await extractWorkbookForAi(buffer);
  return {
    markdown: snap.markdown,
    truncated: snap.truncated,
    format: snap.format,
  };
}

module.exports = {
  extractCanonicalFromXlsx,
  extractWorkbookForAi,
  formatColumnSignalsForLlm,
  profileColumnsFromMatrix,
  MAX_CANONICAL_CHARS,
  MAX_ROWS_PER_SHEET,
};
