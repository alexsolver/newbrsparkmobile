import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, getToken, handleUnauthorizedMaybeSessionInvalidated } from '../services/auth';

export type VoiceNoteStoredValue = {
  transcript?: string;
  phase?: 'idle' | 'recording' | 'uploading' | 'done' | 'error';
  error?: string;
};

function parseVoiceValue(raw: unknown): VoiceNoteStoredValue {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return j && typeof j === 'object' ? j : {};
    } catch {
      return raw.trim() ? { transcript: raw, phase: 'done' } : {};
    }
  }
  if (typeof raw === 'object') return raw as VoiceNoteStoredValue;
  return {};
}

type Props = {
  value: unknown;
  onChange: (next: VoiceNoteStoredValue) => void;
  readOnly?: boolean;
  /** Whisper: pt, en, … */
  transcribeLanguage?: string;
};

export function ChecklistVoiceNoteField({
  value,
  onChange,
  readOnly,
  transcribeLanguage = 'pt',
}: Props) {
  const parsed = parseVoiceValue(value);
  const [phase, setPhase] = useState<VoiceNoteStoredValue['phase']>(parsed.phase || 'idle');
  const [transcript, setTranscript] = useState(String(parsed.transcript || '').trim());
  const [errMsg, setErrMsg] = useState(String(parsed.error || '').trim());
  const recordingRef = useRef<InstanceType<typeof Audio.Recording> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const r = recordingRef.current;
      if (r) {
        r.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const p = parseVoiceValue(value);
    if (p.transcript != null) setTranscript(String(p.transcript).trim());
    if (p.error != null) setErrMsg(String(p.error).trim());
    if (p.phase && p.phase !== 'recording' && p.phase !== 'uploading') setPhase(p.phase);
  }, [value]);

  const pushState = useCallback(
    (patch: VoiceNoteStoredValue) => {
      const next: VoiceNoteStoredValue = {
        transcript: patch.transcript !== undefined ? patch.transcript : transcript,
        phase: patch.phase ?? phase,
        error: patch.error !== undefined ? patch.error : errMsg || undefined,
      };
      if (!next.error) delete next.error;
      onChange(next);
    },
    [onChange, transcript, phase, errMsg],
  );

  const startRecording = useCallback(async () => {
    if (readOnly) return;
    setErrMsg('');
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão', 'É necessário permitir o microfone para gravar a nota de voz.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setPhase('recording');
      pushState({ phase: 'recording', error: '' });
    } catch (e: any) {
      const msg = e?.message || 'Não foi possível iniciar a gravação.';
      setErrMsg(msg);
      setPhase('error');
      pushState({ phase: 'error', error: msg });
    }
  }, [readOnly, pushState]);

  const stopAndTranscribe = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec || readOnly) return;
    recordingRef.current = null;
    setPhase('uploading');
    pushState({ phase: 'uploading', error: '' });
    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch (e: any) {
      const msg = e?.message || 'Falha ao finalizar a gravação.';
      setErrMsg(msg);
      setPhase('error');
      pushState({ phase: 'error', error: msg });
      return;
    }
    if (!uri) {
      const msg = 'Gravação sem ficheiro.';
      setErrMsg(msg);
      setPhase('error');
      pushState({ phase: 'error', error: msg });
      return;
    }

    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected === false) {
        throw new Error('Sem ligação à internet. A transcrição é feita no servidor — conecte-se e tente de novo.');
      }
    } catch (e: any) {
      if (e?.message) {
        setErrMsg(e.message);
        setPhase('error');
        pushState({ phase: 'error', error: e.message });
        return;
      }
    }

    const token = await getToken();
    if (!token) {
      const msg = 'Faça login novamente para transcrever.';
      setErrMsg(msg);
      setPhase('error');
      pushState({ phase: 'error', error: msg });
      return;
    }

    try {
      const form = new FormData();
      form.append('language', String(transcribeLanguage || 'pt').slice(0, 8));
      form.append('audio', {
        uri,
        type: 'audio/m4a',
        name: 'nota_voz.m4a',
      } as any);

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
      if (!mounted.current) return;
      setTranscript(tr);
      setPhase('done');
      setErrMsg('');
      onChange({ transcript: tr, phase: 'done' });
    } catch (e: any) {
      const msg = e?.message || 'Falha na transcrição.';
      if (!mounted.current) return;
      setErrMsg(msg);
      setPhase('error');
      onChange({ transcript, phase: 'error', error: msg });
    }
  }, [readOnly, transcribeLanguage, onChange, transcript]);

  const clearNote = useCallback(() => {
    if (readOnly) return;
    setTranscript('');
    setErrMsg('');
    setPhase('idle');
    onChange({ transcript: '', phase: 'idle' });
  }, [readOnly, onChange]);

  const isRecording = phase === 'recording';
  const isBusy = phase === 'uploading';

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
          {(transcript || errMsg) && !isRecording && !isBusy ? (
            <TouchableOpacity style={styles.btnGhost} onPress={clearNote} hitSlop={10}>
              <Text style={styles.ghostText}>Limpar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {isRecording ? (
        <Text style={styles.hint}>A gravar… fale ao microfone e toque em «Parar e transcrever».</Text>
      ) : null}
      {isBusy ? <Text style={styles.hint}>A enviar e a transcrever no servidor…</Text> : null}

      {errMsg ? (
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
        <Text style={styles.muted}>Grave uma nota — o texto aparece aqui após a transcrição (OpenAI Whisper).</Text>
      ) : null}
    </View>
  );
}

export function voiceNoteValueIsFilled(raw: unknown): boolean {
  const p = parseVoiceValue(raw);
  return String(p.transcript || '').trim().length > 0;
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
