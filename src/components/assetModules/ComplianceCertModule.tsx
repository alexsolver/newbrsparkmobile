import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorPalette } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { AssetExtensionsService } from '../../services/assetExtensionsService';
import { formatDate } from '../../i18n/formatters';
import type { ComplianceDocument, ComplianceFolder } from '../../types/assetExtensions';
import DatePickerButton from '../DatePickerButton';
import { AssetExtensionFormSheet } from './AssetExtensionFormSheet';

const ALERT_DAY_OPTIONS = [0, 1, 7, 14, 30, 90] as const;

function createComplianceStyles(C: ColorPalette) {
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
      marginTop: 10,
      backgroundColor: C.surfaceLow,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    fabSecondaryText: { color: C.slate, fontWeight: '800', fontSize: 12 },
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
    breadcrumb: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      paddingVertical: 6,
    },
    breadcrumbText: { fontSize: 13, fontWeight: '800', color: C.primary, flex: 1 },
    badge: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    badgeText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      paddingHorizontal: 12,
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

function daysUntilExpiry(iso?: string): number | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.trim() + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function newDocId() {
  return `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function copyToComplianceStorage(sourceUri: string, docId: string, suggestedName: string): Promise<string> {
  const safe =
    suggestedName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
  const base = `${FileSystem.documentDirectory || ''}aria_compliance/`;
  await FileSystem.makeDirectoryAsync(base, { intermediates: true }).catch(() => {});
  const dest = `${base}${docId}_${safe}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

type BaseProps = { assetId: string };

export function ComplianceCertModule({ assetId }: BaseProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createComplianceStyles(C), [C]);
  const { user } = useAuth();

  const [folders, setFolders] = useState<ComplianceFolder[]>([]);
  const [docs, setDocs] = useState<ComplianceDocument[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');

  const [docModal, setDocModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ComplianceDocument | null>(null);
  const [form, setForm] = useState<{
    title: string;
    standard: string;
    validUntil: string;
    notes: string;
    alertDaysBefore: number;
    localUri?: string;
    mimeType?: string;
  }>({ title: '', standard: '', validUntil: '', notes: '', alertDaysBefore: 30 });
  const [picking, setPicking] = useState(false);

  const loadFolders = useCallback(() => {
    if (!user?.email) return;
    AssetExtensionsService.getComplianceFolders(assetId, user.email).then(setFolders);
  }, [assetId, user?.email]);

  const loadDocs = useCallback(
    (folderId: string) => {
      if (!user?.email) return;
      AssetExtensionsService.getComplianceDocuments(assetId, folderId, user.email).then(setDocs);
    },
    [assetId, user?.email]
  );

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (currentFolderId) loadDocs(currentFolderId);
    else setDocs([]);
  }, [currentFolderId, loadDocs]);

  const openNewDoc = () => {
    if (!currentFolderId) {
      Alert.alert(t('common.attention'), t('assetExtension.complianceCreateFolderFirst'));
      return;
    }
    setEditingDoc(null);
    setForm({
      title: '',
      standard: '',
      validUntil: '',
      notes: '',
      alertDaysBefore: 30,
      localUri: undefined,
      mimeType: undefined,
    });
    setDocModal(true);
  };

  const openEditDoc = (d: ComplianceDocument) => {
    setEditingDoc(d);
    setForm({
      title: d.title,
      standard: d.standard || '',
      validUntil: d.validUntil || '',
      notes: d.notes || '',
      alertDaysBefore: d.alertDaysBefore ?? 30,
      localUri: d.localUri,
      mimeType: d.mimeType,
    });
    setDocModal(true);
  };

  const pickFile = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      setForm((f) => ({
        ...f,
        localUri: asset.uri,
        mimeType: asset.mimeType || undefined,
        title: f.title?.trim() ? f.title : asset.name,
      }));
    } finally {
      setPicking(false);
    }
  };

  const saveDoc = async () => {
    if (!user?.email || !currentFolderId) return;
    if (!form.title?.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.fillName'));
      return;
    }
    const docId = editingDoc?.id || newDocId();
    let localUri: string | undefined = form.localUri;
    if (localUri) {
      if (!localUri.includes('aria_compliance/')) {
        try {
          localUri = await copyToComplianceStorage(localUri, docId, form.title.trim() || 'doc');
        } catch (e) {
          console.warn('[Compliance] copy file', e);
          Alert.alert(t('common.error'), t('assetExtension.complianceCopyError'));
          return;
        }
      }
    } else {
      localUri = editingDoc?.localUri;
    }

    const validUntil = form.validUntil?.trim() || undefined;
    const alertDaysBefore = validUntil ? form.alertDaysBefore : undefined;

    await AssetExtensionsService.saveComplianceDocument(
      {
        id: docId,
        assetId,
        folderId: currentFolderId,
        title: form.title.trim(),
        standard: form.standard?.trim() || undefined,
        validUntil,
        notes: form.notes?.trim() || undefined,
        localUri,
        mimeType: form.mimeType,
        alertDaysBefore,
      },
      user.email
    );
    setDocModal(false);
    setEditingDoc(null);
    loadDocs(currentFolderId);
  };

  const saveFolder = async () => {
    if (!user?.email) return;
    if (!folderName.trim()) {
      Alert.alert(t('common.attention'), t('assetExtension.fillName'));
      return;
    }
    await AssetExtensionsService.saveComplianceFolder({ assetId, name: folderName.trim() }, user.email);
    setFolderModal(false);
    setFolderName('');
    loadFolders();
  };

  const deleteFolder = (f: ComplianceFolder) => {
    if (!user?.email) return;
    Alert.alert(t('assetExtension.complianceDeleteFolderTitle'), t('assetExtension.complianceDeleteFolderBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          AssetExtensionsService.deleteComplianceFolder(f.id, user.email!).then(() => {
            if (currentFolderId === f.id) setCurrentFolderId(null);
            loadFolders();
          }),
      },
    ]);
  };

  const removeDoc = (d: ComplianceDocument) => {
    if (!user?.email) return;
    AssetExtensionsService.deleteComplianceDocument(d.id, user.email).then(() => {
      if (currentFolderId) loadDocs(currentFolderId);
    });
  };

  const openFile = async (d: ComplianceDocument) => {
    if (!d.localUri) {
      openEditDoc(d);
      return;
    }
    try {
      await Sharing.shareAsync(d.localUri, { mimeType: d.mimeType || 'application/octet-stream' });
    } catch {
      Alert.alert(t('common.error'), t('docs.cannotOpenFile'));
    }
  };

  const renderExpiryBadge = (d: ComplianceDocument) => {
    const days = daysUntilExpiry(d.validUntil);
    if (days === null) return null;
    let bg = C.surfaceLow;
    let fg = C.textSecondary;
    let label = '';
    if (days < 0) {
      bg = '#FEE2E2';
      fg = '#B91C1C';
      label = t('assetExtension.complianceExpired');
    } else if (days <= 30) {
      bg = '#FEF3C7';
      fg = '#B45309';
      label = t('assetExtension.complianceExpiringInDays', { count: days });
    } else {
      label = t('assetExtension.complianceValidInDays', { count: days });
      fg = C.accent;
    }
    return (
      <View style={[S.badge, { backgroundColor: bg }]}>
        <Text style={[S.badgeText, { color: fg }]}>{label}</Text>
      </View>
    );
  };

  const folder = folders.find((f) => f.id === currentFolderId);

  return (
    <View style={S.wrap}>
      {currentFolderId && (
        <TouchableOpacity style={S.breadcrumb} onPress={() => setCurrentFolderId(null)} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.primary} />
          <Text style={S.breadcrumbText} numberOfLines={1}>
            {t('assetExtension.complianceBackFolders')}
          </Text>
        </TouchableOpacity>
      )}

      {!currentFolderId ? (
        <>
          {folders.length === 0 ? (
            <Text style={S.empty}>{t('assetExtension.complianceFoldersEmpty')}</Text>
          ) : (
            <ScrollView>
              {folders.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={S.row}
                  onPress={() => setCurrentFolderId(f.id)}
                  onLongPress={() => deleteFolder(f)}
                >
                  <Ionicons name="folder-open-outline" size={22} color={C.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.rowTitle}>{f.name}</Text>
                    <Text style={S.rowMeta}>{t('assetExtension.complianceTapToOpen')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={S.fab} onPress={() => setFolderModal(true)}>
            <Text style={S.fabText}>{t('assetExtension.complianceNewFolder')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[S.rowMeta, { marginBottom: 8, fontSize: 11 }]} numberOfLines={2}>
            {folder?.name}
          </Text>
          {docs.length === 0 ? (
            <Text style={S.empty}>{t('assetExtension.complianceInFolderEmpty')}</Text>
          ) : (
            <ScrollView>
              {docs.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={S.row}
                  onPress={() => openFile(d)}
                  onLongPress={() =>
                    Alert.alert(d.title, undefined, [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.edit'), onPress: () => openEditDoc(d) },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: () =>
                          Alert.alert(t('common.delete'), t('assetExtension.confirmDelete'), [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: () => removeDoc(d),
                            },
                          ]),
                      },
                    ])
                  }
                >
                  <Ionicons name="document-text-outline" size={22} color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.rowTitle}>{d.title}</Text>
                    <Text style={S.rowMeta}>
                      {[d.standard, d.validUntil ? `${t('assetExtension.validUntil')} ${formatDate(d.validUntil)}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {renderExpiryBadge(d)}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={S.fab} onPress={openNewDoc}>
            <Text style={S.fabText}>{t('assetExtension.complianceNewDocument')}</Text>
          </TouchableOpacity>
        </>
      )}

      <AssetExtensionFormSheet
        visible={folderModal}
        onClose={() => setFolderModal(false)}
        title={t('assetExtension.complianceNewFolder')}
        footer={
          <TouchableOpacity style={[S.fab, { marginTop: 0 }]} onPress={saveFolder}>
            <Text style={S.fabText}>{t('common.save')}</Text>
          </TouchableOpacity>
        }
      >
        <Text style={S.label}>{t('assetExtension.complianceFolderName')}</Text>
        <TextInput
          style={S.input}
          value={folderName}
          onChangeText={setFolderName}
          placeholder={t('assetExtension.complianceFolderName')}
        />
      </AssetExtensionFormSheet>

      <AssetExtensionFormSheet
        visible={docModal}
        onClose={() => setDocModal(false)}
        title={editingDoc ? t('common.edit') : t('assetExtension.complianceNewDocument')}
        footer={
          <TouchableOpacity style={[S.fab, { marginTop: 0 }]} onPress={saveDoc}>
            <Text style={S.fabText}>{t('common.save')}</Text>
          </TouchableOpacity>
        }
      >
        <Text style={S.label}>{t('assetExtension.complianceDocTitle')}</Text>
        <TextInput style={S.input} value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
        <Text style={S.label}>{t('assetExtension.standard')}</Text>
        <TextInput
          style={S.input}
          value={form.standard}
          onChangeText={(standard) => setForm({ ...form, standard })}
        />
        <Text style={S.label}>{t('assetExtension.validUntil')}</Text>
        <View style={{ marginBottom: 12 }}>
          <DatePickerButton
            value={form.validUntil}
            onChange={(iso) => setForm({ ...form, validUntil: iso })}
            accentColor={C.primary}
          />
          {form.validUntil ? (
            <TouchableOpacity
              onPress={() => setForm({ ...form, validUntil: '' })}
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent }}>{t('datePicker.clearDate')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={S.label}>{t('assetExtension.complianceAlertDays')}</Text>
        <Text style={[S.rowMeta, { marginBottom: 8 }]}>{t('assetExtension.complianceAlertHint')}</Text>
        <View style={S.chipRow}>
          {ALERT_DAY_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[S.chip, form.alertDaysBefore === d && S.chipActive]}
              onPress={() => setForm({ ...form, alertDaysBefore: d })}
            >
              <Text style={[S.chipText, form.alertDaysBefore === d && S.chipTextActive]}>
                {d === 0 ? t('assetExtension.complianceAlertSameDay') : `${d}d`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={S.label}>{t('assetExtension.notes')}</Text>
        <TextInput
          style={[S.input, { minHeight: 72 }]}
          multiline
          value={form.notes}
          onChangeText={(notes) => setForm({ ...form, notes })}
        />
        <TouchableOpacity style={S.fabSecondary} onPress={pickFile} disabled={picking}>
          {picking ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <Text style={S.fabSecondaryText}>
              {form.localUri ? t('assetExtension.complianceReplaceFile') : t('assetExtension.complianceAttachFile')}
            </Text>
          )}
        </TouchableOpacity>
        {form.localUri ? (
          <Text style={[S.rowMeta, { marginBottom: 12 }]} numberOfLines={2}>
            {form.localUri.split('/').pop()}
          </Text>
        ) : null}
      </AssetExtensionFormSheet>
    </View>
  );
}
