/**
 * Expande campos do formulário para o PDF de pré-visualização igual ao printReport
 * da Central de Operações (secções repetíveis, instâncias, cabeçalhos).
 */

function normTypeOps(t) {
  const s = String(t == null ? '' : t)
    .trim()
    .replace(/[\s-]+/g, '_');
  return s ? s.toLowerCase() : '';
}

function effTypeOps(f) {
  if (!f || typeof f !== 'object') return '';
  const raw = f.type ?? f.fieldType ?? f.kind ?? f.component ?? f.controlType;
  return normTypeOps(raw);
}

function resolveSectionLabelClient(field) {
  if (!field || typeof field !== 'object') return '';
  const meta = field.metadata && typeof field.metadata === 'object' ? field.metadata : null;
  const props = field.properties && typeof field.properties === 'object' ? field.properties : null;
  const cfg = field.config && typeof field.config === 'object' ? field.config : null;
  const candidates = [
    field.label,
    field.title,
    field.name,
    field.text,
    field.sectionTitle,
    field.question,
    field.placeholder,
    field.caption,
    field.displayName,
    field.rotulo,
    field.nome,
    meta && meta.label,
    meta && meta.title,
    meta && meta.name,
    meta && meta.sectionTitle,
    props && props.label,
    props && props.title,
    cfg && cfg.label,
    cfg && cfg.title,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '';
}

function parseSchemaArrayOps(schemaData) {
  if (Array.isArray(schemaData)) return schemaData;
  if (typeof schemaData === 'string') {
    try {
      const p = JSON.parse(schemaData);
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object' && Array.isArray(p.schema)) return p.schema;
      if (p && typeof p === 'object' && Array.isArray(p.fields)) return p.fields;
      if (p && typeof p === 'object' && Array.isArray(p.blocks)) return p.blocks;
      if (p && typeof p === 'object' && p.form && Array.isArray(p.form.fields)) return p.form.fields;
    } catch {
      return [];
    }
    return [];
  }
  if (schemaData && typeof schemaData === 'object') {
    if (Array.isArray(schemaData.schema)) return schemaData.schema;
    if (Array.isArray(schemaData.fields)) return schemaData.fields;
    if (Array.isArray(schemaData.blocks)) return schemaData.blocks;
    if (schemaData.form && Array.isArray(schemaData.form.fields)) return schemaData.form.fields;
  }
  return [];
}

function buildRepeatFieldMapFromTemplate(template) {
  if (
    template &&
    template.repeatFieldMap &&
    typeof template.repeatFieldMap === 'object' &&
    !Array.isArray(template.repeatFieldMap)
  ) {
    return template.repeatFieldMap;
  }
  const sch = parseSchemaArrayOps(template && template.schemaData);
  const out = Object.create(null);
  let repeatSid = null;
  for (const f of sch) {
    if (!f || !f.id) continue;
    const typ = effTypeOps(f);
    if (typ === 'section_break') {
      repeatSid = f.multiple ? String(f.id) : null;
      continue;
    }
    if (typ === 'hidden') continue;
    if (repeatSid) out[String(f.id)] = repeatSid;
  }
  return out;
}

export function normalizeSectionRepeatRows(responses, sectionId) {
  const k = '__section_repeat_' + sectionId;
  const raw = responses && responses[k];
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
}

function groupTemplateFieldsByRepeatRuns(fields, repeatMap) {
  if (!Array.isArray(fields) || fields.length === 0) return [];
  const map = repeatMap && typeof repeatMap === 'object' ? repeatMap : {};
  const segments = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    const rsid = map[f.id];
    if (!rsid) {
      segments.push({ kind: 'plain', fields: [f] });
      i++;
      continue;
    }
    const sid = rsid;
    const group = [];
    while (i < fields.length) {
      const ff = fields[i];
      if (map[ff.id] !== sid) break;
      group.push(ff);
      i++;
    }
    segments.push({ kind: 'repeat', sectionId: sid, fields: group });
  }
  return segments;
}

function sectionLabelsFromSchemaData(schemaData) {
  const map = Object.create(null);
  parseSchemaArrayOps(schemaData).forEach((f) => {
    if (!f || !f.id) return;
    if (effTypeOps(f) !== 'section_break') return;
    const lab = resolveSectionLabelClient(f);
    if (lab) map[f.id] = lab;
  });
  return map;
}

function repeatSectionLabel(template, sectionId, labelBySidPdf) {
  if (sectionId && labelBySidPdf[sectionId]) return labelBySidPdf[sectionId];
  const br =
    template && Array.isArray(template.sectionBreaks)
      ? template.sectionBreaks.find((s) => s && s.id === sectionId)
      : null;
  if (br && br.label != null && String(br.label).trim() !== '') return String(br.label).trim();
  return 'Secção repetível';
}

/**
 * @param {object} task
 * @param {Array<{id:string,type?:string,label?:string}>} fieldsList — ordem do template (sem órfãos)
 * @returns {Array<object>}
 */
function buildPdfEntriesFromFieldList(task, fieldsList) {
  const responses = task?.responses || {};
  const template = task?.template || {};
  const repeatMapPdf = buildRepeatFieldMapFromTemplate(template);
  const fieldsPdfList = (fieldsList || []).filter(
    (f) => f && f.type !== 'transit_start' && f.type !== 'transit_end',
  );
  const pdfEntries = [];
  if (fieldsPdfList.length === 0) return pdfEntries;

  const pdfSegments = groupTemplateFieldsByRepeatRuns(fieldsPdfList, repeatMapPdf);
  const labelBySidPdf = { ...sectionLabelsFromSchemaData(template.schemaData) };
  if (Array.isArray(template.sectionBreaks)) {
    for (const s of template.sectionBreaks) {
      if (
        s &&
        s.id &&
        s.label != null &&
        String(s.label).trim() !== '' &&
        !labelBySidPdf[s.id]
      ) {
        labelBySidPdf[s.id] = String(s.label).trim();
      }
    }
  }

  pdfSegments.forEach((seg) => {
    if (seg.kind === 'plain') {
      seg.fields.forEach((fd0) => {
        pdfEntries.push({
          id: fd0.id,
          fieldDef: fd0,
          row: null,
          rowIdx: null,
          repeatSid: null,
          omitInstanceInLabel: true,
        });
      });
      return;
    }
    const rows = normalizeSectionRepeatRows(responses, seg.sectionId);
    const secLab = repeatSectionLabel(template, seg.sectionId, labelBySidPdf);
    if (rows.length === 0) {
      seg.fields.forEach((fd0) => {
        pdfEntries.push({
          id: fd0.id,
          fieldDef: fd0,
          row: null,
          rowIdx: null,
          repeatSid: null,
          omitInstanceInLabel: true,
        });
      });
    } else if (rows.length === 1) {
      seg.fields.forEach((fd0) => {
        pdfEntries.push({
          id: fd0.id,
          fieldDef: fd0,
          row: rows[0],
          rowIdx: 0,
          repeatSid: seg.sectionId,
          omitInstanceInLabel: true,
        });
      });
    } else {
      rows.forEach((row, ri) => {
        pdfEntries.push({
          kind: '__repeat_hdr',
          sectionLabel: secLab,
          instanceNum: ri + 1,
        });
        seg.fields.forEach((fd0) => {
          pdfEntries.push({
            id: fd0.id,
            fieldDef: fd0,
            row,
            rowIdx: ri,
            repeatSid: seg.sectionId,
            omitInstanceInLabel: true,
          });
        });
      });
    }
  });
  return pdfEntries;
}

/**
 * Entradas na mesma ordem lógica do PDF da Central: campos do template (com repetições)
 * e depois campos só presentes nas respostas (órfãos).
 *
 * @param {object} task — painel (com template.fields, template.repeatFieldMap, responses)
 * @param {Array<{id:string,type?:string,label?:string,allowTechnicianComment?:boolean}>} schemaFields
 */
export function buildPreviewPdfEntries(task, schemaFields) {
  const tmplFields = task?.template?.fields;
  const tmplIds = new Set(
    Array.isArray(tmplFields) ? tmplFields.map((x) => x && x.id).filter(Boolean) : [],
  );
  const list = schemaFields || [];
  const ordered =
    tmplIds.size > 0 ? list.filter((f) => f && f.id && tmplIds.has(f.id)) : list.filter((f) => f && f.id);
  const orphans =
    tmplIds.size > 0 ? list.filter((f) => f && f.id && !tmplIds.has(f.id)) : [];

  const main = buildPdfEntriesFromFieldList(task, ordered);
  const tail = orphans.map((fd0) => ({
    id: fd0.id,
    fieldDef: fd0,
    row: null,
    rowIdx: null,
    repeatSid: null,
    omitInstanceInLabel: true,
  }));
  return [...main, ...tail];
}
