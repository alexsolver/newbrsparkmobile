import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput, Switch, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, queueOfflineAction, saveAssetsLocal, softDeleteAssetLocal, logAssetHistory, getAssetHistoryLocal } from '../../src/database';
import { colors } from '../../src/theme/colors';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ApiService } from '../../src/services/api';
import QRCode from 'react-native-qrcode-svg';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

const MODULES = [
  { id: 'info', title: 'Ficha Geral', subtitle: 'Registros', icon: 'information-circle-outline' as const, color: '#3B82F6' },
  { id: 'docs', title: 'Documentos', subtitle: 'Vault (PDFs)', icon: 'folder-open-outline' as const, color: '#8B5CF6' },
  { id: 'maint', title: 'Manutenção', subtitle: 'Workflow SOS', icon: 'build-outline' as const, color: '#F59E0B' },
  { id: 'wifi', title: 'Rede & Sensores', subtitle: 'Equip IoT', icon: 'wifi-outline' as const, color: '#06B6D4' },
  { id: 'costs', title: 'Custos', subtitle: 'Métricas TCO', icon: 'cash-outline' as const, color: '#10B981' },
  { id: 'insurance', title: 'Seguros', subtitle: 'Apólices Ativas', icon: 'shield-checkmark-outline' as const, color: '#EF4444' },
  { id: 'contacts', title: 'Equipe', subtitle: 'Prestadores', icon: 'people-outline' as const, color: '#6366F1' },
  { id: 'history', title: 'Histórico', subtitle: 'Eventos GMS', icon: 'time-outline' as const, color: '#64748B' },
  { id: 'reports', title: 'Relatórios', subtitle: 'KPIs PDF', icon: 'document-text-outline' as const, color: '#EC4899' },
];

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const svgRef = useRef<any>(null);

  // Ficha Geral Master
  const [editForm, setEditForm] = useState<any>({
     title: '', inventoryId: '', brand: '', model: '', serialNumber: '', costCenter: '', acquisitionValue: '', cep: '', address: '', gpsCoordinates: '', owner: '', department: '', customFields: [], photos: []
  });

  const [fetchingCep, setFetchingCep] = useState(false);
  const [fetchingGps, setFetchingGps] = useState(false);

  useEffect(() => {
    const localDb = getLocalAssets();
    const found = localDb.find(a => a.id === id);
    if (found) {
      setAsset(found);
      setEditForm({
         title: found.title || '',
         inventoryId: found.details?.inventoryId || '',
         brand: found.details?.brand || '',
         model: found.details?.model || '',
         serialNumber: found.details?.serialNumber || '',
         costCenter: found.details?.costCenter || '',
         acquisitionValue: found.details?.acquisitionValue || '',
         cep: found.details?.cep || '',
         address: found.details?.address || '',
         gpsCoordinates: found.details?.gpsCoordinates || '',
         owner: found.details?.owner || '',
         department: found.details?.department || '',
         customFields: found.details?.customFields || [],
         photos: found.details?.photos || []
      });
      setHistoryLogs(getAssetHistoryLocal(found.id));
    }
  }, [id]);

  const fetchCepData = async () => {
     if (editForm.cep.length < 8) return;
     const cleanCep = editForm.cep.replace(/\D/g, '');
     if (cleanCep.length !== 8) return;
     
     setFetchingCep(true);
     try {
       const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
       const data = await res.json();
       if (!data.erro) {
          setEditForm({...editForm, address: `${data.logradouro}, Bairro ${data.bairro} - ${data.localidade}/${data.uf}`});
       } else {
          Alert.alert('CEP Inválido', 'O CEP inserido não foi encontrado na base.');
       }
     } catch (e) {
       Alert.alert('Aviso', 'O Corretor falhou devido à ausência de rede.');
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
       let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
       setEditForm({...editForm, gpsCoordinates: `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`});
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
          address: editForm.address,
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
             const filepath = cacheDirectory + `brspark_qr_${id}.png`;
             await writeAsStringAsync(filepath, dataURL, { encoding: EncodingType.Base64 });
             await shareAsync(filepath);
          } catch(e) {
             Alert.alert('Erro', 'Não foi possível exportar a imagem da etiqueta.');
          }
       });
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
                  {fetchingCep ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight: '700'}}>Obter</Text>}
               </TouchableOpacity>
            </View>

            <Text style={styles.modLabel}>Edificação / Despacho Coleta</Text>
            <TextInput style={[styles.modInput, {minHeight: 60}]} multiline value={editForm.address} onChangeText={(t)=>setEditForm({...editForm, address:t})} placeholder="Av..." />

            <Text style={styles.modLabel}>Assinatura GPS Geográfica</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0, backgroundColor: '#f1f5f9'}]} value={editForm.gpsCoordinates} editable={false} placeholder="Aguardando Pin..." />
               <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#14B8A6'}]} onPress={fetchGps} disabled={fetchingGps}>
                  {fetchingGps ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
               </TouchableOpacity>
            </View>

            {/* HEADER Custom Fields */}
            <View style={[styles.formSectionHeader, {marginTop: 16, justifyContent: 'space-between'}]}>
               <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <Ionicons name="construct-outline" size={18} color={colors.primary} />
                 <Text style={styles.formSectionTitle}>Campos Customizados</Text>
               </View>
               <TouchableOpacity onPress={pickCustomFieldType} style={{backgroundColor: colors.primary+'15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12}}>
                 <Text style={{color:colors.primary, fontWeight:'800', fontSize: 13}}>+ NOVO EIXO</Text>
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
        <Text style={styles.headerTitle}>{activeModule ? MODULES.find(m=>m.id===activeModule)?.title : 'Gestão do Ativo Corporativo'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleSoftDelete}>
           <Ionicons name="trash-outline" size={24} color={'#EF4444'} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.imageContainer}>
            {asset.imageUrl ? (
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
                   {asset.type === 'REAL_ESTATE' ? 'Imóvel Raiz' : asset.type === 'VEHICLE' ? 'Veículo / Frota' : asset.type === 'COLLECTION' ? 'Artefato Físico' : 'Dispositivo / Equip.'} • ID: {asset.id.split('-')[1].toUpperCase()}
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
                  <QRCode value={asset.id} size={220} getRef={(c) => { svgRef.current = c; }} color={colors.primary} backgroundColor="transparent" />
               </View>

               <Text style={{textAlign: 'center', marginBottom: 24, color: colors.textSecondary, fontWeight: '600', fontSize: 13, lineHeight: 18}}>Afixe fisicamente esta etiqueta gerada a partir do QrCode no objeto operacional para permitir fiscalizações e auditorias à jato.</Text>
               
               <TouchableOpacity style={[styles.saveBtn, {marginTop: 0, width: '100%', paddingVertical: 14}]} onPress={shareQRCode}>
                  <Ionicons name="share-social" size={20} color="#fff" style={{marginRight: 8}} />
                  <Text style={styles.saveBtnText}>Exportar Imagem HD</Text>
               </TouchableOpacity>
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  content: { paddingBottom: 40 },
  
  heroCard: { backgroundColor: colors.cardWhite, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  imageContainer: { width: '100%', height: 240, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: colors.border },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
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
  
  saveBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  
  dashedBox: { borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 24, backgroundColor: colors.primary + '0A' },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 10, backgroundColor: colors.background },
  logRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' },
  logText: { flex: 1, marginLeft: 12, fontWeight: '700', color: colors.primary },
  logTime: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: colors.border },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary + '0A' },
  deletePhotoBadge: { position: 'absolute', top: 4, right: 16, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
