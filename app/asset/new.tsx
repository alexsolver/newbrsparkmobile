import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Dimensions, Image, Switch, ActivityIndicator, Modal, FlatList , KeyboardAvoidingView, Platform} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { ValueInput } from '../../src/components/ValueInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveAssetsLocal, getLocalAssets, queueOfflineAction, logAssetHistory } from '../../src/database';
import { Asset } from '../../src/types/asset';
import * as ImagePicker from 'expo-image-picker';
import { ensureCameraPermissionAfterRationale, ensureLibraryPermissionAfterRationale } from '../../src/lib/jitPermissions';
import * as Location from 'expo-location';
import { ApiService } from '../../src/services/api';
import { pushSyncQueue } from '../../src/services/syncService';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { usePersona } from '../../src/context/PersonaContext';
import { getPersonaTabHref } from '../../src/navigation/personaRouting';
import {
  getContextsForRoot,
  listKindsForJourney,
  getKindById,
  validateTemplate,
  getAssetFormBlock,
} from '../../src/assetKind';
import { AssetTemplateFieldGroup } from '../../src/components/AssetTemplateFieldGroup';
import { ASSET_ICON_LIBRARY } from '../../src/asset/assetIconLibrary';
import {
  buildDefaultModuleSelectionForNewAsset,
  moduleSelectionToWhitelist,
  MODULE_I18N_BY_ID,
  OPTIONAL_ASSET_MODULE_IDS,
} from '../../src/asset/assetModuleRegistry';

const COLOR_PRESETS = ['#FF8C00','#10B981','#3B82F6','#EF4444','#8B5CF6','#F59E0B','#EC4899','#14B8A6','#64748B','#000000'];

export default function NewAssetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ parentId?: string; parentTitle?: string }>();
  const parentId    = params.parentId    || null;
  const parentTitle = params.parentTitle ? decodeURIComponent(params.parentTitle) : null;
  const { colors: C } = useTheme();
  const styles = useMemo(() => createNewAssetStyles(C), [C]);

  const { activePersona } = usePersona();
  const [type, setType] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [assetTypes, setAssetTypes] = useState<any[]>([]);
  const [industryContextId, setIndustryContextId] = useState<string | null>(null);
  const [selectedKindId, setSelectedKindId] = useState<string | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string | number | boolean>>({});
  const [kindSearch, setKindSearch] = useState('');

  React.useEffect(() => {
    const SEED_TYPES = [
      { id: 'REAL_ESTATE', titleKey: 'newAsset.realEstate', subtitleKey: 'newAsset.realEstateSub', icon: 'business-outline', color: '#FF8C00' },
      { id: 'MOBILITY', titleKey: 'newAsset.mobility', subtitleKey: 'newAsset.mobilitySub', icon: 'car-outline', color: '#904D00' },
      { id: 'MACHINERY', titleKey: 'newAsset.machinery', subtitleKey: 'newAsset.machinerySub', icon: 'construct-outline', color: '#64748B' },
      { id: 'AQUATIC', titleKey: 'newAsset.aquatic', subtitleKey: 'newAsset.aquaticSub', icon: 'boat-outline', color: '#006B5C' },
      { id: 'IT', titleKey: 'newAsset.it', subtitleKey: 'newAsset.itSub', icon: 'hardware-chip-outline', color: '#4338CA' },
      { id: 'COLLECTIONS', titleKey: 'newAsset.collections', subtitleKey: 'newAsset.collectionsSub', icon: 'diamond-outline', color: '#A16207' },
      { id: 'OTHER', titleKey: 'newAsset.otherRoot', subtitleKey: 'newAsset.otherRootSub', icon: 'cube-outline', color: '#565E61' },
    ];
    setAssetTypes(SEED_TYPES);
  }, []);

  const availableContexts = useMemo(
    () => (type ? getContextsForRoot(type as any) : []),
    [type]
  );
  const kindOptions = useMemo(
    () => (type && industryContextId ? listKindsForJourney(type as any, industryContextId) : []),
    [type, industryContextId]
  );
  const filteredKinds = useMemo(() => {
    const q = kindSearch.trim().toLowerCase();
    if (!q) return kindOptions;
    return kindOptions.filter((k) => {
      const label = t(k.labelKey).toLowerCase();
      const sub = t(k.shortDescKey).toLowerCase();
      return k.searchTokens.includes(q) || label.includes(q) || sub.includes(q);
    });
  }, [kindOptions, kindSearch, t]);
  const selectedKind = getKindById(selectedKindId);

  const goBackStep = useCallback(() => {
    if (step === 6) setStep(5);
    else if (step === 5) setStep(4);
    else if (step === 4) setStep(3);
    else if (step === 3) {
      setStep(2);
      setSelectedKindId(null);
      setTemplateValues({});
    } else if (step === 2) {
      setStep(1);
      setIndustryContextId(null);
    } else router.back();
  }, [step, router]);

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
  const [iconSearch, setIconSearch] = useState('');

  const filteredIconLibrary = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return ASSET_ICON_LIBRARY;
    return ASSET_ICON_LIBRARY.filter(
      (e) => e.label.toLowerCase().includes(q) || e.icon.toLowerCase().includes(q)
    );
  }, [iconSearch]);

  useEffect(() => {
    if (!iconPickerVisible) setIconSearch('');
  }, [iconPickerVisible]);

  const [moduleSelection, setModuleSelection] = useState<Record<string, boolean>>({});

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
        Alert.alert(t('newAsset.gpsServicesDisabledTitle'), t('newAsset.gpsServicesDisabledBody'));
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
        t('newAsset.gpsCaptureSuccessTitle'),
        t('newAsset.gpsCaptureSuccessBody', { coords: coordStr, accuracySuffix: accuracyText }),
      );
    } catch (e: any) {
      console.warn('[GPS]', e);
      Alert.alert(t('newAsset.gpsFailed'), t('newAsset.gpsCaptureErrorDetail'));
    }

    setFetchingGps(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !type) {
      Alert.alert(t('newAsset.requiredAttention'), t('newAsset.requiredAttentionMsg'));
      return;
    }

    const k = getKindById(selectedKindId);
    const fieldFail = validateTemplate(k, templateValues);
    if (fieldFail) {
      Alert.alert(t('common.attention'), t('assetJourney.missingField'));
      return;
    }

    // Verificar duplicatas de nome
    const existing = getLocalAssets(user?.email || '', { includeMobileWarehouse: false });
    const duplicate = existing.find((a) => a.title.toLowerCase().trim() === title.toLowerCase().trim());
    if (duplicate) {
      Alert.alert(t('newAsset.duplicate'), t('newAsset.duplicateMsg', { title: duplicate.title }));
      return;
    }

    // Gerando ID interno
    const newId = 'brsp-' + Math.random().toString().substring(2, 8);

    const templateSerialized: Record<string, string> = {};
    for (const key of Object.keys(templateValues)) {
      const v = templateValues[key];
      if (v !== undefined && v !== null) {
        templateSerialized[key] = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
      }
    }

    const newAsset: Asset = {
      id: newId,
      title,
      type: type as any,
      status: 'OPERACIONAL',
      statusType: 'success',
      parentId: parentId || null,
      imageUrl: photos.length > 0 ? photos[0] : undefined,
        details: {
        inventoryId,
        brand,
        model,
        serialNumber,
        costCenter,
        acquisitionValue,
        cep,
        street,
        streetNumber,
        complement,
        neighborhood,
        city,
        state,
        gpsCoordinates,
        owner,
        department,
        customFields,
        photos,
        customIcon: customIcon || undefined,
        customColor: customColor || undefined,
        assetKindId: selectedKindId || undefined,
        industryContextId: industryContextId || undefined,
        templateValues: Object.keys(templateSerialized).length ? templateSerialized : undefined,
        moduleVisibility: moduleSelectionToWhitelist(moduleSelection),
        moduleVisibilityMode: 'whitelist' as const,
      },
    };

    saveAssetsLocal([newAsset], user?.email || '');
    queueOfflineAction('CREATE_ASSET', newAsset, user?.email || '');
    logAssetHistory(
      newId,
      t('newAsset.onboarding'),
      parentId
        ? t('newAsset.subAssetLinked', { parent: parentTitle || parentId })
        : t('newAsset.corporateEntry')
    );

    await pushSyncQueue(user?.email || '');
    ApiService.sync(user?.email || '');

    if (k?.maintenanceIntervalMonths && k?.maintenanceHintKey) {
      Alert.alert(t('assetJourney.postSaveTitle'), t(k.maintenanceHintKey, { months: k.maintenanceIntervalMonths }), [
        { text: t('assetJourney.doneBack'), style: 'cancel', onPress: () => router.back() },
        {
          text: t('assetJourney.viewProviders'),
          onPress: () => {
            router.replace(getPersonaTabHref(activePersona, 'services') as any);
          },
        },
      ]);
    } else {
      router.back();
    }
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
            const ok = await ensureCameraPermissionAfterRationale(t);
            if (!ok) {
              Alert.alert(t('common.error'), t('newAsset.cameraPermError'));
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true, quality: 0.6,
            });
            if (!result.canceled) {
              setPhotos((prev: string[]) => [...prev, result.assets[0].uri]);
            }
          }
        },
        {
          text: t('newAsset.deviceGallery'),
          onPress: async () => {
            const ok = await ensureLibraryPermissionAfterRationale(t);
            if (!ok) return;
            const result = await ImagePicker.launchImageLibraryAsync({
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
          if (step === 1) { setType(null); router.back(); }
          else goBackStep();
        }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={C.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 8, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {parentId ? t('newAsset.subAssetOf', { parent: parentTitle || '...' }) : t('newAsset.title')}
          </Text>
          {step > 1 && type && (
            <Text style={{ fontSize: 8, color: C.textSecondary, fontWeight: '700', marginTop: 2, textAlign: 'center' }} numberOfLines={2}>
              {t('assetJourney.breadcrumb' as any, {
                root: t(assetTypes.find((a) => a.id === type)?.titleKey || ''),
                ctx: industryContextId ? t(`assetJourney.context.${industryContextId}` as any) : '—',
                kind: selectedKind ? t(selectedKind.labelKey) : t('assetJourney.generic'),
              })}
            </Text>
          )}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Banner de sub-ativo */}
      {parentId && (
        <View style={styles.parentBanner}>
          <Ionicons name="git-branch-outline" size={15} color={C.primary} />
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

        {step === 2 && type && (
          <View>
            <Text style={styles.sectionTitle}>{t('assetJourney.segmentTitle')}</Text>
            <Text style={styles.sectionDesc}>{t('assetJourney.segmentDesc')}</Text>
            <View style={styles.gridContainer}>
              {availableContexts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.gridItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setIndustryContextId(c.id);
                    setStep(3);
                    setKindSearch('');
                  }}
                >
                  <View style={[styles.iconBox, { backgroundColor: c.color + '15' }]}>
                    <Ionicons name={c.icon as any} size={36} color={c.color} />
                  </View>
                  <Text style={styles.modTitle}>{t(c.labelKey)}</Text>
                  <Text style={styles.modSubtitle}>{t(c.descKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 3 && type && industryContextId && (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>{t('assetJourney.kindSearchTitle')}</Text>
            <Text style={{ fontSize: 10, color: C.textSecondary, marginBottom: 12, fontWeight: '600' }}>{t('assetJourney.kindSearchDesc')}</Text>
            <TextInput
              style={styles.modInput}
              value={kindSearch}
              onChangeText={setKindSearch}
              placeholder={t('assetJourney.kindSearchPh')}
              returnKeyType="search"
            />
            {filteredKinds.length === 0 ? (
              <Text style={{ textAlign: 'center', color: C.textSecondary, marginTop: 20 }}>{t('assetJourney.noKinds')}</Text>
            ) : (
              <View style={{ marginTop: 12, maxHeight: 340 }}>
                {filteredKinds.map((k) => (
                  <TouchableOpacity
                    key={k.id}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      backgroundColor: C.cardWhite,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: C.border,
                      marginBottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                    onPress={() => {
                      setSelectedKindId(k.id);
                      setTemplateValues({});
                      if (!title.trim()) setTitle(t(k.labelKey));
                      setCustomIcon((k.icon as any) || customIcon);
                      setCustomColor(k.color || customColor);
                      setStep(4);
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: k.color + '18',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name={k.icon as any} size={22} color={k.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: C.primary }}>{t(k.labelKey)}</Text>
                      <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '600', marginTop: 2 }} numberOfLines={2}>
                        {t(k.shortDescKey)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={styles.genericCtaBtn}
              activeOpacity={0.88}
              onPress={() => {
                setSelectedKindId(null);
                setTemplateValues({});
                setStep(4);
              }}
            >
              <Ionicons name="layers-outline" size={20} color={C.primary} style={{ marginRight: 10 }} />
              <Text style={styles.genericCtaBtnText}>{t('assetJourney.genericCta')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Identidade: nome e ícone */}
        {step === 4 && type && (
          <View style={styles.formContainer}>
            <View style={styles.selectedTypeBadge}>
               <Ionicons name={assetTypes.find(t=>t.id===type)?.icon as any} size={20} color={C.primary} />
               <Text style={{fontWeight: '900', color: C.primary, marginLeft: 8, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5}}>
                  {t('newAsset.selectedCategory')}: {t(assetTypes.find(t2=>t2.id===type)?.titleKey || '')}
               </Text>
            </View>

            <View style={[styles.formSectionHeader, {marginTop: 0}]}>
               <Ionicons name="finger-print" size={18} color={C.primary} />
               <Text style={styles.formSectionTitle}>Identificação Principal</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.nameLabel')} *</Text>
            <TextInput style={styles.modInput} value={title} onChangeText={setTitle} placeholder={t('newAsset.namePlaceholder')} returnKeyType="done" />

            <View style={[styles.formSectionHeader, {marginTop: 20}]}>
               <Ionicons name="color-palette-outline" size={18} color={C.primary} />
               <Text style={styles.formSectionTitle}>Identidade Visual</Text>
            </View>
            <Text style={{fontSize: 10, color: C.textSecondary, marginBottom: 20, marginTop: 4, fontWeight: '700'}}>Escolha um ícone e uma cor que represente este ativo.</Text>

            {/* Icon Picker Button */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceLow, borderRadius: 12, padding: 14, marginBottom: 32, gap: 14 }}
              onPress={() => setIconPickerVisible(true)}
            >
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: (customColor || C.primary) + '18', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={customIcon ? customIcon as any : 'apps-outline'} size={26} color={customColor || C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>{ customIcon ? 'Ícone selecionado' : 'Escolher ícone'}</Text>
                <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 2 }}>{customIcon ? 'Toque para trocar' : 'Biblioteca de ícones Ionicons'}</Text>
              </View>
              {customIcon && (
                <TouchableOpacity onPress={() => { setCustomIcon(''); setCustomColor(''); }}>
                  <Ionicons name="close-circle" size={20} color={C.border} />
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-forward" size={18} color={C.border} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => {
                if (!title.trim()) {
                  Alert.alert(t('newAsset.requiredAttention'), t('newAsset.requiredAttentionMsg'));
                  return;
                }
                setModuleSelection(buildDefaultModuleSelectionForNewAsset(type as any, getKindById(selectedKindId)));
                setStep(5);
              }}
            >
              <Text style={styles.submitBtnText}>{t('assetJourney.toModules')}</Text>
              <Ionicons name="arrow-forward" size={18} color={C.cardWhite} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Módulos do ativo */}
        {step === 5 && type && (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>{t('assetJourney.modulesTitle')}</Text>
            <Text style={styles.sectionDesc}>{t('assetJourney.modulesDesc')}</Text>
            <Text style={{ fontSize: 10, color: C.textSecondary, marginBottom: 12, fontWeight: '600' }}>
              {t('assetJourney.modulesHint')}
            </Text>
            {OPTIONAL_ASSET_MODULE_IDS.map((mid) => {
              const lab = MODULE_I18N_BY_ID[mid];
              return (
              <View
                key={mid}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: C.border,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>{t(lab.titleKey as any)}</Text>
                  <Text style={{ fontSize: 9, color: C.textSecondary, marginTop: 2, fontWeight: '600' }} numberOfLines={2}>
                    {t(lab.subtitleKey as any)}
                  </Text>
                </View>
                <Switch
                  value={moduleSelection[mid] === true}
                  onValueChange={(v) => setModuleSelection((prev) => ({ ...prev, [mid]: v }))}
                  trackColor={{ false: C.border, true: C.primary }}
                />
              </View>
            );
            })}
            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: 20 }]}
              onPress={() => setStep(6)}
            >
              <Text style={styles.submitBtnText}>{t('assetJourney.toSheet')}</Text>
              <Ionicons name="arrow-forward" size={18} color={C.cardWhite} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Ficha completa */}
        {step === 6 && type && (
          <View style={styles.formContainer}>
            <View style={styles.selectedTypeBadge}>
              <Ionicons name={assetTypes.find((x) => x.id === type)?.icon as any} size={20} color={C.primary} />
              <Text
                style={{
                  fontWeight: '900',
                  color: C.primary,
                  marginLeft: 8,
                  textTransform: 'uppercase',
                  fontSize: 11,
                  letterSpacing: 0.5,
                }}
              >
                {t('newAsset.selectedCategory')}: {t(assetTypes.find((a) => a.id === type)?.titleKey || '')}
                {industryContextId
                  ? ` · ${t(`assetJourney.context.${industryContextId}` as any)}`
                  : ''}
                {selectedKind
                  ? ` · ${t(selectedKind.labelKey)}`
                  : ` · ${t('assetJourney.generic')}`}
              </Text>
            </View>

            <AssetTemplateFieldGroup kind={selectedKind} values={templateValues} onChange={setTemplateValues} />

            <View style={styles.formSectionHeader}>
              <Ionicons name="barcode-outline" size={18} color={C.primary} />
              <Text style={styles.formSectionTitle}>Identificadores</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.inventoryCode')}</Text>
            <TextInput style={styles.modInput} value={inventoryId} onChangeText={setInventoryId} placeholder={t('newAsset.inventoryPlaceholder')} returnKeyType="done"
                      />

            {/* Campos Dinâmicos por Tipo de Ativo (Polimorfismo Brspark) */}
            {getAssetFormBlock(type) === 'realEstate' ? (
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
            ) : getAssetFormBlock(type) === 'vehicleLike' ? (
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
            ) : getAssetFormBlock(type) === 'aquatic' ? (
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
            ) : getAssetFormBlock(type) === 'collectionLike' ? (
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
               <Ionicons name="cash-outline" size={18} color={C.primary} />
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
               <Ionicons name="map-outline" size={18} color={C.primary} />
               <Text style={styles.formSectionTitle}>{t('newAsset.geolocation')}</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.postalCode')}</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0}]} value={cep} onChangeText={setCep} placeholder={t('newAsset.postalPlaceholder')} keyboardType="numeric" maxLength={9} returnKeyType="done"
                      />
               <TouchableOpacity style={styles.actionBtn} onPress={fetchCepData} disabled={fetchingCep}>
                  {fetchingCep ? <ActivityIndicator color={C.cardWhite} /> : <Text style={{ color: C.cardWhite, fontWeight: '700' }}>{t('common.search')}</Text>}
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
               <TextInput style={[styles.modInput, { flex: 1, marginBottom: 0, backgroundColor: C.surfaceLow, color: C.textSecondary }]} value={gpsCoordinates} editable={false} placeholder={t('newAsset.gpsPlaceholder')} returnKeyType="done"
                      />
               <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.connectivity.online }]} onPress={fetchGps} disabled={fetchingGps}>
                  {fetchingGps ? <ActivityIndicator color={C.cardWhite} /> : <Ionicons name="locate" size={24} color={C.cardWhite} />}
               </TouchableOpacity>
            </View>

            {/* HEADER Custom Fields */}
          <View style={[styles.formSectionHeader, {justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 12}]}>
             <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
               <Ionicons name="construct-outline" size={18} color={C.primary} />
               <Text style={[styles.formSectionTitle, {flexShrink: 1, fontSize: 15}]} numberOfLines={1}>{t('newAsset.extraAttrs')}</Text>
             </View>
             <TouchableOpacity onPress={pickCustomFieldType} style={{backgroundColor: C.primary+'15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12}}>
               <Text style={{color:C.primary, fontWeight:'800', fontSize: 11}}>+ {t('newAsset.includeAttr')}</Text>
             </TouchableOpacity>
          </View>
            
            {customFields.length === 0 && (
               <Text style={{color: C.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20, fontStyle: 'italic'}}>{t('newAsset.noCustomFields')}</Text>
            )}

            {customFields.map((field: any, idx: number) => (
               <View key={idx} style={styles.customFieldPill}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                     <Text style={{fontSize: 11, fontWeight: '800', color: C.primary, textTransform: 'uppercase'}}>
                        TIPO: {field.type === 'text' ? t('newAsset.textType') : field.type === 'number' ? t('newAsset.numericType') : t('newAsset.logicType')}
                     </Text>
                     <TouchableOpacity onPress={() => { const cf = [...customFields]; cf.splice(idx, 1); setCustomFields(cf); }}>
                        <Ionicons name="trash" size={16} color={C.destructive} />
                     </TouchableOpacity>
                  </View>
                  <TextInput 
                     style={[styles.modInput, { paddingVertical: 10, fontSize: 14, marginBottom: 8, fontWeight: '700', backgroundColor: C.cardWhite, borderColor: C.border }]} 
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
                           trackColor={{ false: C.border, true: C.primary }}
                        />
                        <Text style={{fontWeight: '700', color: field.value ? C.primary : C.textSecondary}}>
                           {field.value ? t('newAsset.boolTrue') : t('newAsset.boolFalse')}
                        </Text>
                     </View>
                  ) : (
                     <TextInput 
                        style={[styles.modInput, { paddingVertical: 10, fontSize: 14, marginBottom: 0, backgroundColor: C.cardWhite }]} 
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
              <Ionicons name="checkmark-circle" size={24} color={C.cardWhite} style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>{t('newAsset.saveNewRecord')}</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Icon Picker Modal */}
      <Modal visible={iconPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.background }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.cardWhite }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.primary }}>ESCOLHER ÍCONE</Text>
            <TouchableOpacity onPress={() => setIconPickerVisible(false)}>
              <Ionicons name="close" size={24} color={C.slate} />
            </TouchableOpacity>
          </View>

          {/* Color Picker */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>COR DO ÍCONE</Text>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map((preset) => (
                <TouchableOpacity key={preset} onPress={() => setCustomColor(preset)}
                  style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: preset, justifyContent: 'center', alignItems: 'center', borderWidth: customColor === preset ? 2.5 : 0, borderColor: C.cardWhite, shadowColor: preset, shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 }}>
                  {customColor === preset && <Ionicons name="checkmark" size={16} color={C.cardWhite} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingBottom: 12, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.divider }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>BUSCAR NA BIBLIOTECA</Text>
            <TextInput
              value={iconSearch}
              onChangeText={setIconSearch}
              placeholder="Nome ou palavra (ex.: barco, saúde, wifi…)"
              placeholderTextColor={C.textLight}
              style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, backgroundColor: C.surfaceLow, color: C.primary, fontWeight: '600' }}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Preview */}
          {customIcon ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: (customColor || C.primary) + '18', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={customIcon as any} size={36} color={customColor || C.primary} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary, marginTop: 8 }}>Prévia do ícone</Text>
            </View>
          ) : null}

          {/* Icon Grid */}
          <FlatList
            data={filteredIconLibrary}
            keyExtractor={item => item.icon}
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', color: C.textSecondary, paddingVertical: 24, fontWeight: '600' }}>
                Nenhum ícone para “{iconSearch.trim()}”. Tente outro termo.
              </Text>
            }
            numColumns={4}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            columnWrapperStyle={{ gap: 12 }}
            renderItem={({ item }) => {
              const selected = customIcon === item.icon;
              return (
                <TouchableOpacity
                  onPress={() => { setCustomIcon(item.icon); }}
                  style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: selected ? (customColor || C.primary) + '18' : C.cardWhite, borderWidth: selected ? 1.5 : 1, borderColor: selected ? (customColor || C.primary) : C.border }}
                >
                  <Ionicons name={item.icon as any} size={28} color={selected ? (customColor || C.primary) : C.slate} />
                  <Text style={{ fontSize: 8, fontWeight: '700', color: selected ? (customColor || C.primary) : C.textSecondary, marginTop: 6, textAlign: 'center' }} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              );
            }}
          />

          {/* Confirm Button */}
          <View style={{ padding: 20, backgroundColor: C.cardWhite, borderTopWidth: 1, borderTopColor: C.border }}>
            <TouchableOpacity
              style={{ backgroundColor: customIcon ? (customColor || C.branding) : C.border, borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
              onPress={() => customIcon ? setIconPickerVisible(false) : null}
            >
              <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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

function createNewAssetStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '900', color: C.primary, marginHorizontal: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  content: { padding: 16 },
  
  // Categorias (Step 1)
  sectionTitle: { fontSize: 16, fontWeight: '900', color: C.primary, marginBottom: 4, marginTop: 12, letterSpacing: -0.4, textTransform: 'uppercase' },
  sectionDesc: { fontSize: 10, color: C.textSecondary, marginBottom: 32, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: C.cardWhite, paddingVertical: 28, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  iconBox: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modTitle: { fontSize: 10, fontWeight: '900', color: C.primary, textAlign: 'center', marginBottom: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  modSubtitle: { fontSize: 8, color: C.textSecondary, textAlign: 'center', fontWeight: '700', textTransform: 'uppercase' },

  // Formulário Expandido (Step 2)
  formContainer: { backgroundColor: C.cardWhite, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 40 },
  selectedTypeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary + '10', padding: 14, borderRadius: 12, marginBottom: 32, borderWidth: 1, borderColor: C.primary + '40' },
  formSectionHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: C.surfaceLow, paddingBottom: 8, marginBottom: 16 },
  formSectionTitle: { fontSize: 11, fontWeight: '900', color: C.primary, marginLeft: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  modLabel: { fontSize: 7, fontWeight: '900', color: C.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1.2 },
  modInput: { borderWidth: 0, borderRadius: 8, padding: 12, fontSize: 11, backgroundColor: C.surfaceLow, marginBottom: 20, color: C.primary, fontWeight: '900' },
  actionBtn: { backgroundColor: C.branding, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },

  
  customFieldPill: { backgroundColor: C.surfaceLow, padding: 16, borderRadius: 12, borderWidth: 0, marginBottom: 16 },
  
  submitBtn: { backgroundColor: C.branding, borderRadius: 12, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, shadowColor: C.branding, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  submitBtnText: { color: C.cardWhite, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Secundário: borda laranja / fundo claro — alinhado ao restante da tela (sem slate) */
  genericCtaBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary + '0A',
    borderWidth: 1.5,
    borderColor: C.primary + '55',
  },
  genericCtaBtnText: {
    flex: 1,
    color: C.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  
  // Fotos Slider da Vistoria
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: C.surfaceLow },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: C.branding, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: C.branding + '0A' },
  deletePhotoBadge: { position: 'absolute', top: 4, right: 16, backgroundColor: C.destructive, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  parentBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent + '12', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.accent + '25' },
  parentBannerText: { fontSize: 9, color: C.primary, fontWeight: '900', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  });
}
