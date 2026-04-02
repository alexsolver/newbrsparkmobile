import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Modal, Image, KeyboardAvoidingView, Platform, Keyboard, InputAccessoryView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { apiFetch } from '../../src/services/auth';
import { getLocalAssets } from '../../src/database';

export default function AssetShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [asset, setAsset] = useState<any>(null);
  const [shares, setShares] = useState<any[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

  const handleAddEmail = (input: string) => {
    const valid = input.split(/[\s,;]+/).filter(e => e.includes('@'));
    if (valid.length > 0) {
      setEmails(prev => [...new Set([...prev, ...valid])]);
    }
    setEmailInput('');
  };

  const removeEmail = (em: string) => {
    setEmails(prev => prev.filter(e => e !== em));
  };
  const [permission, setPermission] = useState<'READ' | 'WRITE'>('READ');
  const [selectedModules, setSelectedModules] = useState<string[]>(['*']); // default all
  const [shareChildren, setShareChildren] = useState(true);

  const [modalModVisible, setModalModVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingShare, setEditingShare] = useState<any>(null);

  const [expiresType, setExpiresType] = useState<'NEVER' | '8H' | '24H' | 'CUSTOM'>('NEVER');
  const [customExpiresAt, setCustomExpiresAt] = useState<Date>(new Date(Date.now() + 86400000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Keyboard Accessory ID
  const inputAccessoryViewID = Platform.OS === 'ios' ? 'shareEmailInput' : undefined;

  const MODULES_ARR = [
    { id: 'info', title: t('modules.info'), icon: 'information-circle-outline' },
    { id: 'media', title: t('modules.media'), icon: 'camera-outline' },
    { id: 'docs', title: t('modules.files'), icon: 'folder-open-outline' },
    { id: 'insurance', title: t('modules.insurance'), icon: 'shield-checkmark-outline' },
    { id: 'maint', title: t('modules.maintenance'), icon: 'construct-outline' },
    { id: 'costs', title: t('modules.costs'), icon: 'wallet-outline' },
    { id: 'stock', title: t('modules.stock'), icon: 'cube-outline' },
    { id: 'hier', title: t('modules.hierarchy'), icon: 'git-network-outline' },
    { id: 'vault', title: t('modules.security'), icon: 'lock-closed-outline' },
    { id: 'reports', title: t('modules.reports'), icon: 'document-text-outline' },
    { id: 'qr', title: t('modules.qrCode'), icon: 'qr-code-outline' },
    { id: 'ai', title: t('modules.aiConsultant'), icon: 'sparkles-outline' },
    { id: 'history', title: t('modules.history'), icon: 'time-outline' },
  ];

  useEffect(() => {
    const ast = getLocalAssets(user?.email || '').find(a => a.id === id);
    if (ast) {
      setAssetName(ast.title);
      setAsset(ast);
    }
    fetchShares();
  }, [id]);

  const fetchShares = async () => {
    try {
      const res = await apiFetch(`/api/shares/asset/${id}`);
      if (!res.ok) throw new Error('Failed to fetch shares');
      const data = await res.json();
      setShares(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setShares([]);
    }
  };

  const toggleModule = (modId: string) => {
    if (selectedModules.includes('*')) {
      setSelectedModules([modId]);
    } else {
      if (selectedModules.includes(modId)) {
        const next = selectedModules.filter(m => m !== modId);
        setSelectedModules(next.length === 0 ? ['*'] : next);
      } else {
        setSelectedModules([...selectedModules, modId]);
      }
    }
  };

  const handleInvite = async () => {
    const allEmails = [...new Set([...emails, ...emailInput.split(/[\s,;]+/).filter(e => e.includes('@'))])];
    if (allEmails.length === 0) {
      Alert.alert('E-mail inválido', 'Por favor, adicione pelo menos um e-mail válido.');
      return;
    }
    setLoading(true);
    
    let finalExpiresAt: string | null = null;
    if (expiresType === '8H') finalExpiresAt = new Date(Date.now() + 8 * 3600000).toISOString();
    if (expiresType === '24H') finalExpiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    if (expiresType === 'CUSTOM') finalExpiresAt = customExpiresAt.toISOString();

    let successCount = 0;
    try {
      for (const e of allEmails) {
        await apiFetch('/api/shares/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId: id,
            sharedWithEmail: e.trim(),
            permission,
            modules: selectedModules,
            shareChildren,
            expiresAt: finalExpiresAt
          })
        });
        successCount++;
      }
      setEmailInput('');
      setEmails([]);
      setIsAdding(false);
      fetchShares();
      Alert.alert('Sucesso', `Convite gerado e permissões configuradas para ${successCount} usuário(s)!`);
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível compartilhar.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditShare = async () => {
    if (!editingShare) return;
    setLoading(true);
    
    let finalExpiresAt: string | null = null;
    if (expiresType === '8H') finalExpiresAt = new Date(Date.now() + 8 * 3600000).toISOString();
    if (expiresType === '24H') finalExpiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    if (expiresType === 'CUSTOM') finalExpiresAt = customExpiresAt.toISOString();

    try {
      await apiFetch(`/api/shares/${id}/${editingShare.sharedWithEmail}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, modules: selectedModules, expiresAt: finalExpiresAt })
      });
      setIsAdding(false);
      setEditingShare(null);
      fetchShares();
      Alert.alert('Sucesso', 'Permissões atualizadas!');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível atualizar.');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (share: any) => {
    setEditingShare(share);
    setPermission(share.permission);
    let mods = ['*'];
    try { mods = typeof share.modules === 'string' ? JSON.parse(share.modules) : share.modules; } catch(e){}
    setSelectedModules(Array.isArray(mods) ? mods : ['*']);
    
    if (share.expiresAt) {
      setCustomExpiresAt(new Date(share.expiresAt));
      setExpiresType('CUSTOM'); // Or calculate if it matches 8H/24H, but CUSTOM is easier and clearer for edits
    } else {
      setExpiresType('NEVER');
    }
    
    setIsAdding(true);
  };

  const handleRevoke = async (sharedWith: string) => {
    Alert.alert('Remover acesso', `Tem certeza que deseja remover o acesso de ${sharedWith}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        try {
          await apiFetch(`/api/shares/${id}/${sharedWith}`, { method: 'DELETE' });
          fetchShares();
        } catch (e) {
           Alert.alert('Erro', 'Não foi possível remover.');
        }
      }}
    ]);
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* FIXED ASSET HEADER */}
      {asset && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
          <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.accent + '18', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            {asset.imageUrl
              ? <Image source={{ uri: asset.imageUrl }} style={{ width: 72, height: 72 }} />
              : <Ionicons name="cube-outline" size={34} color={colors.accent} />
            }
          </View>
          <View style={{ marginLeft: 16, flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#191C1D', letterSpacing: -0.5 }}>{asset.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Ionicons name="people-outline" size={11} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: '900', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Compartilhamento
              </Text>
            </View>
          </View>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        {!isAdding ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 13, color: colors.slate, fontWeight: '700' }}>
                Pessoas com acesso ao ativo
              </Text>
              <TouchableOpacity onPress={() => setIsAdding(true)} style={styles.stdAddBtn}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {shares.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 40, backgroundColor: '#F8FAFC', borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="people-outline" size={48} color={colors.slate} style={{ marginBottom: 16, opacity: 0.5 }} />
                <Text style={{ fontSize: 14, color: colors.slate, fontWeight: '800', textAlign: 'center' }}>Ninguém tem acesso</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8 }}>Convide membros para visualizar ou editar este bem.</Text>
              </View>
            ) : (
              shares.map(s => (
                <TouchableOpacity 
                  key={s.id} 
                  onPress={() => openEdit(s)}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Ionicons name="person-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.slate }}>{s.sharedWithEmail}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                      <View style={{ backgroundColor: s.permission === 'WRITE' ? '#FEF2F2' : '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                         <Text style={{ fontSize: 9, fontWeight: '800', color: s.permission === 'WRITE' ? '#EF4444' : '#3B82F6' }}>{s.permission === 'WRITE' ? 'EDIÇÃO' : 'LEITURA'}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                        {s.status === 'PENDING' ? '⏳ Pendente' : 'Ativo'}
                        {s.expiresAt && ` • ${new Date(s.expiresAt) < new Date() ? 'Expirado' : `Até ${new Date(s.expiresAt).toLocaleDateString()} ${new Date(s.expiresAt).getHours()}:${String(new Date(s.expiresAt).getMinutes()).padStart(2, '0')}`}`}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleRevoke(s.sharedWithEmail)} style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
              <Text style={{ fontSize: 13, color: colors.slate, fontWeight: '700' }}>
                {editingShare ? `Editando: ${editingShare.sharedWithEmail}` : 'Novo Compartilhamento'}
              </Text>
              <TouchableOpacity onPress={() => { setIsAdding(false); setEditingShare(null); }}>
                <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '800' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              {!editingShare && (
                <>
                  <Text style={styles.label}>E-mails dos Convidados</Text>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: emails.length > 0 ? 12 : 0 }}>
                {emails.map(em => (
                  <View key={em} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
                     <Text style={{ fontSize: 13, color: colors.accent, fontWeight: '700', marginRight: 6 }}>{em}</Text>
                     <TouchableOpacity onPress={() => removeEmail(em)}>
                       <Ionicons name="close-circle" size={16} color={colors.accent} />
                     </TouchableOpacity>
                  </View>
                ))}
              </View>

              <TextInput 
                style={[styles.input, { marginBottom: 20 }]} 
                placeholder="Digite o e-mail e pressione Espaço" 
                autoCapitalize="none"
                keyboardType="email-address"
                value={emailInput}
                onChangeText={(text) => {
                  if (text.endsWith(' ') || text.endsWith(',') || text.endsWith(';')) {
                    handleAddEmail(text);
                  } else {
                    setEmailInput(text);
                  }
                }}
                onSubmitEditing={() => handleAddEmail(emailInput)}
                blurOnSubmit={false}
                inputAccessoryViewID={inputAccessoryViewID}
              />

              {Platform.OS === 'ios' && inputAccessoryViewID && (
                <InputAccessoryView nativeID={inputAccessoryViewID}>
                  <View style={styles.accessoryContainer}>
                    <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.accessoryBtn}>
                      <Text style={styles.accessoryBtnText}>Feito ✓</Text>
                    </TouchableOpacity>
                  </View>
                </InputAccessoryView>
              )}
              </>
              )}

          <Text style={styles.label}>Nível de Permissão</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <TouchableOpacity 
              style={[styles.permBtn, permission === 'READ' && styles.permBtnActive]} 
              onPress={() => setPermission('READ')}
            >
              <Ionicons name="eye-outline" size={18} color={permission === 'READ' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.permBtnText, permission === 'READ' && { color: colors.primary }]}>Leitura</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.permBtn, permission === 'WRITE' && styles.permBtnActive]} 
              onPress={() => setPermission('WRITE')}
            >
              <Ionicons name="create-outline" size={18} color={permission === 'WRITE' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.permBtnText, permission === 'WRITE' && { color: colors.primary }]}>Edição</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Módulos Permitidos ({selectedModules.includes('*') ? 'Todos' : selectedModules.length})</Text>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: 12, marginBottom: 20 }}
            onPress={() => setModalModVisible(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
               <Ionicons name="grid-outline" size={20} color={colors.primary} />
               <Text style={{ fontSize: 13, fontWeight: '800', color: colors.slate }}>
                 {selectedModules.includes('*') ? 'Acesso Total' : `${selectedModules.length} módulos customizados selecionados`}
               </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={styles.label}>Validade do Acesso</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: expiresType === 'CUSTOM' ? 12 : 24 }}>
            <TouchableOpacity style={[styles.timeBtn, expiresType === 'NEVER' && styles.timeBtnActive]} onPress={() => setExpiresType('NEVER')}>
               <Ionicons name="infinite-outline" size={14} color={expiresType === 'NEVER' ? '#fff' : colors.textSecondary} />
               <Text style={[styles.timeBtnText, expiresType === 'NEVER' && { color: '#fff' }]}>Permanente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.timeBtn, expiresType === '8H' && styles.timeBtnActive]} onPress={() => setExpiresType('8H')}>
               <Ionicons name="time-outline" size={14} color={expiresType === '8H' ? '#fff' : colors.textSecondary} />
               <Text style={[styles.timeBtnText, expiresType === '8H' && { color: '#fff' }]}>8 Horas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.timeBtn, expiresType === '24H' && styles.timeBtnActive]} onPress={() => setExpiresType('24H')}>
               <Ionicons name="time-outline" size={14} color={expiresType === '24H' ? '#fff' : colors.textSecondary} />
               <Text style={[styles.timeBtnText, expiresType === '24H' && { color: '#fff' }]}>24 Horas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.timeBtn, expiresType === 'CUSTOM' && styles.timeBtnActive]} onPress={() => setExpiresType('CUSTOM')}>
               <Ionicons name="calendar-outline" size={14} color={expiresType === 'CUSTOM' ? '#fff' : colors.textSecondary} />
               <Text style={[styles.timeBtnText, expiresType === 'CUSTOM' && { color: '#fff' }]}>Data Limite</Text>
            </TouchableOpacity>
          </View>

          {expiresType === 'CUSTOM' && (
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 24 }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>Expira em</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.slate }}>{customExpiresAt.toLocaleString()}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>Alterar</Text>
                </TouchableOpacity>
             </View>
          )}

          {showDatePicker && (
             <DateTimePicker
                value={customExpiresAt}
                mode="datetime"
                display="default"
                minimumDate={new Date()}
                onChange={(event, date) => {
                   setShowDatePicker(false);
                   if (date) setCustomExpiresAt(date);
                }}
             />
          )}

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, padding: 12, backgroundColor: shareChildren ? colors.primary + '10' : '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: shareChildren ? colors.primary + '40' : colors.border }}
            onPress={() => setShareChildren(!shareChildren)}
          >
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: shareChildren ? colors.primary : colors.textSecondary, justifyContent: 'center', alignItems: 'center', marginRight: 12, backgroundColor: shareChildren ? colors.primary : 'transparent' }}>
              {shareChildren && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.slate }}>Aplicar aos filhos (Recomendado)</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Motos, botes ou acessórios vinculados também herdarão essa permissão automática.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={editingShare ? handleEditShare : handleInvite}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{editingShare ? 'Salvar Alterações' : 'Enviar Convite'}</Text>}
          </TouchableOpacity>
        </View>
        </>
        )}

      </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL DE SELEÇÃO DE MÓDULOS */}
      <Modal visible={modalModVisible} animationType="slide" transparent onRequestClose={() => setModalModVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.slate }}>Permissões de Módulo</Text>
              <TouchableOpacity onPress={() => setModalModVisible(false)}>
                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, backgroundColor: selectedModules.includes('*') ? colors.primary + '15' : '#F8FAFC', borderWidth: 1, borderColor: selectedModules.includes('*') ? colors.primary : colors.border, marginBottom: 16 }}
              onPress={() => setSelectedModules(['*'])}
            >
              <Ionicons name="star" size={20} color={selectedModules.includes('*') ? colors.primary : colors.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: selectedModules.includes('*') ? colors.primary : colors.slate }}>Acesso Total</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Permite visualizar todos os módulos atuais e futuros.</Text>
              </View>
              {selectedModules.includes('*') && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 8 }}>Acesso Customizado</Text>
              {MODULES_ARR.map(m => (
                <TouchableOpacity 
                  key={m.id}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' }}
                  onPress={() => toggleModule(m.id)}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceLow, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Ionicons name={m.icon as any} size={18} color={colors.slate} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.slate }}>{m.title}</Text>
                  
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: (selectedModules.includes(m.id) && !selectedModules.includes('*')) ? colors.primary : colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: (selectedModules.includes(m.id) && !selectedModules.includes('*')) ? colors.primary : 'transparent' }}>
                    {(selectedModules.includes(m.id) && !selectedModules.includes('*')) && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <View style={{ marginTop: 20 }}>
               <TouchableOpacity style={styles.primaryBtn} onPress={() => setModalModVisible(false)}>
                 <Text style={styles.primaryBtnText}>Concluir Seleção</Text>
               </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate,
    marginBottom: 20
  },
  permBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    gap: 8
  },
  permBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10'
  },
  permBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary
  },
  chipTextActive: {
    color: '#fff'
  },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    gap: 6
  },
  timeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  timeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center'
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  stdAddBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  accessoryContainer: {
    backgroundColor: '#F1F5F9',
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  accessoryBtn: {
    backgroundColor: '#191C1D',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  accessoryBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  }
});
