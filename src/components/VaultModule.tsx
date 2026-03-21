/**
 * VaultModule — Cofre de Senhas do Ativo
 * Componente isolado para não sobrecarregar [id].tsx
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VaultEntry, VaultCategory, VAULT_CATEGORIES } from '../../src/services/assetVault';
import { colors } from '../../src/theme/colors';

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
  assetId, unlocked, entries, revealedIds,
  vaultModal, vaultForm, editEntry,
  vaultPinModal, vaultPin, isExpoGo, VAULT_PIN,
  onLockOpen, onToggleReveal, onOpenAdd, onOpenEdit, onDelete,
  onSave, onPinInput, onPinDelete, onPinClose, onFormChange, onVaultModalClose,
}: Props) {

  // ── Lock Screen ───────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <View style={S.lockScreen}>
        <View style={S.lockIcon}>
          <Ionicons name="shield-checkmark" size={52} color="#7C3AED" />
        </View>
        <Text style={S.lockTitle}>Vault de Senhas</Text>
        <Text style={S.lockSub}>
          {isExpoGo
            ? 'PIN: 1234 (Expo Go)'
            : 'Acesso protegido por\nFace ID / Touch ID'}
        </Text>
        <TouchableOpacity style={S.unlockBtn} onPress={onLockOpen}>
          <Ionicons name={isExpoGo ? 'keypad-outline' : 'finger-print'} size={22} color="#fff" />
          <Text style={S.unlockBtnText}>
            {isExpoGo ? 'Digitar PIN' : 'Desbloquear Vault'}
          </Text>
        </TouchableOpacity>

        {/* PIN Modal para Expo Go */}
        <Modal visible={vaultPinModal} transparent animationType="fade">
          <View style={S.pinOverlay}>
            <View style={S.pinCard}>
              <Ionicons name="keypad" size={32} color="#7C3AED" style={{ marginBottom: 12 }} />
              <Text style={S.pinTitle}>Vault — PIN</Text>
              <View style={S.pinDots}>
                {[0,1,2,3].map(i => (
                  <View key={i} style={[S.pinDot, vaultPin.length > i && S.pinDotFilled]} />
                ))}
              </View>
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
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Vault Aberto ──────────────────────────────────────────────────────────
  return (
    <View style={S.container}>
      {/* Header do Vault */}
      <View style={S.vaultHeader}>
        <View style={S.vaultHeaderLeft}>
          <Ionicons name="shield-checkmark" size={20} color="#7C3AED" />
          <Text style={S.vaultHeaderTitle}>Vault Desbloqueado</Text>
          <View style={S.greenDot} />
        </View>
        <TouchableOpacity style={S.addBtn} onPress={onOpenAdd}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={S.addBtnText}>Nova Credencial</Text>
        </TouchableOpacity>
      </View>

      {/* Entradas */}
      {entries.length === 0 ? (
        <View style={S.empty}>
          <Ionicons name="key-outline" size={44} color="#E2D9FF" />
          <Text style={S.emptyText}>Nenhuma credencial salva{'\n'}Toque em "Nova Credencial" para começar</Text>
        </View>
      ) : (
        entries.map(entry => {
          const cat = VAULT_CATEGORIES[entry.category];
          const revealed = revealedIds.has(entry.id);
          return (
            <View key={entry.id} style={S.entryCard}>
              {/* Ícone da categoria */}
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
                    <Ionicons name={revealed ? 'eye-off' : 'eye'} size={16} color="#7C3AED" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={S.copyBtn}
                    onPress={() => {
                      (Clipboard as any).setString?.(entry.password);
                      Alert.alert('Copiado', 'Senha copiada para a área de transferência.');
                    }}
                  >
                    <Ionicons name="copy-outline" size={15} color="#7C3AED" />
                  </TouchableOpacity>
                </View>
                {entry.note ? <Text style={S.entryNote}>📌 {entry.note}</Text> : null}
              </View>

              <View style={S.entryActions}>
                <TouchableOpacity onPress={() => onOpenEdit(entry)} style={S.actionIcon}>
                  <Ionicons name="pencil" size={15} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(entry.id)} style={S.actionIcon}>
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* Modal de criação/edição */}
      <Modal visible={vaultModal} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalCard}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editEntry ? 'Editar Credencial' : 'Nova Credencial'}</Text>
              <TouchableOpacity onPress={onVaultModalClose}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Seletor de categoria */}
              <Text style={S.formLabel}>Tipo de Credencial</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CATEGORY_LIST.map(([key, meta]) => {
                    const active = vaultForm.category === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[S.catChip, active && { borderColor: meta.color, backgroundColor: meta.color + '15' }]}
                        onPress={() => onFormChange({ category: key })}
                      >
                        <Ionicons name={meta.icon as any} size={16} color={active ? meta.color : colors.textLight} />
                        <Text style={[S.catChipText, active && { color: meta.color }]}>{meta.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={S.formLabel}>Nome / Descrição *</Text>
              <TextInput
                style={S.formInput}
                value={vaultForm.label}
                onChangeText={t => onFormChange({ label: t })}
                placeholder="Ex: Wi-Fi Principal, Câmera Hall..."
              />

              <Text style={S.formLabel}>Usuário / Login</Text>
              <TextInput
                style={S.formInput}
                value={vaultForm.username}
                onChangeText={t => onFormChange({ username: t })}
                placeholder="admin, usuario@email.com..."
                autoCapitalize="none"
              />

              <Text style={S.formLabel}>Senha / Código *</Text>
              <TextInput
                style={S.formInput}
                value={vaultForm.password}
                onChangeText={t => onFormChange({ password: t })}
                placeholder="••••••••"
                secureTextEntry
                autoCorrect={false}
              />

              <Text style={S.formLabel}>Observações</Text>
              <TextInput
                style={[S.formInput, { minHeight: 70 }]}
                value={vaultForm.note}
                onChangeText={t => onFormChange({ note: t })}
                placeholder="Andar, local, frequência..."
                multiline
              />

              <TouchableOpacity style={S.saveBtn} onPress={onSave}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={S.saveBtnText}>Salvar no Vault</Text>
              </TouchableOpacity>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const PURPLE = '#7C3AED';

const S = StyleSheet.create({
  // Lock screen
  lockScreen: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  lockIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: PURPLE + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  lockTitle: { fontSize: 22, fontWeight: '900', color: PURPLE, marginBottom: 8 },
  lockSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: PURPLE, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, gap: 10, shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  unlockBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // PIN
  pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  pinCard: { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: 300, alignItems: 'center' },
  pinTitle: { fontSize: 18, fontWeight: '800', color: PURPLE, marginBottom: 20 },
  pinDots: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#E2D9FF' },
  pinDotFilled: { backgroundColor: PURPLE, borderColor: PURPLE },
  pinGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 216, gap: 12, justifyContent: 'center' },
  pinKey: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2D9FF' },
  pinKeyText: { fontSize: 22, fontWeight: '700', color: PURPLE },

  // Vault aberto
  container: { paddingBottom: 20 },
  vaultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  vaultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vaultHeaderTitle: { fontSize: 15, fontWeight: '800', color: PURPLE },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: PURPLE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Entry card
  entryCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F5F3FF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2D9FF' },
  catIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  entryLabel: { fontSize: 14, fontWeight: '800', color: PURPLE, flexShrink: 1 },
  catBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText: { fontSize: 10, fontWeight: '800' },
  entryUser: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#4C1D95', letterSpacing: 1 },
  eyeBtn: { padding: 4 },
  copyBtn: { padding: 4 },
  entryNote: { fontSize: 11, color: colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  entryActions: { flexDirection: 'column', gap: 8, marginLeft: 8 },
  actionIcon: { padding: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: PURPLE },
  formLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  formInput: { backgroundColor: '#F8F5FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: PURPLE, fontWeight: '600', borderWidth: 1, borderColor: '#E2D9FF', marginBottom: 14 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  catChipText: { fontSize: 12, fontWeight: '700', color: colors.textLight },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 15, marginTop: 8, shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
