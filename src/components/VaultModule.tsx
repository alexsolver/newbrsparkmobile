/**
 * VaultModule — Cofre de Senhas do Ativo
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Modal, Clipboard, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VaultEntry, VaultCategory, VAULT_CATEGORIES } from '../../src/services/assetVault';
import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';

interface Props {
  assetId: string;
  unlocked: boolean;
  entries: VaultEntry[];
  revealedIds: Set<string>;
  vaultModal: boolean;
  vaultForm: Partial<VaultEntry>;
  editEntry: VaultEntry | null;
  vaultPinModal: boolean;
  vaultPin: string;
  isExpoGo: boolean;
  VAULT_PIN: string;
  onLockOpen: () => void;
  onToggleReveal: (id: string) => void;
  onOpenAdd: () => void;
  onOpenEdit: (e: VaultEntry) => void;
  onDelete: (entryId: string) => void;
  onSave: () => void;
  onPinInput: (k: string) => void;
  onPinDelete: () => void;
  onPinClose: () => void;
  onFormChange: (patch: Partial<VaultEntry>) => void;
  onVaultModalClose: () => void;
}

const CATEGORY_LIST = Object.entries(VAULT_CATEGORIES) as [VaultCategory, typeof VAULT_CATEGORIES[VaultCategory]][];

export function VaultModule({
  unlocked, entries, revealedIds,
  vaultModal, vaultForm, editEntry,
  vaultPinModal, vaultPin,
  onLockOpen, onToggleReveal, onOpenAdd, onOpenEdit, onDelete,
  onSave, onPinInput, onPinDelete, onPinClose, onFormChange, onVaultModalClose,
}: Props) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const brand = C.primary;
  const S = useMemo(() => createVaultStyles(C), [C]);

  // ── Lock Screen ───────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <View style={S.lockScreen}>
        <View style={S.lockIcon}>
          <Ionicons name="shield-checkmark" size={52} color={brand} />
        </View>
        <Text style={S.lockTitle}>{t('vault.title')}</Text>
        <Text style={S.lockSub}>{t('vault.lockSub')}</Text>
        <TouchableOpacity style={S.unlockBtn} onPress={onLockOpen}>
          <Ionicons name="lock-open-outline" size={22} color="#fff" />
          <Text style={S.unlockBtnText}>{t('vault.unlock')}</Text>
        </TouchableOpacity>

        <Modal visible={vaultPinModal} transparent animationType="fade">
          <View style={S.pinOverlay}>
            <View style={S.pinCard}>
              <Ionicons name="keypad" size={32} color={brand} style={{ marginBottom: 12 }} />
              <Text style={S.pinTitle}>Vault — PIN</Text>
              <div style={{flexDirection: 'row', gap: 14, marginBottom: 20}}>
                {[0,1,2,3].map(i => (
                  <View key={i} style={[S.pinDot, vaultPin.length > i && S.pinDotFilled]} />
                ))}
              </div>
              <View style={S.pinGrid}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                  <TouchableOpacity
                    key={i} disabled={k === ''}
                    style={[S.pinKey, k === '' && { opacity: 0 }]}
                    onPress={() => k === '⌫' ? onPinDelete() : onPinInput(k)}
                  >
                    <Text style={S.pinKeyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={onPinClose} style={{ marginTop: 8 }}>
                <Text style={{ color: C.textSecondary, fontWeight: '600' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.vaultHeader}>
        <View style={S.vaultHeaderLeft}>
          <Ionicons name="shield-checkmark" size={20} color={brand} />
          <Text style={S.vaultHeaderTitle}>{t('vault.unlocked')}</Text>
          <View style={S.greenDot} />
        </View>
      </View>

      {entries.length === 0 ? (
        <View style={S.empty}>
          <Ionicons name="key-outline" size={44} color={brand + '30'} />
          <Text style={S.emptyText}>{t('vault.noCredentials')}</Text>
        </View>
      ) : (
        entries.map(entry => {
          const cat = VAULT_CATEGORIES[entry.category];
          const revealed = revealedIds.has(entry.id);
          return (
            <View key={entry.id} style={S.entryCard}>
              <View style={[S.catIcon, { backgroundColor: cat.color + '20' }]}>
                <Ionicons name={cat.icon as any} size={22} color={cat.color} />
              </View>

              <View style={{ flex: 1 }}>
                <View style={S.entryTop}>
                  <Text style={S.entryLabel}>{entry.label}</Text>
                  <View style={[S.catBadge, { backgroundColor: cat.color + '15' }]}>
                    <Text style={[S.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
                  </View>
                </View>
                {entry.username ? (
                  <Text style={S.entryUser}>👤 {entry.username}</Text>
                ) : null}
                <View style={S.passRow}>
                  <Text style={S.passText} numberOfLines={1}>
                    {revealed ? entry.password : '•'.repeat(Math.min(entry.password.length, 16))}
                  </Text>
                  <TouchableOpacity onPress={() => onToggleReveal(entry.id)} style={S.eyeBtn}>
                    <Ionicons name={revealed ? 'eye-off' : 'eye'} size={16} color={brand} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={S.copyBtn}
                    onPress={() => {
                      Clipboard.setString(entry.password);
                      Alert.alert(t('vault.copied'), t('vault.copiedMsg'));
                    }}
                  >
                    <Ionicons name="copy-outline" size={15} color={brand} />
                  </TouchableOpacity>
                </View>
                {entry.note ? <Text style={S.entryNote}>📌 {entry.note}</Text> : null}
              </View>

              <View style={S.entryActions}>
                <TouchableOpacity onPress={() => onOpenEdit(entry)} style={S.actionIcon}>
                  <Ionicons name="pencil" size={15} color={C.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(entry.id)} style={S.actionIcon}>
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={vaultModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={S.modalOverlay}>
          <View style={S.modalCard}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editEntry ? t('vault.editCredential') : t('vault.newCredential')}</Text>
              <TouchableOpacity onPress={onVaultModalClose}>
                <Ionicons name="close" size={22} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <Text style={S.formLabel}>{t('vault.credentialType')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CATEGORY_LIST.map(([key, meta]) => {
                    const active = vaultForm.category === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[S.catChip, active && { borderColor: meta.color, backgroundColor: meta.color + '15' }]}
                        onPress={() => onFormChange({ category: key })}
                      >
                        <Ionicons name={meta.icon as any} size={16} color={active ? meta.color : C.textLight} />
                        <Text style={[S.catChipText, active && { color: meta.color }]}>{meta.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={S.formLabel}>{t('vault.nameDesc')} *</Text>
              <TextInput style={S.formInput} value={vaultForm.label} onChangeText={t => onFormChange({ label: t })} placeholder={t('vault.namePlaceholder')} returnKeyType="done"
                      />

              <Text style={S.formLabel}>{t('vault.userLogin')}</Text>
              <TextInput style={S.formInput} value={vaultForm.username} onChangeText={t => onFormChange({ username: t })} placeholder={t('vault.userPlaceholder')} autoCapitalize="none" returnKeyType="done"
                      />

              <Text style={S.formLabel}>{t('vault.passwordCode')} *</Text>
              <TextInput style={S.formInput} value={vaultForm.password} onChangeText={t => onFormChange({ password: t })} placeholder="••••••••" secureTextEntry autoCorrect={false} returnKeyType="done"
                      />

              <Text style={S.formLabel}>{t('vault.notes')}</Text>
              <TextInput style={[S.formInput, { minHeight: 70 }]} value={vaultForm.note} onChangeText={t => onFormChange({ note: t })} placeholder={t('vault.notesPlaceholder')} multiline />

              <TouchableOpacity style={S.saveBtn} onPress={onSave}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={S.saveBtnText}>{t('vault.saveToVault')}</Text>
              </TouchableOpacity>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function createVaultStyles(C: ColorPalette) {
  const brand = C.primary;
  return StyleSheet.create({
  lockScreen: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  lockIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: brand + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  lockTitle: { fontSize: 18, fontWeight: '900', color: brand, marginBottom: 8, letterSpacing: -0.5, textTransform: 'uppercase' },
  lockSub: { fontSize: 11, color: C.slate, textAlign: 'center', lineHeight: 16, marginBottom: 32, fontWeight: '700', textTransform: 'uppercase' },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: brand, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, gap: 10, shadowColor: brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  unlockBtnText: { color: '#fff', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },

  pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  pinCard: { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: 300, alignItems: 'center' },
  pinTitle: { fontSize: 16, fontWeight: '900', color: brand, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 },
  pinDots: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#E2D9FF' },
  pinDotFilled: { backgroundColor: brand, borderColor: brand },
  pinGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 216, gap: 12, justifyContent: 'center' },
  pinKey: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  pinKeyText: { fontSize: 18, fontWeight: '900', color: brand },

  container: { paddingBottom: 20 },
  vaultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  vaultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  vaultHeaderTitle: { fontSize: 9, fontWeight: '900', color: brand, textTransform: 'uppercase', letterSpacing: 0.8 },
  greenDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#10B981' },
  stdAddBtn: { position: 'absolute', bottom: 30, right: 20, zIndex: 10, width: 60, height: 60, borderRadius: 30, backgroundColor: brand, justifyContent: 'center', alignItems: 'center', shadowColor: brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: C.textSecondary, fontWeight: '800', fontSize: 10, textAlign: 'center', textTransform: 'uppercase' },

  entryCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  catIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  entryLabel: { fontSize: 10, fontWeight: '900', color: brand, flexShrink: 1, textTransform: 'uppercase', letterSpacing: 0.2 },
  catBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText: { fontSize: 7, fontWeight: '900', textTransform: 'uppercase' },
  entryUser: { fontSize: 8, color: C.textSecondary, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passText: { flex: 1, fontSize: 11, fontWeight: '900', color: brand, letterSpacing: 1.5 },
  eyeBtn: { padding: 4 },
  copyBtn: { padding: 4 },
  entryNote: { fontSize: 7, color: C.textSecondary, marginTop: 6, fontStyle: 'italic', fontWeight: '800', textTransform: 'uppercase' },
  entryActions: { flexDirection: 'column', gap: 8, marginLeft: 8 },
  actionIcon: { padding: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, maxHeight: '88%', paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 14, fontWeight: '900', color: brand, letterSpacing: -0.3, textTransform: 'uppercase' },
  formLabel: { fontSize: 7, fontWeight: '900', color: C.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1.2 },
  formInput: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 12, color: brand, fontWeight: '800', borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  catChipText: { fontSize: 8, fontWeight: '900', color: C.textLight, textTransform: 'uppercase' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: brand, borderRadius: 16, paddingVertical: 15, marginTop: 8, shadowColor: brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  });
}
