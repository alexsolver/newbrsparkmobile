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
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorPalette } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { AssetExtensionsService } from '../../services/assetExtensionsService';
import { formatDate } from '../../i18n/formatters';
import { getCurrentLanguage } from '../../i18n';
import type { ReadingRecord } from '../../types/assetExtensions';
import DatePickerButton from '../DatePickerButton';
import type { TFunction } from 'i18next';

function readingGroupKey(r: ReadingRecord): string {
  if (r.kind !== 'other') return r.kind;
  return `other:${(r.customLabel || '').trim().toLowerCase()}`;
}

function displayReadingKindLabel(r: ReadingRecord, t: TFunction): string {
  if (r.kind === 'other' && r.customLabel?.trim()) return r.customLabel.trim();
  return t(`assetExtension.readingKind_${r.kind}` as const);
}

const KINDS: ReadingRecord['kind'][] = ['energy', 'water', 'gas', 'odometer', 'fuel', 'hours', 'other'];

const DEFAULT_UNITS: Record<ReadingRecord['kind'], string> = {
  energy: 'kWh',
  water: 'm³',
  gas: 'm³',
  odometer: 'km',
  fuel: 'L',
  hours: 'h',
  other: '',
};

const KIND_ICONS: Record<ReadingRecord['kind'], keyof typeof Ionicons.glyphMap> = {
  energy: 'flash-outline',
  water: 'water-outline',
  gas: 'flame-outline',
  odometer: 'speedometer-outline',
  fuel: 'car-outline',
  hours: 'time-outline',
  other: 'analytics-outline',
};

/** Unidades rápidas por tipo (sugestão; o utilizador pode editar) */
const UNIT_QUICK: Record<ReadingRecord['kind'], string[]> = {
  energy: ['kWh', 'kW', 'MWh'],
  water: ['m³', 'L'],
  gas: ['m³', 'L'],
  odometer: ['km', 'mi'],
  fuel: ['L'],
  hours: ['h', 'min'],
  other: [],
};

function parseNum(s: string): number | null {
  const n = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

type DeltaInfo =
  | { kind: 'first' }
  | { kind: 'delta'; delta: number; unit: string }
  | { kind: 'invalid' };

/** Para cada id, consumo vs leitura anterior do mesmo grupo (tipo fixo ou «Outro» + nome). */
function buildDeltaById(rows: ReadingRecord[]): Map<string, DeltaInfo> {
  const out = new Map<string, DeltaInfo>();
  const byGroup = new Map<string, ReadingRecord[]>();
  for (const r of rows) {
    const g = readingGroupKey(r);
    const arr = byGroup.get(g) || [];
    arr.push(r);
    byGroup.set(g, arr);
  }
  for (const [, list] of byGroup) {
    const sorted = [...list].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.createdAt.localeCompare(b.createdAt);
    });
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i === 0) {
        out.set(cur.id, { kind: 'first' });
        continue;
      }
      const prev = sorted[i - 1];
      const v1 = parseNum(cur.value);
      const v0 = parseNum(prev.value);
      const unit = (cur.unit || prev.unit || '').trim();
      if (v1 === null || v0 === null) {
        out.set(cur.id, { kind: 'invalid' });
      } else {
        out.set(cur.id, { kind: 'delta', delta: v1 - v0, unit });
      }
    }
  }
  return out;
}

function formatMonthHeader(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  try {
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  } catch {
    return ym;
  }
}

function createStyles(C: ColorPalette) {
  return StyleSheet.create({
    wrap: { padding: 4, flex: 1 },
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
    rowDelta: { fontSize: 10, color: C.accent, fontWeight: '800', marginTop: 4 },
    empty: { textAlign: 'center', color: C.textSecondary, marginTop: 20, fontStyle: 'italic', fontWeight: '600' },
    fab: {
      marginTop: 16,
      backgroundColor: C.primary,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    fabText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
    fabSecondary: {
      marginTop: 8,
      marginBottom: 12,
      backgroundColor: C.surfaceLow,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    fabSecondaryText: { color: C.slate, fontWeight: '800', fontSize: 12 },
    hint: { fontSize: 11, color: C.textSecondary, marginBottom: 8, lineHeight: 16, fontWeight: '600' },
    modalOuter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalPanel: {
      backgroundColor: C.cardWhite,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
      maxHeight: '92%',
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
      marginBottom: 12,
      backgroundColor: C.surfaceLow,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceLow,
    },
    chipActive: { borderColor: C.primary, backgroundColor: C.primary + '22' },
    chipText: { fontSize: 11, fontWeight: '800', color: C.slate },
    chipTextActive: { color: C.primary },
    sectionHeader: {
      paddingVertical: 10,
      paddingHorizontal: 4,
      backgroundColor: C.background,
    },
    sectionTitle: { fontSize: 11, fontWeight: '900', color: C.textSecondary, textTransform: 'capitalize' },
    summaryCard: {
      marginBottom: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: C.surfaceLow,
      borderWidth: 1,
      borderColor: C.border,
    },
    summaryLabel: { fontSize: 10, fontWeight: '800', color: C.textLight, marginBottom: 6, textTransform: 'uppercase' },
    summaryLine: { fontSize: 14, fontWeight: '900', color: C.slate },
    summarySub: { fontSize: 11, color: C.textSecondary, marginTop: 4, fontWeight: '600' },
  });
}

type BaseProps = { assetId: string };

type FormState = {
  kind: ReadingRecord['kind'];
  customLabel: string;
  value: string;
  unit: string;
  date: string;
  notes: string;
};

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export function ReadingsConsumptionModule({ assetId }: BaseProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createStyles(C), [C]);
  const { user } = useAuth();
  const locale = getCurrentLanguage();

  const [rows, setRows] = useState<ReadingRecord[]>([]);
  const [otherPresets, setOtherPresets] = useState<string[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ReadingRecord | null>(null);
  const [form, setForm] = useState<FormState>({
    kind: 'energy',
    customLabel: '',
    value: '',
    unit: DEFAULT_UNITS.energy,
    date: todayIso(),
    notes: '',
  });

  const load = useCallback(() => {
    if (!user?.email) return;
    AssetExtensionsService.getReadings(assetId, user.email).then(setRows);
  }, [assetId, user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshOtherPresets = useCallback(() => {
    if (!user?.email) return;
    AssetExtensionsService.getReadingOtherPresets(user.email).then(setOtherPresets);
  }, [user?.email]);

  useEffect(() => {
    refreshOtherPresets();
  }, [refreshOtherPresets]);

  const mergedOtherPresets = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of otherPresets) {
      const k = p.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p.trim());
    }
    for (const r of rows) {
      if (r.kind === 'other' && r.customLabel?.trim()) {
        const k = r.customLabel.trim().toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(r.customLabel.trim());
        }
      }
    }
    return out.sort((a, b) => a.localeCompare(b, locale, { sensitivity: 'base' }));
  }, [otherPresets, rows, locale]);

  const deltaById = useMemo(() => buildDeltaById(rows), [rows]);

  const sections = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.createdAt.localeCompare(a.createdAt);
    });
    const monthMap = new Map<string, ReadingRecord[]>();
    for (const r of sorted) {
      const key = r.date.slice(0, 7);
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key)!.push(r);
    }
    const keys = [...monthMap.keys()].sort((a, b) => b.localeCompare(a));
    return keys.map((k) => ({
      title: formatMonthHeader(k, locale),
      data: monthMap.get(k)!,
    }));
  }, [rows, locale]);

  const lastReading = useMemo(() => {
    if (!rows.length) return null;
    return [...rows].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.createdAt.localeCompare(a.createdAt);
    })[0];
  }, [rows]);

  const openNew = () => {
    setEditing(null);
    setForm({
      kind: 'energy',
      customLabel: '',
      value: '',
      unit: DEFAULT_UNITS.energy,
      date: todayIso(),
      notes: '',
    });
    setModal(true);
  };

  const openEdit = (r: ReadingRecord) => {
    setEditing(r);
    setForm({
      kind: r.kind,
      customLabel: r.customLabel || '',
      value: r.value,
      unit: r.unit ?? DEFAULT_UNITS[r.kind],
      date: r.date,
      notes: r.notes || '',
    });
    setModal(true);
  };

  const removeReading = (r: ReadingRecord) => {
    if (!user?.email) return;
    AssetExtensionsService.deleteReading(r.id, user.email).then(load);
  };

  const save = async () => {
    if (!user?.email) return;
    if (!form.value?.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.fillValue'));
      return;
    }
    if (form.kind === 'other' && !form.customLabel?.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.readingOtherNameRequired'));
      return;
    }
    await AssetExtensionsService.saveReading(
      {
        id: editing?.id,
        assetId,
        kind: form.kind,
        customLabel: form.kind === 'other' ? form.customLabel.trim() : undefined,
        value: form.value.trim(),
        unit: form.unit?.trim() || undefined,
        date: form.date || todayIso(),
        notes: form.notes?.trim() || undefined,
      },
      user.email
    );
    setModal(false);
    setEditing(null);
    setForm({
      kind: 'energy',
      customLabel: '',
      value: '',
      unit: DEFAULT_UNITS.energy,
      date: todayIso(),
      notes: '',
    });
    load();
    refreshOtherPresets();
  };

  const addPresetFromInput = async () => {
    if (!user?.email) return;
    const name = form.customLabel?.trim();
    if (!name) {
      Alert.alert(t('common.attention'), t('assetExtension.readingOtherNameRequired'));
      return;
    }
    await AssetExtensionsService.addReadingOtherPreset(name, user.email);
    refreshOtherPresets();
  };

  const selectKind = (k: ReadingRecord['kind']) => {
    setForm((f) => {
      const prevDef = DEFAULT_UNITS[f.kind];
      const nextDef = DEFAULT_UNITS[k];
      const keepCustom = Boolean(f.unit?.trim() && f.unit.trim() !== prevDef);
      return {
        ...f,
        kind: k,
        unit: keepCustom ? f.unit : nextDef,
        customLabel: k === 'other' ? (f.kind === 'other' ? f.customLabel : '') : '',
      };
    });
  };

  const confirmDeleteReading = (r: ReadingRecord) => {
    Alert.alert(t('common.delete'), t('assetExtension.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => removeReading(r),
      },
    ]);
  };

  const renderItem = ({ item: r }: { item: ReadingRecord }) => {
    const dinfo = deltaById.get(r.id);
    const icon = KIND_ICONS[r.kind];
    return (
      <TouchableOpacity
        style={S.row}
        onPress={() => openEdit(r)}
        onLongPress={() => confirmDeleteReading(r)}
        activeOpacity={0.85}
      >
        <Ionicons name={icon} size={22} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={S.rowTitle}>
            {displayReadingKindLabel(r, t)} · {r.value}
            {r.unit ? ` ${r.unit}` : ''}
          </Text>
          <Text style={S.rowMeta}>{formatDate(r.date)}</Text>
          {dinfo?.kind === 'delta' ? (
            <Text style={S.rowDelta}>
              {t('assetExtension.readingConsumptionDelta', {
                delta: dinfo.delta.toLocaleString(locale, { maximumFractionDigits: 2 }),
                unit: dinfo.unit || '—',
              })}
            </Text>
          ) : dinfo?.kind === 'first' ? (
            <Text style={[S.rowMeta, { marginTop: 4 }]}>{t('assetExtension.readingFirstInSeries')}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.wrap}>
      {lastReading ? (
        <View style={S.summaryCard}>
          <Text style={S.summaryLabel}>{t('assetExtension.readingLastSummary')}</Text>
          <Text style={S.summaryLine}>
            {displayReadingKindLabel(lastReading, t)} · {lastReading.value}
            {lastReading.unit ? ` ${lastReading.unit}` : ''}
          </Text>
          <Text style={S.summarySub}>{formatDate(lastReading.date)}</Text>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text style={S.empty}>{t('assetExtension.readingsEmpty')}</Text>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={S.sectionHeader}>
              <Text style={S.sectionTitle}>{title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
        />
      )}

      <TouchableOpacity style={S.fab} onPress={openNew}>
        <Text style={S.fabText}>{t('assetExtension.addReading')}</Text>
      </TouchableOpacity>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={S.modalOuter} activeOpacity={1} onPress={() => setModal(false)} />
          <ScrollView style={[S.modalPanel, { marginTop: 'auto' }]} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.slate, marginBottom: 16 }}>
              {editing ? t('common.edit') : t('assetExtension.addReading')}
            </Text>

            <Text style={S.label}>{t('assetExtension.readingTypeLabel')}</Text>
            <View style={S.chipRow}>
              {KINDS.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[S.chip, form.kind === k && S.chipActive]}
                  onPress={() => selectKind(k)}
                >
                  <Text style={[S.chipText, form.kind === k && S.chipTextActive]}>
                    {t(`assetExtension.readingKind_${k}` as const)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.kind === 'other' ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={S.hint}>{t('assetExtension.readingOtherPresetsHint')}</Text>
                {mergedOtherPresets.length > 0 ? (
                  <View style={S.chipRow}>
                    {mergedOtherPresets.map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[S.chip, form.customLabel === p && S.chipActive]}
                        onPress={() => setForm({ ...form, kind: 'other', customLabel: p })}
                      >
                        <Text style={[S.chipText, form.customLabel === p && S.chipTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <Text style={S.label}>{t('assetExtension.readingOtherCustomLabel')}</Text>
                <TextInput
                  style={S.input}
                  value={form.customLabel}
                  onChangeText={(customLabel) => setForm({ ...form, customLabel })}
                  placeholder={t('assetExtension.readingOtherCustomPlaceholder')}
                />
                <TouchableOpacity style={S.fabSecondary} onPress={addPresetFromInput}>
                  <Text style={S.fabSecondaryText}>{t('assetExtension.readingOtherAddPreset')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={S.label}>{t('assetExtension.value')}</Text>
            <TextInput
              style={S.input}
              keyboardType="decimal-pad"
              value={form.value}
              onChangeText={(value) => setForm({ ...form, value })}
            />

            <Text style={S.label}>{t('assetExtension.unit')}</Text>
            {UNIT_QUICK[form.kind].length > 0 ? (
              <View style={S.chipRow}>
                {UNIT_QUICK[form.kind].map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[S.chip, form.unit === u && S.chipActive]}
                    onPress={() => setForm({ ...form, unit: u })}
                  >
                    <Text style={[S.chipText, form.unit === u && S.chipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TextInput
              style={S.input}
              placeholder={t('assetExtension.optionalUnitPlaceholder')}
              value={form.unit}
              onChangeText={(unit) => setForm({ ...form, unit })}
            />

            <Text style={S.label}>{t('assetExtension.date')}</Text>
            <View style={{ marginBottom: 12 }}>
              <DatePickerButton
                value={form.date}
                onChange={(iso) => setForm({ ...form, date: iso })}
                accentColor={C.primary}
                hideQuickChips
              />
            </View>

            <Text style={S.label}>{t('assetExtension.notes')}</Text>
            <TextInput
              style={[S.input, { minHeight: 64 }]}
              multiline
              value={form.notes}
              onChangeText={(notes) => setForm({ ...form, notes })}
              placeholder={t('common.optional')}
            />

            <TouchableOpacity style={S.fab} onPress={save}>
              <Text style={S.fabText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
