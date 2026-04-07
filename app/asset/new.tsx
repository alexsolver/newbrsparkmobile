import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Dimensions, Image, Switch, ActivityIndicator, Modal, FlatList , KeyboardAvoidingView, Platform} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { ValueInput } from '../../src/components/ValueInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveAssetsLocal, getLocalAssets, queueOfflineAction, logAssetHistory, getAssetTypes, saveAssetTypes } from '../../src/database';
import { Asset } from '../../src/types/asset';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ApiService } from '../../src/services/api';
import { pushSyncQueue } from '../../src/services/syncService';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';

const ICON_LIBRARY = [
  { icon: 'home-outline',           label: 'Casa' },
  { icon: 'business-outline',       label: 'Prédio' },
  { icon: 'storefront-outline',     label: 'Loja' },
  { icon: 'bed-outline',            label: 'Quarto' },
  { icon: 'library-outline',        label: 'Biblioteca' },
  { icon: 'school-outline',         label: 'Escola' },
  { icon: 'medkit-outline',         label: 'Saúde' },
  { icon: 'fitness-outline',        label: 'Academia' },
  { icon: 'basketball-outline',     label: 'Esporte' },
  { icon: 'golf-outline',           label: 'Golfe' },
  { icon: 'car-outline',            label: 'Carro' },
  { icon: 'car-sport-outline',      label: 'Esportivo' },
  { icon: 'bus-outline',            label: 'Ônibus' },
  { icon: 'train-outline',          label: 'Trem' },
  { icon: 'bicycle-outline',        label: 'Bicicleta' },
  { icon: 'boat-outline',           label: 'Barco' },
  { icon: 'airplane-outline',       label: 'Avião' },
  { icon: 'rocket-outline',         label: 'Foguete' },
  { icon: 'wallet-outline',         label: 'Carteira' },
  { icon: 'cash-outline',           label: 'Dinheiro' },
  { icon: 'card-outline',           label: 'Cartão' },
  { icon: 'trending-up-outline',    label: 'Investo' },
  { icon: 'diamond-outline',        label: 'Joia' },
  { icon: 'gift-outline',           label: 'Presente' },
  { icon: 'desktop-outline',        label: 'Monitor' },
  { icon: 'laptop-outline',         label: 'Laptop' },
  { icon: 'phone-portrait-outline', label: 'Celular' },
  { icon: 'tablet-portrait-outline',label: 'Tablet' },
  { icon: 'server-outline',         label: 'Servidor' },
  { icon: 'hardware-chip-outline',  label: 'Chip' },
  { icon: 'camera-outline',         label: 'Câmera' },
  { icon: 'tv-outline',             label: 'TV' },
  { icon: 'headset-outline',        label: 'Áudio' },
  { icon: 'print-outline',          label: 'Impressora' },
  { icon: 'leaf-outline',           label: 'Planta' },
  { icon: 'flower-outline',         label: 'Flor' },
  { icon: 'earth-outline',          label: 'Terra' },
  { icon: 'water-outline',          label: 'Água' },
  { icon: 'flame-outline',          label: 'Energia' },
  { icon: 'sunny-outline',          label: 'Solar' },
  { icon: 'cloud-outline',          label: 'Nuvem' },
  { icon: 'snow-outline',           label: 'Frio' },
  { icon: 'briefcase-outline',      label: 'Maleta' },
  { icon: 'cube-outline',           label: 'Cubo' },
  { icon: 'star-outline',           label: 'Estrela' },
  { icon: 'bookmark-outline',       label: 'Marcador' },
  { icon: 'shield-outline',         label: 'Escudo' },
  { icon: 'key-outline',            label: 'Chave' },
  { icon: 'lock-closed-outline',    label: 'Cadeado' },
  { icon: 'construct-outline',      label: 'Manutenção' },
  { icon: 'hammer-outline',         label: 'Martelo' },
  { icon: 'builds-outline',         label: 'Industrial' },
  { icon: 'flask-outline',          label: 'Laboratório' },
  { icon: 'paw-outline',            label: 'Animal' },
  { icon: 'pizza-outline',          label: 'Alimentação' },
  { icon: 'wine-outline',           label: 'Bebida' },
  { icon: 'musical-notes-outline',  label: 'Música' },
  { icon: 'image-outline',          label: 'Arte' },
  { icon: 'ribbon-outline',         label: 'Prêmio' },
  { icon: 'archive-outline',        label: 'Arquivo' },
  { icon: 'barbell-outline',        label: 'Musculação' },
  { icon: 'color-palette-outline',  label: 'Design' },
];

const COLOR_PRESETS = ['#FF8C00','#10B981','#3B82F6','#EF4444','#8B5CF6','#F59E0B','#EC4899','#14B8A6','#64748B','#000000'];

export default function NewAssetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ parentId?: string; parentTitle?: string }>();
  const parentId    = params.parentId    || null;
  const parentTitle = params.parentTitle ? decodeURIComponent(params.parentTitle) : null;

  const [type, setType] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [assetTypes, setAssetTypes] = useState<any[]>([]);

  React.useEffect(() => {
    const SEED_TYPES = [
      { id: 'REAL_ESTATE', titleKey: 'newAsset.realEstate', subtitleKey: 'newAsset.realEstateSub', icon: 'business-outline', color: '#FF8C00' },
      { id: 'TERRESTRIAL', titleKey: 'newAsset.terrestrial', subtitleKey: 'newAsset.terrestrialSub', icon: 'car-outline', color: '#904D00' },
      { id: 'AQUATIC',     titleKey: 'newAsset.aquatic',     subtitleKey: 'newAsset.aquaticSub',     icon: 'boat-outline',     color: '#006B5C' },
      { id: 'SPECIAL',     titleKey: 'newAsset.special',     subtitleKey: 'newAsset.specialSub',     icon: 'star-outline',     color: '#565E61' },
    ];
    setAssetTypes(SEED_TYPES);
  }, []);

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
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [fetchingGps, setFetchingGps] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);

  // Responsabilidade
  const [owner, setOwner] = useState('');
  const [department, setDepartment] = useState('');

  const [customFields, setCustomFields] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [customIcon, setCustomIcon] = useState('');
  const [customColor, setCustomColor] = useState('');
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  const fetchCepData = async () => {
     if (cep.length < 8) return;
     const cleanCep = cep.replace(/\D/g, '');
     if (cleanCep.length !== 8) return;
     
     setFetchingCep(true);
     try {
       const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
       const data = await res.json();
       if (!data.erro) {
           setStreet(data.logradouro || '');
           setNeighborhood(data.bairro || '');
           setCity(data.localidade || '');
           setState(data.uf || '');
        } else {
           Alert.alert(t('assetDetail.invalidZip'), t('assetDetail.invalidZipMsg'));
        }
     } catch (e) {
        Alert.alert(t('common.error'), t('assetDetail.zipFailed'));
     }
     setFetchingCep(false);
  };

  const fetchGps = async () => {
    setFetchingGps(true);

    try {
      // 1. Verifica se serviços de localização estão habilitados no dispositivo
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(
          'GPS Desabilitado',
          'Os serviços de localização estão desligados. Ative o GPS nas configurações do dispositivo.',
        );
        setFetchingGps(false);
        return;
      }

      // 2. Solicita permissão
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('assetDetail.gpsDenied'), t('newAsset.gpsPermMsg'));
        setFetchingGps(false);
        return;
      }

      // 3. Tenta alta precisão (10s timeout), cai para Balanced se demorar
      let loc: Location.LocationObject | null = null;
      try {
        loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 10000)
          ),
        ]) as Location.LocationObject;
      } catch (err: any) {
        if (err?.message === 'timeout') {
          // Fallback para Balanced se HIGH demorar demais (comum em simulador)
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } else {
          throw err;
        }
      }

      if (!loc) throw new Error('Nenhuma localização obtida');

      const { latitude, longitude, accuracy } = loc.coords;
      const coordStr = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      setGpsCoordinates(coordStr);

      // 4. Geocodificação reversa para preencher endereço
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) {
          if (place.street) setStreet(place.street);
          if (place.streetNumber) setStreetNumber(place.streetNumber);
          if (place.subregion || place.district) setNeighborhood(place.subregion || place.district || '');
          if (place.city) setCity(place.city);
          if (place.region) setState(place.region);
          if (place.postalCode) setCep(place.postalCode.replace(/\D/g, '').slice(0, 8));
        }
      } catch (_) {
        // Geocodificação é opcional — não bloqueia o fluxo
      }

      const accuracyText = accuracy ? ` (±${Math.round(accuracy)}m)` : '';
      Alert.alert(
        '📍 GPS Capturado',
        `Coordenadas: ${coordStr}${accuracyText}\n\nSe estiver usando o simulador, a localização é a configurada em Features → Location no Xcode.`,
      );
    } catch (e: any) {
      console.warn('[GPS]', e);
      Alert.alert(
        t('newAsset.gpsFailed'),
        'Não foi possível obter a localização. Verifique se o GPS está ativo e as permissões foram concedidas.\n\nNo simulador iOS: use Xcode → Features → Location para simular coordenadas.',
      );
    }

    setFetchingGps(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !type) {
      Alert.alert(t('newAsset.requiredAttention'), t('newAsset.requiredAttentionMsg'));
      return;
    }

    // Verificar duplicatas de nome
    const existing = getLocalAssets(user?.email || '', { includeMobileWarehouse: false });
    const duplicate = existing.find(a => a.title.toLowerCase().trim() === title.toLowerCase().trim());
    if (duplicate) {
      Alert.alert(t('newAsset.duplicate'), t('newAsset.duplicateMsg', { title: duplicate.title }));
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
      parentId: parentId || null,
      imageUrl: photos.length > 0 ? photos[0] : undefined,
      details: {
        inventoryId, brand, model, serialNumber,
        costCenter, acquisitionValue,
        cep, street, streetNumber, complement, neighborhood, city, state,
        gpsCoordinates, owner, department, customFields, photos,
        customIcon: customIcon || undefined,
        customColor: customColor || undefined,
      }
    };

    // Insere apenas o novo ativo (INSERT OR REPLACE é idempotente)
    saveAssetsLocal([newAsset], user?.email || '');
    queueOfflineAction('CREATE_ASSET', newAsset, user?.email || '');
    logAssetHistory(newId, t('newAsset.onboarding'),
      parentId
        ? t('newAsset.subAssetLinked', { parent: parentTitle || parentId })
        : t('newAsset.corporateEntry'));
    
    // Eagerly push the queue so it saves before any possibility of user logging out
    await pushSyncQueue(user?.email || '');
    // Background sync the rest, no block
    ApiService.sync(user?.email || '');
    
    router.back();
  };

  // UX de Add Custom Field Options
  const pickCustomFieldType = () => {
     Alert.alert(t('assetDetail.addParam'), t('assetDetail.addParamMsg'), [
        { text: t('assetDetail.fieldText'), onPress: () => setCustomFields([...customFields, { label: '', value: '', type: 'text' }]) },
        { text: t('assetDetail.fieldNumber'), onPress: () => setCustomFields([...customFields, { label: '', value: '', type: 'number' }]) },
        { text: t('assetDetail.fieldBoolean'), onPress: () => setCustomFields([...customFields, { label: '', value: false, type: 'boolean' }]) },
        { text: t('common.cancel'), style: 'cancel' }
     ]);
  };

  const pickImage = () => {
    Alert.alert(
      t('newAsset.scannerLocal'),
      t('newAsset.scannerLocalMsg'),
      [
        {
          text: t('newAsset.cameraCapture'),
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
              Alert.alert(t('common.error'), t('newAsset.cameraPermError'));
            }
          }
        },
        {
          text: t('newAsset.deviceGallery'),
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
        { text: t('common.cancel'), style: 'cancel' }
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { 
          if (step === 3) setStep(2);
          else if (step === 2) { setStep(1); setType(null); }
          else router.back();
        }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {parentId ? t('newAsset.subAssetOf', { parent: parentTitle || '...' }) : t('newAsset.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Banner de sub-ativo */}
      {parentId && (
        <View style={styles.parentBanner}>
          <Ionicons name="git-branch-outline" size={15} color={colors.primary} />
          <Text style={styles.parentBannerText}>
           {t('newAsset.linkedTo')}: <Text style={{ fontWeight: '800' }}>{parentTitle || parentId}</Text>
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        {/* PASSO 1: SELECIONAR CATEGORIA COM NOVO DESIGN B2B */}
        {step === 1 && (
          <View>
            <Text style={styles.sectionTitle}>{t('newAsset.frameworkTitle')}</Text>
            <Text style={styles.sectionDesc}>{t('newAsset.frameworkDesc')}</Text>
            
            <View style={styles.gridContainer}>
              {assetTypes.map(cat => (
                 <TouchableOpacity 
                   key={cat.id} 
                   style={styles.gridItem} 
                   activeOpacity={0.7}
                   onPress={() => { setType(cat.id); setStep(2); }}
                 >
                    <View style={[styles.iconBox, { backgroundColor: cat.color + '15' }]}>
                       <Ionicons name={cat.icon as any} size={36} color={cat.color} />
                    </View>
                    <Text style={styles.modTitle}>{t(cat.titleKey)}</Text>
                    <Text style={styles.modSubtitle}>{t(cat.subtitleKey)}</Text>
                 </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* PASSO 2: ÍCone e Foto */}
        {step === 2 && type && (
          <View style={styles.formContainer}>
            <View style={styles.selectedTypeBadge}>
               <Ionicons name={assetTypes.find(t=>t.id===type)?.icon as any} size={20} color={colors.primary} />
               <Text style={{fontWeight: '900', color: colors.primary, marginLeft: 8, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5}}>
                  {t('newAsset.selectedCategory')}: {t(assetTypes.find(t2=>t2.id===type)?.titleKey || '')}
               </Text>
            </View>

            <View style={[styles.formSectionHeader, {marginTop: 0}]}>
               <Ionicons name="finger-print" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Identificação Principal</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.nameLabel')} *</Text>
            <TextInput style={styles.modInput} value={title} onChangeText={setTitle} placeholder={t('newAsset.namePlaceholder')} returnKeyType="done" />

            <View style={[styles.formSectionHeader, {marginTop: 20}]}>
               <Ionicons name="color-palette-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Identidade Visual</Text>
            </View>
            <Text style={{fontSize: 10, color: colors.textSecondary, marginBottom: 20, marginTop: 4, fontWeight: '700'}}>Escolha um ícone e uma cor que represente este bem.</Text>

            {/* Icon Picker Button */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLow, borderRadius: 12, padding: 14, marginBottom: 32, gap: 14 }}
              onPress={() => setIconPickerVisible(true)}
            >
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: (customColor || colors.primary) + '18', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={customIcon ? customIcon as any : 'apps-outline'} size={26} color={customColor || colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>{ customIcon ? 'Ícone selecionado' : 'Escolher ícone'}</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>{customIcon ? 'Toque para trocar' : 'Biblioteca de ícones Ionicons'}</Text>
              </View>
              {customIcon && (
                <TouchableOpacity onPress={() => { setCustomIcon(''); setCustomColor(''); }}>
                  <Ionicons name="close-circle" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitBtn} onPress={() => {
              if (!title.trim()) {
                Alert.alert(t('newAsset.requiredAttention'), t('newAsset.requiredAttentionMsg'));
                return;
              }
              setStep(3);
            }}>
              <Text style={styles.submitBtnText}>Continuar para a Ficha</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{marginLeft: 8}}/>
            </TouchableOpacity>
          </View>
        )}

        {/* PASSO 3: JORNADA DE CADASTRO (Ficha COMPLETA) */}
        {step === 3 && type && (
          <View style={styles.formContainer}>
            <View style={styles.selectedTypeBadge}>
               <Ionicons name={assetTypes.find(t=>t.id===type)?.icon as any} size={20} color={colors.primary} />
               <Text style={{fontWeight: '900', color: colors.primary, marginLeft: 8, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5}}>
                  {t('newAsset.selectedCategory')}: {t(assetTypes.find(t2=>t2.id===type)?.titleKey || '')}
               </Text>
            </View>

            {/* HEADER 1: Dados Mestres */}
            <View style={styles.formSectionHeader}>
               <Ionicons name="barcode-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>Identificadores</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.inventoryCode')}</Text>
            <TextInput style={styles.modInput} value={inventoryId} onChangeText={setInventoryId} placeholder={t('newAsset.inventoryPlaceholder')} returnKeyType="done"
                      />

            {/* Campos Dinâmicos por Tipo de Ativo (Polimorfismo Brspark) */}
            {type === 'REAL_ESTATE' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.registration')}</Text>
                      <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder={t('newAsset.registrationPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.totalArea')}</Text>
                      <TextInput style={styles.modInput} value={model} onChangeText={setModel} placeholder={t('newAsset.areaPlaceholder')} keyboardType="numeric" returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.useType')}</Text>
                <TextInput style={styles.modInput} value={serialNumber} onChangeText={setSerialNumber} placeholder={t('newAsset.useTypePlaceholder')} returnKeyType="done"
                      />
              </>
            ) : type === 'TERRESTRIAL' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.brand')}</Text>
                      <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder={t('newAsset.brandPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.commercialModel')}</Text>
                      <TextInput style={styles.modInput} value={model} onChangeText={setModel} placeholder={t('newAsset.modelPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.chassisVin')}</Text>
                <TextInput style={styles.modInput} value={serialNumber} onChangeText={setSerialNumber} placeholder={t('newAsset.chassisPlaceholder')} returnKeyType="done"
                      />
              </>
            ) : type === 'AQUATIC' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.brand')}</Text>
                      <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder={t('newAsset.brandPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.commercialModel')}</Text>
                      <TextInput style={styles.modInput} value={model} onChangeText={setModel} placeholder={t('newAsset.modelPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.serialNumber')}</Text>
                <TextInput style={styles.modInput} value={serialNumber} onChangeText={setSerialNumber} placeholder={t('newAsset.serialPlaceholder')} returnKeyType="done"
                      />
              </>
            ) : type === 'SPECIAL' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.author')}</Text>
                      <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder={t('newAsset.authorPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.material')}</Text>
                      <TextInput style={styles.modInput} value={model} onChangeText={setModel} placeholder={t('newAsset.materialPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.conservation')}</Text>
                <TextInput style={styles.modInput} value={serialNumber} onChangeText={setSerialNumber} placeholder={t('newAsset.conservationPlaceholder')} returnKeyType="done"
                      />
              </>
            ) : (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.manufacturer')}</Text>
                      <TextInput style={styles.modInput} value={brand} onChangeText={setBrand} placeholder={t('newAsset.manufacturerPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.commercialModel')}</Text>
                      <TextInput style={styles.modInput} value={model} onChangeText={setModel} placeholder={t('newAsset.versionPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.serialNumber')}</Text>
                <TextInput style={styles.modInput} value={serialNumber} onChangeText={setSerialNumber} placeholder={t('newAsset.serialPlaceholder')} returnKeyType="done"
                      />
              </>
            )}

            {/* HEADER 2: Finanças e Dept */}
            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="cash-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>{t('newAsset.valueCost')}</Text>
            </View>

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.costCenter')}</Text>
                  <TextInput style={styles.modInput} value={costCenter} onChangeText={setCostCenter} placeholder={t('newAsset.costCenterPlaceholder')} returnKeyType="done"
                      />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.acquisitionValue')}</Text>
                  <ValueInput style={styles.modInput} value={acquisitionValue} onChangeText={setAcquisitionValue} placeholder="0,00" currency />
               </View>
            </View>
            
            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.department')}</Text>
                  <TextInput style={styles.modInput} value={department} onChangeText={setDepartment} placeholder={t('newAsset.departmentPlaceholder')} returnKeyType="done"
                      />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.techLead')}</Text>
                  <TextInput style={styles.modInput} value={owner} onChangeText={setOwner} placeholder={t('newAsset.techLeadPlaceholder')} returnKeyType="done"
                      />
               </View>
            </View>

            {/* HEADER 3: Localização Avançada */}
            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="map-outline" size={18} color={colors.primary} />
               <Text style={styles.formSectionTitle}>{t('newAsset.geolocation')}</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.postalCode')}</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0}]} value={cep} onChangeText={setCep} placeholder={t('newAsset.postalPlaceholder')} keyboardType="numeric" maxLength={9} returnKeyType="done"
                      />
               <TouchableOpacity style={styles.actionBtn} onPress={fetchCepData} disabled={fetchingCep}>
                  {fetchingCep ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight: '700'}}>{t('common.search')}</Text>}
               </TouchableOpacity>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.street')}</Text>
            <TextInput style={styles.modInput} value={street} onChangeText={setStreet} placeholder={t('newAsset.streetPlaceholder')} returnKeyType="done"
                      />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.number')}</Text>
                  <TextInput style={styles.modInput} value={streetNumber} onChangeText={setStreetNumber} placeholder={t('newAsset.numberPlaceholder')} keyboardType="numeric" returnKeyType="done"
                      />
               </View>
               <View style={{flex: 2}}>
                  <Text style={styles.modLabel}>{t('newAsset.complement')}</Text>
                  <TextInput style={styles.modInput} value={complement} onChangeText={setComplement} placeholder={t('newAsset.complementPlaceholder')} returnKeyType="done"
                      />
               </View>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.neighborhood')}</Text>
            <TextInput style={styles.modInput} value={neighborhood} onChangeText={setNeighborhood} placeholder={t('newAsset.neighborhoodPlaceholder')} returnKeyType="done"
                      />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 2}}>
                  <Text style={styles.modLabel}>{t('newAsset.city')}</Text>
                  <TextInput style={styles.modInput} value={city} onChangeText={setCity} placeholder={t('newAsset.cityPlaceholder')} returnKeyType="done"
                      />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.state')}</Text>
                  <TextInput style={styles.modInput} value={state} onChangeText={setState} placeholder={t('newAsset.statePlaceholder')} maxLength={2} autoCapitalize="characters" returnKeyType="done"
                      />
               </View>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.gpsSignature')}</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0, backgroundColor: '#f1f5f9', color: '#64748b'}]} value={gpsCoordinates} editable={false} placeholder={t('newAsset.gpsPlaceholder')} returnKeyType="done"
                      />
               <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#14B8A6'}]} onPress={fetchGps} disabled={fetchingGps}>
                  {fetchingGps ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
               </TouchableOpacity>
            </View>

            {/* HEADER Custom Fields */}
          <View style={[styles.formSectionHeader, {justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 12}]}>
             <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
               <Ionicons name="construct-outline" size={18} color={colors.primary} />
               <Text style={[styles.formSectionTitle, {flexShrink: 1, fontSize: 15}]} numberOfLines={1}>{t('newAsset.extraAttrs')}</Text>
             </View>
             <TouchableOpacity onPress={pickCustomFieldType} style={{backgroundColor: colors.primary+'15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12}}>
               <Text style={{color:colors.primary, fontWeight:'800', fontSize: 11}}>+ {t('newAsset.includeAttr')}</Text>
             </TouchableOpacity>
          </View>
            
            {customFields.length === 0 && (
               <Text style={{color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20, fontStyle: 'italic'}}>{t('newAsset.noCustomFields')}</Text>
            )}

            {customFields.map((field: any, idx: number) => (
               <View key={idx} style={styles.customFieldPill}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                     <Text style={{fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase'}}>
                        TIPO: {field.type === 'text' ? t('newAsset.textType') : field.type === 'number' ? t('newAsset.numericType') : t('newAsset.logicType')}
                     </Text>
                     <TouchableOpacity onPress={() => { const cf = [...customFields]; cf.splice(idx, 1); setCustomFields(cf); }}>
                        <Ionicons name="trash" size={16} color="#ef4444" />
                     </TouchableOpacity>
                  </View>
                  <TextInput 
                     style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 8, fontWeight:'700', backgroundColor: '#fff', borderColor: '#CBD5E1'}]} 
                     value={field.label} 
                     placeholder={t('newAsset.fieldNamePlaceholder')}
                     onChangeText={(t) => {
                        const cf = [...customFields]; cf[idx].label = t; setCustomFields(cf);
                     }} 
                  returnKeyType="done"
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
                           {field.value ? t('newAsset.boolTrue') : t('newAsset.boolFalse')}
                        </Text>
                     </View>
                  ) : (
                     <TextInput 
                        style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 0, backgroundColor: '#fff'}]} 
                        value={field.value} 
                        placeholder={field.type === 'number' ? t('assetDetail.numericData') : t('assetDetail.freeTextData')}
                        keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                        onChangeText={(t) => {
                           const cf = [...customFields]; cf[idx].value = t; setCustomFields(cf);
                        }} 
                     returnKeyType="done"
                      />
                  )}
               </View>
            ))}

            <TouchableOpacity style={styles.submitBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" style={{marginRight: 8}}/>
              <Text style={styles.submitBtnText}>{t('newAsset.saveNewRecord')}</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Icon Picker Modal */}
      <Modal visible={iconPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary }}>ESCOLHER ÍCONE</Text>
            <TouchableOpacity onPress={() => setIconPickerVisible(false)}>
              <Ionicons name="close" size={24} color={colors.slate} />
            </TouchableOpacity>
          </View>

          {/* Color Picker */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>COR DO ÍCONE</Text>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map(c => (
                <TouchableOpacity key={c} onPress={() => setCustomColor(c)}
                  style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c, justifyContent: 'center', alignItems: 'center', borderWidth: customColor === c ? 2.5 : 0, borderColor: '#fff', shadowColor: c, shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 }}>
                  {customColor === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Preview */}
          {customIcon ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: (customColor || colors.primary) + '18', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={customIcon as any} size={36} color={customColor || colors.primary} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: 8 }}>Prévia do ícone</Text>
            </View>
          ) : null}

          {/* Icon Grid */}
          <FlatList
            data={ICON_LIBRARY}
            keyExtractor={item => item.icon}
            numColumns={4}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            columnWrapperStyle={{ gap: 12 }}
            renderItem={({ item }) => {
              const selected = customIcon === item.icon;
              return (
                <TouchableOpacity
                  onPress={() => { setCustomIcon(item.icon); }}
                  style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: selected ? (customColor || colors.primary) + '18' : colors.cardWhite, borderWidth: selected ? 1.5 : 1, borderColor: selected ? (customColor || colors.primary) : colors.border }}
                >
                  <Ionicons name={item.icon as any} size={28} color={selected ? (customColor || colors.primary) : colors.slate} />
                  <Text style={{ fontSize: 8, fontWeight: '700', color: selected ? (customColor || colors.primary) : colors.textSecondary, marginTop: 6, textAlign: 'center' }} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              );
            }}
          />

          {/* Confirm Button */}
          <View style={{ padding: 20, backgroundColor: colors.cardWhite, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              style={{ backgroundColor: customIcon ? (customColor || colors.branding) : '#CBD5E1', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
              onPress={() => customIcon ? setIconPickerVisible(false) : null}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {customIcon ? 'Confirmar ícone' : 'Selecione um ícone'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 32 - 16) / 2; // 2 items per row in new asset selector

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '900', color: colors.primary, marginHorizontal: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  content: { padding: 16 },
  
  // Categorias (Step 1)
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.primary, marginBottom: 4, marginTop: 12, letterSpacing: -0.4, textTransform: 'uppercase' },
  sectionDesc: { fontSize: 10, color: colors.textSecondary, marginBottom: 32, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 28, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  iconBox: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modTitle: { fontSize: 10, fontWeight: '900', color: colors.primary, textAlign: 'center', marginBottom: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  modSubtitle: { fontSize: 8, color: colors.textSecondary, textAlign: 'center', fontWeight: '700', textTransform: 'uppercase' },

  // Formulário Expandido (Step 2)
  formContainer: { backgroundColor: colors.cardWhite, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 40 },
  selectedTypeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', padding: 14, borderRadius: 12, marginBottom: 32, borderWidth: 1, borderColor: colors.primary + '40' },
  formSectionHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: colors.surfaceLow, paddingBottom: 8, marginBottom: 16 },
  formSectionTitle: { fontSize: 11, fontWeight: '900', color: colors.primary, marginLeft: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  modLabel: { fontSize: 7, fontWeight: '900', color: colors.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1.2 },
  modInput: { borderWidth: 0, borderRadius: 8, padding: 12, fontSize: 11, backgroundColor: colors.surfaceLow, marginBottom: 20, color: colors.primary, fontWeight: '900' },
  actionBtn: { backgroundColor: colors.branding, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },

  
  customFieldPill: { backgroundColor: colors.surfaceLow, padding: 16, borderRadius: 12, borderWidth: 0, marginBottom: 16 },
  
  submitBtn: { backgroundColor: colors.branding, borderRadius: 12, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, shadowColor: colors.branding, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  submitBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  
  // Fotos Slider da Vistoria
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: colors.surfaceLow },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: colors.branding, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.branding + '0A' },
  deletePhotoBadge: { position: 'absolute', top: 4, right: 16, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  parentBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent + '12', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.accent + '25' },
  parentBannerText: { fontSize: 9, color: colors.primary, fontWeight: '900', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
});
