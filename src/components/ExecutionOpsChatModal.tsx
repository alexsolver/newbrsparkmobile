import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  postExecutionOpsChat,
  type ExecutionOpsChatMessage,
} from '../services/executionOpsChat';

type Props = {
  visible: boolean;
  executionId: string;
  onClose: () => void;
  colors: ColorPalette;
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

export function ExecutionOpsChatModal({ visible, executionId, onClose, colors }: Props) {
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
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.45)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.cardWhite,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 20,
          maxHeight: '88%',
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        title: { fontSize: 18, fontWeight: '800', color: colors.slate, flex: 1 },
        hint: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: 8,
          lineHeight: 18,
        },
        err: { color: '#b91c1c', fontSize: 13, marginTop: 8 },
        thread: { maxHeight: 360, marginTop: 12 },
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
    [colors],
  );

  const load = useCallback(async () => {
    const id = String(executionId || '').trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchExecutionOpsChat(id);
      setMessages(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    if (!visible) {
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
  }, [visible, load]);

  useEffect(() => {
    if (!visible || messages.length === 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [visible, messages]);

  const send = async () => {
    const id = String(executionId || '').trim();
    const text = draft.trim();
    if (!id || !text) return;
    setSending(true);
    setError(null);
    try {
      await postExecutionOpsChat(id, text);
      setDraft('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Chat com o gestor</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Fechar" hitSlop={12}>
              <Ionicons name="close" size={28} color={colors.slate} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Mensagens ficam registadas nesta FT (auditoria). Só você e a equipe no painel veem este fio.
          </Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <ScrollView ref={scrollRef} style={styles.thread} contentContainerStyle={styles.threadContent}>
            {loading && messages.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : (
              messages.map((m) => {
                const isGestor = String(m.senderKind).toUpperCase() === 'GESTOR';
                return (
                  <View
                    key={m.id}
                    style={[styles.bubble, isGestor ? styles.bubbleGestor : styles.bubbleTech]}
                  >
                    <Text style={styles.meta}>
                      {kindLabel(m.senderKind)} · {m.senderEmail} · {formatWhen(m.createdAt)}
                    </Text>
                    <Text style={styles.body}>{m.body}</Text>
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
      </View>
    </Modal>
  );
}
