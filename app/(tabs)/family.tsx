import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  FlatList, Alert, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import {
  initFamilyDatabase, getFamilyAssets, getFamilyMembers,
  saveFamilyAsset, saveFamilyMember, deleteFamilyAsset,
  FamilyAsset, FamilyMember,
} from '../../src/database/family';

// ─── Paleta "Âmbar Privado" (distinta do azul corporativo) ─────────────────────
const AMBER = {
  primary:    '#92400E',
  accent:     '#D97706',
  light:      '#FEF3C7',
  border:     '#FDE68A',
  background: '#FFFBEB',
  card:       '#FFFFFF',
  text:       '#1C1917',
  textSec:    '#78716C',
};

const CATEGORIES: Record<string, { label: string; icon: any; color: string }> = {
  PROPERTY:   { label: 'Imóveis',        icon: 'home',              color: '#B45309' },
  VEHICLE:    { label: 'Veículos',        icon: 'car',               color: '#D97706' },
  INVESTMENT: { label: 'Investimentos',   icon: 'trending-up',       color: '#059669' },
  INSURANCE:  { label: 'Seguros',         icon: 'shield-checkmark',  color: '#DC2626' },
  DOCUMENT:   { label: 'Documentos',      icon: 'document-text',     color: '#7C3AED' },
  PENSION:    { label: 'Previdência',     icon: 'leaf',              color: '#0891B2' },
};

const RELATIONSHIPS = ['Cônjuge', 'Filho(a)', 'Pai', 'Mãe', 'Irmão/Irmã', 'Neto(a)', 'Outro'];

export default function FamilyScreen() {
  const [unlocked,    setUnlocked]    = useState(false);
  const [checking,    setChecking]    = useState(true);
  const [assets,      setAssets]      = useState<FamilyAsset[]>([]);
  const [members,     setMembers]     = useState<FamilyMember[]>([]);
  const [activeTab,   setActiveTab]   = useState<'assets' | 'members'>('assets');
  const [filterCat,   setFilterCat]   = useState<string>('ALL');

  // ── Modais ────────────────────────────────────────────────────────────────────
  const [assetModal,  setAssetModal]  = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [pinModal,    setPinModal]    = useState(false);
  const [pinInput,    setPinInput]    = useState('');
  const [assetForm,   setAssetForm]   = useState<Partial<FamilyAsset>>({ category: 'PROPERTY' });
  const [memberForm,  setMemberForm]  = useState<Partial<FamilyMember>>({ relationship: 'Cônjuge' });

  const isExpoGo = Constants.appOwnership === 'expo';
  const PIN_DEV  = '1234'; // PIN apenas para testar no Expo Go

  // ── Autenticação Biométrica (com fallback PIN para Expo Go) ──────────────────
  const authenticate = useCallback(async () => {
    setChecking(true);

    // Expo Go no iOS não tem permissão de Face ID — usa PIN de desenvolvimento
    if (isExpoGo) {
      setChecking(false);
      setPinInput('');
      setPinModal(true);
      return;
    }

    const hasBio = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasBio || !enrolled) {
      Alert.alert('Cofre Familiar', 'Biometria não disponível. Acesso liberado.');
      setUnlocked(true);
      await initFamilyDatabase();
      loadData();
      setChecking(false);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Autentique-se para acessar o Cofre Familiar',
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar Senha',
    });

    if (result.success) {
      setUnlocked(true);
      await initFamilyDatabase();
      loadData();
    } else {
      Alert.alert('Acesso Negado', 'Biometria não reconhecida.');
    }
    setChecking(false);
  }, [isExpoGo]);

  const loadData = async () => {
    const [a, m] = await Promise.all([getFamilyAssets(), getFamilyMembers()]);
    setAssets(a);
    setMembers(m);
  };

  useEffect(() => { authenticate(); }, []);

  // ── Re-lock ao sair da aba ────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      // Ao ganhar foco: se estiver bloqueado, autentica
      if (!unlocked) authenticate();

      return () => {
        // Ao PERDER foco (sair da aba): bloqueia imediatamente
        setUnlocked(false);
      };
    }, [unlocked])
  );

  // ── Save Handlers ─────────────────────────────────────────────────────────────
  const handleSaveAsset = async () => {
    if (!assetForm.title?.trim()) { Alert.alert('Atenção', 'Insira o nome do bem.'); return; }
    const now = Date.now();
    await saveFamilyAsset({
      id: `fa_${now}`, category: 'PROPERTY',
      ...assetForm, createdAt: now, updatedAt: now,
    } as FamilyAsset);
    setAssetModal(false);
    setAssetForm({ category: 'PROPERTY' });
    loadData();
  };

  const handleSaveMember = async () => {
    if (!memberForm.name?.trim()) { Alert.alert('Atenção', 'Insira o nome do familiar.'); return; }
    await saveFamilyMember({
      id: `fm_${Date.now()}`, relationship: 'Cônjuge',
      ...memberForm,
    } as FamilyMember);
    setMemberModal(false);
    setMemberForm({ relationship: 'Cônjuge' });
    loadData();
  };

  const handleDeleteAsset = (id: string, title: string) => {
    Alert.alert('Excluir Bem', `Remover "${title}" do Cofre Familiar?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await deleteFamilyAsset(id); loadData(); } },
    ]);
  };

  // ── Tela de Lock ─────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={AMBER.accent} size="large" />
        <Text style={[styles.lockSub, { marginTop: 16 }]}>Verificando biometria...</Text>
      </View>
    );
  }

  if (!unlocked) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 40 }]}>
        <View style={styles.lockIcon}>
          <Ionicons name="shield-checkmark" size={52} color={AMBER.accent} />
        </View>
        <Text style={styles.lockTitle}>Cofre Patrimonial Familiar</Text>
        <Text style={styles.lockSub}>Esta área é protegida por biometria.{'\n'}Seus dados pessoais são criptografados.</Text>
        <TouchableOpacity style={styles.unlockBtn} onPress={authenticate}>
          <Ionicons name="finger-print" size={22} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.unlockBtnText}>Autenticar com Face ID / Touch ID</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const filteredAssets = filterCat === 'ALL' ? assets : assets.filter(a => a.category === filterCat);

  // ── Tela Principal ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top']} style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Cofre Familiar</Text>
          <Text style={styles.headerSub}>{assets.length} bens · {members.length} familiar{members.length !== 1 ? 'es' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => activeTab === 'assets' ? setAssetModal(true) : setMemberModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'assets' && styles.tabItemActive]} onPress={() => setActiveTab('assets')}>
          <Ionicons name="briefcase-outline" size={16} color={activeTab === 'assets' ? AMBER.accent : AMBER.textSec} />
          <Text style={[styles.tabText, activeTab === 'assets' && styles.tabTextActive]}>Patrimônio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'members' && styles.tabItemActive]} onPress={() => setActiveTab('members')}>
          <Ionicons name="people-outline" size={16} color={activeTab === 'members' ? AMBER.accent : AMBER.textSec} />
          <Text style={[styles.tabText, activeTab === 'members' && styles.tabTextActive]}>Família</Text>
        </TouchableOpacity>
      </View>

      {/* Painel: Patrimônio */}
      {activeTab === 'assets' && (
        <>
          {/* Filtro por Categoria */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, filterCat === 'ALL' && styles.filterChipActive]}
              onPress={() => setFilterCat('ALL')}>
              <Text style={[styles.filterText, filterCat === 'ALL' && styles.filterTextActive]}>Todos</Text>
            </TouchableOpacity>
            {Object.entries(CATEGORIES).map(([key, cfg]) => (
              <TouchableOpacity key={key}
                style={[styles.filterChip, filterCat === key && styles.filterChipActive]}
                onPress={() => setFilterCat(key)}>
                <Ionicons name={cfg.icon} size={11} color={filterCat === key ? '#fff' : cfg.color} style={{ marginRight: 4 }} />
                <Text style={[styles.filterText, filterCat === key && styles.filterTextActive]}>{cfg.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredAssets}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="lock-closed-outline" size={52} color={AMBER.border} />
                <Text style={styles.emptyText}>Nenhum bem registrado{'\n'}Toque em + para adicionar</Text>
              </View>
            }
            renderItem={({ item }) => {
              const cfg = CATEGORIES[item.category];
              const sharedMembers = members.filter(m => item.sharedWith?.includes(m.id));
              return (
                <View style={styles.card}>
                  <View style={[styles.cardIcon, { backgroundColor: cfg.color + '18' }]}>
                    <Ionicons name={cfg.icon} size={22} color={cfg.color} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSub}>
                      {cfg.label}{item.institution ? ` · ${item.institution}` : ''}
                      {item.value ? `  •  R$ ${Number(item.value).toLocaleString('pt-BR')}` : ''}
                    </Text>
                    {item.expiryDate ? (
                      <Text style={styles.cardExpiry}>📅 Vence: {item.expiryDate}</Text>
                    ) : null}
                    {/* Avatares dos familiares com acesso */}
                    {sharedMembers.length > 0 && (
                      <View style={styles.sharedRow}>
                        <Ionicons name="people" size={11} color={AMBER.accent} />
                        {sharedMembers.slice(0, 4).map((m, i) => (
                          <View key={m.id} style={[styles.memberAvatar, { marginLeft: i === 0 ? 4 : -6, zIndex: 10 - i }]}>
                            <Text style={styles.memberAvatarText}>
                              {m.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                            </Text>
                          </View>
                        ))}
                        {sharedMembers.length > 4 && (
                          <Text style={styles.sharedMore}>+{sharedMembers.length - 4}</Text>
                        )}
                        <Text style={styles.sharedLabel}>com acesso</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteAsset(item.id, item.title)} style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </>
      )}

      {/* Painel: Família */}
      {activeTab === 'members' && (
        <FlatList
          data={members}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={52} color={AMBER.border} />
              <Text style={styles.emptyText}>Nenhum familiar cadastrado{'\n'}Toque em + para vincular</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.cardIcon, { backgroundColor: AMBER.light }]}>
                <Ionicons name="person" size={22} color={AMBER.accent} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.relationship}{item.cpf ? ` · CPF: ${item.cpf}` : ''}</Text>
                {item.birthDate ? <Text style={styles.cardExpiry}>🎂 {item.birthDate}</Text> : null}
              </View>
            </View>
          )}
        />
      )}

      {/* Modal: Novo Bem */}
      <Modal visible={assetModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView edges={['top']} style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo Bem Patrimonial</Text>
            <TouchableOpacity onPress={() => setAssetModal(false)}>
              <Ionicons name="close" size={26} color={AMBER.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.label}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {Object.entries(CATEGORIES).map(([key, cfg]) => (
                  <TouchableOpacity key={key}
                    style={[styles.catChip, assetForm.category === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                    onPress={() => setAssetForm(f => ({ ...f, category: key as any }))}>
                    <Ionicons name={cfg.icon} size={14} color={assetForm.category === key ? '#fff' : cfg.color} />
                    <Text style={[styles.catChipText, assetForm.category === key && { color: '#fff' }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.label}>Nome / Descrição *</Text>
            <TextInput style={styles.input} value={assetForm.title} onChangeText={t => setAssetForm(f => ({ ...f, title: t }))} placeholder="Ex: Apartamento Centro SP" />
            <Text style={styles.label}>Instituição / Seguradora</Text>
            <TextInput style={styles.input} value={assetForm.institution} onChangeText={t => setAssetForm(f => ({ ...f, institution: t }))} placeholder="Ex: Itaú, Porto Seguro..." />
            <Text style={styles.label}>Valor Estimado (R$)</Text>
            <TextInput style={styles.input} value={assetForm.value?.toString()} keyboardType="numeric" onChangeText={t => setAssetForm(f => ({ ...f, value: parseFloat(t) || undefined }))} placeholder="0,00" />
            <Text style={styles.label}>Data de Vencimento / Validade</Text>
            <TextInput style={styles.input} value={assetForm.expiryDate} onChangeText={t => setAssetForm(f => ({ ...f, expiryDate: t }))} placeholder="DD/MM/AAAA" />
            <Text style={styles.label}>Observações</Text>
            <TextInput style={[styles.input, { minHeight: 80 }]} multiline value={assetForm.notes} onChangeText={t => setAssetForm(f => ({ ...f, notes: t }))} placeholder="Anotações livres..." />

            {/* Compartilhamento com familiares */}
            {members.length > 0 && (
              <>
                <Text style={styles.label}>Compartilhar com Familiar</Text>
                <Text style={{ fontSize: 12, color: AMBER.textSec, marginBottom: 12, lineHeight: 18 }}>
                  Selecione quem pode visualizar os detalhes deste bem.
                </Text>
                {members.map(m => {
                  const isSelected = (assetForm.sharedWith || []).includes(m.id);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.memberRow, isSelected && styles.memberRowSelected]}
                      onPress={() => {
                        const cur = assetForm.sharedWith || [];
                        const next = isSelected ? cur.filter(id => id !== m.id) : [...cur, m.id];
                        setAssetForm(f => ({ ...f, sharedWith: next }));
                      }}
                    >
                      <View style={[styles.memberCheck, isSelected && styles.memberCheckActive]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <View style={[styles.memberAvatarLg, { backgroundColor: AMBER.light }]}>
                        <Text style={styles.memberAvatarLgText}>
                          {m.name.split(' ').map((w: string) => w[0]).slice(0,2).join('')}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '800', color: AMBER.text, fontSize: 14 }}>{m.name}</Text>
                        <Text style={{ fontSize: 12, color: AMBER.textSec }}>{m.relationship}</Text>
                      </View>
                      {isSelected && <Ionicons name="eye" size={16} color={AMBER.accent} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 8 }} />
              </>
            )}
            {members.length === 0 && (
              <View style={styles.noMembersHint}>
                <Ionicons name="people-outline" size={18} color={AMBER.textSec} />
                <Text style={{ fontSize: 12, color: AMBER.textSec, marginLeft: 8 }}>
                  Cadastre familiares na aba "Família" para poder compartilhar
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAsset}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnText}>Registrar no Cofre</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal: Novo Familiar */}
      <Modal visible={memberModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView edges={['top']} style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Vincular Familiar</Text>
            <TouchableOpacity onPress={() => setMemberModal(false)}>
              <Ionicons name="close" size={26} color={AMBER.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.label}>Nome Completo *</Text>
            <TextInput style={styles.input} value={memberForm.name} onChangeText={t => setMemberForm(f => ({ ...f, name: t }))} placeholder="Ex: Maria da Silva" />
            <Text style={styles.label}>Vínculo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity key={r}
                    style={[styles.catChip, memberForm.relationship === r && { backgroundColor: AMBER.accent, borderColor: AMBER.accent }]}
                    onPress={() => setMemberForm(f => ({ ...f, relationship: r }))}>
                    <Text style={[styles.catChipText, memberForm.relationship === r && { color: '#fff' }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.label}>CPF</Text>
            <TextInput style={styles.input} value={memberForm.cpf} onChangeText={t => setMemberForm(f => ({ ...f, cpf: t }))} placeholder="000.000.000-00" keyboardType="numeric" />
            <Text style={styles.label}>Data de Nascimento</Text>
            <TextInput style={styles.input} value={memberForm.birthDate} onChangeText={t => setMemberForm(f => ({ ...f, birthDate: t }))} placeholder="DD/MM/AAAA" />
            <Text style={styles.label}>E-mail</Text>
            <TextInput style={styles.input} value={memberForm.email} onChangeText={t => setMemberForm(f => ({ ...f, email: t }))} placeholder="email@exemplo.com" keyboardType="email-address" />
            <Text style={styles.label}>Telefone</Text>
            <TextInput style={styles.input} value={memberForm.phone} onChangeText={t => setMemberForm(f => ({ ...f, phone: t }))} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMember}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnText}>Vincular ao Núcleo Familiar</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal: PIN (Expo Go fallback) */}
      <Modal visible={pinModal} animationType="fade" transparent>
        <View style={styles.pinOverlay}>
          <View style={styles.pinCard}>
            <View style={styles.lockIcon}>
              <Ionicons name="keypad" size={36} color={AMBER.accent} />
            </View>
            <Text style={styles.pinTitle}>Cofre Familiar</Text>
            <Text style={styles.pinSub}>
              Digite o PIN para acessar{'\n'}
              <Text style={{ fontSize: 11, color: AMBER.textSec }}>
                (Em produção será Face ID / Touch ID)
              </Text>
            </Text>
            <View style={styles.pinDots}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[styles.pinDot, pinInput.length > i && styles.pinDotFilled]} />
              ))}
            </View>
            <View style={styles.pinGrid}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.pinKey, k === '' && { opacity: 0 }]}
                  disabled={k === ''}
                  onPress={() => {
                    if (k === '⌫') {
                      setPinInput(p => p.slice(0,-1));
                    } else {
                      const next = pinInput + k;
                      setPinInput(next);
                      if (next.length === 4) {
                        if (next === PIN_DEV) {
                          setPinModal(false);
                          setUnlocked(true);
                          initFamilyDatabase().then(loadData);
                        } else {
                          Alert.alert('PIN Incorreto', 'Tente novamente.');
                          setPinInput('');
                        }
                      }
                    }
                  }}
                >
                  <Text style={styles.pinKeyText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPinModal(false)} style={{ marginTop: 8 }}>
              <Text style={{ color: AMBER.textSec, fontSize: 14, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AMBER.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: AMBER.card, borderBottomWidth: 1, borderBottomColor: AMBER.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: AMBER.primary },
  headerSub:   { fontSize: 13, color: AMBER.textSec, fontWeight: '600', marginTop: 2 },
  addBtn: {
    backgroundColor: AMBER.accent, width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: AMBER.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },

  tabBar: {
    flexDirection: 'row', backgroundColor: AMBER.card,
    borderBottomWidth: 1, borderBottomColor: AMBER.border,
  },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: AMBER.accent },
  tabText: { fontSize: 13, fontWeight: '700', color: AMBER.textSec },
  tabTextActive: { color: AMBER.accent },

  filterScroll: { flexGrow: 0, backgroundColor: AMBER.card, borderBottomWidth: 1, borderBottomColor: AMBER.border },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: AMBER.border, backgroundColor: AMBER.card },
  filterChipActive: { backgroundColor: AMBER.accent, borderColor: AMBER.accent },
  filterText: { fontSize: 11, fontWeight: '700', color: AMBER.textSec },
  filterTextActive: { color: '#fff' },

  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: AMBER.card,
    borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: AMBER.border,
    shadowColor: AMBER.accent, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: AMBER.text, marginBottom: 3 },
  cardSub: { fontSize: 12, color: AMBER.textSec, fontWeight: '600' },
  cardExpiry: { fontSize: 11, color: AMBER.accent, fontWeight: '700', marginTop: 4 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 14 },
  emptyText: { fontSize: 15, color: AMBER.textSec, fontWeight: '600', textAlign: 'center', lineHeight: 22 },

  lockIcon: { backgroundColor: AMBER.light, width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  lockTitle: { fontSize: 24, fontWeight: '800', color: AMBER.primary, textAlign: 'center', marginBottom: 12 },
  lockSub: { fontSize: 15, color: AMBER.textSec, textAlign: 'center', lineHeight: 22, marginBottom: 40 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: AMBER.accent, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24, width: '100%',
    shadowColor: AMBER.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  unlockBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  modal: { flex: 1, backgroundColor: AMBER.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: AMBER.border, backgroundColor: AMBER.card },
  modalTitle: { fontSize: 20, fontWeight: '800', color: AMBER.primary },
  modalBody: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 11, fontWeight: '800', color: AMBER.textSec, textTransform: 'uppercase', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: AMBER.border, borderRadius: 10, padding: 14, fontSize: 15, backgroundColor: AMBER.card, marginBottom: 20, color: AMBER.text, fontWeight: '600' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: AMBER.border, backgroundColor: AMBER.card },
  catChipText: { fontSize: 12, fontWeight: '700', color: AMBER.textSec },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: AMBER.accent, borderRadius: 14, paddingVertical: 16, marginTop: 8, shadowColor: AMBER.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Compartilhamento
  sharedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  memberAvatar: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: AMBER.accent, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  memberAvatarText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  sharedMore: { fontSize: 10, color: AMBER.textSec, fontWeight: '700', marginLeft: 6 },
  sharedLabel: { fontSize: 10, color: AMBER.textSec, fontWeight: '600', marginLeft: 6 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, marginBottom: 10,
    borderWidth: 1.5, borderColor: AMBER.border, backgroundColor: AMBER.card,
  },
  memberRowSelected: { borderColor: AMBER.accent, backgroundColor: AMBER.light },
  memberCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: AMBER.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff',
  },
  memberCheckActive: { backgroundColor: AMBER.accent, borderColor: AMBER.accent },
  memberAvatarLg: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memberAvatarLgText: { fontSize: 13, fontWeight: '800', color: AMBER.accent },
  noMembersHint: { flexDirection: 'row', alignItems: 'center', backgroundColor: AMBER.light, padding: 12, borderRadius: 10, marginBottom: 20 },

  // Teclado PIN (Expo Go fallback)
  pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  pinCard: { backgroundColor: AMBER.card, borderRadius: 24, padding: 28, width: 300, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  pinTitle: { fontSize: 20, fontWeight: '800', color: AMBER.primary, marginBottom: 4, marginTop: 12 },
  pinSub: { fontSize: 14, color: AMBER.textSec, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  pinDots: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: AMBER.border, backgroundColor: 'transparent' },
  pinDotFilled: { backgroundColor: AMBER.accent, borderColor: AMBER.accent },
  pinGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 216, gap: 12, justifyContent: 'center' },
  pinKey: { width: 60, height: 60, borderRadius: 30, backgroundColor: AMBER.light, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: AMBER.border },
  pinKeyText: { fontSize: 22, fontWeight: '700', color: AMBER.primary },
});
