const router = require('express').Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const fs = require('fs/promises');
const path = require('path');

// Caminho para os arquivos de tradução do App Mobile (fonte da verdade)
const LOCALES_DIR = path.join(__dirname, '../../../../src/i18n/locales');

// READ ALL ENTRIES (By Source) - Internal Admin Use
router.get('/entries', adminAuth, async (req, res) => {
  try {
    const { source } = req.query;
    if (source === 'app') {
      const pt = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'pt-BR.json'), 'utf8'));
      const en = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'en-US.json'), 'utf8'));
      const es = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'es-ES.json'), 'utf8'));

      // Flatten nested JSON → { 'common.save': 'Salvar', 'auth.login.title': 'Entrar', ... }
      function flatten(obj, prefix = '') {
        return Object.entries(obj).reduce((acc, [k, v]) => {
          const key = prefix ? `${prefix}.${k}` : k;
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(acc, flatten(v, key));
          } else {
            acc[key] = String(v ?? '');
          }
          return acc;
        }, {});
      }

      const ptFlat = flatten(pt);
      const enFlat = flatten(en);
      const esFlat = flatten(es);

      const keys = new Set([...Object.keys(ptFlat), ...Object.keys(enFlat), ...Object.keys(esFlat)]);
      const entries = Array.from(keys).sort().map(k => ({
        key:   k,
        id:    k,
        ptBr:  ptFlat[k] || '',
        enUs:  enFlat[k] || '',
        esEs:  esFlat[k] || '',
        group: k.split('.')[0], // agrupa por namespace (common, auth, asset…)
      }));
      return res.json(entries);
    }
    
    if (source === 'db-metatags') {
      const tags = await prisma.metatag.findMany({ orderBy: { key: 'asc' } });
      return res.json(tags.map(t => ({
        id:    t.id,
        key:   t.key,
        ptBr:  t.ptBr || '',
        enUs:  t.enUs || '',
        esEs:  t.esEs || '',
        group: t.type
      })));
    }

    if (source === 'db-flags') {
      const flags = await prisma.featureFlag.findMany({ where: { tenantId: null }, orderBy: { key: 'asc' } });
      let ptJson = {}, enJson = {}, esJson = {};
      try {
        ptJson = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'pt-BR.json'), 'utf8'));
        enJson = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'en-US.json'), 'utf8'));
        esJson = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'es-ES.json'), 'utf8'));
      } catch (_) {}
      return res.json(flags.map(f => ({
        id:          f.id,
        key:         f.key,
        label:       f.label,
        description: f.description,
        enabled:     f.enabled,
        // PT-BR = stored label. EN/ES = look up from JSON modules.flags.{key}
        ptBr:  f.label        || ptJson?.modules?.[f.key] || '',
        enUs:  enJson?.modules?.[f.key] || '',
        esEs:  esJson?.modules?.[f.key] || '',
        group: 'Feature Flags'
      })));
    }


    if (source === 'locales') {
      const activeOnly = ['1', 'true', 'yes'].includes(String(req.query.activeOnly || '').toLowerCase());
      const locales = await prisma.localeProfile.findMany({
        where: activeOnly ? { isActive: true } : undefined,
        orderBy: { name: 'asc' },
      });
      return res.json(locales);
    }

    if (source === 'overrides') {
      const { tenantId } = req.query;
      const overrides = await prisma.translationOverride.findMany({
        where: { ...(tenantId && { tenantId }) },
        orderBy: { key: 'asc' }
      });
      return res.json(overrides);
    }

    res.status(400).json({ error: 'Invalid source' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// GET SPECIFIC OVERRIDES
router.get('/overrides', adminAuth, async (req, res) => {
  try {
    const { tenantId } = req.query;
    const overrides = await prisma.translationOverride.findMany({
      where: { ...(tenantId && { tenantId }) },
      orderBy: { key: 'asc' }
    });
    return res.json(overrides);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// UPDATE GLOBAL ENTRIES
router.post('/update', adminAuth, async (req, res) => {
  try {
    const { source, entries } = req.body;
    if (source === 'app') {
       return res.json({ success: true, message: 'Dicionário global (Demo: Locked)' });
    }

    for (const entry of entries) {
      if (source === 'db-metatags') {
        await prisma.metatag.update({ 
          where: { id: entry.id },
          data: { translations: { 'pt-BR': entry.ptBr, 'en-US': entry.enUs, 'es-ES': entry.esEs } }
        });
      }
      if (source === 'db-flags') {
        await prisma.featureFlag.update({
          where: { id: entry.id },
          data: { translations: { 'pt-BR': entry.ptBr, 'en-US': entry.enUs, 'es-ES': entry.esEs } }
        });
      }
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// CREATE/UPDATE TENANT OVERRIDES
router.post('/overrides', adminAuth, async (req, res) => {
  try {
    const { tenantId, entries } = req.body; 
    if (!tenantId) return res.status(400).json({ error: 'TenantId is required' });

    for (const entry of entries) {
      await prisma.translationOverride.upsert({
        where: { tenantId_key_language: { tenantId, key: entry.key, language: entry.language } },
        update: { value: entry.value },
        create: { tenantId, key: entry.key, language: entry.language, value: entry.value }
      });
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// UPDATE REGIONAL PROFILE
router.post('/locales', adminAuth, async (req, res) => {
  try {
    const { id, ...data } = req.body;
    await prisma.localeProfile.update({ where: { id }, data });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// PUBLIC: I18N BUNDLE FOR MOBILE APP (NO AUTH)
router.get('/bundle', async (req, res) => {
  try {
    const { tenantId, lang = 'pt-BR' } = req.query;

    const localeFile = path.join(LOCALES_DIR, `${lang}.json`);
    let bundle = {};
    try {
      const content = await fs.readFile(localeFile, 'utf8');
      bundle = JSON.parse(content);
    } catch (e) { /* ignore */ }

    if (tenantId) {
      const overrides = await prisma.translationOverride.findMany({
        where: { tenantId, language: lang }
      });
      overrides.forEach(ov => {
        const keys = ov.key.split('.');
        let current = bundle;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) current[keys[i]] = {};
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = ov.value;
      });
    }

    res.json(bundle);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
