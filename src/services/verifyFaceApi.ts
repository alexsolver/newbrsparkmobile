/**
 * Chamada única a POST /api/vision/verify-face (checklist, ponto, outbox).
 * Timeout alargado — CompreFace / rede móvel frequentemente ultrapassam 18s.
 */
import { apiFetch } from './auth';

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
      return { ok: false, kind: 'network' };
    }
    if (apiResp?.error) {
      return { ok: false, kind: 'error_msg', message: String(apiResp.error) };
    }
    if (!rawResp.ok) {
      return { ok: false, kind: 'network' };
    }
    if (apiResp?.match !== true) {
      const nm = typeof apiResp?.message === 'string' ? apiResp.message : undefined;
      return { ok: false, kind: 'no_match', message: nm };
    }
    return { ok: true, data: apiResp };
  } catch {
    return { ok: false, kind: 'network' };
  }
}
