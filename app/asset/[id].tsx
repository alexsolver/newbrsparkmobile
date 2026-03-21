import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, queueOfflineAction, saveAssetsLocal } from '../../src/database';
import { colors } from '../../src/theme/colors';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

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

  // Formulário reativo avançado para Edição de Ativos
  const [editForm, setEditForm] = useState<any>({
     title: '', brand: '', location: '', owner: '', customFields: [], photos: []
  });

  useEffect(() => {
    const localDb = getLocalAssets();
    const found = localDb.find(a => a.id === id);
    if (found) {
      setAsset(found);
      setEditForm({
         title: found.title || '',
         brand: found.details?.brand || '',
         location: found.details?.location || '',
         owner: found.details?.owner || '',
         customFields: found.details?.customFields || [],
         photos: found.details?.photos || []
      });
    }
  }, [id]);

  const scheduleMaintenance = () => {
    queueOfflineAction('SCHEDULE_MAINTENANCE', { assetId: id, timestamp: Date.now() });
    Alert.alert('Agendado com Sucesso', 'Fluxo técnico autorizado via rede de segurança offline!');
    setActiveModule(null);
  };

  const handleSaveInfo = () => {
    if (!asset) return;
    const updated = {
       ...asset,
       title: editForm.title,
       details: {
          ...asset.details,
          brand: editForm.brand,
          location: editForm.location,
          owner: editForm.owner,
          customFields: editForm.customFields,
          photos: editForm.photos
       }
    };
    // Sync profundo em SQLite local
    const localDb = getLocalAssets();
    const newDb = localDb.map(a => a.id === asset.id ? updated : a);
    saveAssetsLocal(newDb);
    setAsset(updated);
    queueOfflineAction('UPDATE_ASSET', updated); // Enfilera a alteração nativa pro back-end
    Alert.alert('Ficha Criptografada', 'Formulário completo foi salvo localmente e na fila pra nuvem.');
    setActiveModule(null);
  };

  const addCustomField = () => {
    setEditForm({
       ...editForm, 
       customFields: [...editForm.customFields, { key: 'Novo Parametro', value: '' }]
    });
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled) {
      setEditForm({ ...editForm, photos: [...editForm.photos, result.assets[0].uri] });
    }
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
            <Text style={styles.modLabel}>ID Global Criptográfico (SaaS)</Text>
            <TextInput style={[styles.modInput, {backgroundColor:'#f3f4f6', color: '#94a3b8'}]} value={asset.id} editable={false} />
            
            <Text style={styles.modLabel}>Nome do Ativo / Etiqueta Mestra</Text>
            <TextInput style={styles.modInput} value={editForm.title} onChangeText={(t)=>setEditForm({...editForm,title:t})} />
            
            <Text style={styles.modLabel}>Fabricante / Modelo da Máquina</Text>
            <TextInput style={styles.modInput} value={editForm.brand} onChangeText={(t)=>setEditForm({...editForm,brand:t})} placeholder="Ex: Bobcat Industrial / Scania" />

            <Text style={styles.modLabel}>Filial ou Setor Atual (Deploy)</Text>
            <TextInput style={styles.modInput} value={editForm.location} onChangeText={(t)=>setEditForm({...editForm,location:t})} placeholder="Ex: CD Guarulhos Leste" />

            <Text style={styles.modLabel}>Custódia Responsável (Operador)</Text>
            <TextInput style={styles.modInput} value={editForm.owner} onChangeText={(t)=>setEditForm({...editForm,owner:t})} placeholder="Ex: Carlos Mecânico Chefe" />

            {/* Grid Dinâmico Custom Fields Corporativos */}
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, marginTop: 12}}>
               <Text style={[styles.modLabel, {marginBottom:0}]}>Estruturas Flexíveis Personalizadas</Text>
               <TouchableOpacity onPress={addCustomField}>
                  <Text style={{color:colors.primary, fontWeight:'700', fontSize: 13}}>+ Adicionar Propriedade</Text>
               </TouchableOpacity>
            </View>
            
            {editForm.customFields.map((field: any, idx: number) => (
               <View key={idx} style={{flexDirection: 'row', gap: 8, marginBottom: 12}}>
                  <TextInput 
                     style={[styles.modInput, {flex: 0.45, marginBottom:0, backgroundColor: '#f8fafc', fontWeight:'700'}]} 
                     value={field.key} 
                     onChangeText={(t) => {
                        const cf = [...editForm.customFields]; cf[idx].key = t; setEditForm({...editForm, customFields: cf});
                     }} 
                  />
                  <TextInput 
                     style={[styles.modInput, {flex: 0.55, marginBottom:0}]} 
                     value={field.value} 
                     placeholder="Inserir Valor..."
                     onChangeText={(t) => {
                        const cf = [...editForm.customFields]; cf[idx].value = t; setEditForm({...editForm, customFields: cf});
                     }} 
                  />
               </View>
            ))}

            {/* Hub de Fotos em Tempo Real In Loco */}
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 32}}>
               <Text style={[styles.modLabel, {marginBottom:0}]}>Inspeção Fotográfica do Ativo</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 32}}>
               <TouchableOpacity style={styles.photoAddBtn} onPress={pickImage}>
                  <Ionicons name="camera" size={32} color={colors.primary} />
                  <Text style={{color: colors.primary, fontSize: 12, marginTop: 6, fontWeight: '700'}}>Anexar Scanner</Text>
               </TouchableOpacity>
               {editForm.photos.map((uri: string, idx: number) => (
                  <Image key={idx} source={{uri}} style={styles.photoThumb} />
               ))}
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveInfo}>
               <Ionicons name="shield-checkmark" size={20} color="#fff" style={{marginRight: 8}} />
               <Text style={styles.saveBtnText}>Assinar Diário de Modificações (Enviar)</Text>
            </TouchableOpacity>
          </View>
        );
      case 'docs':
        return (
          <View style={styles.modContainer}>
            <TouchableOpacity style={styles.dashedBox} onPress={() => Alert.alert('Importado', 'Um documento local em PDF entrou na sandbox Offline do dispositivo.')}>
               <Ionicons name="document-attach-outline" size={32} color={colors.primary} />
               <Text style={{marginTop: 8, color: colors.primary, fontWeight: '600'}}>Alocar / Escanear PDF Novo</Text>
            </TouchableOpacity>
            <View style={styles.docRow}>
               <Ionicons name="document-text" size={24} color={'#E11D48'} />
               <Text style={{flex: 1, marginLeft: 12, fontWeight: '500'}}>Apolice_Sinistro_Gerado.pdf</Text>
            </View>
            <View style={styles.docRow}>
               <Ionicons name="document-text" size={24} color={'#3B82F6'} />
               <Text style={{flex: 1, marginLeft: 12, fontWeight: '500'}}>Averbacao_Placa_1234.pdf</Text>
            </View>
          </View>
        );
      case 'maint':
        return (
          <View style={styles.modContainer}>
            <View style={styles.logRow}><View style={[styles.dot, {backgroundColor: colors.success.text}]} /><Text style={styles.logText}>Óleo Trocado e Vistoria Completa</Text><Text style={styles.logTime}>Há 2 meses</Text></View>
            <View style={styles.logRow}><View style={styles.dot} /><Text style={styles.logText}>Substituição de Cabos Eletrônicos da Injeção</Text><Text style={styles.logTime}>Planejado p/ Março</Text></View>
            <TouchableOpacity style={[styles.saveBtn, {marginTop: 24, backgroundColor: '#F59E0B'}]} onPress={scheduleMaintenance}>
               <Text style={[styles.saveBtnText, {color: '#1E293B'}]}>⚒️ Emitir Nova Ordem de Serviço (S.O)</Text>
            </TouchableOpacity>
          </View>
        );
      case 'costs':
        return (
          <View style={styles.modContainer}>
             <Text style={{fontSize: 32, fontWeight: '800', color: colors.primary, marginBottom: 4}}>R$ 48.910,20</Text>
             <Text style={{color: colors.textSecondary, marginBottom: 24, fontWeight: '600'}}>Custo Total de Maturação Acumulado (TCO)</Text>
             <View style={styles.docRow}><Text style={{flex: 1, fontWeight: '500'}}>Apólices Consolidadas</Text><Text style={{fontWeight: '700', color: colors.warning.text}}>- R$ 1.200</Text></View>
             <View style={styles.docRow}><Text style={{flex: 1, fontWeight: '500'}}>Preventivas (Peças + MO)</Text><Text style={{fontWeight: '700', color: colors.warning.text}}>- R$ 4.500</Text></View>
             <View style={styles.docRow}><Text style={{flex: 1, fontWeight: '500'}}>Depreciação de Ativo Estimada</Text><Text style={{fontWeight: '700', color: colors.warning.text}}>- R$ 11.200</Text></View>
             <View style={[styles.docRow, {backgroundColor: '#ECFDF5', borderColor: '#A7F3D0'}]}><Text style={{flex: 1, fontWeight: '700', color: '#065F46'}}>Rentabilidade Atribuída</Text><Text style={{fontWeight: '800', color: '#059669'}}>+ R$ 65.810</Text></View>
          </View>
        );
      default: 
        return (
           <View style={styles.modContainer}>
              <Text style={{color: colors.textSecondary, textAlign: 'center', marginTop: 24, lineHeight: 22}}>Módulo Satélite restrito e pendente de homologação na Branch B2B central.</Text>
           </View>
        );
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={()=>activeModule?setActiveModule(null):router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{activeModule ? MODULES.find(m=>m.id===activeModule)?.title : 'Gestão Intracorporativa'}</Text>
        <TouchableOpacity style={styles.backButton}>
           <Ionicons name="ellipsis-vertical" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.imageContainer}>
            {asset.imageUrl ? (
               <Image source={{ uri: asset.imageUrl }} style={styles.image} />
            ) : (
               <View style={styles.imagePlaceholder}>
                 <Ionicons name="cube" size={50} color={colors.textLight} />
               </View>
            )}
            <View style={styles.badgeContainer}>
              <Badge label={asset.status} type={asset.statusType} />
            </View>
          </View>
          
          <View style={styles.heroDetails}>
            <Text style={styles.title}>{asset.title}</Text>
            <Text style={styles.typeTag}>
              {asset.type === 'REAL_ESTATE' ? 'Imóvel Nativo' : asset.type === 'VEHICLE' ? 'Veículo Frotista' : asset.type === 'COLLECTION' ? 'Artefato Físico' : 'Dispositivo Eletrônico'} • SN: {asset.id}
            </Text>
          </View>
        </View>

        {!activeModule && (
          <View>
            <Text style={styles.sectionTitle}>Diretório Módulos</Text>
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
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - (16 * 2) - (12 * 2)) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  content: { paddingBottom: 40 },
  heroCard: { backgroundColor: colors.cardWhite, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  imageContainer: { width: '100%', height: 220, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: colors.border, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  badgeContainer: { position: 'absolute', bottom: 12, left: 16 },
  heroDetails: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  typeTag: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, paddingHorizontal: 16, marginBottom: 16 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  iconBox: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  modSubtitle: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  
  // Painel Interno dos módulos do Ativo
  innerModuleView: { backgroundColor: colors.cardWhite, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 20 },
  modContainer: { width: '100%' },
  modLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  modInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, fontSize: 15, backgroundColor: colors.cardWhite, marginBottom: 20, color: colors.primary, fontWeight: '500' },
  saveBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dashedBox: { borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 8, padding: 24, alignItems: 'center', marginBottom: 24, backgroundColor: colors.primary + '0A' },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 10, backgroundColor: colors.background },
  logRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' },
  logText: { flex: 1, marginLeft: 12, fontWeight: '600', color: colors.primary },
  logTime: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  
  // Fotos Slider da Vistoria
  photoThumb: { width: 100, height: 100, borderRadius: 8, marginRight: 12, backgroundColor: colors.border },
  photoAddBtn: { width: 100, height: 100, borderRadius: 8, marginRight: 12, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary + '0A' },
});
