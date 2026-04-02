'use strict';
const router = require('express').Router();
const prisma = require('../db');
const https = require('https');

const authUser = require('../middleware/authUser');

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

// Helper: Query Bluesoft Cosmos API
async function queryCosmos(gtin) {
  const integration = await prisma.integration.findFirst({
    where: { type: 'ERP', name: 'Bluesoft Cosmos', status: 'ACTIVE' }
  });

  if (!integration || !integration.apiKey) {
    return { error: 'Integração Cosmos não configurada ou inativa', status: 404 };
  }

  const baseUrl = integration.baseUrl || 'https://api.cosmos.bluesoft.com.br';
  const hostname = baseUrl.replace('https://', '').split('/')[0];
  const path = `/gtins/${gtin}.json`;

  const r = await httpsGet(hostname, path, {
    'X-Cosmos-Token': integration.apiKey,
    'User-Agent': 'BrSpark'
  });

  if (r.status === 200) {
    const data = JSON.parse(r.body);
    return {
      found: true,
      description: data.description,
      brand: data.brand?.name || null,
      thumbnail: data.thumbnail || null,
      category: data.gpc?.description || null
    };
  }

  if (r.status === 404) return { found: false, message: 'Produto não encontrado no Cosmos.' };
  return { error: `Cosmos retornou HTTP ${r.status}`, status: r.status };
}

// Helper: Query UPCItemDB API
async function queryUpcItemDb(gtin) {
  const integration = await prisma.integration.findFirst({
    where: { type: 'ERP', name: 'UPCItemDB', status: 'ACTIVE' }
  });

  // UPCItemDB tem rota de trial sem apiKey, mas vamos usar a config do admin se existir
  const apiKey = integration ? integration.apiKey : null;
  const baseUrl = integration ? integration.baseUrl : 'https://api.upcitemdb.com/prod/trial';
  
  const hostPath = baseUrl.replace('https://', '');
  const hostname = hostPath.split('/')[0];
  const basePath = '/' + hostPath.split('/').slice(1).join('/');
  const reqPath = `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/lookup?upc=${gtin}`;

  const headers = { 'User-Agent': 'BrSpark' };
  if (apiKey) headers['user_key'] = apiKey;

  const r = await httpsGet(hostname, reqPath, headers);

  if (r.status === 200) {
    const data = JSON.parse(r.body);
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return {
        found: true,
        description: item.title || item.description,
        brand: item.brand || null,
        thumbnail: item.images && item.images.length > 0 ? item.images[0] : null,
        category: item.category || null
      };
    } else {
      return { found: false, message: 'Produto não encontrado no UPCItemDB.' };
    }
  }

  if (r.status === 400 || r.status === 404) return { found: false, message: 'Produto não encontrado no UPCItemDB.' };
  return { error: `UPCItemDB retornou HTTP ${r.status}`, status: r.status };
}

// GET /api/barcode/:gtin?country=BR
router.get('/:gtin', authUser, async (req, res) => {
  try {
    const { gtin } = req.params;
    const country = (req.query.country || 'BR').toUpperCase();

    if (!gtin || gtin.length < 8) {
      return res.status(400).json({ error: 'GTIN/UPC inválido.' });
    }

    let result;
    if (country === 'US') {
      result = await queryUpcItemDb(gtin);
    } else {
      // Default to Cosmos for BR
      result = await queryCosmos(gtin);
    }

    if (result.error) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    return res.json(result);

  } catch (err) {
    console.error('[Barcode API Error]', err);
    res.status(500).json({ error: 'Erro ao consultar a API de código de barras.' });
  }
});

module.exports = router;
