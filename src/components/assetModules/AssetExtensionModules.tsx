import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Clipboard,
  LayoutAnimation,
  UIManager,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorPalette } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { AssetExtensionsService } from '../../services/assetExtensionsService';
import { formatDate } from '../../i18n/formatters';
import { ensureAssetOccupancyCalendarFeed } from '../../services/assetOccupancyCalendarApi';
import { AssetAgendaEmbedded } from './AssetAgendaEmbedded';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function createExtStyles(C: ColorPalette) {
  return StyleSheet.create({
    wrap: { padding: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    rowTitle: { fontSize: 12, fontWeight: '800', color: C.slate, flex: 1 },
    rowMeta: { fontSize: 9, color: C.textSecondary, fontWeight: '600', marginTop: 4 },
    empty: { textAlign: 'center', color: C.textSecondary, marginTop: 20, fontStyle: 'italic', fontWeight: '600' },
    fab: {
      marginTop: 16,
      backgroundColor: C.primary,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    fabText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
    modalOuter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalPanel: {
      backgroundColor: C.cardWhite,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
      maxHeight: '88%',
    },
    label: { fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 6, textTransform: 'uppercase' },
    input: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 13,
      fontWeight: '700',
      color: C.slate,
      marginBottom: 14,
      backgroundColor: C.surfaceLow,
    },
    agendaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      backgroundColor: C.surfaceLow,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
  });
}

type BaseProps = { assetId: string };

export function ValuationDepreciationModule({ assetId }: BaseProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createExtStyles(C), [C]);
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = useCallback(() => {
    AssetExtensionsService.getValuations(assetId, user?.email).then(setRows);
  }, [assetId, user?.email]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.bookValue?.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.fillBookValue'));
      return;
    }
    await AssetExtensionsService.saveValuation(
      {
        assetId,
        bookValue: form.bookValue.trim(),
        method: form.method,
        usefulLifeMonths: form.usefulLifeMonths,
        revaluationDate: form.revaluationDate,
        notes: form.notes,
      },
      user?.email || ''
    );
    setModal(false);
    setForm({});
    load();
  };

  return (
    <View style={S.wrap}>
      {rows.length === 0 ? (
        <Text style={S.empty}>{t('assetExtension.valuationEmpty')}</Text>
      ) : (
        <ScrollView>
          {rows.map((r) => (
            <View key={r.id} style={S.row}>
              <Ionicons name="analytics-outline" size={20} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={S.rowTitle}>{r.bookValue}</Text>
                <Text style={S.rowMeta}>{[r.method, r.revaluationDate].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <TouchableOpacity style={S.fab} onPress={() => setModal(true)}>
        <Text style={S.fabText}>{t('assetExtension.addValuation')}</Text>
      </TouchableOpacity>
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={S.modalOuter} activeOpacity={1} onPress={() => { Keyboard.dismiss(); setModal(false); }} />
          <View style={[S.modalPanel, { marginTop: 'auto' }]}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.slate, marginBottom: 16 }}>{t('modules.valuation')}</Text>
            <Text style={S.label}>{t('assetExtension.bookValue')}</Text>
            <TextInput style={S.input} value={form.bookValue} onChangeText={(bookValue) => setForm({ ...form, bookValue })} />
            <Text style={S.label}>{t('assetExtension.method')}</Text>
            <TextInput style={S.input} value={form.method} onChangeText={(method) => setForm({ ...form, method })} />
            <TouchableOpacity style={S.fab} onPress={save}>
              <Text style={S.fabText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

export function ServiceUsageHistoryModule({ assetId }: BaseProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createExtStyles(C), [C]);
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({ category: 'revision' });

  const load = useCallback(() => {
    AssetExtensionsService.getServiceHistory(assetId, user?.email).then(setRows);
  }, [assetId, user?.email]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.description?.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.fillDescription'));
      return;
    }
    await AssetExtensionsService.saveServiceHistory(
      {
        assetId,
        date: form.date || new Date().toISOString().split('T')[0],
        category: form.category || 'other',
        odometer: form.odometer,
        hours: form.hours,
        description: form.description.trim(),
      },
      user?.email || ''
    );
    setModal(false);
    setForm({ category: 'revision' });
    load();
  };

  return (
    <View style={S.wrap}>
      {rows.length === 0 ? (
        <Text style={S.empty}>{t('assetExtension.serviceEmpty')}</Text>
      ) : (
        <ScrollView>
          {rows.map((r) => (
            <View key={r.id} style={S.row}>
              <Ionicons name="build-outline" size={20} color={C.primary} />
              <View style={{ flex: 1 }}>
                <Text style={S.rowTitle}>{r.description}</Text>
                <Text style={S.rowMeta}>
                  {formatDate(r.date)} · {r.category}
                  {r.odometer ? ` · ${r.odometer} km` : ''}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <TouchableOpacity style={S.fab} onPress={() => setModal(true)}>
        <Text style={S.fabText}>{t('assetExtension.addServiceEvent')}</Text>
      </TouchableOpacity>
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={S.modalOuter} activeOpacity={1} onPress={() => { Keyboard.dismiss(); setModal(false); }} />
          <View style={[S.modalPanel, { marginTop: 'auto' }]}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.slate, marginBottom: 16 }}>{t('modules.serviceHistory')}</Text>
            <Text style={S.label}>{t('assetExtension.description')}</Text>
            <TextInput style={S.input} value={form.description} onChangeText={(description) => setForm({ ...form, description })} />
            <Text style={S.label}>{t('assetExtension.odometer')}</Text>
            <TextInput style={S.input} value={form.odometer} onChangeText={(odometer) => setForm({ ...form, odometer })} />
            <TouchableOpacity style={S.fab} onPress={save}>
              <Text style={S.fabText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

export function AssetAgendaShortcutModule({ assetId }: BaseProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createExtStyles(C), [C]);
  const { user } = useAuth();
  const [icalUrl, setIcalUrl] = useState<string | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalError, setIcalError] = useState<string | null>(null);
  const [icalOpen, setIcalOpen] = useState(false);

  const loadIcal = useCallback(
    async (rotate?: boolean) => {
      if (!user?.email) {
        setIcalError(t('assetExtension.icalNeedLogin'));
        return;
      }
      setIcalLoading(true);
      setIcalError(null);
      try {
        const { url } = await ensureAssetOccupancyCalendarFeed(assetId, rotate);
        setIcalUrl(url);
      } catch (e: any) {
        setIcalError(e?.message || 'err');
        setIcalUrl(null);
      } finally {
        setIcalLoading(false);
      }
    },
    [assetId, user?.email, t]
  );

  useEffect(() => {
    void loadIcal(false);
  }, [loadIcal]);

  const copyIcal = () => {
    if (!icalUrl) return;
    Clipboard.setString(icalUrl);
    Alert.alert(t('common.done'), t('assetExtension.icalCopied'));
  };

  const rotateIcal = () => {
    Alert.alert(t('assetExtension.icalRotateTitle'), t('assetExtension.icalRotateBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('assetExtension.icalRotate'), style: 'destructive', onPress: () => void loadIcal(true) },
    ]);
  };

  const toggleIcal = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIcalOpen((o) => !o);
  };

  return (
    <View style={S.wrap}>
      <AssetAgendaEmbedded assetId={assetId} />

      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginTop: 16,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: C.surfaceLow,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.border,
        }}
        onPress={toggleIcal}
        activeOpacity={0.75}
      >
        <Ionicons name="link-outline" size={22} color={C.accent} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '900', color: C.slate }}>{t('assetExtension.icalTitle')}</Text>
        <Ionicons name={icalOpen ? 'chevron-up' : 'chevron-down'} size={22} color={C.textLight} />
      </TouchableOpacity>

      {icalOpen ? (
        <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, color: C.textSecondary, marginBottom: 10, fontWeight: '600', lineHeight: 16 }}>
            {t('assetExtension.icalDescription')}
          </Text>
          {icalLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={{ fontSize: 11, color: C.textLight }}>{t('assetExtension.icalLoading')}</Text>
            </View>
          ) : icalError ? (
            <View>
              <Text style={{ fontSize: 11, color: C.status?.warning?.fg || '#B45309', fontWeight: '600', marginBottom: 8 }}>
                {icalError}
              </Text>
              <TouchableOpacity onPress={() => void loadIcal(false)} style={{ alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.accent }}>{t('assetExtension.icalRetry')}</Text>
              </TouchableOpacity>
            </View>
          ) : icalUrl ? (
            <>
              <Text selectable style={{ fontSize: 10, color: C.textSecondary, fontWeight: '600', marginBottom: 10 }}>
                {icalUrl}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity style={[S.fab, { flex: 1, minWidth: 120, marginTop: 0, paddingVertical: 12 }]} onPress={copyIcal}>
                  <Text style={S.fabText}>{t('assetExtension.icalCopy')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    S.fab,
                    {
                      flex: 1,
                      minWidth: 120,
                      marginTop: 0,
                      paddingVertical: 12,
                      backgroundColor: C.surfaceLow,
                    },
                  ]}
                  onPress={rotateIcal}
                >
                  <Text style={[S.fabText, { color: C.slate }]}>{t('assetExtension.icalRotate')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 10, color: C.textLight, marginTop: 12, fontWeight: '600', lineHeight: 15 }}>
                {t('assetExtension.icalSyncHint')}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export { ComplianceCertModule } from './ComplianceCertModule';
export { ReadingsConsumptionModule } from './ReadingsConsumptionModule';
export { WarrantiesContractsModule } from './WarrantiesContractsModule';
