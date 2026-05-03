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
  Modal,
  Pressable,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
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

export default function NewTechnicianFinanceScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const [kind, setKind] = useState<TechnicianFinanceKind>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [linkableOs, setLinkableOs] = useState<LinkableExpenseTask[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [selectedOsIds, setSelectedOsIds] = useState<string[]>([]);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [osHelpVisible, setOsHelpVisible] = useState(false);
  const amountDraftRef = useRef('');
  const amountEditingRef = useRef(false);

  const openOs = useMemo(
    () => linkableOs.filter((x) => x.linkKind === 'open'),
    [linkableOs],
  );
  const completedOs = useMemo(
    () => linkableOs.filter((x) => x.linkKind === 'completed'),
    [linkableOs],
  );

  useEffect(() => {
    if (kind === 'revenue') setSelectedOsIds([]);
  }, [kind]);

  const refreshLinkableOs = useCallback(async () => {
    setLinkableLoading(true);
    try {
      const sortLocale = String(i18n.language || 'en-US').replace('_', '-');
      const translateTaskTitle = (titleBase: string) => {
        const s = String(titleBase || '').trim();
        if (!s || s.toLowerCase() === 'sem título') return t('technicianMobile.financeTaskNoTitle');
        if (s === 'Nova OS Designada' || s.toLowerCase() === 'nova os designada') {
          return t('technicianMobile.financeTaskDefaultNewWo');
        }
        return s;
      };
      const list = await loadLinkableTasksForTechnicianExpense({ translateTaskTitle, sortLocale });
      setLinkableOs(list);
    } catch {
      setLinkableOs([]);
    } finally {
      setLinkableLoading(false);
    }
  }, [i18n.language, t]);

  useFocusEffect(
    useCallback(() => {
      void refreshLinkableOs();
    }, [refreshLinkableOs])
  );

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
    setAttachments((prev) => prev.filter((x) => x._localId !== id));
  };

  const handleSave = async () => {
    const rawSrc =
      amountEditingRef.current && amountDraftRef.current.trim() !== ''
        ? amountDraftRef.current
        : amountStr;
    const amount = Math.max(0, parseLocaleAmountString(rawSrc));
    if (amount <= 0) {
      Alert.alert(t('common.attention'), t('appAlerts.finance.valuePositive'));
      return;
    }
    if (kind === 'expense') {
      if (categoryKey == null || String(categoryKey).trim() === '') {
        Alert.alert(t('common.attention'), t('appAlerts.finance.categoryRequired'));
        return;
      }
      if (categoryKey === 'outros' && !description.trim()) {
        Alert.alert(t('common.attention'), t('appAlerts.finance.othersDescription'));
        return;
      }
    }
    const email = user?.email || undefined;
    const payload: TechnicianFinanceAttachment[] = attachments.map(({ uri, name, mimeType }) => ({
      uri,
      name,
      mimeType,
    }));
    await TechnicianFinanceService.createManual(
      {
        kind,
        amount,
        description: description.trim() || undefined,
        categoryKey: kind === 'expense' ? categoryKey : null,
        attachments: payload.length > 0 ? payload : undefined,
        linkedTaskIds:
          kind === 'expense' && selectedOsIds.length > 0 ? selectedOsIds : undefined,
      },
      email
    );
    Alert.alert(t('appAlerts.finance.savedNewTitle'), t('appAlerts.finance.savedNewBody'), [
      { text: t('common.ok'), onPress: () => router.back() },
    ]);
  };

  const renderOsRow = (row: LinkableExpenseTask) => {
    const on = selectedOsIds.includes(row.id);
    const completed = row.linkKind === 'completed';
    return (
      <TouchableOpacity
        key={row.id}
        style={[styles.osRow, completed && styles.osRowCompleted, on && styles.osRowOn]}
        onPress={() => toggleOs(row.id)}
        activeOpacity={0.85}
      >
        <Ionicons
          name={on ? 'checkbox' : 'square-outline'}
          size={22}
          color={on ? '#0f766e' : '#94a3b8'}
          style={{ marginRight: 10, marginTop: 2 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.osRowTxt} numberOfLines={2}>
            {row.displayLine}
          </Text>
          <Text style={[styles.osRowBadge, completed ? styles.osRowBadgeDone : styles.osRowBadgeOpen]}>
            {completed
              ? t('technicianMobile.financeNewOsRowBadgeCompleted')
              : t('technicianMobile.financeNewOsRowBadgeOpen')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.flexFill}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenSubheader
        title={t('technicianMobile.financeNewTitle')}
        subtitle={t('technicianMobile.financeNewSubtitle')}
        onBack={() => router.back()}
        onRightPress={() => void refreshLinkableOs()}
        rightLoading={linkableLoading}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <Text style={styles.lbl}>{t('technicianMobile.financeFieldType')}</Text>
        <View style={styles.kindRow}>
          <TouchableOpacity
            style={[styles.kindBtn, kind === 'expense' && styles.kindBtnExp]}
            onPress={() => setKind('expense')}
          >
            <Text style={[styles.kindBtnTxt, kind === 'expense' && styles.kindBtnTxtOn]}>
              {t('technicianMobile.financeKindExpense')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.kindBtn, kind === 'revenue' && styles.kindBtnRev]}
            onPress={() => setKind('revenue')}
          >
            <Text style={[styles.kindBtnTxt, kind === 'revenue' && styles.kindBtnTxtOn]}>
              {t('technicianMobile.financeKindRevenue')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.lbl}>{t('technicianFinance.amountLabel')}</Text>
        <ValueInput
          style={styles.input}
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
        />

        {kind === 'expense' ? (
          <TechnicianExpenseCategoryChips value={categoryKey} onChange={(k) => setCategoryKey(k)} />
        ) : null}

        <Text style={styles.lbl}>{t('technicianFinance.descriptionOptional')}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          placeholder={t('technicianFinance.descPlaceholder')}
          placeholderTextColor="#94a3b8"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
        />

        {kind === 'expense' ? (
          <>
            <View style={styles.osLinkHeadRow}>
              <Text style={styles.osLinkHeadLbl}>{t('technicianMobile.financeNewOsLinkTitle')}</Text>
              <Pressable
                onPress={() => setOsHelpVisible(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('technicianMobile.financeNewOsHelpA11y')}
                style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}
              >
                <Ionicons name="help-circle-outline" size={24} color="#64748b" />
              </Pressable>
            </View>
            {linkableLoading ? (
              <View style={styles.osLoading}>
                <ActivityIndicator color="#0f766e" />
                <Text style={styles.osLoadingTxt}>{t('technicianMobile.financeOsLoadingLine')}</Text>
              </View>
            ) : linkableOs.length === 0 ? (
              <Text style={styles.osEmpty}>{t('technicianMobile.financeOsEmptyLine')}</Text>
            ) : (
              <ScrollView
                style={styles.osListScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {openOs.length > 0 ? (
                  <View style={styles.osList}>
                    <Text style={styles.osSubsectionLbl}>{t('technicianMobile.financeNewOsSectionOpen')}</Text>
                    {openOs.map((row) => renderOsRow(row))}
                  </View>
                ) : null}
                {completedOs.length > 0 ? (
                  <View style={[styles.osList, openOs.length > 0 && styles.osListSpaced]}>
                    <Text style={styles.osSubsectionLbl}>{t('technicianMobile.financeNewOsSectionCompleted')}</Text>
                    {completedOs.map((row) => renderOsRow(row))}
                  </View>
                ) : null}
              </ScrollView>
            )}
          </>
        ) : null}

        <Text style={styles.lbl}>{t('technicianMobile.financeAttachSectionTitle')}</Text>
        <Text style={styles.attachHint}>{t('technicianMobile.financeAttachHint', { max: MAX_ATTACHMENTS })}</Text>
        <TouchableOpacity style={styles.addAttachBtn} onPress={pickAttachments} activeOpacity={0.88}>
          <Ionicons name="attach-outline" size={22} color="#0f766e" />
          <Text style={styles.addAttachBtnTxt}>{t('technicianMobile.financeAddAttachment')}</Text>
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
                    {att.name ||
                      (isProbablyImage(att)
                        ? t('technicianMobile.financeAttachImage')
                        : t('technicianMobile.financeAttachDocument'))}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeAttachment(att._localId)}
                  style={styles.removeAttach}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.9}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.saveBtnTxt}>{t('technicianMobile.financeSave')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={osHelpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOsHelpVisible(false)}
      >
        <View style={styles.helpModalBackdrop}>
          <View style={[styles.helpModalCard, { backgroundColor: C.cardWhite }]}>
            <Text style={[styles.helpModalTitle, { color: C.slate }]}>{t('technicianMobile.financeNewOsHelpTitle')}</Text>
            <Text style={[styles.helpModalBody, { color: C.textSecondary }]}>
              {t('technicianMobile.financeNewOsHelpBody')}
            </Text>
            <TouchableOpacity
              style={[styles.helpModalClose, { backgroundColor: C.accent }]}
              onPress={() => setOsHelpVisible(false)}
              activeOpacity={0.88}
            >
              <Text style={styles.helpModalCloseTxt}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  /** Único filho permitido em TouchableWithoutFeedback; preenche o ecrã para o teclado. */
  flexFill: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
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
  osLinkHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  osLinkHeadLbl: { flex: 1, fontSize: 12, fontWeight: '800', color: '#475569' },
  osListScroll: { maxHeight: 280, marginBottom: 18 },
  osList: { gap: 8 },
  osListSpaced: { marginTop: 14 },
  osSubsectionLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
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
  osRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  osRowOn: { borderColor: '#99f6e4', backgroundColor: '#ecfdf5' },
  /** OS concluídas (janela 30 dias): verde alinhado a estados positivos / receita no ecrã. */
  osRowCompleted: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  osRowTxt: { fontSize: 14, fontWeight: '600', color: '#334155' },
  osRowBadge: { marginTop: 4, fontSize: 10, fontWeight: '800', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  osRowBadgeOpen: { color: '#0f766e', backgroundColor: '#d1fae5' },
  osRowBadgeDone: { color: '#047857', backgroundColor: '#bbf7d0' },
  helpModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  helpModalCard: { borderRadius: 16, padding: 20 },
  helpModalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12 },
  helpModalBody: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  helpModalClose: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  helpModalCloseTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  attachHint: { fontSize: 12, color: '#94a3b8', marginTop: -4, marginBottom: 10, lineHeight: 17 },
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
