/**
 * Chamada única a POST /api/vision/verify-face (checklist, ponto, outbox).
 * Timeout alargado — CompreFace / rede móvel frequentemente ultrapassam 18s.
 */
import { apiFetch } from './auth';
import { agentDebugLog } from '../utils/agentDebugIngest';

const VERIFY_FACE_TIMEOUT_MS = 60_000;

export type FacialAuthModeForApi = 'self_verify' | 'identify';

export type VerifyFaceApiOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; kind: 'error_msg'; message: string }
  | { ok: false; kind: 'no_match'; message?: string }
  | { ok: false; kind: 'network' };

export async function verifyFaceWithApi(
  imageBase64: string,
  facialAuthMode: FacialAuthModeForApi = 'self_verify',
): Promise<VerifyFaceApiOutcome> {
  const raw = String(imageBase64 || '').trim();
  if (!raw || raw.length < 64) {
    return { ok: false, kind: 'error_msg', message: 'Imagem inválida ou vazia.' };
  }
  try {
    const rawResp = await apiFetch('/api/vision/verify-face', {
      method: 'POST',
      timeoutMs: VERIFY_FACE_TIMEOUT_MS,
      body: JSON.stringify({ imageBase64: raw, facialAuthMode }),
    });
    let apiResp: Record<string, unknown>;
    try {
      apiResp = (await rawResp.json()) as Record<string, unknown>;
    } catch {
      agentDebugLog({
        location: 'verifyFaceApi.ts:verifyFaceWithApi',
        message: 'verify_face_json_parse_fail',
        data: { httpStatus: rawResp.status, httpOk: rawResp.ok },
        hypothesisId: 'VF1',
      });
      return { ok: false, kind: 'network' };
    }
    agentDebugLog({
      location: 'verifyFaceApi.ts:verifyFaceWithApi',
      message: 'verify_face_http_body',
      data: {
        httpStatus: rawResp.status,
        httpOk: rawResp.ok,
        hasError: Boolean(apiResp?.error),
        matchTrue: apiResp?.match === true,
      },
      hypothesisId: 'VF1',
    });
    if (apiResp?.error) {
      return { ok: false, kind: 'error_msg', message: String(apiResp.error) };
    }
    if (!rawResp.ok) {
      // #region agent log
      agentDebugLog({
        location: 'verifyFaceApi.ts:verifyFaceWithApi',
        message: 'verify_face_http_not_ok',
        data: {
          httpStatus: rawResp.status,
          bodyMatchFalse: apiResp?.match === false,
        },
        hypothesisId: 'VF2',
      });
      // #endregion
      return { ok: false, kind: 'network' };
    }
    if (apiResp?.match !== true) {
      const nm = typeof apiResp?.message === 'string' ? apiResp.message : undefined;
      return { ok: false, kind: 'no_match', message: nm };
    }
    return { ok: true, data: apiResp };
  } catch {
    agentDebugLog({
      location: 'verifyFaceApi.ts:verifyFaceWithApi',
      message: 'verify_face_throw',
      data: {},
      hypothesisId: 'VF1',
    });
    return { ok: false, kind: 'network' };
  }
}
