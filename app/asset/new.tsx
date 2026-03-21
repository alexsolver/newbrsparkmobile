import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Dimensions, Image, Switch, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveAssetsLocal, getLocalAssets, queueOfflineAction, logAssetHistory } from '../../src/database';
import { Asset } from '../../src/types/asset';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ApiService } from '../../src/services/api';

const ASSET_TYPES = [
  { id: 'REAL_ESTATE', title: 'Imóvel', subtitle: 'Prédios, Terrenos', icon: 'business-outline' as const, color: '#3B82F6' },
  { id: 'VEHICLE', title: 'Veículo', subtitle: 'Frotas Leves/Pesadas', icon: 'car-outline' as const, color: '#F59E0B' },
  { id: 'COLLECTION', title: 'Patrimônio', subtitle: 'Móveis, TI', icon: 'diamond-outline' as const, color: '#8B5CF6' },
  { id: 'OTHER', title: 'Máquina/Equip.', subtitle: 'Indústria, IoT', icon: 'cube-outline' as const, color: '#10B981' },
];

export default function NewAssetScreen() {
  const router = useRouter();
  const [type, setType] = useState<string | null>(null);

  // Core Fields
  const [title, setTitle] = useState('');
  const [inventoryId, setInventoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  
  // Finanças
  const [costCenter, setCostCenter] = useState('');
  const [acquisitionValue, setAcquisitionValue] = useState('');
  
  // Localização
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState('');
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [fetchingGps, setFetchingGps] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);

  // Responsabilidade
  const [owner, setOwner] = useState('');
  const [department, setDepartment] = useState('');

  const [customFields, setCustomFields] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const fetchCepData = async () => {
     if (cep.length < 8) return;
     const cleanCep = cep.replace(/\D/g, '');
     if (cleanCep.length !== 8) return;
     
     setFetchingCep(true);
     try {
       const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
       const data = await res.json();
       if (!data.erro) {
          setAddress(`${data.logradouro}, Bairro ${data.bairro} - ${data.localidade}/${data.uf}`);
       } else {
          Alert.alert('CEP Inválido', 'O CEP inserido não foi encontrado na base.');
       }
     } catch (e) {
       Alert.alert('Erro', 'Falha ao buscar CEP. Verifique sua conexão.');
     }
     setFetchingCep(false);
  };

  const fetchGps = async () => {
    setFetchingGps(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão Negada', 'O aplicativo precisa de permissão de GPS para escanear a localização do ativo.');
      setFetchingGps(false);
      return;
    }

    try {
       let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
       setGpsCoordinates(`${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
    } catch (e) {
       Alert.alert('Falha de GPS', 'Não foi possível rastrear as coordenadas.');
    }
    setFetchingGps(false);
  };

  const handleSave = () => {
    if (!title.trim() || !type) {
      Alert.alert('Atenção Obrigatória', 'Forneça no mínimo o Nome/Etiqueta principal do ativo para cadastrá-lo.');
      return;
    }
    
    // Gerando ID interno
    const newId = "brsp-" + Math.random().toString().substring(2, 8);
    
    const newAsset: Asset = {
      id: newId,
      title,
      type: type as any,
      status: 'OPERACIONAL',
      statusType: 'success',
      imageUrl: photos.length > 0 ? photos[0] : undefined,
      details: { 
        inventoryId,
        brand,
        model,
        serialNumber,
        costCenter,
        acquisitionValue,
        address,
        cep,
        gpsCoordinates,
        owner,
        department,
        customFields, 
        photos
      }
    };
    
    const existing = getLocalAssets();
    saveAssetsLocal([newAsset, ...existing]);
    queueOfflineAction('CREATE_ASSET', newAsset);
    logAssetHistory(newId, 'Inventário Efetuado (Onboarding)', 'Ingresso corporativo na base de dados global através de formulário eletrônico.');
    Alert.alert('Ficha Criptografada \ud83d\udca5', 'A ficha técnica oficial do seu ativo foi implantada localmente e enviada ao servidor B2B central.');
    ApiService.sync();
    router.back();
  };

  // UX de Add Custom Field Options
  const pickCustomFieldType = () => {
     Alert.alert('Novo Campo Customizado', 'Qual tipo de inteligência esse campo vai guardar?', [
        { text: 'Texto', onPress: () => setCustomFields([...customFields, { label: '', value: '', type: 'text' }]) },
        { text: 'Número', onPress: () => setCustomFields([...customFields, { label: '', value: '', type: 'number' }]) },
        { text: 'Booleano (Sim/Não)', onPress: () => setCustomFields([...customFields, { label: '', value: false, type: 'boolean' }]) },
        { text: 'Cancelar', style: 'cancel' }
     ]);
  };

  const pickImage = () => {
    Alert.alert(
      'Scanner Local',
      'Como deseja providenciar a foto/vídeo do ativo?',
      [
        {
          text: '📸 Captura (Câmera Ativa)',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (perm.granted) {
              let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, quality: 0.6,
              });
              if (!result.canceled) {
                setPhotos((prev: string[]) => [...prev, result.assets[0].uri]);
              }
            } else {
              Alert.alert('Erro', 'Permissão de Câmera negada ou hardware inacessível.');
            }
          }
        },
        {
          text: '🖼️ Dispositivo Local (Galeria)',
          onPress: async () => {
            let result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true, quality: 0.6,
            });
            if (!result.canceled) {
              setPhotos((prev) => [...prev, result.assets[0].uri]);
            }
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { type ? setType(null) : router.back() }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type ? 'Criação de Ativo' : 'Selecione a Estrutura'}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* PASSO 1: SELECIONAR CATEGORIA COM NOVO DESIGN B2B */}
        {!type && (
          <View>
            <Text style={styles.sectionTitle}>Framework Operacional</Text>
            <Text style={styles.sectionDesc}>Selecione a classe raiz para definir as propriedades herdeiras do Ativo.</Text>
            
            <View style={styles.gridContainer}>
              {ASSET_TYPES.map(cat => (
                 <TouchableOpacity 
                   key={cat.id} 
                   style={styles.gridItem} 
                   activeOpacity={0.7}
                   onPress={() => setType(cat.id)}
                 >
                    <View style={[styles.iconBox, { backgroundColor: cat.color + '15' }]}>
                       <Ionicons name={cat.icon} size={36} color={cat.color} />
                    </View>
                    <Text style={styles.modTitle}>{cat.title}</Text>
                    <Text style={styles.modSubtitle}>{cat.subtitle}</Text>
                 </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* PASSO 2: JORNADA DE CADASTRO (Ficha COMPLETA) */}
        {type && (
          <View style={styles.formContainer}>
            <View style={styles.selectedTypeBadge}>
               <Ionicons name={ASSET_TYPES.find(t=>t.id===type)?.icon as any} size={20} color={colors.primary} />
               <Text style={{fontWeight: '800', color: colors.primary, marginLeft: 8, textTransform: 'uppercase', fontSize: 13}}>
                  Categoria Selecionada: {ASSET_TYPES.find(t=>t.id===type)?.title}
               </Text>
            </View>

            {/* HEADER 1: Dados Mestres */}
            <View style={styles.formSectionHeader}>
               <Ionicons name="finger-print" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Informações Primárias</Text>
            </View>

            <Text style={styles.modLabel}>Nome / Etiqueta Principal *</Text>
            <TextInput style={styles.modInput} value={title} onChangeText={setTitle} placeholder="Ex: Trator CAT Modelo B20" />
            
            <Text style={styles.modLabel}>Cód. de Patrimônio (Tombamento)</Text>
            <TextInput style={styles.modInput} value={inventoryId} onChangeText={setInventoryId} placeholder="Ex: PT-48810-A" />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Fabricante</Text>
                  <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder="Marca" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Modelo Comercial</Text>
                  <TextInput style={styles.modInput} value={model} onChangeText={setModel} placeholder="Versão/Model" />
               </View>
            </View>

            <Text style={styles.modLabel}>Número de Série (S/N) / Chassi</Text>
            <TextInput style={styles.modInput} value={serialNumber} onChangeText={setSerialNumber} placeholder="Ex: ABC12345678" />

            {/* HEADER 2: Finanças e Dept */}
            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="cash-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Atribuição de Valor e Custo</Text>
            </View>

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Centro de Custos (CC)</Text>
                  <TextInput style={styles.modInput} value={costCenter} onChangeText={setCostCenter} placeholder="Ex: ENG-01" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Valor de Aquisição</Text>
                  <TextInput style={styles.modInput} value={acquisitionValue} onChangeText={setAcquisitionValue} placeholder="R$ 0,00" keyboardType="numeric" />
               </View>
            </View>
            
            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Departamento Alocado</Text>
                  <TextInput style={styles.modInput} value={department} onChangeText={setDepartment} placeholder="Manutenção" />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>Líder Técnico (Custodiano)</Text>
                  <TextInput style={styles.modInput} value={owner} onChangeText={setOwner} placeholder="Ex: João Eng." />
               </View>
            </View>

            {/* HEADER 3: Localização Avançada */}
            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="map-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Geolocalização / Endereçamento</Text>
            </View>

            <Text style={styles.modLabel}>CEP Postal (Brasil)</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0}]} value={cep} onChangeText={setCep} placeholder="Ex: 01001-000" keyboardType="numeric" maxLength={9} />
               <TouchableOpacity style={styles.actionBtn} onPress={fetchCepData} disabled={fetchingCep}>
                  {fetchingCep ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight: '700'}}>Buscar ZIP</Text>}
               </TouchableOpacity>
            </View>

            <Text style={styles.modLabel}>Edificação / Despacho / Cidade</Text>
            <TextInput style={[styles.modInput, {minHeight: 60}]} multiline value={address} onChangeText={setAddress} placeholder="Avenida, Rua, Condomínio Físico..." />

            <Text style={styles.modLabel}>Assinatura Global GPS (Lat/Long)</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0, backgroundColor: '#f1f5f9', color: '#64748b'}]} value={gpsCoordinates} editable={false} placeholder="Aguardando scanner de satélite..." />
               <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#14B8A6'}]} onPress={fetchGps} disabled={fetchingGps}>
                  {fetchingGps ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
               </TouchableOpacity>
            </View>

            {/* HEADER 4: Custom Fields Limpos */}
            <View style={[styles.formSectionHeader, {marginTop: 16, justifyContent: 'space-between'}]}>
               <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <Ionicons name="construct-outline" size={18} color={colors.primary} />
                 <Text style={styles.formSectionTitle}>Campos Customizados</Text>
               </View>
               <TouchableOpacity onPress={pickCustomFieldType} style={{backgroundColor: colors.primary+'15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12}}>
                 <Text style={{color:colors.primary, fontWeight:'800', fontSize: 13}}>+ NOVO EIXO</Text>
               </TouchableOpacity>
            </View>
            
            {customFields.length === 0 && (
               <Text style={{color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20, fontStyle: 'italic'}}>A interface de campos modulares está inativada. Insira um eixo de propriedade específico usando o botão acima.</Text>
            )}

            {customFields.map((field: any, idx: number) => (
               <View key={idx} style={styles.customFieldPill}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                     <Text style={{fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase'}}>
                        TIPO: {field.type === 'text' ? 'TEXTO' : field.type === 'number' ? 'NUMÉRICO' : 'VALOR LÓGICO Y/N'}
                     </Text>
                     <TouchableOpacity onPress={() => { const cf = [...customFields]; cf.splice(idx, 1); setCustomFields(cf); }}>
                        <Ionicons name="trash" size={16} color="#ef4444" />
                     </TouchableOpacity>
                  </View>
                  <TextInput 
                     style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 8, fontWeight:'700', backgroundColor: '#fff', borderColor: '#CBD5E1'}]} 
                     value={field.label} 
                     placeholder="Nome do Critério (Ex: Tensão, Inspeção CIPA)"
                     onChangeText={(t) => {
                        const cf = [...customFields]; cf[idx].label = t; setCustomFields(cf);
                     }} 
                  />
                  {field.type === 'boolean' ? (
                     <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                        <Switch 
                           value={field.value} 
                           onValueChange={(v) => {
                              const cf = [...customFields]; cf[idx].value = v; setCustomFields(cf);
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
                        placeholder={field.type === 'number' ? "Anotação Numérica..." : "Conteúdo Escrito / Extenso"}
                        keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                        onChangeText={(t) => {
                           const cf = [...customFields]; cf[idx].value = t; setCustomFields(cf);
                        }} 
                     />
                  )}
               </View>
            ))}

            {/* HEADER 5: Câmera Integrada */}
            <View style={[styles.formSectionHeader, {marginTop: 24}]}>
               <Ionicons name="images-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Mídia e Fotografia Física</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 32}}>
               <TouchableOpacity style={styles.photoAddBtn} onPress={pickImage}>
                  <Ionicons name="camera" size={32} color={colors.primary} />
                  <Text style={{color: colors.primary, fontSize: 12, marginTop: 6, fontWeight: '700'}}>Adicionar Foto</Text>
               </TouchableOpacity>
               {photos.map((uri: string, idx: number) => (
                  <View key={idx} style={{position: 'relative'}}>
                    <Image source={{uri}} style={styles.photoThumb} />
                    <TouchableOpacity style={styles.deletePhotoBadge} onPress={() => {
                        const newPhotos = [...photos]; newPhotos.splice(idx,1); setPhotos(newPhotos);
                    }}>
                       <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
               ))}
            </ScrollView>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" style={{marginRight: 8}}/>
              <Text style={styles.submitBtnText}>Salvar Cadastro Novo</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 32 - 16) / 2; // 2 items per row in new asset selector

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  content: { padding: 16 },
  
  // Categorias (Step 1)
  sectionTitle: { fontSize: 24, fontWeight: '800', color: colors.primary, marginBottom: 4, marginTop: 12 },
  sectionDesc: { fontSize: 14, color: colors.textSecondary, marginBottom: 32, lineHeight: 20 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 28, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  iconBox: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modTitle: { fontSize: 17, fontWeight: '800', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  modSubtitle: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', fontWeight: '500' },

  // Formulário Expandido (Step 2)
  formContainer: { backgroundColor: colors.cardWhite, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 40 },
  selectedTypeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', padding: 14, borderRadius: 12, marginBottom: 32, borderWidth: 1, borderColor: colors.primary + '40' },
  formSectionHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.background, paddingBottom: 8, marginBottom: 16 },
  formSectionTitle: { fontSize: 16, fontWeight: '800', color: colors.primary, marginLeft: 8 },
  
  modLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  modInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, fontSize: 15, backgroundColor: colors.background, marginBottom: 20, color: colors.primary, fontWeight: '600' },
  actionBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  
  customFieldPill: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  
  submitBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  
  // Fotos Slider da Vistoria
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: colors.border },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary + '0A' },
  deletePhotoBadge: { position: 'absolute', top: 4, right: 16, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
