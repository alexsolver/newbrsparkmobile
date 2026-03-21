import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, Image, Dimensions } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { ApiService } from '../../src/services/api';
import { Ionicons } from '@expo/vector-icons';
import { getSyncQueue } from '../../src/database';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MODULES = [
  { id: 'data', title: 'Ficha Cadastral', subtitle: 'Meus Dados', icon: 'person-outline' as const, color: '#3B82F6' },
  { id: 'sync', title: 'Sistema e Rede', subtitle: 'Nuvem Async', icon: 'cloud-upload-outline' as const, color: '#F59E0B' },
  { id: 'options', title: 'Preferências', subtitle: 'Interface e Login', icon: 'settings-outline' as const, color: '#8B5CF6' }
];

export default function ProfileScreen() {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Configurações do Perfil do Usuário
  const [profile, setProfile] = useState({
     name: 'João Silva',
     email: 'joao.silva@brspark.com',
     phone: '(11) 98888-7777',
     role: 'Gestor de Frota / Patrimônio',
     avatar: null as string | null
  });

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const saved = await AsyncStorage.getItem('@user_profile');
      if (saved) {
         setProfile(JSON.parse(saved));
      }
    };
    loadProfile();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      setQueueCount(getSyncQueue().length);
    }, [])
  );

  const saveProfile = async () => {
     await AsyncStorage.setItem('@user_profile', JSON.stringify(profile));
     setIsEditing(false);
     Alert.alert('Perfil Atualizado', 'Sua ficha cadastral corporativa foi salva localmente.');
  };

  const handleSync = async () => {
    setSyncing(true);
    const success = await ApiService.sync();
    setQueueCount(getSyncQueue().length);
    setSyncing(false);
    if (success) {
      Alert.alert('Sucesso', 'Sincronização concluída com o servidor SaaS!');
    } else {
      Alert.alert('Aviso', 'A sincronização falhou. Você ainda pode usar o app offline na fila.');
    }
  };

  const pickAvatar = () => {
    Alert.alert(
      'Foto de Perfil',
      'Como deseja definir seu Avatar personal em Nuvem?',
      [
        {
          text: '📸 Tirar Foto (Câmera)',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (perm.granted) {
              let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, quality: 0.5, aspect: [1, 1],
              });
              if (!result.canceled) {
                const newProfile = { ...profile, avatar: result.assets[0].uri };
                setProfile(newProfile);
                AsyncStorage.setItem('@user_profile', JSON.stringify(newProfile));
              }
            } else {
              Alert.alert('Erro', 'Permissão de câmera negada.');
            }
          }
        },
        {
          text: '🖼️ Rolo da Câmera',
          onPress: async () => {
            let result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true, quality: 0.5, aspect: [1, 1],
            });
            if (!result.canceled) {
              const newProfile = { ...profile, avatar: result.assets[0].uri };
              setProfile(newProfile);
              AsyncStorage.setItem('@user_profile', JSON.stringify(newProfile));
            }
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  const renderModuleContent = () => {
    switch(activeModule) {
      case 'data':
        return (
          <View style={styles.modContainer}>
             <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
               <Text style={styles.modSectionTitle}>Informações Corporativas</Text>
               {!isEditing && (
                  <TouchableOpacity onPress={() => setIsEditing(true)}>
                     <Text style={{color: colors.primary, fontWeight: '800'}}>EDITAR</Text>
                  </TouchableOpacity>
               )}
            </View>

            <Text style={styles.modLabel}>Nome Completo</Text>
            <TextInput style={[styles.modInput, !isEditing && {backgroundColor:'#f8fafc', opacity:0.8}]} value={profile.name} onChangeText={t => setProfile({...profile, name: t})} editable={isEditing} />

            <Text style={styles.modLabel}>Email Operacional</Text>
            <TextInput style={[styles.modInput, !isEditing && {backgroundColor:'#f8fafc', opacity:0.8}]} value={profile.email} onChangeText={t => setProfile({...profile, email: t})} editable={isEditing} keyboardType="email-address" />

            <Text style={styles.modLabel}>Telefone / Whatsapp</Text>
            <TextInput style={[styles.modInput, !isEditing && {backgroundColor:'#f8fafc', opacity:0.8}]} value={profile.phone} onChangeText={t => setProfile({...profile, phone: t})} editable={isEditing} keyboardType="phone-pad" />

            <Text style={styles.modLabel}>Departamento Funcional</Text>
            <TextInput style={[styles.modInput, !isEditing && {backgroundColor:'#f8fafc', opacity:0.8}, {marginBottom:0}]} value={profile.role} onChangeText={t => setProfile({...profile, role: t})} editable={isEditing} />

            {isEditing && (
              <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
                 <Ionicons name="checkmark-circle" size={24} color="#fff" style={{marginRight: 8}} />
                 <Text style={styles.saveBtnText}>Salvar Informações do Perfil</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      case 'sync':
        return (
          <View style={styles.modContainer}>
            <Text style={styles.modSectionTitle}>Monitoramento Back-end</Text>
            <View style={styles.syncRow}>
              <Text style={styles.syncLabel}>Ações Pendentes na Ficha Local</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{queueCount}</Text></View>
            </View>
            <Text style={{color: colors.textSecondary, marginBottom: 24, fontSize: 13, lineHeight: 18}}>A inteligência do BrSpark realiza o despache offline e submissões automaticamente. Este botão permite testar manualmente a robustez da rede e drenar a fila de transações pendentes para a nuvem.</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSync} disabled={syncing}>
               <Ionicons name="swap-vertical" size={20} color="#fff" style={{marginRight: 8}} />
               <Text style={styles.saveBtnText}>{syncing ? 'Conectando...' : 'Forçar Atualização na Nuvem'}</Text>
            </TouchableOpacity>
          </View>
        );
      case 'options':
        return (
          <View style={styles.modContainer}>
             <Text style={styles.modSectionTitle}>Interface Global</Text>
             <TouchableOpacity style={styles.optionRow}>
                <Ionicons name="moon" size={24} color={colors.primary} />
                <Text style={styles.optionText}>Ativar Modo Escuro B2B</Text>
                <View style={[styles.badge, {backgroundColor: '#DBEAFE'}]}><Text style={{color: colors.primary, fontSize: 10, fontWeight: '700'}}>BREVE</Text></View>
             </TouchableOpacity>
             <TouchableOpacity style={styles.optionRow}>
                <Ionicons name="notifications" size={24} color={colors.primary} />
                <Text style={styles.optionText}>Alertas PUSH de Sinistros</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.optionRow, {borderColor: '#FECACA', marginTop: 32}]} onPress={()=>Alert.alert('Alinhamento B2B', 'A equipe de segurança corporativa não permite desconexão offline (Riscos ISO).')}>
                <Ionicons name="log-out-outline" size={24} color={'#EF4444'} />
                <Text style={[styles.optionText, {color: '#EF4444'}]}>Suspender Sessão Local</Text>
             </TouchableOpacity>
          </View>
        );
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {activeModule ? (
         <View style={styles.subHeader}>
           <TouchableOpacity onPress={() => setActiveModule(null)} style={{padding: 4}}>
             <Ionicons name="arrow-back" size={24} color={colors.primary} />
           </TouchableOpacity>
           <Text style={styles.subHeaderTitle}>{MODULES.find(m=>m.id===activeModule)?.title}</Text>
           <View style={{width: 24}}></View>
         </View>
      ) : (
         <Header />
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Avatar Section - Visível sempre no topo */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
             <View style={styles.avatarWrapper}>
                {profile.avatar ? (
                   <Image source={{ uri: profile.avatar }} style={styles.avatarImage} />
                ) : (
                   <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={56} color={colors.primary} />
                   </View>
                )}
                <View style={styles.avatarEditBadge}>
                   <Ionicons name="camera" size={14} color="#fff" />
                </View>
             </View>
          </TouchableOpacity>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.role}>{profile.role}</Text>
        </View>

        {/* Grade de Módulos (Somente tela inicial) */}
        {!activeModule && (
          <View>
             <Text style={styles.sectionTitle}>Diretório Pessoal</Text>
             <View style={styles.gridContainer}>
               {MODULES.map(mod => (
                  <TouchableOpacity 
                    key={mod.id} 
                    style={styles.gridItem} 
                    activeOpacity={0.7}
                    onPress={() => setActiveModule(mod.id)}
                  >
                     <View style={[styles.iconBox, { backgroundColor: mod.color + '15' }]}>
                        <Ionicons name={mod.icon} size={32} color={mod.color} />
                     </View>
                     <Text style={styles.modTitle}>{mod.title}</Text>
                     <Text style={styles.modSubtitle} numberOfLines={1}>{mod.subtitle}</Text>
                  </TouchableOpacity>
               ))}
             </View>
          </View>
        )}

        {/* Formulário Profundo (Quando Módulo está Ativo) */}
        {activeModule && (
          <View style={styles.innerModuleView}>
             {renderModuleContent()}
          </View>
        )}

        <View style={{height: 60}} />
      </ScrollView>
    </View>
  );
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 32 - 24) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  
  // Header Auxiliar (Drill-down)
  subHeader: { height: 96, paddingTop: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border },
  subHeaderTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },

  // Avatar
  avatarContainer: { alignItems: 'center', marginBottom: 32, marginTop: 12 },
  avatarWrapper: { position: 'relative', width: 110, height: 110, borderRadius: 55, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 55 },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 55, backgroundColor: colors.primary + '11', justifyContent: 'center', alignItems: 'center' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primary, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.background },
  name: { fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: 16 },
  role: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontWeight: '600' },
  
  // Grid Principal
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, paddingHorizontal: 4, marginBottom: 16 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  iconBox: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  modSubtitle: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },

  // Inner Views
  innerModuleView: { backgroundColor: colors.cardWhite, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 },
  modContainer: { width: '100%' },
  modSectionTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  
  // Forms Internos
  modLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  modInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, fontSize: 15, backgroundColor: colors.cardWhite, marginBottom: 20, color: colors.primary, fontWeight: '500' },
  saveBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  // Sync / Options
  syncRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 16, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  syncLabel: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  badge: { backgroundColor: colors.warning.background, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  badgeText: { color: colors.warning.text, fontWeight: '800' },
  
  optionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, padding: 16, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.primary, marginLeft: 12 },
});
