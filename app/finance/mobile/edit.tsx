import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../../src/theme/ThemeContext';
import { ScreenSubheader } from '../../../src/components/ScreenSubheader';
import { ValueInput, parseLocaleAmountString } from '../../../src/components/ValueInput';
import { TechnicianExpenseCategoryChips } from '../../../src/components/TechnicianExpenseCategoryChips';
import { TechnicianFinanceService } from '../../../src/services/technicianFinanceService';
import { useAuth } from '../../../src/hooks/useAuth';
import type { TechnicianFinanceAttachment, TechnicianFinanceKind } from '../../../src/types/technicianFinance';
import {
  loadLinkableTasksForTechnicianExpense,
  type LinkableExpenseTask,
} from '../../../src/utils/technicianFinanceLinkableTasks';

const MAX_ATTACHMENTS = 10;

type LocalAttachment = TechnicianFinanceAttachment & { _localId: string };

function guessMime(uri: string, name?: string): string | undefined {
  const lower = (name || uri).toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function isProbablyImage(att: LocalAttachment) {
  const m = att.mimeType?.toLowerCase() || '';
  if (m.startsWith('image/')) return true;
  const n = (att.name || att.uri).toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(n);
}

function baseDescriptionWithoutRateio(desc?: string): string {
  if (!desc) return '';
  return desc.replace(/\s*\(rateio\s+\d+\s*\/\s*\d+\)\s*$/i, '').trim();
}

export default function EditTechnicianFinanceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { ids: idsParam } = useLocalSearchParams<{ ids?: string }>();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(C), [C]);

  const entryIds = useMemo(
    () =>
      String(idsParam || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [idsParam]
  );

  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [kind, setKind] = useState<TechnicianFinanceKind>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [linkableOs, setLinkableOs] = useState<LinkableExpenseTask[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [selectedOsIds, setSelectedOsIds] = useState<string[]>([]);
  const [financeValueUnlocked, setFinanceValueUnlocked] = useState(false);
  /** Despesa com OS guardada: valor/descrição/anexos fechados até revisão. */
  const [expenseValueLockActive, setExpenseValueLockActive] = useState(false);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const amountDraftRef = useRef('');
  const amountEditingRef = useRef(false);

  const valueFieldsLocked = expenseValueLockActive && !financeValueUnlocked;

  const screenTitle = useMemo(() => {
    if (financeValueUnlocked) return 'Corrigir lançamento';
    if (valueFieldsLocked) return 'Ajustar rateio';
    return 'Editar lançamento';
  }, [financeValueUnlocked, valueFieldsLocked]);

  const refreshLinkableOs = useCallback(async () => {
    setLinkableLoading(true);
    try {
      const list = await loadLinkableTasksForTechnicianExpense();
      setLinkableOs(list);
    } catch {
      setLinkableOs([]);
    } finally {
      setLinkableLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLinkableOs();
    }, [refreshLinkableOs])
  );

  useEffect(() => {
    if (kind === 'revenue') setSelectedOsIds([]);
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (entryIds.length === 0) {
        setLoading(false);
        setBlocked(true);
        return;
      }
      setLoading(true);
      try {
        const parts = [];
        for (const id of entryIds) {
          const e = await TechnicianFinanceService.getEntryById(id);
          if (e) parts.push(e);
        }
        if (parts.length !== entryIds.length || parts.some((p) => p.source !== 'manual')) {
          if (!cancelled) {
            setBlocked(true);
            Alert.alert(t('appAlerts.finance.notEditableTitle'), t('appAlerts.finance.notEditableBody'), [
              { text: t('common.ok'), onPress: () => router.back() },
            ]);
          }
          return;
        }

        parts.sort((a, b) => {
          const pa = String(a.id).split('_');
          const pb = String(b.id).split('_');
          return (Number(pa[3]) || 0) - (Number(pb[3]) || 0);
        });

        const k0 = parts[0].kind;
        const total = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const osOrder: string[] = [];
        for (const p of parts) {
          const tid = p.taskId ? String(p.taskId) : '';
          if (tid && !osOrder.includes(tid)) osOrder.push(tid);
        }
        let desc0 = '';
        for (const p of parts) {
          const b = baseDescriptionWithoutRateio(p.description);
          if (b && (!desc0 || b.length > desc0.length)) desc0 = b;
        }

        const atts: LocalAttachment[] = [];
        const seen = (parts[0].attachments || []).map((a, i) => ({
          ...a,
          _localId: `keep_${i}_${a.uri}`,
        }));
        for (const a of seen) atts.push(a);

        if (!cancelled) {
          const unlocked = parts.length > 0 && parts.every((p) => p.financeValueUnlocked === true);
          setKind(k0);
          setAmountStr(String(total));
          setDescription(desc0);
          setSelectedOsIds(osOrder);
          setAttachments(atts);
          setFinanceValueUnlocked(unlocked);
          setExpenseValueLockActive(k0 === 'expense' && osOrder.length > 0 && !unlocked);
          setCategoryKey(
            k0 === 'expense'
              ? parts[0].categoryKey != null && String(parts[0].categoryKey).trim() !== ''
                ? String(parts[0].categoryKey).trim()
                : null
              : null
          );
          setBlocked(false);
        }
      } catch {
        if (!cancelled) {
          setBlocked(true);
          Alert.alert(t('common.error'), t('appAlerts.finance.loadError'), [
            { text: t('common.ok'), onPress: () => router.back() },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryIds, router, t]);

  const toggleOs = (id: string) => {
    setSelectedOsIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const appendAttachments = (items: TechnicianFinanceAttachment[]) => {
    setAttachments((prev) => {
      const room = MAX_ATTACHMENTS - prev.length;
      if (room <= 0) return prev;
      const slice = items.slice(0, room);
      const next = slice.map((a) => ({
        ...a,
        _localId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      }));
      if (items.length > room) {
        Alert.alert(t('common.attention'), t('appAlerts.finance.attachLimit', { max: MAX_ATTACHMENTS }));
      }
      return [...prev, ...next];
    });
  };

  const pickAttachments = () => {
    if (valueFieldsLocked) {
      Alert.alert(t('appAlerts.finance.attachClosedTitle'), t('appAlerts.finance.attachClosedBody'));
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert(t('common.attention'), t('appAlerts.finance.attachLimitReached', { max: MAX_ATTACHMENTS }));
      return;
    }
    Alert.alert(t('appAlerts.finance.attachPickerTitle'), t('appAlerts.finance.attachPickerBody'), [
      {
        text: t('documents.camera'),
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(t('appAlerts.techReg.permTitle'), t('appAlerts.finance.cameraRequired'));
            return;
          }
          const res = await ImagePicker.launchCameraAsync({ quality: 0.75 });
          if (!res.canceled && res.assets?.[0]?.uri) {
            const uri = res.assets[0].uri;
            appendAttachments([{ uri, mimeType: guessMime(uri) }]);
          }
        },
      },
      {
        text: t('documents.gallery'),
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({
            quality: 0.75,
            allowsMultipleSelection: true,
            selectionLimit: MAX_ATTACHMENTS - attachments.length,
          });
          if (!res.canceled && res.assets?.length) {
            appendAttachments(
              res.assets.map((a) => ({
                uri: a.uri,
                mimeType: a.mimeType || guessMime(a.uri),
              }))
            );
          }
        },
      },
      {
        text: t('documents.file'),
        onPress: async () => {
          const res = await DocumentPicker.getDocumentAsync({
            type: ['image/*', 'application/pdf', '*/*'],
            copyToCacheDirectory: true,
            multiple: true,
          });
          if (res.canceled || !res.assets?.length) return;
          appendAttachments(
            res.assets.map((a) => ({
              uri: a.uri,
              name: a.name,
              mimeType: a.mimeType || guessMime(a.uri, a.name),
            }))
          );
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const removeAttachment = (id: string) => {
    if (valueFieldsLocked) return;
    setAttachments((prev) => prev.filter((x) => x._localId !== id));
  };

  const handleSave = async () => {
    if (blocked || entryIds.length === 0) return;
    const rawSrc =
      amountEditingRef.current && amountDraftRef.current.trim() !== ''
        ? amountDraftRef.current
        : amountStr;
    const amount = Math.max(0, parseLocaleAmountString(rawSrc));
    if (amount <= 0) {
      Alert.alert(t('common.attention'), t('appAlerts.finance.valuePositive'));
      return;
    }
    if (kind === 'expense' && categoryKey === 'outros' && !description.trim()) {
      Alert.alert(t('common.attention'), t('appAlerts.finance.othersDescription'));
      return;
    }
    const email = user?.email || undefined;
    const payload: TechnicianFinanceAttachment[] = attachments.map(({ uri, name, mimeType }) => ({
      uri,
      name,
      mimeType,
    }));
    try {
      await TechnicianFinanceService.updateManualTechnicianFinance(
        entryIds,
        {
          kind,
          amount,
          description: description.trim() || undefined,
          categoryKey: kind === 'expense' ? categoryKey : null,
          attachments: payload.length > 0 ? payload : undefined,
          linkedTaskIds: kind === 'expense' ? selectedOsIds : [],
        },
        email
      );
      Alert.alert(t('appAlerts.finance.savedEditTitle'), t('appAlerts.finance.savedEditBody'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('appAlerts.finance.saveEditError'));
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenSubheader
          title={screenTitle}
          subtitle={t('technicianMobile.financeEditSubtitle')}
          onBack={() => router.back()}
          onRightPress={() => void refreshLinkableOs()}
          rightLoading={linkableLoading}
        />
        <ActivityIndicator color="#0f766e" style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenSubheader
          title={screenTitle}
          subtitle={t('technicianMobile.financeEditSubtitle')}
          onBack={() => router.back()}
          onRightPress={() => void refreshLinkableOs()}
          rightLoading={linkableLoading}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenSubheader
        title={screenTitle}
        subtitle={t('technicianMobile.financeEditSubtitle')}
        onBack={() => router.back()}
        onRightPress={() => void refreshLinkableOs()}
        rightLoading={linkableLoading}
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          {financeValueUnlocked
            ? 'Lançamento devolvido para revisão: pode alterar valor, texto, anexos e OS. Todas as OS do rateio têm de estar sincronizadas neste celular. Ao guardar, o lançamento volta a ficar fechado.'
            : valueFieldsLocked
              ? 'Valor, descrição e anexos estão fechados. Pode incluir ou remover OS no rateio (só OS elegíveis: em aberto ou concluídas há até 30 dias, com campo de despesas no modelo). Para corrigir valores, o escritório deve devolver o lançamento para revisão.'
              : 'Despesas sem OS podem ser editadas livremente. Com OS vinculadas, após guardar o valor fica fechado até revisão.'}
        </Text>

        <Text style={styles.lbl}>Tipo</Text>
        <View style={styles.kindRow}>
          <TouchableOpacity
            style={[styles.kindBtn, kind === 'expense' && styles.kindBtnExp, valueFieldsLocked && { opacity: 0.45 }]}
            onPress={() => setKind('expense')}
            disabled={valueFieldsLocked}
          >
            <Text style={[styles.kindBtnTxt, kind === 'expense' && styles.kindBtnTxtOn]}>Despesa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.kindBtn, kind === 'revenue' && styles.kindBtnRev, valueFieldsLocked && { opacity: 0.45 }]}
            onPress={() => setKind('revenue')}
            disabled={valueFieldsLocked}
          >
            <Text style={[styles.kindBtnTxt, kind === 'revenue' && styles.kindBtnTxtOn]}>Receita</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.lbl}>Valor (R$)</Text>
        <ValueInput
          style={valueFieldsLocked ? [styles.input, styles.inputDisabled] : styles.input}
          placeholder="0,00"
          currency
          currencySymbol="R$"
          value={amountStr}
          onChangeText={setAmountStr}
          onDraftChange={(t) => {
            amountDraftRef.current = t;
          }}
          onEditingStateChange={(editing) => {
            amountEditingRef.current = editing;
          }}
          editable={!valueFieldsLocked}
        />

        {kind === 'expense' ? (
          <TechnicianExpenseCategoryChips value={categoryKey} onChange={setCategoryKey} />
        ) : null}

        <Text style={styles.lbl}>Descrição (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMulti, valueFieldsLocked && styles.inputDisabled]}
          placeholder="Nota ou referência…"
          placeholderTextColor="#94a3b8"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
          editable={!valueFieldsLocked}
        />

        {kind === 'expense' ? (
          <>
            <Text style={styles.lbl}>Relacionar a OS (opcional)</Text>
            <Text style={styles.osHint}>
              Lista: OS com campo de despesas no modelo, em aberto no celular ou concluídas há até 30 dias. Várias OS
              dividem o valor em partes iguais.
            </Text>
            {linkableLoading ? (
              <View style={styles.osLoading}>
                <ActivityIndicator color="#0f766e" />
                <Text style={styles.osLoadingTxt}>Carregando OS elegíveis…</Text>
              </View>
            ) : linkableOs.length === 0 ? (
              <Text style={styles.osEmpty}>Nenhuma OS elegível neste momento.</Text>
            ) : (
              <View style={styles.osList}>
                {linkableOs.map((t) => {
                  const on = selectedOsIds.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.osRow, on && styles.osRowOn]}
                      onPress={() => toggleOs(t.id)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={on ? '#0f766e' : '#94a3b8'}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={styles.osRowTxt} numberOfLines={2}>
                        {t.displayLine}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        <Text style={styles.lbl}>Documentos ou fotos (opcional)</Text>
        <TouchableOpacity
          style={[styles.addAttachBtn, valueFieldsLocked && { opacity: 0.45 }]}
          onPress={pickAttachments}
          activeOpacity={0.88}
          disabled={valueFieldsLocked}
        >
          <Ionicons name="attach-outline" size={22} color="#0f766e" />
          <Text style={styles.addAttachBtnTxt}>Adicionar anexo</Text>
        </TouchableOpacity>

        {attachments.length > 0 ? (
          <View style={styles.attachList}>
            {attachments.map((att) => (
              <View key={att._localId} style={styles.attachRow}>
                {isProbablyImage(att) ? (
                  <Image source={{ uri: att.uri }} style={styles.thumb} />
                ) : (
                  <View style={styles.docThumb}>
                    <Ionicons name="document-text-outline" size={28} color="#64748b" />
                  </View>
                )}
                <View style={styles.attachMeta}>
                  <Text style={styles.attachName} numberOfLines={2}>
                    {att.name || (isProbablyImage(att) ? 'Imagem' : 'Documento')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeAttachment(att._localId)}
                  style={styles.removeAttach}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={valueFieldsLocked}
                >
                  <Ionicons name="close-circle" size={24} color={valueFieldsLocked ? '#e2e8f0' : '#94a3b8'} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.9}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.saveBtnTxt}>{valueFieldsLocked ? 'Salvar rateio' : 'Salvar alterações'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(C: any) {
  return StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 20, paddingBottom: 40 },
    hint: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 20 },
    lbl: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8 },
    kindRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    kindBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: '#f1f5f9',
      borderWidth: 1,
      borderColor: '#e2e8f0',
      alignItems: 'center',
    },
    kindBtnExp: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
    kindBtnRev: { backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
    kindBtnTxt: { fontSize: 15, fontWeight: '800', color: '#64748b' },
    kindBtnTxtOn: { color: '#0f172a' },
    input: {
      borderWidth: 1,
      borderColor: '#cbd5e1',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      color: '#0f172a',
      marginBottom: 18,
    },
    inputMulti: { minHeight: 100, textAlignVertical: 'top' },
    inputDisabled: { backgroundColor: '#f1f5f9', color: '#64748b' },
    osHint: {
      fontSize: 12,
      color: '#94a3b8',
      lineHeight: 17,
      marginTop: -4,
      marginBottom: 12,
    },
    osLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 18,
      paddingVertical: 8,
    },
    osLoadingTxt: { fontSize: 13, color: '#64748b' },
    osEmpty: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 18 },
    osList: { gap: 8, marginBottom: 18 },
    osRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      backgroundColor: '#f8fafc',
    },
    osRowOn: { borderColor: '#99f6e4', backgroundColor: '#ecfdf5' },
    osRowTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
    addAttachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#99f6e4',
      backgroundColor: '#ecfdf5',
      marginBottom: 14,
    },
    addAttachBtnTxt: { fontSize: 15, fontWeight: '800', color: '#0f766e' },
    attachList: { marginBottom: 18, gap: 10 },
    attachRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f8fafc',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      padding: 10,
      paddingRight: 6,
    },
    thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#e2e8f0' },
    docThumb: {
      width: 52,
      height: 52,
      borderRadius: 8,
      backgroundColor: '#e2e8f0',
      justifyContent: 'center',
      alignItems: 'center',
    },
    attachMeta: { flex: 1, marginLeft: 12, marginRight: 8 },
    attachName: { fontSize: 14, fontWeight: '600', color: '#334155' },
    removeAttach: { padding: 4 },
    saveBtn: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: '#0f766e',
      paddingVertical: 16,
      borderRadius: 14,
    },
    saveBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
  });
}
