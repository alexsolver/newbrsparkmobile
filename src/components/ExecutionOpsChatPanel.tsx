import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchExecutionOpsChat,
  persistOpsChatReadAck,
  postExecutionOpsChat,
  type ExecutionOpsChatMessage,
} from '../services/executionOpsChat';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

export type ExecutionOpsChatPanelProps = {
  executionId: string;
  colors: ColorPalette;
  /** Quando falso, para o polling e limpa rascunho local. */
  active: boolean;
  /** true = altura limitada (modal); false = ocupa o espaço vertical disponível (ecrã dedicado). */
  compact: boolean;
};

function kindLabel(kind: string): string {
  const k = String(kind || '').toUpperCase();
  if (k === 'GESTOR') return 'Gestor';
  if (k === 'TECH') return 'Técnico';
  return kind || '—';
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** Lista + envio do chat operacional por FT (reutilizado no modal do checklist e no ecrã «Conversas»). */
export function ExecutionOpsChatPanel({ executionId, colors, active, compact }: ExecutionOpsChatPanelProps) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const viewerLocale = useMemo(
    () => user?.preferredChatLocale?.trim() || i18n.language || null,
    [user?.preferredChatLocale, i18n.language],
  );
  const [messages, setMessages] = useState<ExecutionOpsChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        err: { color: '#b91c1c', fontSize: 13, marginTop: 8 },
        thread: compact ? { maxHeight: 360, marginTop: 12 } : { flex: 1, marginTop: 8 },
        threadContent: { paddingBottom: 12, gap: 10 },
        bubble: {
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
        },
        bubbleGestor: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
        bubbleTech: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
        meta: {
          fontSize: 10,
          fontWeight: '800',
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
        },
        body: { fontSize: 14, color: colors.slate, lineHeight: 20 },
        inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
        input: {
          flex: 1,
          minHeight: 44,
          maxHeight: 120,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 15,
          color: colors.slate,
        },
        sendBtn: {
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        sendBtnOff: { opacity: 0.45 },
      }),
    [colors, compact],
  );

  useEffect(() => {
    setMessages([]);
  }, [executionId]);

  const load = useCallback(async () => {
    const id = String(executionId || '').trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchExecutionOpsChat(id, viewerLocale);
      setMessages(rows);
      if (active) await persistOpsChatReadAck(id, rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [executionId, viewerLocale, active]);

  useEffect(() => {
    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setDraft('');
      setError(null);
      return;
    }
    void load();
    pollRef.current = setInterval(() => {
      void load();
    }, 15000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [active, load]);

  useEffect(() => {
    if (!active || messages.length === 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [active, messages]);

  const send = async () => {
    const id = String(executionId || '').trim();
    const text = draft.trim();
    if (!id || !text) return;
    setSending(true);
    setError(null);
    try {
      await postExecutionOpsChat(id, text, viewerLocale);
      setDraft('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={compact ? undefined : { flex: 1 }}>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <ScrollView ref={scrollRef} style={styles.thread} contentContainerStyle={styles.threadContent}>
        {loading && messages.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : (
          messages.map((m) => {
            const isGestor = String(m.senderKind).toUpperCase() === 'GESTOR';
            return (
              <View key={m.id} style={[styles.bubble, isGestor ? styles.bubbleGestor : styles.bubbleTech]}>
                <Text style={styles.meta}>
                  {kindLabel(m.senderKind)} · {m.senderEmail} · {formatWhen(m.createdAt)}
                </Text>
                <Text style={styles.body}>{m.displayBody != null && String(m.displayBody).trim() !== '' ? m.displayBody : m.body}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreva uma mensagem…"
          placeholderTextColor={colors.textLight}
          multiline
          maxLength={8000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
