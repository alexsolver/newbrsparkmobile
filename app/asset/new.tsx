import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Dimensions, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveAssetsLocal, getLocalAssets, queueOfflineAction } from '../../src/database';
import { Asset } from '../../src/types/asset';
import * as ImagePicker from 'expo-image-picker';

const ASSET_TYPES = [
  { id: 'REAL_ESTATE', title: 'Imóvel', subtitle: 'Prédios, Terrenos', icon: 'business-outline' as const, color: '#3B82F6' },
  { id: 'VEHICLE', title: 'Veículo', subtitle: 'Frotas', icon: 'car-outline' as const, color: '#F59E0B' },
  { id: 'COLLECTION', title: 'Coleção', subtitle: 'Obras, Peças', icon: 'diamond-outline' as const, color: '#8B5CF6' },
  { id: 'OTHER', title: 'Outro', subtitle: 'Máquinas, IoT', icon: 'cube-outline' as const, color: '#10B981' },
];

export default function NewAssetScreen() {
  const router = useRouter();
  const [type, setType] = useState<string | null>(null);

  // Formulário Oficial
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [location, setLocation] = useState('');
  const [owner, setOwner] = useState('');
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const handleSave = () => {
    if (!title.trim() || !type) {
      Alert.alert('Atenção', 'Você precisa no mínimo definir a categoria e o Título principal.');
      return;
    }
    const newAsset: Asset = {
      id: "brsp-" + Math.random().toString().substring(2, 8),
      title,
      type: type as any,
      status: 'NOVO CADASTRO',
      statusType: 'success',
      imageUrl: photos.length > 0 ? photos[0] : undefined,
      details: { 
        brand, location, owner, customFields, photos
      }
    };
    
    const existing = getLocalAssets();
    saveAssetsLocal([newAsset, ...existing]); // Insere no início do db local
    queueOfflineAction('CREATE_ASSET', newAsset);
    Alert.alert('Formulário Criado!', 'Seu ativo completo foi cadastrado e listado!');
    router.back();
  };

  const addCustomField = () => {
    setCustomFields([...customFields, { key: 'Nova Prop.', value: '' }]);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled) {
      setPhotos([...photos, result.assets[0].uri]);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { type ? setType(null) : router.back() }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type ? 'Preencher Formulário' : 'Novo Ativo'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* PASSO 1: SELECIONAR CATEGORIA COM NOVO DESIGN B2B */}
        {!type && (
          <View>
            <Text style={styles.sectionTitle}>1. Escolha a Categoria Oficial</Text>
            <Text style={styles.sectionDesc}>Qual módulo operacional esse ativo irá seguir?</Text>
            
            <View style={styles.gridContainer}>
              {ASSET_TYPES.map(cat => (
                 <TouchableOpacity 
                   key={cat.id} 
                   style={styles.gridItem} 
                   activeOpacity={0.7}
                   onPress={() => setType(cat.id)}
                 >
                    <View style={[styles.iconBox, { backgroundColor: cat.color + '15' }]}>
                       <Ionicons name={cat.icon} size={32} color={cat.color} />
                    </View>
                    <Text style={styles.modTitle}>{cat.title}</Text>
                    <Text style={styles.modSubtitle}>{cat.subtitle}</Text>
                 </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* PASSO 2: JORNADA DE CADASTRO EXPANDIDA (Ficha COMPLETA) */}
        {type && (
          <View style={styles.formContainer}>
            <View style={styles.selectedTypeBadge}>
               <Ionicons name={ASSET_TYPES.find(t=>t.id===type)?.icon as any} size={20} color={colors.primary} />
               <Text style={{fontWeight: '700', color: colors.primary, marginLeft: 8}}>
                  Categoria: {ASSET_TYPES.find(t=>t.id===type)?.title}
               </Text>
            </View>

            <Text style={styles.modLabel}>Nome Comercial / Plaqueta Principal</Text>
            <TextInput style={styles.modInput} value={title} onChangeText={setTitle} placeholder="Ex: Trator CAT Modelo B" />
            
            <Text style={styles.modLabel}>Fabricante (Opcional)</Text>
            <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder="Ex: Toyota, LG, etc" />

            <Text style={styles.modLabel}>Endereço ou Filial Sede (Opcional)</Text>
            <TextInput style={styles.modInput} value={location} onChangeText={setLocation} placeholder="Onde o objeto será mantido?" />

            <Text style={styles.modLabel}>Líder Técnico Atribuído (Opcional)</Text>
            <TextInput style={styles.modInput} value={owner} onChangeText={setOwner} placeholder="Funcionário que zela" />

            {/* Custom Fields Dinâmicos */}
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12}}>
               <Text style={[styles.modLabel, {marginBottom:0}]}>Propriedades Dinâmicas B2B</Text>
               <TouchableOpacity onPress={addCustomField}><Text style={{color:colors.primary, fontWeight:'600'}}>+ Add Parâmetro</Text></TouchableOpacity>
            </View>
            
            {customFields.map((field: any, idx: number) => (
               <View key={idx} style={{flexDirection: 'row', gap: 8, marginBottom: 12}}>
                  <TextInput 
                     style={[styles.modInput, {flex: 0.45, marginBottom:0, backgroundColor: '#f8fafc', fontWeight:'700'}]} 
                     value={field.key} 
                     onChangeText={(t) => {
                        const cf = [...customFields]; cf[idx].key = t; setCustomFields(cf);
                     }} 
                  />
                  <TextInput 
                     style={[styles.modInput, {flex: 0.55, marginBottom:0}]} 
                     value={field.value} 
                     placeholder="Valor"
                     onChangeText={(t) => {
                        const cf = [...customFields]; cf[idx].value = t; setCustomFields(cf);
                     }} 
                  />
               </View>
            ))}

            {/* Hub de Fotos Scanner Padrão */}
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 24}}>
               <Text style={[styles.modLabel, {marginBottom:0}]}>Fotos / Inspeção do Ativo Físico</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 32}}>
               <TouchableOpacity style={styles.photoAddBtn} onPress={pickImage}>
                  <Ionicons name="camera" size={32} color={colors.primary} />
                  <Text style={{color: colors.primary, fontSize: 12, marginTop: 6, fontWeight: '700'}}>Fotografar</Text>
               </TouchableOpacity>
               {photos.map((uri: string, idx: number) => (
                  <Image key={idx} source={{uri}} style={styles.photoThumb} />
               ))}
            </ScrollView>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" style={{marginRight: 8}}/>
              <Text style={styles.submitBtnText}>Criar Ficha do Ativo Oficial</Text>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  content: { padding: 16 },
  
  // Categorias (Step 1)
  sectionTitle: { fontSize: 22, fontWeight: '700', color: colors.primary, marginBottom: 4, marginTop: 12 },
  sectionDesc: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 24, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  iconBox: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modTitle: { fontSize: 16, fontWeight: '700', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  modSubtitle: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  // Formulário Expandido (Step 2)
  formContainer: { backgroundColor: colors.cardWhite, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 40 },
  selectedTypeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', padding: 12, borderRadius: 8, marginBottom: 24, borderWidth: 1, borderColor: colors.primary + '40' },
  modLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  modInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, fontSize: 16, backgroundColor: colors.background, marginBottom: 20, color: colors.primary, fontWeight: '500' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  
  // Fotos Slider da Vistoria
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: colors.border },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary + '0A' },
});
