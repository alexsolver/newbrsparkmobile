import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput, Switch, ActivityIndicator, Modal, Clipboard } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, getChildAssets, getAssetAncestors, updateAssetParent, queueOfflineAction, saveAssetsLocal, softDeleteAssetLocal, logAssetHistory, getAssetHistoryLocal } from '../../src/database';
import { colors } from '../../src/theme/colors';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ApiService } from '../../src/services/api';
import QRCode from 'react-native-qrcode-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { AssetVaultService, VaultEntry, VaultCategory, VAULT_CATEGORIES } from '../../src/services/assetVault';
import { VaultModule } from '../../src/components/VaultModule';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const MODULES = [
  { id: 'info', title: 'Ficha Geral', subtitle: 'Registros', icon: 'information-circle-outline' as const, color: '#3B82F6' },
  { id: 'docs', title: 'Documentos', subtitle: 'Vault (PDFs)', icon: 'folder-open-outline' as const, color: '#8B5CF6' },
  { id: 'maint', title: 'Manutenção', subtitle: 'Workflow SOS', icon: 'build-outline' as const, color: '#F59E0B' },
  { id: 'vault',   title: 'Vault',         subtitle: 'Cofre de Senhas',  icon: 'lock-closed' as const,            color: '#7C3AED' },
  { id: 'costs',   title: 'Custos',         subtitle: 'Métricas TCO',   icon: 'cash-outline' as const,           color: '#10B981' },
  { id: 'insurance', title: 'Seguros',      subtitle: 'Apólices Ativas', icon: 'shield-checkmark-outline' as const, color: '#EF4444' },
  { id: 'contacts',  title: 'Equipe',       subtitle: 'Prestadores',     icon: 'people-outline' as const,         color: '#6366F1' },
  { id: 'hier',    title: 'Hierarquia',     subtitle: 'Sub-ativos',      icon: 'git-branch-outline' as const,     color: '#0891B2' },
  { id: 'history', title: 'Histórico',      subtitle: 'Eventos GMS',    icon: 'time-outline' as const,           color: '#64748B' },
  { id: 'reports', title: 'Relatórios',     subtitle: 'KPIs PDF',       icon: 'document-text-outline' as const,  color: '#EC4899' },
];

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [children,    setChildren]    = useState<Asset[]>([]);
  const [ancestors,   setAncestors]   = useState<Asset[]>([]);
  const [subExpanded, setSubExpanded] = useState(true);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const svgRef = useRef<any>(null);

  // ── Vault State ───────────────────────────────────────────────────────────────
  const [vaultUnlocked,  setVaultUnlocked]  = useState(false);
  const [vaultEntries,   setVaultEntries]   = useState<VaultEntry[]>([]);
  const [vaultForm,      setVaultForm]      = useState<Partial<VaultEntry & { showPass: boolean }>>({
    category: 'wifi', label: '', username: '', password: '', note: '',
  });
  const [vaultModal,     setVaultModal]     = useState(false);
  const [editEntry,      setEditEntry]      = useState<VaultEntry | null>(null);
  const [revealedIds,    setRevealedIds]    = useState<Set<string>>(new Set());
  const [vaultPinModal,  setVaultPinModal]  = useState(false);
  const [vaultPin,       setVaultPin]       = useState('');
  const VAULT_PIN = '1234';
  const isExpoGo = Constants.appOwnership === 'expo';
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  // Ficha Geral Master
  const [editForm, setEditForm] = useState<any>({
     title: '', inventoryId: '', brand: '', model: '', serialNumber: '', costCenter: '', acquisitionValue: '',
     cep: '', street: '', streetNumber: '', complement: '', neighborhood: '', city: '', state: '',
     gpsCoordinates: '', owner: '', department: '', customFields: [], photos: []
  });

  const [fetchingCep, setFetchingCep] = useState(false);
  const [fetchingGps, setFetchingGps] = useState(false);

  const loadAssetData = useCallback(() => {
    const localDb = getLocalAssets();
    const found = localDb.find(a => a.id === id);
    if (found) {
      setAsset(found);
      setChildren(getChildAssets(found.id));
      setAncestors(getAssetAncestors(found.id));
      setEditForm({
         title: found.title || '',
         inventoryId: found.details?.inventoryId || '',
         brand: found.details?.brand || '',
         model: found.details?.model || '',
         serialNumber: found.details?.serialNumber || '',
         costCenter: found.details?.costCenter || '',
         acquisitionValue: found.details?.acquisitionValue || '',
         cep: found.details?.cep || '',
         street: found.details?.street || '',
         streetNumber: found.details?.streetNumber || '',
         complement: found.details?.complement || '',
         neighborhood: found.details?.neighborhood || '',
         city: found.details?.city || '',
         state: found.details?.state || '',
         gpsCoordinates: found.details?.gpsCoordinates || '',
         owner: found.details?.owner || '',
         department: found.details?.department || '',
         customFields: found.details?.customFields || [],
         photos: found.details?.photos || []
      });
      setHistoryLogs(getAssetHistoryLocal(found.id));
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    loadAssetData();
  }, [loadAssetData]));

  useEffect(() => {
    loadAssetData();
  }, [loadAssetData]);

  const fetchCepData = async () => {
     if (editForm.cep.length < 8) return;
     const cleanCep = editForm.cep.replace(/\D/g, '');
     if (cleanCep.length !== 8) return;
     
     setFetchingCep(true);
     try {
       const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
       const data = await res.json();
       if (!data.erro) {
          setEditForm((f: any) => ({
            ...f,
            street: data.logradouro || f.street,
            neighborhood: data.bairro || f.neighborhood,
            city: data.localidade || f.city,
            state: data.uf || f.state,
          }));
       } else {
          Alert.alert('CEP Inválido', 'O CEP inserido não foi encontrado na base.');
       }
     } catch (e) {
       Alert.alert('Aviso', 'Falha ao buscar CEP. Verifique sua conexão.');
     }
     setFetchingCep(false);
  };

  const fetchGps = async () => {
    setFetchingGps(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('GPS Negado', 'Impossível mapear a máquina sem permissão.');
      setFetchingGps(false);
      return;
    }
    try {
       const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
       const { latitude, longitude } = loc.coords;
       const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
       setEditForm((f: any) => ({
         ...f,
         gpsCoordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
         ...(place ? {
           street: place.street || f.street,
           streetNumber: place.streetNumber || f.streetNumber,
           neighborhood: place.subregion || place.district || f.neighborhood,
           city: place.city || f.city,
           state: place.region || f.state,
           cep: place.postalCode ? place.postalCode.replace(/\D/g,'') : f.cep,
           country: place.country || f.country,
           stateCode: place.isoCountryCode || f.stateCode, // Using isoCountryCode as a proxy for stateCode if available
         } : {})
       }));
       if (place) Alert.alert('GPS Capturado ✅', 'Coordenadas e endereço preenchidos automaticamente.');
     } catch (e) {
        Alert.alert('Falha', 'Não foi possível detectar a antena do celular.');
     }
     setFetchingGps(false);
  };

  const scheduleMaintenance = () => {
    queueOfflineAction('SCHEDULE_MAINTENANCE', { assetId: id, timestamp: Date.now() });
    Alert.alert('S.O Entregue', 'Fluxo técnico autorizado na rede corporativa!');
    setActiveModule(null);
    ApiService.sync();
  };

  const handleSaveInfo = () => {
    if (!asset) return;
    const updated = {
       ...asset,
       title: editForm.title,
       imageUrl: editForm.photos.length > 0 ? editForm.photos[0] : asset.imageUrl,
       details: {
          ...asset.details,
          inventoryId: editForm.inventoryId,
          brand: editForm.brand,
          model: editForm.model,
          serialNumber: editForm.serialNumber,
          costCenter: editForm.costCenter,
          acquisitionValue: editForm.acquisitionValue,
          cep: editForm.cep,
          street: editForm.street,
          streetNumber: editForm.streetNumber,
          complement: editForm.complement,
          neighborhood: editForm.neighborhood,
          city: editForm.city,
          state: editForm.state,
          gpsCoordinates: editForm.gpsCoordinates,
          owner: editForm.owner,
          department: editForm.department,
          customFields: editForm.customFields,
          photos: editForm.photos
       }
    };
    const localDb = getLocalAssets();
    const newDb = localDb.map(a => a.id === asset.id ? updated : a);
    saveAssetsLocal(newDb);
    setAsset(updated);
    queueOfflineAction('UPDATE_ASSET', updated);
    logAssetHistory(asset.id, 'Atualização de Ficha (Mestra)', 'Dados de identificação, geolocalização ou metadados foram atualizados.');
    setHistoryLogs(getAssetHistoryLocal(asset.id));
    Alert.alert('Salvo (Offline)', 'O portfólio modificou e foi disparado o PUSH SaaS.');
    setActiveModule(null);
    ApiService.sync();
  };

  const pickCustomFieldType = () => {
     Alert.alert('Acoplar Parâmetro', 'O que este campo vai mapear?', [
        { text: 'Texto', onPress: () => setEditForm({...editForm, customFields: [...editForm.customFields, { label: '', value: '', type: 'text' }]}) },
        { text: 'Número', onPress: () => setEditForm({...editForm, customFields: [...editForm.customFields, { label: '', value: '', type: 'number' }]}) },
        { text: 'Booleano Y/N', onPress: () => setEditForm({...editForm, customFields: [...editForm.customFields, { label: '', value: false, type: 'boolean' }]}) },
        { text: 'Cancelar', style: 'cancel' }
     ]);
  };

  const pickImage = () => {
    Alert.alert(
      'Acoplar Fotografia',
      'Como você quer inserir o arquivo da vistoria?',
      [
        {
          text: '📸 Tirar Foto in loco',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (perm.granted) {
              let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, quality: 0.6,
              });
              if (!result.canceled) {
                setEditForm((prev: any) => ({ ...prev, photos: [...prev.photos, result.assets[0].uri] }));
              }
            } else {
              Alert.alert('Acesso Negado', 'Permita que o BrSpark acesse a lente da câmera.');
            }
          }
        },
        {
          text: '🖼️ Rolo de Câmera',
          onPress: async () => {
            let result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true, quality: 0.6,
            });
            if (!result.canceled) {
              setEditForm((prev: any) => ({ ...prev, photos: [...prev.photos, result.assets[0].uri] }));
            }
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  const shareQRCode = () => {
    if (svgRef.current) {
       svgRef.current.toDataURL(async (dataURL: string) => {
          try {
             let base64Code = dataURL;
             if (dataURL.includes('base64,')) {
                base64Code = dataURL.split('base64,')[1];
             }
             const filepath = (FileSystem as any).documentDirectory + `brspark_qr_${id}.png`;
             await (FileSystem as any).writeAsStringAsync(filepath, base64Code, { encoding: 'base64' });
             await Sharing.shareAsync(filepath);
          } catch(e) {
             Alert.alert('Erro Técnico', `Falha ao exportar código: ${e}`);
          }
       });
    } else {
       Alert.alert('Aviso', 'Componente não pôde ser renderizado.');
    }
  };

  const handleSoftDelete = () => {
    if (!asset) return;
    Alert.alert(
      'Aviso de Segurança (Exclusão Lógica)',
      `Tem certeza que deseja excluir o ativo "${asset.title}"? Todos os relatórios e faturas continuarão mantidos em nuvem como soft-delete.`,
      [
         { text: 'Cancelar', style: 'cancel' },
         { text: 'Sim, Excluir Ativo', style: 'destructive', onPress: () => {
              softDeleteAssetLocal(asset.id);
              queueOfflineAction('DELETE_ASSET', { id: asset.id });
              ApiService.sync();
              router.push('/(tabs)' as any);
           }
         }
      ]
    );
  };

  if (!asset) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
         <Text>Carregando chaves operacionais do ativo {id} ...</Text>
      </View>
    );
  }

  const renderModuleContent = () => {
    switch(activeModule) {
      case 'info':
        return (
          <View style={styles.modContainer}>
             <View style={styles.formSectionHeader}>
               <Ionicons name="finger-print" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Informações Primárias</Text>
             </View>

            <Text style={styles.modLabel}>ID Global (SaaS)</Text>
            <TextInput style={[styles.modInput, {backgroundColor:'#f1f5f9', color: '#94a3b8'}]} value={asset.id} editable={false} />

            <Text style={styles.modLabel}>Nome / Etiqueta Principal *</Text>
            <TextInput style={styles.modInput} value={editForm.title} onChangeText={(t)=>setEditForm({...editForm, title:t})} />
            
            <Text style={styles.modLabel}>Cód. de Patrimônio (Tombamento)</Text>
            <TextInput style={styles.modInput} value={editForm.inventoryId} onChangeText={(t)=>setEditForm({...editForm, inventoryId:t})} placeholder="Ex: PT-48810-A" />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Fabricante</Text>
                  <TextInput style={styles.modInput} value={editForm.brand} onChangeText={(t)=>setEditForm({...editForm, brand:t})} placeholder="Marca" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Modelo Comercial</Text>
                  <TextInput style={styles.modInput} value={editForm.model} onChangeText={(t)=>setEditForm({...editForm, model:t})} placeholder="Versão/Model" />
               </View>
            </View>

            <Text style={styles.modLabel}>Número de Série (S/N) / Chassi</Text>
            <TextInput style={styles.modInput} value={editForm.serialNumber} onChangeText={(t)=>setEditForm({...editForm, serialNumber:t})} placeholder="Ex: ABC12345678" />

            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="cash-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Atribuição de Valor e Custo</Text>
            </View>

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Centro de Custos (CC)</Text>
                  <TextInput style={styles.modInput} value={editForm.costCenter} onChangeText={(t)=>setEditForm({...editForm, costCenter:t})} placeholder="Ex: ENG-01" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Valor de Aquisição</Text>
                  <TextInput style={styles.modInput} value={editForm.acquisitionValue} onChangeText={(t)=>setEditForm({...editForm, acquisitionValue:t})} placeholder="R$ 0,00" keyboardType="numeric" />
               </View>
            </View>
            
            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Departamento Alocado</Text>
                  <TextInput style={styles.modInput} value={editForm.department} onChangeText={(t)=>setEditForm({...editForm, department:t})} placeholder="Manutenção" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Líder Técnico (Custodio)</Text>
                  <TextInput style={styles.modInput} value={editForm.owner} onChangeText={(t)=>setEditForm({...editForm, owner:t})} placeholder="João Eng." />
               </View>
            </View>

            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="map-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Geolocalização / Endereçamento</Text>
            </View>

            <Text style={styles.modLabel}>CEP Postal</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0}]} value={editForm.cep} onChangeText={(t)=>setEditForm({...editForm, cep:t})} placeholder="00000-000" keyboardType="numeric" maxLength={9} />
               <TouchableOpacity style={styles.actionBtn} onPress={fetchCepData} disabled={fetchingCep}>
                  {fetchingCep ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight: '700'}}>Buscar</Text>}
               </TouchableOpacity>
            </View>

            <Text style={styles.modLabel}>Logradouro (Rua / Avenida)</Text>
            <TextInput style={styles.modInput} value={editForm.street} onChangeText={(t)=>setEditForm({...editForm, street:t})} placeholder="Ex: Av. Paulista" />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Número</Text>
                  <TextInput style={styles.modInput} value={editForm.streetNumber} onChangeText={(t)=>setEditForm({...editForm, streetNumber:t})} placeholder="Ex: 1001" keyboardType="numeric" />
               </View>
               <View style={{flex: 2}}>
                  <Text style={styles.modLabel}>Complemento</Text>
                  <TextInput style={styles.modInput} value={editForm.complement} onChangeText={(t)=>setEditForm({...editForm, complement:t})} placeholder="Sala 12, Bloco B" />
               </View>
            </View>

            <Text style={styles.modLabel}>Bairro</Text>
            <TextInput style={styles.modInput} value={editForm.neighborhood} onChangeText={(t)=>setEditForm({...editForm, neighborhood:t})} placeholder="Ex: Centro" />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 2}}>
                  <Text style={styles.modLabel}>Cidade</Text>
                  <TextInput style={styles.modInput} value={editForm.city} onChangeText={(t)=>setEditForm({...editForm, city:t})} placeholder="São Paulo" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Estado (UF)</Text>
                  <TextInput style={styles.modInput} value={editForm.state} onChangeText={(t)=>setEditForm({...editForm, state:t})} placeholder="SP" maxLength={2} autoCapitalize="characters" />
               </View>
            </View>

            <Text style={styles.modLabel}>Assinatura GPS (Lat/Long)</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0, backgroundColor: '#f1f5f9'}]} value={editForm.gpsCoordinates} editable={false} placeholder="Toque no botão para capturar..." />
               <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#14B8A6'}]} onPress={fetchGps} disabled={fetchingGps}>
                  {fetchingGps ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
               </TouchableOpacity>
            </View>

            {/* HEADER Custom Fields */}
            <View style={[styles.formSectionHeader, {marginTop: 16, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12}]}>
               <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
                 <Ionicons name="construct-outline" size={18} color={colors.primary} />
                 <Text style={[styles.formSectionTitle, {flexShrink: 1, fontSize: 15}]} numberOfLines={1}>Atributos Extras</Text>
               </View>
               <TouchableOpacity onPress={pickCustomFieldType} style={{backgroundColor: colors.primary+'15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12}}>
                 <Text style={{color:colors.primary, fontWeight:'800', fontSize: 11}}>+ INCLUIR ATRIBUTO</Text>
               </TouchableOpacity>
            </View>

            {editForm.customFields.map((field: any, idx: number) => (
               <View key={idx} style={styles.customFieldPill}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                     <Text style={{fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase'}}>
                        TIPO: {field.type === 'text' ? 'TEXTO' : field.type === 'number' ? 'NUMÉRICO' : 'VALOR LÓGICO Y/N'}
                     </Text>
                     <TouchableOpacity onPress={() => { const cf = [...editForm.customFields]; cf.splice(idx, 1); setEditForm({...editForm, customFields: cf}); }}>
                        <Ionicons name="trash" size={16} color="#ef4444" />
                     </TouchableOpacity>
                  </View>
                  <TextInput 
                     style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 8, fontWeight:'700', backgroundColor: '#fff', borderColor: '#CBD5E1'}]} 
                     value={field.label} 
                     placeholder="Critério (Tensão, Pressão)"
                     onChangeText={(t) => {
                        const cf = [...editForm.customFields]; cf[idx].label = t; setEditForm({...editForm, customFields: cf});
                     }} 
                  />
                  {field.type === 'boolean' ? (
                     <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                        <Switch 
                           value={field.value} 
                           onValueChange={(v) => {
                              const cf = [...editForm.customFields]; cf[idx].value = v; setEditForm({...editForm, customFields: cf});
                           }} 
                           trackColor={{ false: "#cbd5e1", true: colors.primary }}
                        />
                        <Text style={{fontWeight: '700', color: field.value ? colors.primary : colors.textSecondary}}>
                           {field.value ? 'VERDADEIRO / SIM' : 'FALSO / NÃO'}
                        </Text>
                     </View>
                  ) : (
                     <TextInput 
                        style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 0, backgroundColor: '#fff'}]} 
                        value={field.value} 
                        placeholder={field.type === 'number' ? "Dado Numérico..." : "Dado Texto Livre..."}
                        keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                        onChangeText={(t) => {
                           const cf = [...editForm.customFields]; cf[idx].value = t; setEditForm({...editForm, customFields: cf});
                        }} 
                     />
                  )}
               </View>
            ))}

            {/* ─── Seção Hierarquia ─────────────────────────────────────── */}
            <View style={[styles.formSectionHeader, {marginTop: 24, justifyContent: 'space-between'}]}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
                <Text style={styles.formSectionTitle}>Hierarquia</Text>
              </View>
              <TouchableOpacity onPress={() => setSubExpanded(v => !v)}>
                <Ionicons name={subExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            {/* Ativo pai atual */}
            {asset.parentId ? (
              <View style={styles.parentBox}>
                <Ionicons name="arrow-up-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.parentBoxText}>
                  Pertence a: {getLocalAssets().find(a => a.id === asset.parentId)?.title || asset.parentId}
                </Text>
                <TouchableOpacity onPress={() => {
                  updateAssetParent(asset.id, null);
                  setAsset(prev => prev ? {...prev, parentId: null} : prev);
                }}>
                  <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.parentSelectBtn} onPress={() => {
                const all = getLocalAssets().filter(a => a.id !== asset.id);
                Alert.alert('Vincular Ativo Pai', 'Selecione o ativo pai:', [
                  ...all.map(a => ({ text: a.title, onPress: () => {
                    updateAssetParent(asset.id, a.id);
                    setAsset(prev => prev ? {...prev, parentId: a.id} : prev);
                    logAssetHistory(asset.id, 'VINCULADO A PAI', `Vinculado a: ${a.title}`);
                  }})),
                  { text: 'Cancelar', style: 'cancel' as const }
                ]);
              }}>
                <Ionicons name="link-outline" size={15} color={colors.primary} />
                <Text style={{color: colors.primary, fontWeight: '700', fontSize: 13, marginLeft: 6}}>Vincular a Ativo Pai</Text>
              </TouchableOpacity>
            )}

            {/* Sub-ativos */}
            {subExpanded && (
              <View style={styles.childrenSection}>
                {children.length === 0 ? (
                  <Text style={{fontSize: 13, color: colors.textLight, fontStyle: 'italic', marginBottom: 8}}>Sem sub-ativos vinculados</Text>
                ) : (
                  children.map(child => (
                    <TouchableOpacity key={child.id} style={styles.childRow}
                      onPress={() => router.push(`/asset/${child.id}` as any)}>
                      <Ionicons name="cube-outline" size={16} color={colors.primary} style={{marginRight: 8}} />
                      <Text style={{flex:1, fontWeight:'700', color: colors.primary, fontSize: 13}} numberOfLines={1}>{child.title}</Text>
                      {child.childrenCount! > 0 && (
                        <Text style={styles.childBadge}>{child.childrenCount} sub</Text>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
                    </TouchableOpacity>
                  ))
                )}
                <TouchableOpacity style={styles.addChildBtn}
                  onPress={() => router.push(`/asset/new?parentId=${asset.id}&parentTitle=${encodeURIComponent(asset.title)}` as any)}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={{color: colors.primary, fontWeight:'800', fontSize: 13, marginLeft: 6}}>Adicionar Sub-ativo</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Fotos */}
            <View style={[styles.formSectionHeader, {marginTop: 24}]}>
               <Ionicons name="images-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Mídia In Loco</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 32}}>
               <TouchableOpacity style={styles.photoAddBtn} onPress={pickImage}>
                  <Ionicons name="camera" size={32} color={colors.primary} />
                  <Text style={{color: colors.primary, fontSize: 12, marginTop: 6, fontWeight: '700'}}>Adicionar Foto</Text>
               </TouchableOpacity>
               {editForm.photos.map((uri: string, idx: number) => (
                  <View key={idx} style={{position: 'relative'}}>
                     <Image source={{uri}} style={styles.photoThumb} />
                     <TouchableOpacity style={styles.deletePhotoBadge} onPress={() => {
                        const ne = [...editForm.photos]; ne.splice(idx,1); setEditForm({...editForm, photos: ne});
                     }}>
                        <Ionicons name="close" size={16} color="#fff" />
                     </TouchableOpacity>
                  </View>
               ))}
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveInfo}>
               <Ionicons name="checkmark-circle" size={24} color="#fff" style={{marginRight: 8}} />
               <Text style={styles.saveBtnText}>Salvar Alterações do Ativo</Text>
            </TouchableOpacity>
          </View>
        );
      case 'docs':
        return (
          <View style={styles.modContainer}>
            <TouchableOpacity style={styles.dashedBox} onPress={() => Alert.alert('Anexado', 'PDF enviado com hash criptografado para o servidor B2B central.')}>
               <Ionicons name="document-attach" size={36} color={colors.primary} />
               <Text style={{marginTop: 8, color: colors.primary, fontWeight: '700'}}>Alocar PDF Oficial</Text>
            </TouchableOpacity>
            <View style={styles.docRow}><Ionicons name="document-text" size={24} color={'#E11D48'} /><Text style={{flex: 1, marginLeft: 12, fontWeight: '600'}}>Apolice_Sinistro_Gerada.pdf</Text></View>
            <View style={styles.docRow}><Ionicons name="document-text" size={24} color={'#3B82F6'} /><Text style={{flex: 1, marginLeft: 12, fontWeight: '600'}}>Averbacao_Placa_1234.pdf</Text></View>
          </View>
        );
      case 'maint':
        return (
          <View style={styles.modContainer}>
            <View style={styles.logRow}><View style={[styles.dot, {backgroundColor: colors.success.text}]} /><Text style={styles.logText}>Óleo e Freios (Preventiva)</Text><Text style={styles.logTime}>Há 2 dias</Text></View>
            <View style={styles.logRow}><View style={styles.dot} /><Text style={styles.logText}>Motor / Tensão Calibração</Text><Text style={styles.logTime}>Março de 2026</Text></View>
            <TouchableOpacity style={[styles.saveBtn, {marginTop: 24, backgroundColor: '#10B981'}]} onPress={scheduleMaintenance}>
               <Text style={[styles.saveBtnText, {color: '#fff'}]}>Emitir Ordem de Serviço Ágil</Text>
            </TouchableOpacity>
          </View>
        );
      case 'vault':
        return (
          <VaultModule
            assetId={asset.id}
            unlocked={vaultUnlocked}
            entries={vaultEntries}
            revealedIds={revealedIds}
            vaultModal={vaultModal}
            vaultForm={vaultForm}
            editEntry={editEntry}
            vaultPinModal={vaultPinModal}
            vaultPin={vaultPin}
            isExpoGo={isExpoGo}
            VAULT_PIN={VAULT_PIN}
            onLockOpen={async () => {
              if (isExpoGo) { setVaultPin(''); setVaultPinModal(true); return; }
              const { success } = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Autentique para acessar o Vault',
                cancelLabel: 'Cancelar',
              });
              if (success) {
                const data = await AssetVaultService.getEntries(asset.id);
                setVaultEntries(data);
                setVaultUnlocked(true);
              } else {
                Alert.alert('Acesso Negado', 'Biometria não reconhecida.');
              }
            }}
            onToggleReveal={(id) => setRevealedIds(prev => {
              const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
            })}
            onOpenAdd={() => {
              setEditEntry(null);
              setVaultForm({ category: 'wifi', label: '', username: '', password: '', note: '' });
              setVaultModal(true);
            }}
            onOpenEdit={(e) => {
              setEditEntry(e);
              setVaultForm({ ...e });
              setVaultModal(true);
            }}
            onDelete={async (entryId) => {
              Alert.alert('Excluir?', 'Remover esta credencial do Vault?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Excluir', style: 'destructive', onPress: async () => {
                  await AssetVaultService.deleteEntry(asset.id, entryId);
                  setVaultEntries(await AssetVaultService.getEntries(asset.id));
                }},
              ]);
            }}
            onSave={async () => {
              if (!vaultForm.label?.trim() || !vaultForm.password?.trim()) {
                Alert.alert('Atenção', 'Preencha o nome e a senha.'); return;
              }
              if (editEntry) {
                await AssetVaultService.updateEntry(asset.id, editEntry.id, vaultForm as any);
              } else {
                await AssetVaultService.saveEntry(asset.id, vaultForm as any);
              }
              setVaultEntries(await AssetVaultService.getEntries(asset.id));
              setVaultModal(false);
            }}
            onPinInput={(k) => {
              const next = vaultPin + k;
              setVaultPin(next);
              if (next.length === 4) {
                if (next === VAULT_PIN) {
                  setVaultPinModal(false);
                  AssetVaultService.getEntries(asset.id).then(data => {
                    setVaultEntries(data); setVaultUnlocked(true);
                  });
                } else {
                  Alert.alert('PIN Incorreto'); setVaultPin('');
                }
              }
            }}
            onPinDelete={() => setVaultPin(p => p.slice(0, -1))}
            onPinClose={() => setVaultPinModal(false)}
            onFormChange={(patch) => setVaultForm(f => ({ ...f, ...patch }))}
            onVaultModalClose={() => setVaultModal(false)}
          />
        );
      case 'costs':
        return (
          <View style={styles.modContainer}>
             <Text style={{fontSize: 32, fontWeight: '800', color: colors.primary, marginBottom: 4}}>R$ 48.910,20</Text>
             <Text style={{color: colors.textSecondary, marginBottom: 24, fontWeight: '600'}}>Custo Total Associado TCO / Depreciação</Text>
             <View style={styles.docRow}><Text style={{flex: 1, fontWeight: '500'}}>Licenças / Apólice Bradesco</Text><Text style={{fontWeight: '700', color: colors.warning.text}}>- R$ 1.200</Text></View>
             <View style={styles.docRow}><Text style={{flex: 1, fontWeight: '500'}}>MRO e Manutenções</Text><Text style={{fontWeight: '700', color: colors.warning.text}}>- R$ 4.500</Text></View>
             <View style={[styles.docRow, {backgroundColor: '#ECFDF5', borderColor: '#A7F3D0'}]}><Text style={{flex: 1, fontWeight: '700', color: '#065F46'}}>Rentabilidade</Text><Text style={{fontWeight: '800', color: '#059669'}}>+ R$ 65.810</Text></View>
          </View>
        );
      case 'hier': {
        const TYPE_ICONS: Record<string, { icon: any; color: string }> = {
          REAL_ESTATE: { icon: 'business',  color: '#3B82F6' },
          VEHICLE:     { icon: 'car',       color: '#F59E0B' },
          COLLECTION:  { icon: 'diamond',   color: '#8B5CF6' },
          OTHER:       { icon: 'cube',      color: '#10B981' },
        };
        const parentAsset = asset.parentId
          ? getLocalAssets().find(a => a.id === asset.parentId)
          : null;
        const allAncestors = getAssetAncestors(asset.id);
        return (
          <View style={styles.modContainer}>
            {/* Breadcrumb ancestral */}
            {allAncestors.length > 1 && (
              <View style={{marginBottom: 20}}>
                <Text style={[styles.formSectionTitle, {marginBottom: 8, fontSize: 12, color: colors.textSecondary}]}>ÁRVORE ANCESTRAL</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4}}>
                  {allAncestors.map((anc, i) => (
                    <React.Fragment key={anc.id}>
                      <TouchableOpacity
                        onPress={() => anc.id !== asset.id && router.push(`/asset/${anc.id}` as any)}
                        style={[{paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8},
                          anc.id === asset.id
                            ? {backgroundColor: colors.primary + '20'}
                            : {backgroundColor: '#F1F5F9'}]}
                      >
                        <Text style={{fontSize: 12, fontWeight: '700',
                          color: anc.id === asset.id ? colors.primary : colors.textSecondary}}>
                          {anc.title}
                        </Text>
                      </TouchableOpacity>
                      {i < allAncestors.length - 1 && (
                        <Ionicons name="chevron-forward" size={12} color={colors.textLight} />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            )}

            {/* Ativo pai */}
            {parentAsset && (
              <View style={{marginBottom: 20}}>
                <Text style={[styles.formSectionTitle, {marginBottom: 8, fontSize: 12, color: colors.textSecondary}]}>ATIVO PAI</Text>
                <TouchableOpacity
                  style={[styles.parentBox]}
                  onPress={() => router.push(`/asset/${parentAsset.id}` as any)}
                >
                  <View style={[{width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center'},
                    {backgroundColor: (TYPE_ICONS[parentAsset.type]?.color || '#64748B') + '20'}]}>
                    <Ionicons name={TYPE_ICONS[parentAsset.type]?.icon || 'cube'} size={16} color={TYPE_ICONS[parentAsset.type]?.color || '#64748B'} />
                  </View>
                  <Text style={[styles.parentBoxText]}>{parentAsset.title}</Text>
                  <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Sub-ativos Section */}
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
              <Text style={[styles.formSectionTitle, {fontSize: 12, color: colors.textSecondary}]}>
                SUB-ATIVOS ({children.length})
              </Text>
              <TouchableOpacity
                style={{backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5}}
                onPress={() => {
                  Alert.alert('Adicionar Sub-ativo', 'Evolução da Hierarquia Brspark. Como deseja prosseguir?', [
                    { 
                      text: 'Cadastrar Novo', 
                      onPress: () => router.push(`/asset/new?parentId=${asset.id}&parentTitle=${encodeURIComponent(asset.title)}` as any) 
                    },
                    { 
                      text: 'Vincular Existente', 
                      onPress: () => {
                        setLinkSearch('');
                        setLinkModalVisible(true);
                      }
                    },
                    { text: 'Cancelar', style: 'cancel' }
                  ]);
                }}
              >
                <Text style={{color: colors.primary, fontWeight: '800', fontSize: 11}}>+ SUB-ATIVO</Text>
              </TouchableOpacity>
            </View>

            {children.length === 0 ? (
              <View style={{alignItems: 'center', paddingVertical: 32, gap: 10,
                backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed'}}>
                <Ionicons name="git-branch-outline" size={36} color={colors.border} />
                <Text style={{color: colors.textSecondary, fontWeight: '600', fontSize: 13, textAlign: 'center'}}>
                  Sem sub-ativos vinculados{`\n`}Toque em "+ SUB-ATIVO" para estruturar
                </Text>
              </View>
            ) : (
              <View style={styles.childrenSection}>
                {children.map((child, idx) => {
                  const cfg = TYPE_ICONS[child.type] || { icon: 'cube', color: '#64748B' };
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[styles.childRow, idx === children.length - 1 && {borderBottomWidth: 0}]}
                      onPress={() => router.push(`/asset/${child.id}` as any)}
                    >
                      <View style={[{width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 10},
                        {backgroundColor: cfg.color + '20'}]}>
                        <Ionicons name={cfg.icon} size={15} color={cfg.color} />
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={{fontWeight: '800', color: colors.primary, fontSize: 14}}>{child.title}</Text>
                        <Text style={{fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginTop: 1}}>
                          {child.type === 'REAL_ESTATE' ? 'Imóvel' : child.type === 'VEHICLE' ? 'Veículo' : child.type === 'COLLECTION' ? 'Patrimônio' : 'Máq./Equip.'}
                          {(child.childrenCount ?? 0) > 0 ? `  ·  ${child.childrenCount} sub` : ''}
                        </Text>
                      </View>
                      <View style={[{width: 8, height: 8, borderRadius: 4, marginRight: 8},
                        {backgroundColor: child.statusType === 'success' ? '#10B981' : '#F59E0B'}]} />
                      <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      }
      case 'history':
        return (
          <View style={styles.modContainer}>
             {historyLogs.length === 0 ? (
                <Text style={{color: colors.textSecondary, textAlign: 'center', marginTop: 24, fontStyle: 'italic'}}>Ainda não há eventos no radar corporativo.</Text>
             ) : (
                historyLogs.map((log: any, idx: number) => (
                   <View key={idx} style={styles.logRow}>
                      <View style={[styles.dot, {backgroundColor: colors.primary}]} />
                      <View style={{flex: 1, marginLeft: 12}}>
                         <Text style={styles.logText}>{log.action}</Text>
                         <Text style={{fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16}}>{log.details}</Text>
                      </View>
                      <Text style={styles.logTime}>{new Date(log.created_at).toLocaleDateString('pt-BR')}</Text>
                   </View>
                ))
             )}
          </View>
        );
      default: 
        return (
           <View style={styles.modContainer}>
              <Text style={{color: colors.textSecondary, textAlign: 'center', marginTop: 24, lineHeight: 22, fontStyle: 'italic', fontWeight: '500'}}>Componente restrito em rede móvel. Exerça visão deste módulo via Dashboard Web-Desktop ERP.</Text>
           </View>
        );
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={()=>activeModule?setActiveModule(null):router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">{activeModule ? MODULES.find(m=>m.id===activeModule)?.title : 'Gestão de Ativo'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleSoftDelete}>
           <Ionicons name="trash-outline" size={24} color={'#EF4444'} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.imageContainer}>
            {asset.details?.photos && asset.details.photos.length > 0 ? (
               <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: '100%', height: '100%' }}>
                  {asset.details!.photos!.map((uri: string, idx: number) => (
                      <View key={idx} style={{ width: Dimensions.get('window').width, height: 240 }}>
                         <Image source={{ uri }} style={styles.image} />
                         <View style={styles.carouselIndicator}>
                            <Text style={styles.carouselText}>{idx + 1} / {asset.details!.photos!.length}</Text>
                         </View>
                      </View>
                  ))}
               </ScrollView>
            ) : asset.imageUrl ? (
               <Image source={{ uri: asset.imageUrl }} style={styles.image} />
            ) : (
               <View style={styles.imagePlaceholder}>
                 <Ionicons name="cube" size={60} color={colors.textLight} />
               </View>
            )}
            <View style={styles.badgeContainer}>
              <Badge label={asset.status} type={asset.statusType} />
            </View>
          </View>
          
          <View style={styles.heroDetails}>
             <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
               <View style={{flex: 1}}>
                 <Text style={styles.title}>{asset.title}</Text>
                 <Text style={styles.typeTag}>
                   {asset.type === 'REAL_ESTATE' ? 'Imóvel Raiz' : asset.type === 'VEHICLE' ? 'Veículo / Frota' : asset.type === 'COLLECTION' ? 'Artefato Físico' : 'Dispositivo / Equip.'} • ID: {asset.id.includes('-') ? asset.id.split('-')[1].toUpperCase() : asset.id.toUpperCase()}
                 </Text>
               </View>
               <TouchableOpacity onPress={() => setQrModalVisible(true)} style={{backgroundColor: colors.primary+'10', padding: 12, borderRadius: 12}}>
                  <Ionicons name="qr-code" size={32} color={colors.primary} />
               </TouchableOpacity>
            </View>
          </View>
        </View>

        {!activeModule && (
          <View>
            <Text style={styles.sectionTitle}>Módulos Operacionais</Text>
            <View style={styles.gridContainer}>
              {MODULES.map(mod => (
                 <TouchableOpacity 
                   key={mod.id} 
                   style={styles.gridItem} 
                   activeOpacity={0.7}
                   onPress={() => setActiveModule(mod.id)}
                 >
                    <View style={[styles.iconBox, { backgroundColor: mod.color + '15' }]}>
                       <Ionicons name={mod.icon} size={28} color={mod.color} />
                    </View>
                    <Text style={styles.modTitle}>{mod.title}</Text>
                    <Text style={styles.modSubtitle} numberOfLines={1}>{mod.subtitle}</Text>
                 </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeModule && (
          <View style={styles.innerModuleView}>
             {renderModuleContent()}
          </View>
        )}
      </ScrollView>

      <Modal visible={qrModalVisible} transparent animationType="fade">
         <View style={{flex:1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20}}>
            <View style={{backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', position: 'relative'}}>
               <TouchableOpacity onPress={()=>setQrModalVisible(false)} style={{position: 'absolute', top: 16, right: 16, zIndex:10}}>
                  <Ionicons name="close" size={28} color={colors.textSecondary}/>
               </TouchableOpacity>
               
               <Text style={{fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: 24, marginTop: 8}}>Selo Patrimonial Físico</Text>
               
               <View style={{backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.primary, marginBottom: 24}}>
                  <QRCode value={asset.id} size={220} getRef={(c) => { svgRef.current = c; }} color="#000000" backgroundColor="#FFFFFF" />
               </View>

               <Text style={{textAlign: 'center', marginBottom: 24, color: colors.textSecondary, fontWeight: '600', fontSize: 13, lineHeight: 18}}>Afixe fisicamente esta etiqueta gerada a partir do QrCode no objeto operacional para permitir fiscalizações e auditorias à jato.</Text>
               
               <TouchableOpacity style={[styles.saveBtn, {marginTop: 0, width: '100%', paddingVertical: 14}]} onPress={shareQRCode}>
                  <Ionicons name="share-social" size={20} color="#fff" style={{marginRight: 8}} />
                  <Text style={styles.saveBtnText}>Exportar Imagem HD</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>

      {/* Modal de Vínculo de Ativo Existente */}
      <Modal visible={linkModalVisible} transparent={true} animationType="slide">
        <View style={{flex:1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'}}>
           <View style={{backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', padding: 20}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <Text style={{fontSize: 20, fontWeight: '900', color: colors.primary}}>Vincular Ativo Existente</Text>
                <TouchableOpacity onPress={() => setLinkModalVisible(false)}>
                  <Ionicons name="close-circle" size={28} color={colors.textLight} />
                </TouchableOpacity>
              </View>

              <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 16}}>
                <Ionicons name="search" size={18} color={colors.textLight} style={{marginRight: 8}} />
                <TextInput
                  style={{flex: 1, height: 44, fontSize: 15, color: colors.primary, fontWeight: '600'}}
                  placeholder="Pesquisar para vincular..."
                  placeholderTextColor={colors.textLight}
                  value={linkSearch}
                  onChangeText={setLinkSearch}
                />
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {getLocalAssets()
                  .filter(a => a.id !== asset.id && a.parentId !== asset.id)
                  .filter(a => a.title.toLowerCase().includes(linkSearch.toLowerCase()))
                  .map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center', padding: 15,
                        backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 10,
                        borderWidth: 1, borderColor: colors.border
                      }}
                      onPress={() => {
                        Alert.alert('Confirmar Vínculo', `Deseja que "${a.title}" se torne um sub-ativo de "${asset.title}"?`, [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Confirmar', onPress: async () => {
                            updateAssetParent(a.id, asset.id);
                            loadAssetData();
                            setLinkModalVisible(false);
                            logAssetHistory(asset.id, 'VÍNCULO HIERÁRQUICO', `Ativo "${a.title}" vinculado como sub-ativo.`);
                            Alert.alert('Sucesso ✅', `Vínculo estabelecido com sucesso na rede Brspark.`);
                          }}
                        ]);
                      }}
                    >
                      <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: 12}}>
                        <Ionicons name="cube-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={{fontWeight: '700', color: colors.primary}}>{a.title}</Text>
                        <Text style={{fontSize: 11, color: colors.textSecondary}}>{a.type}</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>
                  ))
                }
                {getLocalAssets().filter(a => a.id !== asset.id && a.parentId !== asset.id).length === 0 && (
                   <Text style={{textAlign: 'center', color: colors.textSecondary, marginTop: 40, fontStyle: 'italic'}}>Não há ativos disponíveis para vincular.</Text>
                )}
              </ScrollView>
           </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - (16 * 2) - (12 * 2)) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.primary, marginHorizontal: 12 },
  content: { paddingBottom: 40 },
  
  heroCard: { backgroundColor: colors.cardWhite, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  imageContainer: { width: '100%', height: 240, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: colors.border },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  carouselIndicator: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  carouselText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  badgeContainer: { position: 'absolute', bottom: 12, left: 16 },
  heroDetails: { padding: 20 },
  title: { fontSize: 26, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  typeTag: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.primary, paddingHorizontal: 16, marginBottom: 16 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 18, paddingHorizontal: 4, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  iconBox: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modTitle: { fontSize: 13, fontWeight: '800', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  modSubtitle: { fontSize: 10, color: colors.textSecondary, textAlign: 'center', fontWeight: '500' },
  
  // Painel Interno
  innerModuleView: { backgroundColor: colors.cardWhite, marginHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 },
  modContainer: { width: '100%' },
  
  formSectionHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.background, paddingBottom: 8, marginBottom: 16 },
  formSectionTitle: { fontSize: 16, fontWeight: '800', color: colors.primary, marginLeft: 8 },
  modLabel: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  modInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, fontSize: 15, backgroundColor: colors.background, marginBottom: 20, color: colors.primary, fontWeight: '600' },
  actionBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  
  customFieldPill: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  
  saveBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  
  dashedBox: { borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 24, backgroundColor: colors.primary + '0A' },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 10, backgroundColor: colors.background },
  logRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' },
  logText: { flex: 1, marginLeft: 12, fontWeight: '700', color: colors.primary },
  logTime: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: colors.border },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary + '0A' },
  deletePhotoBadge: { position: 'absolute', top: 4, right: 16, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Hierarquia
  parentBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary + '10', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: colors.primary + '30' },
  parentBoxText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.primary },
  parentSelectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  childrenSection: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  childRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  childBadge: { backgroundColor: colors.primary + '15', color: colors.primary, fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6 },
  addChildBtn: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, justifyContent: 'center' },
});
