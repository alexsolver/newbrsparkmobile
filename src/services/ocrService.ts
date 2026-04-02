/**
 * OCR Service – Reconhecimento real de comprovantes financeiros
 * Usa OCR.space API (free tier: 500 req/dia)
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const OCR_API_KEY = 'K85957953488957'; // Free tier key — substituir por key própria em produção
const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';

export interface OcrResult {
  description: string;
  amount: number;
  date: string;
  category: string;
  confidence: number;
  rawText?: string;
}

/**
 * Processa imagem de recibo/boleto via OCR.space API
 */
export async function processReceiptImage(imageUri: string): Promise<OcrResult> {
  let uri = imageUri;

  // Comprimir imagem para ficar dentro do limite de 1MB (free tier)
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: 'jpeg' as any }
    );
    uri = manipulated.uri;
  } catch {
    // Se falhar a compressão (ex: PDF), usa o original
  }

  // 1. Ler imagem como base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as any,
  });

  // Verificar tamanho (free tier aceita até ~1MB de base64)
  const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
  if (sizeKB > 1024) {
    throw new Error(`Imagem muito grande (${sizeKB}KB). Tente tirar uma foto com menos resolução.`);
  }

  // 2. Enviar para OCR.space como base64
  const body = new URLSearchParams();
  body.append('base64Image', `data:image/jpeg;base64,${base64}`);
  body.append('language', 'por');
  body.append('isOverlayRequired', 'false');
  body.append('detectOrientation', 'true');
  body.append('scale', 'true');
  body.append('OCREngine', '2');

  let json: any;
  try {
    const response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'apikey': OCR_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    json = await response.json();
  } catch (netErr: any) {
    throw new Error('Falha de rede: ' + (netErr?.message || 'Verifique sua conexão com a internet.'));
  }

  if (json.IsErroredOnProcessing) {
    const errMsg = json.ErrorMessage?.join('; ') || json.ErrorDetails || 'Erro desconhecido no servidor OCR';
    throw new Error(errMsg);
  }

  if (!json.ParsedResults?.length) {
    throw new Error('O OCR não conseguiu extrair texto da imagem. Tente uma foto mais nítida.');
  }

  const rawText = json.ParsedResults[0].ParsedText || '';

  if (!rawText.trim()) {
    throw new Error('Nenhum texto encontrado na imagem. Certifique-se de que o documento está legível.');
  }

  // 3. Extrair dados financeiros do texto reconhecido
  const amount = extractAmount(rawText);
  const date = extractDate(rawText);
  const category = inferCategory(rawText);
  const description = extractDescription(rawText);

  return {
    description: description || 'Documento digitalizado',
    amount: amount || 0,
    date: date || new Date().toISOString().split('T')[0],
    category,
    confidence: amount ? 0.9 : 0.5,
    rawText,
  };
}

// ─── Extração de dados financeiros ─────────────────────────────────

/** Extrai o valor monetário principal (R$ X.XXX,XX) */
function extractAmount(text: string): number | null {
  const lines = text.split('\n');

  // Prioridade 1: Valor total / valor do documento
  const priorityPatterns = [
    /(?:VALOR\s*(?:DO\s*)?DOCUMENTO|VALOR\s*COBRADO|VALOR\s*TOTAL|TOTAL\s*A\s*PAGAR|VALOR\s*PAGAR)[:\s]*R?\$?\s*([\d.,]+)/i,
    /R\$\s*([\d.]+,\d{2})/,
    /([\d]{1,3}(?:\.?\d{3})*,\d{2})/,
  ];

  for (const pattern of priorityPatterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const cleaned = match[1].replace(/\./g, '').replace(',', '.');
        const value = parseFloat(cleaned);
        if (value > 0 && value < 1000000) return value;
      }
    }
  }
  return null;
}

/** Extrai data de vencimento ou emissão */
function extractDate(text: string): string | null {
  const lines = text.split('\n');

  // Prioridade: data de vencimento
  for (const line of lines) {
    const vencMatch = line.match(/(?:VENCIMENTO|DT\.?\s*VENCTO?|DATA\s*VENCTO?)[:\s]*(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})/i);
    if (vencMatch) {
      const year = vencMatch[3].length === 2 ? '20' + vencMatch[3] : vencMatch[3];
      return `${year}-${vencMatch[2]}-${vencMatch[1]}`;
    }
  }

  // Fallback: qualquer data DD/MM/AAAA
  const datePatterns = [
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{2})-(\d{2})-(\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
  }

  // ISO format
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  return null;
}

/** Extrai descrição do documento */
function extractDescription(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);

  // Busca linhas com palavras-chave de descrição
  const descPatterns = [
    /(?:DESCRIÇÃO|DESCRICAO|REFERENTE|DEMONSTRATIVO)[:\s]*(.*)/i,
    /(?:CEDENTE|BENEFICIÁRIO|BENEFICIARIO|FAVORECIDO)[:\s]*(.*)/i,
    /(?:SACADO|PAGADOR)[:\s]*(.*)/i,
  ];

  for (const pattern of descPatterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match && match[1].trim().length > 3) {
        return match[1].trim().substring(0, 60);
      }
    }
  }

  // Fallback: primeira linha significativa que não seja número puro
  for (const line of lines) {
    if (line.length > 8 && !/^\d+$/.test(line) && !/^R\$/.test(line)) {
      return line.substring(0, 60);
    }
  }

  return null;
}

/** Identifica categoria baseado em palavras-chave */
function inferCategory(text: string): string {
  const upper = text.toUpperCase();
  const rules: Record<string, string[]> = {
    'CONTAS': ['LUZ', 'ÁGUA', 'AGUA', 'GÁS', 'GAS', 'ENERGIA', 'ELÉTRICA', 'ELETRICA', 'ENEL', 'SABESP', 'COPASA', 'SANEPAR', 'CEMIG', 'CPFL', 'INTERNET', 'TELEFONE', 'CELULAR', 'NET', 'CLARO', 'VIVO', 'TIM'],
    'MANUTENÇÃO': ['MANUTENÇÃO', 'MANUTENCAO', 'REPARO', 'CONSERTO', 'PINTURA', 'HIDRÁULICO', 'ELÉTRICO', 'AR CONDICIONADO', 'REFORMA'],
    'TAXAS': ['IPTU', 'IPVA', 'IMPOSTO', 'TAXA', 'SEGURO', 'CONDOMÍNIO', 'CONDOMINIO', 'BOLETO', 'PARCELA', 'FINANCIAMENTO', 'TRIBUTO'],
    'LIMPEZA': ['LIMPEZA', 'FAXINA', 'HIGIENIZAÇÃO', 'SANITIZAÇÃO', 'DEDETIZAÇÃO'],
    'LOGÍSTICA': ['TRANSPORTE', 'FRETE', 'ENTREGA', 'MUDANÇA', 'CORREIOS', 'SEDEX'],
  };

  for (const [category, keywords] of Object.entries(rules)) {
    if (keywords.some(kw => upper.includes(kw))) return category;
  }
  return 'OUTROS';
}
