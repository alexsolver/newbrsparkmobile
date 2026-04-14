'use strict';

const { resolveOpenAiCredentials } = require('./openAiCredentials');
const { openAiMessageContentToString, parseOpenAiJsonObject } = require('./openAiChatParse');
const { detectBufferMime } = require('./validateTechRegProfilePhotoOpenAi');

/**
 * @param {string|null|undefined} s
 * @returns {string|null}
 */
function normalizeIsoDate(s) {
  if (s == null || s === '') return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

const DOC_TYPES_BR = ['RG', 'CPF', 'CNH', 'PASSAPORTE', 'RNE', 'CARTEIRA_FUNCIONAL', 'OUTRO'];

/** Boolean vindo do modelo (string "true"/"false"). */
function asModelBoolean(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'sim' || s === 'yes' || s === '1';
}

/**
 * Extrai campos de documento de identificação com foto (OCR + interpretação via visão).
 * @param {Buffer} imageBuffer
 * @param {{ countryCode?: string }} [opts]
 * @returns {Promise<{
 *   docType: string,
 *   documentNumber: string,
 *   issueDate: string | null,
 *   expiryDate: string | null,
 *   issuingBody: string,
 *   fullName: string,
 *   birthDate: string | null
 * }>}
 */
async function extractIdDocumentWithOpenAi(imageBuffer, opts = {}) {
  const { apiKey, model, baseUrl } = await resolveOpenAiCredentials();
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error(
      'Chave OpenAI ausente: configure a integração «OpenAI» no painel ou OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }

  const country = String(opts.countryCode || 'BR').trim().toUpperCase() || 'BR';
  const mime = detectBufferMime(imageBuffer);
  const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;

  const docTypesHint =
    country === 'BR'
      ? `Tipos permitidos para docType (use exatamente uma destas strings em MAIÚSCULAS): ${DOC_TYPES_BR.join(', ')}.`
      : `Para o país ${country}, use docType entre: PASSAPORTE, RG_OU_EQUIVALENTE, CNH_OU_EQUIVALENTE, CPF_OU_TAX_ID, OUTRO (sempre MAIÚSCULAS com underscore onde indicado).`;

  const systemPrompt =
    'És um extrator de dados de documentos de identificação. Respondes APENAS JSON válido, sem markdown. ' +
    'Se um campo não existir no documento ou for ilegível, usa null ou string vazia conforme o schema. ' +
    'Datas sempre em formato YYYY-MM-DD ou null.';

  const userText = `Analisa a imagem: é um documento de identificação oficial com fotografia (RG, CNH, passaporte, CPF impresso, etc.).

País de contexto do candidato (ISO): ${country}.
${docTypesHint}

Extrai e devolve JSON com este formato exato:
{
  "docType": "string — um dos tipos permitidos acima",
  "documentNumber": "número principal do documento, sem espaços extras se possível",
  "issueDate": "YYYY-MM-DD ou null",
  "expiryDate": "YYYY-MM-DD ou null — se o documento não tiver validade, null",
  "issuingBody": "órgão emissor como no documento ou string vazia",
  "fullName": "nome completo como no documento",
  "birthDate": "YYYY-MM-DD ou null"
}

Regras:
- fullName e documentNumber são os mais importantes; se ilegível, string vazia ou null.
- Para CPF só numérico (11 dígitos) quando for o tipo CPF.
- Não inventes dados: se não vês, null ou "".`;

  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + String(apiKey).trim(),
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          ],
        },
      ],
    }),
  });

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const err = new Error(`Resposta inválida do serviço de OCR (HTTP ${res.status}).`);
    err.code = 'OPENAI_PARSE';
    throw err;
  }

  if (!res.ok) {
    const msg = data?.error?.message || rawText.slice(0, 280);
    const err = new Error(`OCR falhou: ${msg}`);
    err.code = 'OPENAI_HTTP';
    err.status = res.status;
    throw err;
  }

  const msg0 = data?.choices?.[0]?.message;
  if (msg0?.refusal) {
    const err = new Error('O modelo recusou analisar o documento.');
    err.code = 'OPENAI_REFUSAL';
    throw err;
  }
  const contentStr = openAiMessageContentToString(msg0?.content);
  if (!String(contentStr).trim()) {
    const err = new Error('OCR sem conteúdo.');
    err.code = 'OPENAI_EMPTY';
    throw err;
  }

  let parsed;
  try {
    parsed = parseOpenAiJsonObject(contentStr);
  } catch (e) {
    const err = new Error('Resultado do OCR em formato inválido.');
    err.code = 'OPENAI_JSON';
    throw err;
  }

  return {
    docType: String(parsed.docType || 'OUTRO')
      .trim()
      .toUpperCase()
      .slice(0, 64) || 'OUTRO',
    documentNumber: String(parsed.documentNumber || '').trim().slice(0, 120),
    issueDate: normalizeIsoDate(parsed.issueDate),
    expiryDate: normalizeIsoDate(parsed.expiryDate),
    issuingBody: String(parsed.issuingBody || '').trim().slice(0, 200),
    fullName: String(parsed.fullName || '').trim().slice(0, 200),
    birthDate: normalizeIsoDate(parsed.birthDate),
  };
}

/**
 * Passo 3: compara fotografia do rosto no documento com a foto de perfil (etapa 1).
 * Usa o mesmo motor multimodal OpenAI que valida a foto de perfil — não usa CompreFace.
 *
 * @param {Buffer} profileBuffer — foto de perfil (referência)
 * @param {Buffer} documentBuffer — imagem do documento
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 * @throws {Error} NO_OPENAI_KEY, OPENAI_* (erros de transporte/parse)
 */
async function verifyDocumentFaceMatchesProfileOpenAi(profileBuffer, documentBuffer) {
  if (!profileBuffer || profileBuffer.length < 64 || !documentBuffer || documentBuffer.length < 64) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Imagem inválida ou muito pequena.',
    };
  }

  const { apiKey, model, baseUrl } = await resolveOpenAiCredentials();
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error(
      'Chave OpenAI ausente: configure a integração «OpenAI» no painel ou OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }

  const mimeP = detectBufferMime(profileBuffer);
  const mimeD = detectBufferMime(documentBuffer);
  const dataUrlP = `data:${mimeP};base64,${profileBuffer.toString('base64')}`;
  const dataUrlD = `data:${mimeD};base64,${documentBuffer.toString('base64')}`;

  const systemPrompt =
    'És um assistente de verificação de identidade para cadastro de prestador no Brasil. A fotografia no documento (RG/CNH/etc.) é quase sempre pequena, antiga, com qualidade de impressão ou reflexo no plástico — isso é normal. O teu objetivo é aceitar quando for razoavelmente a mesma pessoa e só recusar com evidência forte de pessoa diferente ou de ausência total de foto no documento. Respondes APENAS JSON válido, sem markdown.';

  const userText = `Duas imagens por ordem:
1) Foto de perfil atual do candidato (selfie/retrato do passo 1).
2) Foto de um documento com a fotografia oficial do portador (muito pequena no papel é normal).

JSON exato:
{"documentFaceReadable":boolean,"samePerson":boolean,"userMessagePtBr":"frase curta em pt-BR"}

Regras IMPORTANTES:
- documentFaceReadable: marca true se existir QUALQUER fotografia de rosto humana reconhecível no documento, mesmo que pequena, desfocada, com reflexo leve ou baixo contraste — típico de foto impressa. Só false se NÃO houver foto de pessoa no documento, estiver cortada de modo que não haja rosto, ou imagem totalmente ilegível (ex.: só branco ou documento invertido sem ver face).
- samePerson: julga se a pessoa da imagem 1 é a mesma da foto no documento (imagem 2). Ignora diferença de idade (documento antigo), penteado, barba, maquilhagem, óculos de grau, iluminação e qualidade. Em caso de dúvida razoável, escolhe samePerson true. Só false se tiveres alta confiança de serem duas pessoas claramente diferentes.
- NÃO forces samePerson=false só porque documentFaceReadable=false: se mesmo assim achares que é a mesma pessoa, podes por samePerson true e documentFaceReadable true.
- userMessagePtBr: se aceites, algo como "Identidade conferida."; se recusares, diz o que melhorar na foto do documento (luz, reflexo, enquadramento).`;

  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + String(apiKey).trim(),
    },
    body: JSON.stringify({
      model,
      temperature: 0.28,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: dataUrlP, detail: 'high' } },
            { type: 'image_url', image_url: { url: dataUrlD, detail: 'high' } },
          ],
        },
      ],
    }),
  });

  const rawText = await res.text();
  let outer;
  try {
    outer = JSON.parse(rawText);
  } catch {
    const err = new Error(`Resposta inválida do serviço de comparação (HTTP ${res.status}).`);
    err.code = 'OPENAI_PARSE';
    throw err;
  }

  if (!res.ok) {
    const msg = outer?.error?.message || rawText.slice(0, 280);
    const err = new Error(`Comparação facial falhou: ${msg}`);
    err.code = 'OPENAI_HTTP';
    err.status = res.status;
    throw err;
  }

  const msg0 = outer?.choices?.[0]?.message;
  if (msg0?.refusal) {
    const err = new Error('O modelo recusou comparar as imagens.');
    err.code = 'OPENAI_REFUSAL';
    throw err;
  }
  const contentStr = openAiMessageContentToString(msg0?.content);
  if (!String(contentStr).trim()) {
    const err = new Error('Resposta da comparação sem conteúdo.');
    err.code = 'OPENAI_EMPTY';
    throw err;
  }

  let parsed;
  try {
    parsed = parseOpenAiJsonObject(contentStr);
  } catch (e) {
    const err = new Error('Resultado da comparação em formato inválido.');
    err.code = 'OPENAI_JSON';
    throw err;
  }

  const readable = asModelBoolean(parsed.documentFaceReadable);
  const same = asModelBoolean(parsed.samePerson);
  const userMsg = String(parsed.userMessagePtBr || '').trim();

  /** Se o modelo confia na mesma pessoa, aceita mesmo com flags inconsistentes (foto de documento é sempre difícil). */
  if (same) {
    return { ok: true };
  }

  if (!readable && !same) {
    return {
      ok: false,
      code: 'NO_FACE_DETECTED',
      message:
        userMsg ||
        'Não conseguimos ver bem a fotografia do rosto no documento nesta imagem. Tire outra foto: documento inteiro, luz uniforme, sem reflexo forte no plástico e com a fotinha do documento visível.',
    };
  }

  return {
    ok: false,
    code: 'FACE_MISMATCH',
    message:
      userMsg ||
      'Não foi possível confirmar que a foto do documento é da mesma pessoa da foto de perfil. Se for você, tente uma foto mais nítida do documento ou verifique se o passo 1 usa a sua foto atual.',
  };
}

module.exports = {
  extractIdDocumentWithOpenAi,
  verifyDocumentFaceMatchesProfileOpenAi,
  normalizeIsoDate,
  DOC_TYPES_BR,
};
