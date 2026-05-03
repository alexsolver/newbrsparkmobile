'use strict';

const {
  stripDataUrlBase64,
  recognizeWithIntegration,
  verifyFacePairWithIntegration,
  isFaceMatchNoFaceInImageError,
  pickTopRecognitionMatch,
  flattenRecognitionSubjectCandidates,
  parseComprefaceSubjectName,
} = require('./comprefaceClient');
const { loadUserFacialReferenceBuffers } = require('./userFacialEnrollmentBuffers');
const { mapVerificationFailureToUserMessage } = require('./comprefaceVerificationUserMessages');
const { resolveAppEffectiveTenantId, userMayOperateUnderTenant } = require('./appLoginEffectiveTenant');

const _envSim = process.env.COMPREFACE_MIN_SIMILARITY;
const MIN_SIMILARITY = Math.min(
  0.999,
  Math.max(0.5, _envSim != null && _envSim !== '' ? Number(_envSim) : 0.88)
);

/** Limiar só para modo `identify` (opcional). Se não definido, usa o mesmo que `COMPREFACE_MIN_SIMILARITY`. */
function envMinSimilarityIdentify() {
  const raw = process.env.COMPREFACE_IDENTIFY_MIN_SIMILARITY;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(0.999, Math.max(0.5, n));
  }
  return MIN_SIMILARITY;
}

/** Quantas referências 1:1 pedir em paralelo ao FaceMatch (1–4). `1` por omissão (sequencial) — menos carga no serviço e latência mais previsível no login/ponto. */
function envVerificationRefConcurrency() {
  const n = Number(process.env.COMPREFACE_VERIFICATION_REF_CONCURRENCY);
  const d = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  return Math.min(4, Math.max(1, d));
}

const FACIAL_GALLERY_SYNC_HINT =
  'No painel: Usuários → edite o usuário → Reconhecimento facial → sincronize as fotos de referência (avatar e fotos base na galeria do servidor).';

const NO_FACE_IN_IMAGE_PT_BR =
  'Nenhum rosto foi detectado na imagem enviada. Posicione o rosto de frente para a câmera, com boa iluminação; fotografias de telas, reflexos ou imagens em papel não serão validadas.';

function auditNoFaceInImage(mode, engine) {
  return {
    pending: false,
    deferredValidationFailed: true,
    at: new Date().toISOString(),
    facialAuthMode: mode,
    engine,
    reason: 'compreface_no_face_in_image',
    comprefaceCode: 28,
    message: NO_FACE_IN_IMAGE_PT_BR,
  };
}

/**
 * Em `self_verify`, o CompreFace devolve vários subjects ordenados por similaridade.
 * O primeiro pode ser outro utilizador (rosto parecido / galeria duplicada). Procuramos
 * o candidato que corresponde ao utilizador da sessão (e tenant) acima do limiar.
 * @returns {{ subject: string, similarity: number } | null}
 */
function pickSelfVerifySubjectFromRecognition(
  recognizeJson,
  { tenantId, sessionUserId, minSim, sessionUserHomeTenantId }
) {
  const results = recognizeJson && Array.isArray(recognizeJson.result) ? recognizeJson.result : [];
  if (!results.length) return null;
  const face = results[0];
  const subjects = face && Array.isArray(face.subjects) ? face.subjects : [];
  const tid = String(tenantId || '').trim();
  const sid = String(sessionUserId || '').trim();
  const homeTid = String(sessionUserHomeTenantId || '').trim();
  if (!sid) return null;
  for (const sub of subjects) {
    if (!sub || sub.subject == null || sub.similarity == null) continue;
    const similarity = Number(sub.similarity);
    if (!Number.isFinite(similarity) || similarity < minSim) continue;
    const parsed = parseComprefaceSubjectName(String(sub.subject));
    if (!parsed) continue;
    if (String(parsed.userId) !== sid) continue;
    const pTid = String(parsed.tenantId || '').trim();
    if (tid && pTid !== tid) {
      if (!homeTid || pTid !== homeTid) continue;
    }
    return { subject: String(sub.subject), similarity };
  }
  return null;
}

/**
 * Melhor match do utilizador da sessão em `self_verify` **sem** filtro de limiar.
 * Usado quando o CompreFace ordena outro subject primeiro: o técnico pode estar na
 * lista com score abaixo do mínimo — nesse caso não se deve fazer fallback para o
 * top global (outra pessoa), sob pena de mensagem falsa «não corresponde ao utilizador da OS».
 * @returns {{ subject: string, similarity: number } | null}
 */
function pickSelfVerifyBestSubjectFromRecognition(
  recognizeJson,
  { tenantId, sessionUserId, sessionUserHomeTenantId }
) {
  const results = recognizeJson && Array.isArray(recognizeJson.result) ? recognizeJson.result : [];
  if (!results.length) return null;
  const face = results[0];
  const subjects = face && Array.isArray(face.subjects) ? face.subjects : [];
  const tid = String(tenantId || '').trim();
  const sid = String(sessionUserId || '').trim();
  const homeTid = String(sessionUserHomeTenantId || '').trim();
  if (!sid) return null;
  let best = null;
  for (const sub of subjects) {
    if (!sub || sub.subject == null || sub.similarity == null) continue;
    const similarity = Number(sub.similarity);
    if (!Number.isFinite(similarity)) continue;
    const parsed = parseComprefaceSubjectName(String(sub.subject));
    if (!parsed) continue;
    if (String(parsed.userId) !== sid) continue;
    const pTid = String(parsed.tenantId || '').trim();
    if (tid && pTid !== tid) {
      if (!homeTid || pTid !== homeTid) continue;
    }
    if (!best || similarity > best.similarity) {
      best = { subject: String(sub.subject), similarity };
    }
  }
  return best;
}

/**
 * Utilizador ativo a usar em `identify` quando o subject do FaceMatch aponta para um User **inativo**
 * (galeria antiga): mesma `appAccountId` e mesma tenant «casa» do subject, preferindo quem opera na tenant pedida.
 * @returns {Promise<{ id: string, tenantId: string } | null>}
 */
async function resolveActiveUserForIdentifySubject(prisma, subjectUserId, subjectHomeTenantId, operationalTenantId) {
  const uid = String(subjectUserId || '').trim();
  const homeTid = String(subjectHomeTenantId || '').trim();
  const opTid = String(operationalTenantId || '').trim();
  if (!uid || !homeTid) return null;

  const row = await prisma.user.findFirst({
    where: { id: uid },
    select: { id: true, tenantId: true, isActive: true, appAccountId: true },
  });
  if (!row) return null;
  if (String(row.tenantId || '').trim() !== homeTid) return null;
  if (row.isActive) {
    return { id: row.id, tenantId: String(row.tenantId || '').trim() };
  }
  const acc = row.appAccountId ? String(row.appAccountId).trim() : '';
  if (!acc) return null;

  const sibs = await prisma.user.findMany({
    where: {
      appAccountId: acc,
      tenantId: homeTid,
      isActive: true,
    },
    select: { id: true, tenantId: true },
    orderBy: { updatedAt: 'desc' },
    take: 8,
  });
  if (!sibs.length) return null;
  for (const s of sibs) {
    if (opTid && (await userMayOperateUnderTenant(prisma, s.id, opTid))) {
      return { id: s.id, tenantId: String(s.tenantId || '').trim() };
    }
  }
  return { id: sibs[0].id, tenantId: String(sibs[0].tenantId || '').trim() };
}

/**
 * Em `identify`, percorre candidatos (Recognition) de **todos** os rostos na imagem, ordenados por similaridade.
 * `syncUserToCompreface` grava subjects como `User.tenantId:userId`. Aceita candidato se o utilizador existe,
 * o prefixo do subject bate com `User.tenantId`, e (`subjTenant === tid` OU vínculo via `userMayOperateUnderTenant`).
 * Subjects ligados a utilizadores **inativos** na BD são ignorados ou mapeados para filiação ativa mesma conta (mesma tenant casa).
 * @returns {Promise<{ subject: string, similarity: number, userId: string, subjectTenant: string } | null>}
 */
async function pickIdentifySubjectFromRecognition(recognizeJson, prisma, { tenantId, minSim }) {
  const candidates = flattenRecognitionSubjectCandidates(recognizeJson);
  const tid = String(tenantId || '').trim();
  if (!tid) return null;

  /** @type {Array<{ rawSubject: string, similarity: number, subjUserId: string, subjTenant: string }>} */
  const parsedRows = [];
  for (const sub of candidates) {
    if (!sub || sub.subject == null || sub.similarity == null) continue;
    const similarity = Number(sub.similarity);
    if (!Number.isFinite(similarity) || similarity < minSim) continue;
    const rawSubject = String(sub.subject || '').trim();
    if (!rawSubject) continue;
    const parsed = parseComprefaceSubjectName(rawSubject);
    if (parsed) {
      const subjTenant = String(parsed.tenantId || '').trim();
      const subjUserId = String(parsed.userId || '').trim();
      if (subjUserId && subjTenant) parsedRows.push({ rawSubject, similarity, subjUserId, subjTenant });
    } else {
      parsedRows.push({ rawSubject, similarity, subjUserId: rawSubject, subjTenant: '' });
    }
  }
  if (!parsedRows.length) return null;

  const idSet = [...new Set(parsedRows.map((p) => p.subjUserId))].filter(Boolean);
  const users = await prisma.user.findMany({
    where: { id: { in: idSet } },
    select: { id: true, tenantId: true, isActive: true, appAccountId: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  for (const p of parsedRows) {
    if (!p.subjTenant) {
      const u = byId.get(p.subjUserId);
      if (!u) continue;
      p.subjTenant = String(u.tenantId || '').trim();
    }
    const home = byId.get(p.subjUserId);
    if (!home) continue;
    if (String(home.tenantId || '').trim() !== p.subjTenant) continue;

    const resolved = await resolveActiveUserForIdentifySubject(prisma, p.subjUserId, p.subjTenant, tid);
    if (!resolved) continue;

    if (p.subjTenant === tid || (await userMayOperateUnderTenant(prisma, resolved.id, tid))) {
      return {
        subject: p.rawSubject,
        similarity: p.similarity,
        userId: resolved.id,
        subjectTenant: p.subjTenant,
      };
    }
  }
  return null;
}

function parseMeta(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * Provedor de biometria facial definido no plano (Plan.features.facialVisionProvider).
 */
async function resolveFacialVisionProviderForTenant(tenantId, prisma) {
  if (!tenantId) return 'COMPREFACE';
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: { select: { features: true } } },
  });
  const raw = sub?.plan?.features;
  const feat = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const v = String(feat.facialVisionProvider || 'COMPREFACE')
    .trim()
    .toUpperCase();
  if (v === 'AUTO' || v === 'AWS' || v === 'COMPREFACE') return v;
  return 'COMPREFACE';
}

function pickVisionIntegration(integrations, provider) {
  const vision = integrations.filter((i) => {
    const meta = parseMeta(i.metadata);
    if (!meta || meta.category !== 'COMPUTER_VISION') return false;
    if (i.status !== 'ACTIVE') return false;
    if (provider === 'AWS' && meta.engine !== 'aws_rekognition') return false;
    if (provider === 'COMPREFACE' && meta.engine !== 'compreface') return false;
    if (provider === 'AUTO') return true;
    return true;
  });
  vision.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (provider === 'AUTO') {
    const cf = vision.find((i) => parseMeta(i.metadata)?.engine === 'compreface');
    if (cf) return cf;
    return vision.find((i) => parseMeta(i.metadata)?.engine === 'aws_rekognition');
  }
  return vision[0] || null;
}

/**
 * Verificação facial no servidor — usada pela sincronização de execuções e alinhada ao fluxo da API verify-face.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tenantId: string, sessionUserId: string, mode: 'self_verify'|'identify', imageBuffer: Buffer }} opts
 * @returns {Promise<
 *   | { ok: true; audit: Record<string, unknown> }
 *   | { ok: false; audit: Record<string, unknown> }
 *   | { ok: false; skip: true; reason: string }
 * >}
 */
async function verifyFacialImageBuffer(prisma, opts) {
  const { tenantId, sessionUserId, mode, imageBuffer } = opts;
  const buf = imageBuffer;
  if (!buf || buf.length < 64) {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        message: 'Imagem inválida ou demasiado pequena para validação no servidor.',
      },
    };
  }

  const provider = await resolveFacialVisionProviderForTenant(tenantId, prisma);
  const integrations = await prisma.integration.findMany({ where: { type: 'AI_LLM' } });
  const visionInt = pickVisionIntegration(integrations, provider);

  if (!visionInt) {
    return {
      ok: false,
      skip: true,
      reason: 'no_vision_integration',
      audit: {
        pending: true,
        reason: 'server_no_integration',
        /** Sem `capturedAt` aqui — `resolvePendingFacialAuditsOnSync` reaproveita `bio.capturedAt`. */
        facialAuthMode: mode,
        message:
          provider !== 'AUTO'
            ? 'Integração de biometria facial não configurada no servidor.'
            : 'Nenhuma integração de biometria ativa no servidor.',
      },
    };
  }

  const meta = parseMeta(visionInt.metadata);
  const engine = meta?.engine || 'unknown';

  if (engine === 'aws_rekognition') {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        message:
          'AWS Rekognition ainda não implementado para validação no servidor. Configure outro motor de biometria nas integrações.',
      },
    };
  }

  if (engine !== 'compreface') {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        message: 'Motor de visão não suportado para validação no servidor.',
      },
    };
  }

  /**
   * `self_verify` via Recognition na galeria global falha quando o utilizador não entra no top-N
   * de candidatos (muitos rostos no tenant / scores apertados). Se existir chave de Verification no
   * CompreFace, comparamos a captura 1:1 com avatar + fotos de matrícula do utilizador da sessão.
   * `COMPREFACE_SELF_VERIFY_USE_RECOGNITION_ONLY=1` força só o fluxo antigo (Recognition).
   */
  const useRecognitionOnlySelfVerify =
    String(process.env.COMPREFACE_SELF_VERIFY_USE_RECOGNITION_ONLY || '').trim() === '1';
  if (!useRecognitionOnlySelfVerify && mode === 'self_verify' && tenantId && sessionUserId) {
    const verKey = visionInt.comprefaceVerificationKey && String(visionInt.comprefaceVerificationKey).trim();
    if (verKey) {
      let refs = [];
      try {
        refs = await loadUserFacialReferenceBuffers(prisma, sessionUserId);
      } catch (e) {
        console.warn('[facialRecognitionEngine] loadUserFacialReferenceBuffers', e.message || e);
      }
      if (refs.length > 0) {
        /** Lotes pequenos em paralelo + saída ao atingir o limiar: mais rápido quando a referência correta não é a primeira.
         * Concorrência global = lote × (1 ou 2 pedidos Verification por par); use `COMPREFACE_VERIFICATION_REF_CONCURRENCY=1` para sequencial. */
        const refConcurrency = envVerificationRefConcurrency();
        const validRefs = refs.filter((r) => r.buf && r.buf.length >= 64);
        let best = -1;
        let lastErr = null;
        for (let i = 0; i < validRefs.length; i += refConcurrency) {
          const chunk = validRefs.slice(i, i + refConcurrency);
          const settled = await Promise.allSettled(
            chunk.map(({ buf: refBuf }) =>
              verifyFacePairWithIntegration(visionInt, buf, refBuf, verKey)
            )
          );
          for (const r of settled) {
            if (r.status === 'fulfilled') {
              const sim = r.value;
              if (Number.isFinite(sim) && sim > best) best = sim;
            } else {
              lastErr = r.reason;
            }
          }
          if (best >= MIN_SIMILARITY) break;
        }
        if (best >= MIN_SIMILARITY) {
          /** `tenantId` aqui é o contexto operacional (dedicado / JWT). `User.tenantId` é a org «casa» — não filtrar por ele ou prestadores em cliente falham apesar do motor aceitar. */
          let identified = await prisma.user.findFirst({
            where: { id: sessionUserId, isActive: true },
            select: { id: true, name: true, email: true, role: true },
          });
          let anyUserRow = null;
          if (!identified) {
            anyUserRow = await prisma.user.findFirst({
              where: { id: sessionUserId },
              select: { id: true, isActive: true },
            });
          }
          if (identified) {
            return {
              ok: true,
              audit: {
                pending: false,
                at: new Date().toISOString(),
                engine: 'server',
                confidence: best,
                facialAuthMode: 'self_verify',
                selfVerifyPath: 'compreface_verification',
                identifiedUserId: identified.id,
                identifiedUser: {
                  id: identified.id,
                  name: identified.name,
                  email: identified.email,
                  role: identified.role,
                },
              },
            };
          }
          /* Evita cair silenciosamente no Recognition: a face já bateu as referências (best >= limiar). */
          return {
            ok: false,
            audit: {
              pending: false,
              deferredValidationFailed: true,
              at: new Date().toISOString(),
              facialAuthMode: mode,
              confidence: best,
              selfVerifyPath: 'compreface_verification',
              message:
                anyUserRow && anyUserRow.isActive === false
                  ? 'A sua conta está inativa no sistema. Peça à organização para reativar o utilizador antes de validar a biometria.'
                  : 'A biometria facial foi aceite pelo motor, mas o servidor não encontrou o utilizador ativo correspondente à sessão. Contacte o suporte ou volte a iniciar sessão.',
            },
          };
        }
        if (best >= 0 && best < MIN_SIMILARITY) {
          return {
            ok: false,
            audit: {
              pending: false,
              deferredValidationFailed: true,
              at: new Date().toISOString(),
              facialAuthMode: mode,
              confidence: best,
              selfVerifyPath: 'compreface_verification',
              message: `Confiança abaixo do mínimo (${MIN_SIMILARITY}). ${FACIAL_GALLERY_SYNC_HINT}`,
            },
          };
        }
        if (lastErr) {
          const mapped = mapVerificationFailureToUserMessage(lastErr);
          if (mapped) {
            return {
              ok: false,
              audit: {
                pending: false,
                deferredValidationFailed: true,
                at: new Date().toISOString(),
                facialAuthMode: mode,
                selfVerifyPath: 'compreface_verification',
                message: mapped.message,
              },
            };
          }
        }
      }
    }
  }

  const predictionCountSelf = Math.min(
    20,
    Math.max(8, Number(process.env.COMPREFACE_SELF_VERIFY_PREDICTION_COUNT) || 12)
  );
  const predictionCountIdentify = Math.min(
    20,
    Math.max(
      8,
      Number(process.env.COMPREFACE_IDENTIFY_PREDICTION_COUNT) ||
        Number(process.env.COMPREFACE_SELF_VERIFY_PREDICTION_COUNT) ||
        16
    )
  );
  const predictionCount =
    mode === 'self_verify' ? predictionCountSelf : predictionCountIdentify;

  let recog;
  try {
    recog = await recognizeWithIntegration(visionInt, buf, { predictionCount });
  } catch (e1) {
    if (isFaceMatchNoFaceInImageError(e1)) {
      return { ok: false, audit: auditNoFaceInImage(mode, engine) };
    }
    try {
      recog = await recognizeWithIntegration(visionInt, buf, { predictionCount });
    } catch (e) {
      if (isFaceMatchNoFaceInImageError(e)) {
        return { ok: false, audit: auditNoFaceInImage(mode, engine) };
      }
      console.error('[facialRecognitionEngine] recognize', e);
      return {
        ok: false,
        skip: true,
        reason: 'facial_service_unreachable',
        audit: {
          pending: true,
          reason: 'server_facial_error',
          /** Sem `capturedAt` — merge com auditoria pendente preserva a hora real da captura. */
          facialAuthMode: mode,
          message:
            'Não foi possível contatar o serviço de reconhecimento facial no servidor. Tente mais tarde ou verifique a conexão.',
        },
      };
    }
  }

  const globalTop = pickTopRecognitionMatch(recog.data);
  let sessionUserHomeTenantId = null;
  if (mode === 'self_verify' && sessionUserId) {
    const uHome = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { tenantId: true },
    });
    sessionUserHomeTenantId = uHome?.tenantId ? String(uHome.tenantId) : null;
  }
  let top = null;
  if (mode === 'self_verify' && tenantId && sessionUserId) {
    top = pickSelfVerifySubjectFromRecognition(recog.data, {
      tenantId,
      sessionUserId,
      minSim: MIN_SIMILARITY,
      sessionUserHomeTenantId,
    });
    if (!top) {
      const bestSelf = pickSelfVerifyBestSubjectFromRecognition(recog.data, {
        tenantId,
        sessionUserId,
        sessionUserHomeTenantId,
      });
      if (bestSelf && bestSelf.similarity < MIN_SIMILARITY) {
        return {
          ok: false,
          audit: {
            pending: false,
            deferredValidationFailed: true,
            at: new Date().toISOString(),
            facialAuthMode: mode,
            confidence: bestSelf.similarity,
            message: `Confiança abaixo do mínimo (${MIN_SIMILARITY}). ${FACIAL_GALLERY_SYNC_HINT}`,
          },
        };
      }
    }
  } else if (mode === 'identify') {
    let tidOp = String(tenantId || '').trim();
    if (!tidOp && sessionUserId) {
      const eff = await resolveAppEffectiveTenantId(prisma, sessionUserId);
      if (eff) tidOp = String(eff).trim();
    }
    if (!tidOp && sessionUserId) {
      const u = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { tenantId: true },
      });
      if (u?.tenantId) tidOp = String(u.tenantId).trim();
    }
    const minIdent = envMinSimilarityIdentify();
    top = tidOp
      ? await pickIdentifySubjectFromRecognition(recog.data, prisma, {
          tenantId: tidOp,
          minSim: minIdent,
        })
      : null;
  }
  /* Em `self_verify`, nunca usar `globalTop` quando o candidato da sessão falhou.
   * Em `identify`, também não: o top global pode ser outra pessoa / registo órfão no FaceMatch e
   * levar a «Utilizador reconhecido não encontrado ou inativo» apesar do rosto parecer reconhecido. */
  if (!top && mode !== 'self_verify' && mode !== 'identify') top = globalTop;

  if (!top) {
    const missingVerKey =
      mode === 'self_verify' &&
      !(visionInt.comprefaceVerificationKey && String(visionInt.comprefaceVerificationKey).trim());
    const msgNoTop = missingVerKey
      ? `Falta a chave de Verification do FaceMatch nas Integrações (campo «Verification API Key», além da Recognition). Sem ela a validação só usa a galeria global e costuma falhar mesmo com fotos corretas. ${FACIAL_GALLERY_SYNC_HINT}`
      : `Rosto não reconhecido na galeria do servidor. ${FACIAL_GALLERY_SYNC_HINT}`;
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        ...(missingVerKey ? { missingComprefaceVerificationKey: true } : {}),
        message: msgNoTop,
      },
    };
  }

  const minGate = mode === 'identify' ? envMinSimilarityIdentify() : MIN_SIMILARITY;

  let parsed = null;
  if (mode === 'identify' && top.userId != null) {
    parsed = { tenantId: top.subjectTenant, userId: top.userId };
  } else {
    parsed = parseComprefaceSubjectName(top.subject);
  }
  if (!parsed || !parsed.userId) {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        confidence: top.similarity,
        message: `Registo biométrico inválido no servidor. ${FACIAL_GALLERY_SYNC_HINT}`,
      },
    };
  }

  if (top.similarity < minGate) {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        confidence: top.similarity,
        message: `Confiança abaixo do mínimo (${minGate}). ${FACIAL_GALLERY_SYNC_HINT}`,
      },
    };
  }

  if (mode === 'self_verify' && String(parsed.userId) !== String(sessionUserId)) {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        confidence: top.similarity,
        message: `O rosto não corresponde ao usuário que sincronizou a OS. ${FACIAL_GALLERY_SYNC_HINT}`,
      },
    };
  }

  const identified = await prisma.user.findFirst({
    where: { id: parsed.userId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!identified) {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: mode,
        confidence: top.similarity,
        message: `Utilizador reconhecido não encontrado ou inativo. ${FACIAL_GALLERY_SYNC_HINT}`,
      },
    };
  }

  if (mode === 'identify') {
    return {
      ok: true,
      audit: {
        pending: false,
        at: new Date().toISOString(),
        engine: 'compreface',
        confidence: top.similarity,
        facialAuthMode: 'identify',
        identifiedUser: {
          id: identified.id,
          name: identified.name,
          email: identified.email,
          role: identified.role,
        },
      },
    };
  }

  const selfOk = identified.id === sessionUserId;
  if (!selfOk) {
    return {
      ok: false,
      audit: {
        pending: false,
        deferredValidationFailed: true,
        at: new Date().toISOString(),
        facialAuthMode: 'self_verify',
        confidence: top.similarity,
        message: `Rosto não corresponde ao técnico que submeteu a execução. ${FACIAL_GALLERY_SYNC_HINT}`,
      },
    };
  }

  return {
    ok: true,
    audit: {
      pending: false,
      at: new Date().toISOString(),
      engine: 'server',
      confidence: top.similarity,
      facialAuthMode: 'self_verify',
      identifiedUserId: identified.id,
      identifiedUser: {
        id: identified.id,
        name: identified.name,
        email: identified.email,
        role: identified.role,
      },
    },
  };
}

/**
 * Descarrega imagem HTTP(S) para Buffer (sincronização de execuções).
 */
async function fetchImageBufferFromPublicUrl(url) {
  const u = String(url || '').trim().split('?')[0];
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  try {
    const ctrl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined;
    const res = await fetch(u, { redirect: 'follow', signal: ctrl });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    return buf.length >= 64 ? buf : null;
  } catch (e) {
    console.warn('[facialRecognitionEngine] fetch image failed', u.slice(0, 80), e.message);
    return null;
  }
}

function parseBiometricRaw(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

function firstHttpPhotoUri(val) {
  if (val == null) return null;
  if (Array.isArray(val)) {
    for (const item of val) {
      const s = typeof item === 'string' ? item.trim() : '';
      if (s.startsWith('http://') || s.startsWith('https://')) return s;
    }
    return null;
  }
  const s = String(val).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return null;
}

function cloneResponsesShallow(responses) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return responses;
  const out = { ...responses };
  for (const k of Object.keys(out)) {
    if (k.startsWith('__section_repeat_') && Array.isArray(out[k])) {
      out[k] = out[k].map((row) => (row && typeof row === 'object' ? { ...row } : row));
    }
  }
  return out;
}

function collectResponseScopes(responses) {
  const scopes = [];
  if (!responses || typeof responses !== 'object') return scopes;
  scopes.push(responses);
  for (const k of Object.keys(responses)) {
    if (k.startsWith('__section_repeat_') && Array.isArray(responses[k])) {
      for (const row of responses[k]) {
        if (row && typeof row === 'object') scopes.push(row);
      }
    }
  }
  return scopes;
}

function facialFieldModesFromSchema(schemaData) {
  const m = new Map();
  if (!Array.isArray(schemaData)) return m;
  for (const f of schemaData) {
    if (f && f.type === 'facial_recognition' && f.id) {
      m.set(String(f.id), f.facialAuthMode === 'identify' ? 'identify' : 'self_verify');
    }
  }
  return m;
}

/**
 * Atualiza `campo__biometric` pendente usando a foto já enviada (URL pública).
 * @returns {Promise<number>} número de campos atualizados
 */
async function resolvePendingFacialAuditsOnSync(prisma, { responses, templateId, tenantId, sessionUserId }) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return 0;
  if (!templateId || !tenantId || !sessionUserId) return 0;

  const tmpl = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    select: { schemaData: true },
  });
  const modeByFieldId = facialFieldModesFromSchema(tmpl?.schemaData);

  const scopes = collectResponseScopes(responses);
  let updated = 0;

  for (const scope of scopes) {
    for (const key of Object.keys(scope)) {
      if (!key.endsWith('__biometric')) continue;
      const bio = parseBiometricRaw(scope[key]);
      if (!bio || bio.pending !== true) continue;

      const fieldId = key.slice(0, -'__biometric'.length);
      const photoUri = firstHttpPhotoUri(scope[fieldId]);
      if (!photoUri) {
        console.warn(
          '[facialRecognitionEngine] pending facial sem URL HTTP no campo',
          fieldId,
          '(mantém pendente até próximo sync)'
        );
        continue;
      }

      const mode =
        bio.facialAuthMode === 'identify'
          ? 'identify'
          : modeByFieldId.get(fieldId) === 'identify'
            ? 'identify'
            : 'self_verify';

      const buf = await fetchImageBufferFromPublicUrl(photoUri);
      if (!buf) continue;

      const result = await verifyFacialImageBuffer(prisma, {
        tenantId,
        sessionUserId,
        mode,
        imageBuffer: buf,
      });

      const parseCapturedAtFromHttpUrl = (u) => {
        try {
          const s = String(u || '');
          const qi = s.indexOf('?');
          if (qi < 0) return null;
          const sp = new URLSearchParams(s.slice(qi + 1));
          const raw = sp.get('capturedAt');
          if (!raw) return null;
          const d = new Date(decodeURIComponent(raw));
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        } catch {
          return null;
        }
      };

      const mergeCapture = (audit) => {
        const a = audit && typeof audit === 'object' ? { ...audit } : {};
        /** Pendência original traz a hora de obturador; não deixar `capturedAt` de erros transitórios substituir. */
        if (bio.capturedAt) {
          a.capturedAt = bio.capturedAt;
        } else if (!a.capturedAt && photoUri) {
          const fromUrl = parseCapturedAtFromHttpUrl(photoUri);
          if (fromUrl) a.capturedAt = fromUrl;
        }
        for (const gk of ['captureLat', 'captureLng', 'captureAddr']) {
          if (bio[gk] != null && String(bio[gk]).trim() !== '') {
            a[gk] = bio[gk];
          }
        }
        return a;
      };

      if (result.skip) {
        scope[key] = JSON.stringify(mergeCapture(result.audit));
        updated += 1;
        continue;
      }

      scope[key] = JSON.stringify(mergeCapture(result.audit));
      updated += 1;
    }
  }

  return updated;
}

module.exports = {
  stripDataUrlBase64,
  MIN_SIMILARITY,
  FACIAL_GALLERY_SYNC_HINT,
  /** @deprecated use FACIAL_GALLERY_SYNC_HINT */
  COMPREFACE_SYNC_HINT: FACIAL_GALLERY_SYNC_HINT,
  parseMeta,
  resolveFacialVisionProviderForTenant,
  pickVisionIntegration,
  verifyFacialImageBuffer,
  resolvePendingFacialAuditsOnSync,
  cloneResponsesShallow,
};
