import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorPalette } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { AssetExtensionsService } from '../../services/assetExtensionsService';
import { formatDate } from '../../i18n/formatters';
import type { WarrantyContractRecord } from '../../types/assetExtensions';
import DatePickerButton from '../DatePickerButton';
import { AssetExtensionFormSheet } from './AssetExtensionFormSheet';

const WARRANTY_SUBTYPES: WarrantyContractRecord['subtype'][] = [
  'factory_warranty',
  'extended',
  'lease',
  'maintenance_contract',
  'other',
];

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
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
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
  });
}

type BaseProps = { assetId: string };

export function WarrantiesContractsModule({ assetId }: BaseProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createExtStyles(C), [C]);
  const { user } = useAuth();
  const [rows, setRows] = useState<WarrantyContractRecord[]>([]);
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    title: string;
    subtype: WarrantyContractRecord['subtype'];
    startDate: string;
    endDate: string;
    provider: string;
    notes: string;
  }>({
    title: '',
    subtype: 'other',
    startDate: '',
    endDate: '',
    provider: '',
    notes: '',
  });

  const load = useCallback(() => {
    AssetExtensionsService.getWarranties(assetId, user?.email).then(setRows);
  }, [assetId, user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm({
      title: '',
      subtype: 'other',
      startDate: '',
      endDate: '',
      provider: '',
      notes: '',
    });
    setModal(true);
  };

  const openEdit = (r: WarrantyContractRecord) => {
    setEditingId(r.id);
    setForm({
      title: r.title,
      subtype: r.subtype || 'other',
      startDate: r.startDate || '',
      endDate: r.endDate || '',
      provider: r.provider || '',
      notes: r.notes || '',
    });
    setModal(true);
  };

  const closeModal = () => {
    setModal(false);
    setEditingId(null);
  };

  const save = async () => {
    if (!form.title?.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.fillTitle'));
      return;
    }
    await AssetExtensionsService.saveWarranty(
      {
        id: editingId || undefined,
        assetId,
        title: form.title.trim(),
        subtype: form.subtype,
        startDate: form.startDate?.trim() || undefined,
        endDate: form.endDate?.trim() || undefined,
        provider: form.provider?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      },
      user?.email || ''
    );
    closeModal();
    load();
  };

  const sheetTitle = editingId ? t('common.edit') : t('assetExtension.warrantyNewPolicy');

  return (
    <View style={S.wrap}>
      {rows.length === 0 ? (
        <Text style={S.empty}>{t('assetExtension.warrantiesEmpty')}</Text>
      ) : (
        <ScrollView>
          {rows.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={S.row}
              onPress={() => openEdit(r)}
              onLongPress={() =>
                Alert.alert(t('common.delete'), t('assetExtension.confirmDelete'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => AssetExtensionsService.deleteWarranty(r.id, user?.email || '').then(load),
                  },
                ])
              }
            >
              <Ionicons name="document-text-outline" size={20} color={C.primary} />
              <View style={{ flex: 1 }}>
                <Text style={S.rowTitle}>{r.title}</Text>
                <Text style={S.rowMeta}>
                  {[
                    t(`assetExtension.warrantySubtype_${r.subtype}`),
                    r.provider,
                    r.endDate ? `${t('assetExtension.until')} ${formatDate(r.endDate)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <TouchableOpacity style={S.fab} onPress={openNew}>
        <Text style={S.fabText}>{t('assetExtension.warrantyAddPolicy')}</Text>
      </TouchableOpacity>

      <AssetExtensionFormSheet
        visible={modal}
        onClose={closeModal}
        title={sheetTitle}
        footer={
          <TouchableOpacity style={[S.fab, { marginTop: 0 }]} onPress={save}>
            <Text style={S.fabText}>{t('common.save')}</Text>
          </TouchableOpacity>
        }
      >
        <Text style={S.label}>{t('assetExtension.titleField')}</Text>
        <TextInput style={S.input} value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
        <Text style={S.label}>{t('assetExtension.warrantySubtypeLabel')}</Text>
        <View style={S.chipRow}>
          {WARRANTY_SUBTYPES.map((st) => (
            <TouchableOpacity
              key={st}
              style={[S.chip, form.subtype === st && S.chipActive]}
              onPress={() => setForm({ ...form, subtype: st })}
            >
              <Text style={[S.chipText, form.subtype === st && S.chipTextActive]}>
                {t(`assetExtension.warrantySubtype_${st}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={S.label}>{t('assetExtension.provider')}</Text>
        <TextInput
          style={S.input}
          value={form.provider}
          onChangeText={(provider) => setForm({ ...form, provider })}
        />
        <Text style={S.label}>{t('assetExtension.startDate')}</Text>
        <View style={{ marginBottom: 8 }}>
          <DatePickerButton
            value={form.startDate}
            onChange={(iso) => setForm({ ...form, startDate: iso })}
            accentColor={C.primary}
          />
          {form.startDate ? (
            <TouchableOpacity onPress={() => setForm({ ...form, startDate: '' })} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent }}>{t('datePicker.clearDate')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={S.label}>{t('assetExtension.endDate')}</Text>
        <View style={{ marginBottom: 8 }}>
          <DatePickerButton
            value={form.endDate}
            onChange={(iso) => setForm({ ...form, endDate: iso })}
            accentColor={C.primary}
            minDate={form.startDate ? new Date(form.startDate + 'T12:00:00') : undefined}
          />
          {form.endDate ? (
            <TouchableOpacity onPress={() => setForm({ ...form, endDate: '' })} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent }}>{t('datePicker.clearDate')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={S.label}>{t('assetExtension.notes')}</Text>
        <TextInput
          style={[S.input, { minHeight: 72 }]}
          multiline
          value={form.notes}
          onChangeText={(notes) => setForm({ ...form, notes })}
        />
      </AssetExtensionFormSheet>
    </View>
  );
}
