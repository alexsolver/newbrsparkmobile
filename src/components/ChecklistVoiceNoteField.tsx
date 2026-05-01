import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch, getToken, handleUnauthorizedMaybeSessionInvalidated } from '../services/auth';

const VOICE_NOTE_PHASE_PENDING = 'pending_transcription';

const IOS_AUDIO_SESSION_BUSY_MS = [0, 160, 320, 600, 1000] as const;
const RECORDING_ATTEMPTS = IOS_AUDIO_SESSION_BUSY_MS.length;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** iOS `AVAudioSessionErrorInsufficientPriority` / transient session contention. */
function isIosAudioSessionBusyError(e: unknown): boolean {
  const o = e as { message?: string; code?: number | string } | null;
  const msg = typeof o?.message === 'string' ? o.message : '';
  const code = o?.code;
  if (code === 561017449 || code === '561017449') return true;
  const m = msg.toLowerCase();
  return (
    msg.includes('561017449') ||
    m.includes('session activation failed') ||
    m.includes('insufficientpriority') ||
    msg.includes('!pri')
  );
}

async function applyVoiceRecordingAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    staysActiveInBackground: false,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/** Release recording flag so the next `setActive` can succeed after contention. */
async function releaseVoiceRecordingAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    staysActiveInBackground: false,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export type VoiceNoteStoredValue = {
  transcript?: string;
  phase?: 'idle' | 'recording' | 'uploading' | 'done' | 'error' | 'pending_transcription';
  status?: 'pending_transcription' | 'completed';
  error?: string;
  localUri?: string;
  mimeType?: string;
  fileName?: string;
  language?: string;
  pendingSince?: string;
  lastAttemptAt?: string;
};

export function parseVoiceNoteValue(raw: unknown): VoiceNoteStoredValue {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return j && typeof j === 'object' ? (j as VoiceNoteStoredValue) : {};
    } catch {
      return raw.trim() ? { transcript: raw, phase: 'done', status: 'completed' } : {};
    }
  }
  if (typeof raw === 'object') return raw as VoiceNoteStoredValue;
  return {};
}

export function voiceNoteHasPendingTranscription(raw: unknown): boolean {
  const p = parseVoiceNoteValue(raw);
  const phase = String(p.phase || p.status || '').toLowerCase();
  const localUri = String(p.localUri || '').trim();
  const hasTranscript = String(p.transcript || '').trim().length > 0;
  return !hasTranscript && phase === VOICE_NOTE_PHASE_PENDING && !!localUri;
}

type Props = {
  value: unknown;
  onChange: (next: VoiceNoteStoredValue) => void;
  readOnly?: boolean;
  /** pt-br, en, … (servidor normaliza pt-* → pt para Whisper) */
  transcribeLanguage?: string;
};

export function ChecklistVoiceNoteField({
  value,
  onChange,
  readOnly,
  transcribeLanguage = 'pt-br',
}: Props) {
  const { t } = useTranslation();
  const parsed = parseVoiceNoteValue(value);
  const [phase, setPhase] = useState<VoiceNoteStoredValue['phase']>(parsed.phase || 'idle');
  const [transcript, setTranscript] = useState(String(parsed.transcript || '').trim());
  const [errMsg, setErrMsg] = useState(String(parsed.error || '').trim());
  const [pendingLocalUri, setPendingLocalUri] = useState(String(parsed.localUri || '').trim());
  const [pendingMimeType, setPendingMimeType] = useState(String(parsed.mimeType || '').trim());
  const [pendingFileName, setPendingFileName] = useState(String(parsed.fileName || '').trim());
  const recordingRef = useRef<InstanceType<typeof Audio.Recording> | null>(null);
  const mounted = useRef(true);
  const transcribingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const r = recordingRef.current;
      if (r) {
        r.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      void releaseVoiceRecordingAudioMode().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const p = parseVoiceNoteValue(value);
    if (p.transcript != null) setTranscript(String(p.transcript).trim());
    if (p.error != null) setErrMsg(String(p.error).trim());
    setPendingLocalUri(String(p.localUri || '').trim());
    setPendingMimeType(String(p.mimeType || '').trim());
    setPendingFileName(String(p.fileName || '').trim());
    if (p.phase && p.phase !== 'recording' && p.phase !== 'uploading') setPhase(p.phase);
  }, [value]);

  const emitState = useCallback(
    (patch: Partial<VoiceNoteStoredValue>) => {
      const nextPhase = patch.phase ?? phase;
      const nextTranscript =
        patch.transcript !== undefined ? String(patch.transcript || '').trim() : transcript;
      const nextError =
        patch.error !== undefined ? String(patch.error || '').trim() : errMsg;
      const nextLocalUri =
        patch.localUri !== undefined ? String(patch.localUri || '').trim() : pendingLocalUri;
      const nextMimeType =
        patch.mimeType !== undefined ? String(patch.mimeType || '').trim() : pendingMimeType;
      const nextFileName =
        patch.fileName !== undefined ? String(patch.fileName || '').trim() : pendingFileName;
      const nextLanguage = String(patch.language || transcribeLanguage || 'pt-br').slice(0, 8);

      const next: VoiceNoteStoredValue = {
        transcript: nextTranscript,
        phase: nextPhase,
        status: nextPhase === VOICE_NOTE_PHASE_PENDING ? 'pending_transcription' : 'completed',
        error: nextError || undefined,
        localUri: nextLocalUri || undefined,
        mimeType: nextMimeType || undefined,
        fileName: nextFileName || undefined,
        language: nextLanguage,
        pendingSince:
          patch.pendingSince !== undefined
            ? patch.pendingSince || undefined
            : nextPhase === VOICE_NOTE_PHASE_PENDING
              ? parsed.pendingSince || new Date().toISOString()
              : undefined,
        lastAttemptAt:
          patch.lastAttemptAt !== undefined
            ? patch.lastAttemptAt || undefined
            : nextPhase === VOICE_NOTE_PHASE_PENDING
              ? new Date().toISOString()
              : undefined,
      };

      if (next.phase !== VOICE_NOTE_PHASE_PENDING && !nextTranscript) {
        next.status = undefined;
      }
      if (next.phase === 'done') {
        next.status = 'completed';
        delete next.localUri;
      }
      if (!next.error) delete next.error;
      if (!next.localUri) delete next.localUri;
      if (!next.mimeType) delete next.mimeType;
      if (!next.fileName) delete next.fileName;
      if (!next.language) delete next.language;
      if (!next.pendingSince) delete next.pendingSince;
      if (!next.lastAttemptAt) delete next.lastAttemptAt;

      onChange(next);
    },
    [
      errMsg,
      onChange,
      parsed.pendingSince,
      pendingFileName,
      pendingLocalUri,
      pendingMimeType,
      phase,
      transcript,
      transcribeLanguage,
    ],
  );

  const markPending = useCallback(
    (
      uri: string,
      opts?: {
        message?: string;
        mimeType?: string;
        fileName?: string;
      },
    ) => {
      const msg = String(opts?.message || '').trim();
      const mime = String(opts?.mimeType || pendingMimeType || 'audio/m4a').trim();
      const fileName = String(opts?.fileName || pendingFileName || 'nota_voz.m4a').trim();
      setPendingLocalUri(uri);
      setPendingMimeType(mime);
      setPendingFileName(fileName);
      setErrMsg(msg);
      setPhase(VOICE_NOTE_PHASE_PENDING);
      emitState({
        phase: VOICE_NOTE_PHASE_PENDING,
        error: msg,
        localUri: uri,
        mimeType: mime,
        fileName,
        pendingSince: parsed.pendingSince || new Date().toISOString(),
        lastAttemptAt: new Date().toISOString(),
      });
    },
    [emitState, parsed.pendingSince, pendingFileName, pendingMimeType],
  );

  const transcribeFromUri = useCallback(
    async (
      uri: string,
      opts?: {
        mimeType?: string;
        fileName?: string;
        quietIfOffline?: boolean;
      },
    ): Promise<boolean> => {
      if (!uri || readOnly || transcribingRef.current) return false;
      transcribingRef.current = true;
      const fileName = String(opts?.fileName || pendingFileName || 'nota_voz.m4a').trim() || 'nota_voz.m4a';
      const mimeType = String(opts?.mimeType || pendingMimeType || 'audio/m4a').trim() || 'audio/m4a';
      const language = String(transcribeLanguage || 'pt-br').slice(0, 8);
      setPhase('uploading');
      setErrMsg('');
      emitState({
        phase: 'uploading',
        error: '',
        localUri: uri,
        mimeType,
        fileName,
        language,
        lastAttemptAt: new Date().toISOString(),
      });

      try {
        const net = await Network.getNetworkStateAsync();
        if (net.isConnected === false) {
          if (!opts?.quietIfOffline) {
            markPending(uri, {
              message:
                'Sem internet agora. A nota foi guardada e será transcrita automaticamente quando voltar a conexão.',
              mimeType,
              fileName,
            });
          } else {
            setPhase(VOICE_NOTE_PHASE_PENDING);
          }
          return false;
        }

        const token = await getToken();
        if (!token) {
          markPending(uri, {
            message: 'Sessão expirada. Faça login novamente; a transcrição será retomada automaticamente.',
            mimeType,
            fileName,
          });
          return false;
        }

        const form = new FormData();
        form.append('language', language);
        form.append(
          'audio',
          {
            uri,
            type: mimeType,
            name: fileName,
          } as any,
        );

        const res = await apiFetch('/api/checklists/voice/transcribe', {
          method: 'POST',
          body: form,
          timeoutMs: 120_000,
        });
        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(res.status >= 500 ? 'Resposta inválida do servidor.' : text.slice(0, 240));
        }
        if (res.status === 401) {
          await handleUnauthorizedMaybeSessionInvalidated(res);
        }
        if (!res.ok) {
          throw new Error(String(json?.error || `Erro HTTP ${res.status}`));
        }
        const tr = String(json?.transcript || '').trim();
        if (!tr) {
          throw new Error('Transcrição vazia.');
        }
        if (!mounted.current) return true;
        setTranscript(tr);
        setPhase('done');
        setErrMsg('');
        setPendingLocalUri('');
        setPendingMimeType('');
        setPendingFileName('');
        onChange({
          transcript: tr,
          phase: 'done',
          status: 'completed',
          language,
        });
        return true;
      } catch (e: any) {
        const msg = String(e?.message || 'Falha na transcrição.').trim();
        if (!mounted.current) return false;
        markPending(uri, { message: msg, mimeType, fileName });
        return false;
      } finally {
        transcribingRef.current = false;
      }
    },
    [
      emitState,
      markPending,
      onChange,
      pendingFileName,
      pendingMimeType,
      readOnly,
      transcribeLanguage,
    ],
  );

  useEffect(() => {
    if (readOnly) return;
    const shouldRetry =
      (phase === VOICE_NOTE_PHASE_PENDING || String(parsed.status || '').toLowerCase() === VOICE_NOTE_PHASE_PENDING) &&
      pendingLocalUri;
    if (!shouldRetry) return;

    let cancelled = false;
    const tryNow = async () => {
      if (cancelled || transcribingRef.current) return;
      const net = await Network.getNetworkStateAsync();
      if (cancelled || net.isConnected === false) return;
      await transcribeFromUri(pendingLocalUri, {
        mimeType: pendingMimeType,
        fileName: pendingFileName,
        quietIfOffline: true,
      });
    };

    void tryNow();

    const sub = Network.addNetworkStateListener((state) => {
      if (cancelled || !state.isConnected || transcribingRef.current) return;
      void transcribeFromUri(pendingLocalUri, {
        mimeType: pendingMimeType,
        fileName: pendingFileName,
        quietIfOffline: true,
      });
    });
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, [
    parsed.status,
    pendingFileName,
    pendingLocalUri,
    pendingMimeType,
    phase,
    readOnly,
    transcribeFromUri,
  ]);

  const startRecording = useCallback(async () => {
    if (readOnly) return;
    setErrMsg('');
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('appAlerts.techReg.permTitle'), t('appAlerts.voice.micRequired'));
        return;
      }

      const stuck = recordingRef.current;
      if (stuck) {
        recordingRef.current = null;
        try {
          await stuck.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        await sleep(80);
      }

      for (let attempt = 0; attempt < RECORDING_ATTEMPTS; attempt++) {
        const waitMs = IOS_AUDIO_SESSION_BUSY_MS[attempt];
        if (waitMs > 0) {
          await sleep(waitMs);
          try {
            await releaseVoiceRecordingAudioMode();
          } catch {
            /* ignore */
          }
          await sleep(Platform.OS === 'ios' ? 90 : 40);
        }

        await applyVoiceRecordingAudioMode();

        let rec: InstanceType<typeof Audio.Recording> | null = null;
        try {
          rec = new Audio.Recording();
          await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
          await rec.startAsync();
          recordingRef.current = rec;
          setPhase('recording');
          emitState({ phase: 'recording', error: '' });
          return;
        } catch (e) {
          if (rec) {
            try {
              await rec.stopAndUnloadAsync();
            } catch {
              /* ignore */
            }
          }
          const retriable = Platform.OS === 'ios' && isIosAudioSessionBusyError(e);
          const more = attempt < RECORDING_ATTEMPTS - 1;
          if (!retriable || !more) {
            throw e;
          }
        }
      }
    } catch (e: any) {
      const busy = Platform.OS === 'ios' && isIosAudioSessionBusyError(e);
      const msg = busy
        ? t('appAlerts.voice.sessionBusy')
        : e?.message || 'Não foi possível iniciar a gravação.';
      setErrMsg(msg);
      setPhase('error');
      emitState({ phase: 'error', error: msg });
    }
  }, [emitState, readOnly, t]);

  const stopAndTranscribe = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec || readOnly) return;
    recordingRef.current = null;
    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch (e: any) {
      const msg = e?.message || 'Falha ao finalizar a gravação.';
      setErrMsg(msg);
      setPhase('error');
      emitState({ phase: 'error', error: msg });
      return;
    } finally {
      try {
        await releaseVoiceRecordingAudioMode();
      } catch {
        /* ignore */
      }
    }
    if (!uri) {
      const msg = 'Gravação sem arquivo.';
      setErrMsg(msg);
      setPhase('error');
      emitState({ phase: 'error', error: msg });
      return;
    }

    await transcribeFromUri(uri, {
      mimeType: 'audio/m4a',
      fileName: `nota_voz_${Date.now()}.m4a`,
    });
  }, [emitState, readOnly, transcribeFromUri]);

  const retryPendingNow = useCallback(() => {
    if (!pendingLocalUri || readOnly) return;
    void transcribeFromUri(pendingLocalUri, {
      mimeType: pendingMimeType,
      fileName: pendingFileName,
    });
  }, [pendingFileName, pendingLocalUri, pendingMimeType, readOnly, transcribeFromUri]);

  const clearNote = useCallback(() => {
    if (readOnly) return;
    setTranscript('');
    setErrMsg('');
    setPhase('idle');
    setPendingLocalUri('');
    setPendingMimeType('');
    setPendingFileName('');
    onChange({ transcript: '', phase: 'idle' });
  }, [readOnly, onChange]);

  const isRecording = phase === 'recording';
  const isBusy = phase === 'uploading';
  const isPending = phase === VOICE_NOTE_PHASE_PENDING && !!pendingLocalUri;

  return (
    <View style={styles.wrap}>
      {!readOnly ? (
        <View style={styles.row}>
          {!isRecording ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={startRecording}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              {isBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="mic" size={22} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Gravar</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={stopAndTranscribe}
              activeOpacity={0.85}
            >
              <Ionicons name="stop-circle" size={24} color="#fff" />
              <Text style={styles.btnPrimaryText}>Parar e transcrever</Text>
            </TouchableOpacity>
          )}
          {(transcript || errMsg || isPending) && !isRecording && !isBusy ? (
            <TouchableOpacity style={styles.btnGhost} onPress={clearNote} hitSlop={10}>
              <Text style={styles.ghostText}>Limpar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {isRecording ? (
        <Text style={styles.hint}>A gravar... fale ao microfone e toque em "Parar e transcrever".</Text>
      ) : null}
      {isBusy ? <Text style={styles.hint}>A enviar e a transcrever no servidor...</Text> : null}

      {isPending ? (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>Transcrição pendente</Text>
          <Text style={styles.pendingText}>
            Áudio guardado no dispositivo. Quando houver internet/sessão válida, a transcrição será retomada automaticamente.
          </Text>
          {!readOnly ? (
            <TouchableOpacity style={styles.pendingRetryBtn} onPress={retryPendingNow} activeOpacity={0.88}>
              <Text style={styles.pendingRetryText}>Tentar agora</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {errMsg && !isPending ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{errMsg}</Text>
        </View>
      ) : null}

      {transcript ? (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>Transcrição</Text>
          <Text style={styles.transcriptBody} selectable>
            {transcript}
          </Text>
        </View>
      ) : !readOnly && phase === 'idle' ? (
        <Text style={styles.muted}>Grave uma nota - o texto aparece aqui após a transcrição (OpenAI Whisper).</Text>
      ) : null}
    </View>
  );
}

export function voiceNoteValueIsFilled(raw: unknown): boolean {
  const p = parseVoiceNoteValue(raw);
  const tr = String(p.transcript || '').trim();
  if (tr.length > 0) return true;
  const st = String(p.phase || p.status || '').toLowerCase();
  const lu = String(p.localUri || '').trim();
  return st === VOICE_NOTE_PHASE_PENDING && !!lu;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  btnPrimary: { backgroundColor: '#4f46e5' },
  btnDanger: { backgroundColor: '#b91c1c' },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { paddingVertical: 8, paddingHorizontal: 4 },
  ghostText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 13, color: '#475569', lineHeight: 19 },
  pendingBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 8,
  },
  pendingTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  pendingText: { fontSize: 13, color: '#78350f', lineHeight: 19 },
  pendingRetryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#d97706',
  },
  pendingRetryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  errBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errText: { fontSize: 13, color: '#991b1b', lineHeight: 19 },
  transcriptBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  transcriptLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 6 },
  transcriptBody: { fontSize: 15, color: '#0f172a', lineHeight: 22 },
  muted: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
});
