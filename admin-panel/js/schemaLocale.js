/**
 * Paridade com `src/checklist/schemaLocale.ts` — rótulos por locale no schema (Forms Builder).
 * Expõe `window.AriaSchemaLocale` para checklists-builder.js (script clássico).
 */
(function (global) {
  var PRIMARY = 'pt-BR';
  var SUPPORTED = ['pt-BR', 'en-US', 'es-ES', 'de-DE'];

  function normalizeSchemaLocaleTag(tag) {
    var t = String(tag || PRIMARY).replace(/_/g, '-');
    var lower = t.toLowerCase();
    if (lower === 'pt' || lower.indexOf('pt-') === 0) return 'pt-BR';
    if (lower === 'en' || lower.indexOf('en-') === 0) return 'en-US';
    if (lower === 'es' || lower.indexOf('es-') === 0) return 'es-ES';
    if (lower === 'de' || lower.indexOf('de-') === 0) return 'de-DE';
    return PRIMARY;
  }

  function getLocalizedFieldLabel(field, localeTag) {
    if (!field) return '';
    var loc = normalizeSchemaLocaleTag(localeTag);
    var by = field.labels;
    if (by && typeof by === 'object' && !Array.isArray(by)) {
      if (by[loc] != null && String(by[loc]).trim()) return String(by[loc]);
      var prefix = loc.split('-')[0].toLowerCase();
      var keys = Object.keys(by);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var kl = k.toLowerCase();
        if (kl === prefix || kl.indexOf(prefix + '-') === 0) {
          var v = by[k];
          if (v != null && String(v).trim()) return String(v);
        }
      }
    }
    var legacy = field.label != null ? String(field.label) : '';
    if (legacy.trim()) return legacy;
    return field.id != null ? String(field.id) : '';
  }

  function setLocalizedFieldLabel(field, localeTag, value) {
    if (!field || typeof field !== 'object') return;
    var loc = normalizeSchemaLocaleTag(localeTag);
    var v = value != null ? String(value) : '';
    if (!field.labels || typeof field.labels !== 'object' || Array.isArray(field.labels)) {
      field.labels = {};
    }
    field.labels[loc] = v;
    if (loc === PRIMARY) {
      field.label = v;
    }
  }

  function ensureFieldLabelsShape(field) {
    if (!field || typeof field !== 'object') return;
    if (!field.labels || typeof field.labels !== 'object' || Array.isArray(field.labels)) {
      field.labels = {};
    }
    var base = field.label != null ? String(field.label).trim() : '';
    if (base && (!field.labels[PRIMARY] || !String(field.labels[PRIMARY]).trim())) {
      field.labels[PRIMARY] = field.label;
    }
  }

  global.AriaSchemaLocale = {
    PRIMARY: PRIMARY,
    SUPPORTED: SUPPORTED,
    normalizeSchemaLocaleTag: normalizeSchemaLocaleTag,
    getLocalizedFieldLabel: getLocalizedFieldLabel,
    setLocalizedFieldLabel: setLocalizedFieldLabel,
    ensureFieldLabelsShape: ensureFieldLabelsShape,
  };
})(typeof window !== 'undefined' ? window : globalThis);
