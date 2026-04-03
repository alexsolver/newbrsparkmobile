import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, Dimensions, NativeSyntheticEvent, NativeScrollEvent, Alert, Modal,
  KeyboardAvoidingView, Platform} from 'react-native';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { Asset } from '../../src/types/asset';
import { LinearGradient } from 'expo-linear-gradient';
import { getRootAssets, getLocalAssets, getServiceCategories, saveServiceCategories } from '../../src/database';
import { ApiService, ProviderService } from '../../src/services/api';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Badge } from '../../src/components/Badge';
import { StockService } from '../../src/services/stockService';
import { StockItem } from '../../src/types/stock';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import { API_BASE, apiFetch } from '../../src/services/auth';
import { useManualSync } from '../../src/hooks/useManualSync';
import { pushSyncQueue, pullTasks } from '../../src/services/syncService';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Categorias de Serviço (Circular Style) — IDs batem com o backend ────────
const SERVICE_CATEGORIES = [
  { id: 'all',          labelKey: 'all',          icon: 'apps',                   color: '#904D00' },
  { id: 'Elétrica',    labelKey: 'electrical',    icon: 'flash',                  color: '#F59E0B' },
  { id: 'Hidráulica',  labelKey: 'plumbing',      icon: 'water-outline',          color: '#3B82F6' },
  { id: 'Limpeza',     labelKey: 'cleaning',      icon: 'sparkles-outline',       color: '#10B981', isMCI: false },
  { id: 'Reformas',    labelKey: 'renovation',    icon: 'hammer',                 color: '#8B5CF6' },
  { id: 'Jardinagem',  labelKey: 'garden',        icon: 'leaf-outline',           color: '#22C55E' },
  { id: 'Segurança',   labelKey: 'security',      icon: 'shield-checkmark',       color: '#EF4444' },
  { id: 'Climatização',labelKey: 'climatization', icon: 'thermometer-outline',    color: '#06B6D4' },
  { id: 'Tecnologia',  labelKey: 'technology',    icon: 'laptop-outline',         color: '#6366F1' },
];


// ─── Busca inteligente ─────────────────────────────────────────────
function smartMatch(provider: any, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matchIn = (text: string) => (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
  const words = q.split(/\s+/);
  if (matchIn(provider.name || '')) return true;
  if (matchIn(provider.category || '')) return true;
  // tags: backend → comma string | legacy → array
  const tagsArr: string[] = typeof provider.tags === 'string'
    ? provider.tags.split(',').filter(Boolean)
    : (Array.isArray(provider.tags) ? provider.tags : []);
  if (tagsArr.some((t: string) => matchIn(t))) return true;
  // keywords: flat string search
  const kwStr: string = typeof provider.keywords === 'string'
    ? provider.keywords
    : (Array.isArray(provider.keywords) ? provider.keywords.join(' ') : '');
  return words.some(w => kwStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(w));
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user, userRole } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Tab bar height: ~49px bar + bottom safe area inset
  const TAB_BAR_HEIGHT = 49 + insets.bottom;
  const pagerRef = useRef<ScrollView>(null);
  const mapRef = useRef<MapView>(null);
  const isInternalScroll = useRef(false);
  const [pagerWidth, setPagerWidth] = useState(SCREEN_W);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [pendingShares, setPendingShares] = useState<any[]>([]);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const next = new Set(expandedProviders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedProviders(next);
  };
  const [allExpanded, setAllExpanded] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const { mode, setMode } = useAppContext();
  const [svcFilter, setSvcFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<'DEFAULT' | 'RATING' | 'AGENDA' | 'VERIFIED' | 'PRICE' | 'DISTANCE'>('DEFAULT');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [assetSortMode, setAssetSortMode] = useState<'MANUAL' | 'A_Z' | 'Z_A' | 'STATUS_UP' | 'STATUS_DOWN'>('MANUAL');
  const [assetSortSheetVisible, setAssetSortSheetVisible] = useState(false);
  const [portfolioViewMode, setPortfolioViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [providerTab, setProviderTab] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('PENDING');
  const [providerTasks, setProviderTasks] = useState<any[]>([]);
  const [inprogressIds, setInprogressIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [providerSortMode, setProviderSortMode] = useState<'NEWEST' | 'OLDEST'>('NEWEST');
  const [providerSearch, setProviderSearch] = useState('');
  const [isProviderMenuExpanded, setIsProviderMenuExpanded] = useState(true);
  const [activeCardDropdown, setActiveCardDropdown] = useState<string | null>(null);

  // Which list section is currently in drag-reorder mode ('MY' | 'SHARED' | null)
  const [reorderingList, setReorderingList] = useState<'MY' | 'SHARED' | null>(null);

  // Task Card Details Modal
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskModalVisible, setTaskModalVisible] = useState(false);

  const moveAsset = (index: number, direction: 'UP' | 'DOWN', currentList: Asset[], isGlobal: boolean) => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === currentList.length - 1) return;

    const clone = [...currentList];
    const swapIdx = direction === 'UP' ? index - 1 : index + 1;
    [clone[index], clone[swapIdx]] = [clone[swapIdx], clone[index]];

    const updates: { id: string; displayOrder: number }[] = [];
    clone.forEach((item, i) => {
      item.displayOrder = i + 1;
      updates.push({ id: item.id, displayOrder: i + 1 });
    });

    import('../../src/database').then(({ updateAssetOrder }) => {
      updateAssetOrder(updates, user?.email || '');
    });

    const applySwap = (prev: Asset[]) =>
      prev.map(a => { const found = clone.find(c => c.id === a.id); return found ? { ...a, displayOrder: found.displayOrder } : a; });

    if (isGlobal) setAllAssets(applySwap);
    else setAssets(applySwap);
  };


  const handleSolicitar = (providerName: string) => {
    if (!user) {
      Alert.alert(
        t('home.createAccount'),
        t('home.createAccountMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('home.login'), onPress: () => router.push('/auth/login' as any) },
        ]
      );
      return;
    }
    // TODO: Navigate to service request flow
    Alert.alert(t('home.requestService'), t('home.requestServiceMsg', { name: providerName }));
  };

  const loadData = async (triggerSync = false) => {
    // Bens: apenas para usuários autenticados
    if (user) {
      const email = user.email || '';

      // Auto-sync: se banco local estiver vazio OU sync explícito solicitado
      const localAssets = getRootAssets(email);
      if (triggerSync || localAssets.length === 0) {
        try {
          await ApiService.sync(email);
        } catch (e) {
          console.warn('[Portfolio] Auto-sync falhou:', e);
        }
      }

      // Buscar ordens do prestador via agenda service
      try {
         const { AgendaService } = require('../../src/services/agendaService');
         const { pullTasks } = require('../../src/services/syncService');
         
         // Aguarda a tarefa de sincronizar antes de renderizar (timeout de 3s para não travar UI)
         await Promise.race([
            pullTasks(email),
            new Promise(resolve => setTimeout(resolve, 3000))
         ]).catch(e => console.warn('[loadData] pullTasks falhou (offline?):', e));
         
         const events = await AgendaService.getUnifiedAgenda(email);
         
         const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
         let executedTasksRaw = [];
         try { executedTasksRaw = JSON.parse(executedStr); } catch(e) {}
         if (!Array.isArray(executedTasksRaw)) executedTasksRaw = [];
         
         const executedMap: Record<string, any> = {};
         const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
         const now = Date.now();
         let updatedExecs = false;
         const validExecs = [];
         
         for (const ex of executedTasksRaw) {
             const item = typeof ex === 'string' ? { id: ex, completedAt: new Date().toISOString() } : ex;
             if (typeof ex === 'string') updatedExecs = true;
             
             const age = now - new Date(item.completedAt).getTime();
             if (age <= THIRTY_DAYS_MS) {
                 validExecs.push(item);
                 executedMap[String(item.id)] = item;
             } else {
                 updatedExecs = true;
             }
         }
         
         if (updatedExecs) {
             await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(validExecs));
         }
         
         const inprogStr = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
         let inprogressTasks = [];
         try { inprogressTasks = JSON.parse(inprogStr); } catch(e) {}
         if (!Array.isArray(inprogressTasks)) inprogressTasks = [];
         
         const accStr = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
         let acceptedTasks: string[] = [];
         try { acceptedTasks = JSON.parse(accStr); } catch(e) {}
         if (!Array.isArray(acceptedTasks)) acceptedTasks = [];
         
         const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
         let outboxTasks = [];
         try { outboxTasks = JSON.parse(outboxStr); } catch(e){}
         const pendingSyncIds = new Set(Array.isArray(outboxTasks) ? outboxTasks.map((o:any) => String(o.taskId)) : []);
         
         const allKeys = await AsyncStorage.getAllKeys();
         const cachedExecutionKeys = new Set(allKeys.filter(k => k.startsWith('@brspark_execution_')));
         
         // Inject executed tasks that disappeared from the backend (cloud purged) back into the dataset
         const existingIds = new Set(events.map((e:any) => String(e.id)));
         const combinedEvents = [...events];
         for (const key of Object.keys(executedMap)) {
             if (!existingIds.has(key)) {
                 const exData = executedMap[key];
                 combinedEvents.push({
                     id: key,
                     source: 'CHECKLIST',
                     category: 'TASK',
                     title: exData.title || `OS Fechada (ID: ${key.substring(0,6)})`,
                     description: exData.description || 'Esta Ordem de Serviço foi concluída e arquivada pelo servidor central.',
                     startDate: exData.completedAt,
                     endDate: exData.completedAt,
                     color: exData.color || '#10B981',
                     metadata: { icon: exData.icon || 'checkmark-done-circle' },
                     refId: exData.refId || key,
                 });
             }
         }
         
         const pt_filtered = combinedEvents.filter((e: any) => {
             if (e.source !== 'CHECKLIST' && e.category !== 'TASK') return false;
             return true; 
         }).filter((e: any) => {
             const isPurged = executedTasksRaw.find((raw:any) => (typeof raw === 'string' ? raw : raw.id) === String(e.id)) 
                              && !executedMap[String(e.id)];
             return !isPurged;
         });
         
         console.log('AGENDA EVENTS LOADED:', events.length, 'INJECTED:', combinedEvents.length - events.length, 'FILTERED:', pt_filtered.length);
         const mapped = pt_filtered.map((t: any) => {
            const dt = new Date(t.startDate || Date.now());
            const day = isNaN(dt.getDate()) ? '29' : dt.getDate().toString().padStart(2,'0');
            const month = isNaN(dt.getMonth()) ? '03' : (dt.getMonth() + 1).toString().padStart(2,'0');
            const year = isNaN(dt.getFullYear()) ? '2026' : dt.getFullYear();
            
            const isCompleted = !!executedMap[String(t.id)];
            
            return {
               ...t,
               id: String(t.id),
               title: `OS ${t.id} | ${t.title || 'Manutenção'}`,
               status: isCompleted ? 'COMPLETED' : 
                       inprogressTasks.includes(String(t.id)) ? 'IN_PROGRESS' : 'PENDING',
               isPendingSync: pendingSyncIds.has(String(t.id)),
               isCachedLocally: cachedExecutionKeys.has(`@brspark_execution_${t.id}`),
               service: t.title || 'Serviço Gên.',
               createdAt: t.startDate || new Date().toISOString(),
               dueDate: t.endDate || new Date(new Date().getTime() + 86400000).toISOString(),
               description: t.description || 'Nenhuma descrição detalhada foi fornecida para esta Ordem de Serviço.',
               color: isCompleted ? '#10B981' : 
                      (inprogressTasks.includes(String(t.id)) || acceptedTasks.includes(String(t.id))) ? '#F59E0B' : 
                      '#94A3B8',
               refId: t.refId,
               icon: t.metadata?.icon || t.icon || null,
               isAccepted: acceptedTasks.includes(String(t.id))
            };
         });
         // Default to NEWEST based on createdAt
         mapped.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
         setProviderTasks(mapped);
         setInprogressIds(new Set(inprogressTasks.map((id: string) => String(id))));
         setCompletedIds(new Set(Object.keys(executedMap)));
      } catch(e) {
         console.error('ERROR LOADING AGENDA:', e);
      }

      setAssets(getRootAssets(email));
      setAllAssets(getLocalAssets(email));
      const items = await StockService.getItems();
      setStockItems(items);

      try {
        const res = await apiFetch('/api/shares/pending');
        if (res.ok) {
          const data = await res.json();
          setPendingShares(data);
        }
      } catch (e) {
        setPendingShares([]);
      }
    } else {
      setAssets([]);
      setAllAssets([]);
      setStockItems([]);
      setPendingShares([]);
    }

    // Categorias de serviço: fixa por ora
    setCategories([
      { id: 'all',         label: t('home.serviceCategories.all'),        icon: 'apps' },
      { id: 'Elétrica',   label: 'Elétrica',    icon: 'flash' },
      { id: 'Hidráulica', label: 'Hidráulica',  icon: 'water' },
      { id: 'Limpeza',    label: 'Limpeza',     icon: 'brush-outline' },
      { id: 'Reformas',   label: 'Reformas',    icon: 'hammer' },
      { id: 'Segurança',  label: 'Segurança',   icon: 'shield-checkmark' },
      { id: 'Jardinagem', label: 'Jardinagem',  icon: 'leaf' },
      { id: 'Climatização', label: 'Climatização', icon: 'thermometer-outline' },
      { id: 'Tecnologia', label: 'Tecnologia',  icon: 'laptop-outline' },
    ]);

    // Prestadores: busca paginada via ProviderService (lida com cache offline automaticamente)
    const result = await ProviderService.search({ page: 1, limit: 20 });
    setProviders(result.data);
  };

  // Primeira montagem: sincroniza se banco estiver vazio
  const hasMountedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      loadData(true); // primeira visita: força sync
    } else {
      loadData(false); // voltas subsequentes: só lê cache local
    }
  }, [user]));

  // Sync scroll to global mode changes (from Header)
  React.useEffect(() => {
    let page = 0;
    if (userRole === 'TECHNICIAN') {
      page = mode === 'PROVIDER' ? 1 : 0;
    } else {
      page = mode === 'ASSETS' ? 1 : 0;
    }
    isInternalScroll.current = true;
    pagerRef.current?.scrollTo({ x: page * pagerWidth, animated: true });
    // Release lock after animation
    const timer = setTimeout(() => { isInternalScroll.current = false; }, 500);
    return () => clearTimeout(timer);
  }, [mode, pagerWidth, userRole]);

  // ── Auto-Sync Background Poller for Pending Offline Tasks ──
  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      if (!active || !user) return;
      try {
        // ALWAYS push sync queue so that pushTelemetryBatch() runs!
        await pushSyncQueue(user.email);
        await pullTasks(user.email);
        if (active) loadData(false);
      } catch(e) {
         console.log("[Auto-Poller] Falha silenciosa:", e);
      }
    }, 5000); // 5 segundos
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  const { refreshing, onRefresh } = useManualSync(() => loadData(true));

  const handleAcceptShare = async (assetId: string) => {
    try {
      await apiFetch(`/api/shares/${assetId}/accept`, { method: 'POST' });
      onRefresh(); // Trigger a full sync so the new asset is downloaded
    } catch(e) {
      Alert.alert('Erro', 'Não foi possível aceitar o convite.');
    }
  };

  const handleRejectShare = async (assetId: string) => {
    try {
      await apiFetch(`/api/shares/${assetId}/reject`, { method: 'POST' });
      loadData();
    } catch(e) {
      Alert.alert('Erro', 'Não foi possível recusar o convite.');
    }
  };

  const getAssetStockInfo = (assetId: string) => {
    const items = stockItems.filter(i => i.locationId === assetId);
    const hasLow = items.some(i => i.currentStock <= i.minStock);
    return { hasStock: items.length > 0, hasLowStock: hasLow };
  };

  const onPageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isInternalScroll.current) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / pagerWidth);
    
    let newMode = mode;
    if (userRole === 'TECHNICIAN') {
      newMode = page === 0 ? 'ASSETS' : 'PROVIDER';
    } else {
      newMode = page === 0 ? 'SERVICES' : 'ASSETS';
    }
    
    if (newMode !== mode) setMode(newMode as any);
  };

  // ─── Parse GPS coordinates from asset details ────────────────────────────
  const parseGPS = (gpsStr?: string): { latitude: number; longitude: number } | null => {
    if (!gpsStr) return null;
    const parts = gpsStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1] };
    }
    return null;
  };

  // ─── Render: Map View ────────────────────────────────────────────────────
  const renderMapContent = () => {
    const pool = activeFilter === 'GLOBAL' ? allAssets : assets;
    const visibleAssets = pool.filter(a =>
      activeFilter === 'ALL' || activeFilter === 'GLOBAL' || a.type === activeFilter
    );

    const mappable = visibleAssets
      .map(a => ({ asset: a, coords: parseGPS((a.details as any)?.gpsCoordinates) }))
      .filter(item => item.coords !== null) as { asset: Asset; coords: { latitude: number; longitude: number } }[];

    const unmapped = visibleAssets.filter(a => !parseGPS((a.details as any)?.gpsCoordinates));

    // Calculate initial region from markers or default to Brazil center
    const initialRegion = mappable.length > 0
      ? {
          latitude: mappable.reduce((s, m) => s + m.coords.latitude, 0) / mappable.length,
          longitude: mappable.reduce((s, m) => s + m.coords.longitude, 0) / mappable.length,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }
      : { latitude: -15.7801, longitude: -47.9292, latitudeDelta: 20, longitudeDelta: 20 };

    const TYPE_COLORS: Record<string, string> = {
      REAL_ESTATE: '#2563EB',
      TERRESTRIAL: '#D97706',
      AQUATIC: '#0891B2',
      SPECIAL: '#7C3AED',
      OTHER: '#64748B',
    };

    // Build a map of parentId -> children names (from all loaded assets)
    const childrenByParent: Record<string, string[]> = {};
    allAssets.forEach(a => {
      if (a.parentId) {
        if (!childrenByParent[a.parentId]) childrenByParent[a.parentId] = [];
        childrenByParent[a.parentId].push(a.title);
      }
    });

    return (
      <View style={{ flex: 1, minHeight: 500 }}>
        {mappable.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
            <Ionicons name="map-outline" size={52} color={C.textLight} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.textSecondary, marginTop: 16 }}>Nenhum bem tem localização GPS</Text>
            <Text style={{ fontSize: 12, color: C.textLight, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}>
              Adicione coordenadas ao cadastrar um bem para visualizá-lo no mapa.
            </Text>
          </View>
        ) : (
          <View style={{ position: 'relative' }}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={{ width: '100%', height: 520, borderRadius: 20 }}
              initialRegion={initialRegion}
              showsUserLocation
              showsMyLocationButton={false}
            >
              {mappable.map(({ asset, coords }) => {
                const childNames = childrenByParent[asset.id] || [];
                // Use the higher value between DB count and derived count from allAssets
                const childCount = Math.max(asset.childrenCount ?? 0, childNames.length);
                const hasChildren = childCount > 0;
                const markerColor = TYPE_COLORS[asset.type] || '#64748B';
                const typeIcon = asset.type === 'REAL_ESTATE' ? 'home'
                  : asset.type === 'TERRESTRIAL' ? 'car'
                  : asset.type === 'AQUATIC' ? 'boat'
                  : 'star';
                const labels: Record<string, string> = { REAL_ESTATE: 'Imóvel', TERRESTRIAL: 'Terrestre', AQUATIC: 'Aquático', SPECIAL: 'Especial', OTHER: 'Outro' };
                return (
                  <Marker
                    key={asset.id}
                    coordinate={coords}
                    onCalloutPress={() => router.push(`/asset/${asset.id}` as any)}
                  >
                    {/* Pin */}
                    <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: markerColor,
                        justifyContent: 'center', alignItems: 'center',
                        borderWidth: hasChildren ? 3 : 2.5,
                        borderColor: hasChildren ? '#FCD34D' : '#fff',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
                      }}>
                        <Ionicons name={typeIcon as any} size={16} color="#fff" />
                      </View>
                      {hasChildren && (
                        <View style={{
                          position: 'absolute', top: 0, right: 0,
                          minWidth: 18, height: 18, borderRadius: 9,
                          backgroundColor: '#F59E0B',
                          borderWidth: 1.5, borderColor: '#fff',
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: 3,
                          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.2, shadowRadius: 2, elevation: 3,
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff', lineHeight: 11 }}>
                            {childCount > 9 ? '9+' : childCount}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Custom Callout — always shows linked assets section */}
                    <Callout tooltip onPress={() => router.push(`/asset/${asset.id}` as any)}>
                      <View style={{
                        backgroundColor: '#fff', borderRadius: 14, padding: 14,
                        minWidth: 200, maxWidth: 250,
                        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15, shadowRadius: 10, elevation: 6,
                        borderWidth: 1, borderColor: '#E2E8F0',
                      }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <View style={{
                            width: 30, height: 30, borderRadius: 15,
                            backgroundColor: markerColor + '20',
                            justifyContent: 'center', alignItems: 'center', marginRight: 10,
                          }}>
                            <Ionicons name={typeIcon as any} size={15} color={markerColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }} numberOfLines={1}>{asset.title}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginTop: 1 }}>{labels[asset.type] || asset.type}</Text>
                          </View>
                        </View>

                        {/* Address */}
                        {asset.details?.address ? (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                            <Ionicons name="location-outline" size={12} color="#94A3B8" style={{ marginRight: 5, marginTop: 1 }} />
                            <Text style={{ fontSize: 11, color: '#64748B', flex: 1 }} numberOfLines={2}>{asset.details.address}</Text>
                          </View>
                        ) : null}

                        {/* Linked assets — only shown when there are children */}
                        {hasChildren && (
                        <View style={{
                          borderTopWidth: 1, borderTopColor: '#F1F5F9',
                          paddingTop: 8,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Ionicons name="link" size={12} color="#F59E0B" style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {childCount} bem{childCount > 1 ? 'ns' : ''} vinculado{childCount > 1 ? 's' : ''}
                            </Text>
                          </View>
                          {childNames.slice(0, 4).map((name, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#F59E0B', marginRight: 7 }} />
                              <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }} numberOfLines={1}>{name}</Text>
                            </View>
                          ))}
                          {childNames.length > 4 && (
                            <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginTop: 2 }}>+{childNames.length - 4} mais</Text>
                          )}
                        </View>
                        )}

                        {/* Tap hint */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F8FAFC' }}>
                          <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>Toque para abrir</Text>
                          <Ionicons name="chevron-forward" size={11} color="#94A3B8" style={{ marginLeft: 2 }} />
                        </View>
                      </View>
                    </Callout>
                  </Marker>
                );
              })}

            </MapView>

            {/* ── Legend overlay — bottom-left inside the map ── */}
            <View style={{
              position: 'absolute', bottom: TAB_BAR_HEIGHT + 16, left: 12,
              backgroundColor: 'rgba(255,255,255,0.96)',
              borderRadius: 16, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
              shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.14, shadowRadius: 8, elevation: 5,
              maxWidth: 210,
              // Never taller than the visible map area above the tab bar
              maxHeight: 520 - TAB_BAR_HEIGHT - 32,
            }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ paddingBottom: 6 }}
              >
              {(() => {
                const TYPE_LABELS: Record<string, string> = { REAL_ESTATE: 'Imóvel', TERRESTRIAL: 'Terrestre', AQUATIC: 'Aquático', SPECIAL: 'Especial', OTHER: 'Outro' };
                const showNames = mappable.length <= 6;

                return (
                  <>
                    {/* Section: No mapa */}
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                      📍 No mapa
                    </Text>

                    {showNames ? (
                      // Show individual asset names — tapping pans the map to that asset
                      mappable.map(({ asset, coords }) => {
                        const color = TYPE_COLORS[asset.type] || '#64748B';
                        const hasKids = (asset.childrenCount ?? 0) > 0 || (childrenByParent[asset.id] || []).length > 0;
                        return (
                          <TouchableOpacity
                            key={asset.id}
                            onPress={() => {
                              mapRef.current?.animateToRegion(
                                { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                                600
                              );
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}
                          >
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8, borderWidth: hasKids ? 2 : 0, borderColor: '#FCD34D' }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                              {asset.title}
                            </Text>
                            {hasKids && (
                              <Text style={{ fontSize: 9, color: '#F59E0B', fontWeight: '800', marginLeft: 4 }}>
                                +{Math.max(asset.childrenCount ?? 0, (childrenByParent[asset.id] || []).length)}
                              </Text>
                            )}
                            <Ionicons name="locate" size={10} color="#CBD5E1" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      // Fallback to category counts when many assets
                      Object.entries(TYPE_COLORS).map(([type, color]) => {
                        const count = mappable.filter(m => m.asset.type === type).length;
                        if (count === 0) return null;
                        return (
                          <View key={type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8 }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B' }}>
                              {TYPE_LABELS[type]} <Text style={{ color: '#94A3B8' }}>({count})</Text>
                            </Text>
                          </View>
                        );
                      })
                    )}

                    {/* Section: Sem localização */}
                    {unmapped.length > 0 && (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 3 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                          Sem localização
                        </Text>
                        {unmapped.slice(0, 5).map(a => (
                          <TouchableOpacity
                            key={a.id}
                            onPress={() => router.push(`/asset/${a.id}` as any)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}
                          >
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#CBD5E1', marginRight: 8 }} />
                            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500', flex: 1 }} numberOfLines={1}>{a.title}</Text>
                            <Ionicons name="chevron-forward" size={10} color="#CBD5E1" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        ))}
                        {unmapped.length > 5 && (
                          <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>+{unmapped.length - 5} sem localização</Text>
                        )}
                      </View>
                    )}
                  </>
                );
              })()}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    );
  };


  // ─── Render: Assets Dashboard ──────────────────────────────────────────
  const renderAssetContent = () => {
    const pool = activeFilter === 'GLOBAL' ? allAssets : assets;
    let visibleAssets = pool.filter(a => activeFilter === 'ALL' || activeFilter === 'GLOBAL' || a.type === activeFilter);
    visibleAssets = visibleAssets.sort((a, b) => {
      if (assetSortMode === 'MANUAL') return (a.displayOrder || 0) - (b.displayOrder || 0);
      if (assetSortMode === 'A_Z') return a.title.localeCompare(b.title);
      if (assetSortMode === 'Z_A') return b.title.localeCompare(a.title);
      if (assetSortMode === 'STATUS_UP') {
        const sa = a.statusType === 'success' ? 1 : 0;
        const sb = b.statusType === 'success' ? 1 : 0;
        if (sa !== sb) return sb - sa;
        return a.title.localeCompare(b.title);
      }
      if (assetSortMode === 'STATUS_DOWN') {
        const sa = a.statusType === 'success' ? 1 : 0;
        const sb = b.statusType === 'success' ? 1 : 0;
        if (sa !== sb) return sa - sb;
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    const myAssets = visibleAssets.filter(a => !a.details?._isShared);
    const sharedAssets = visibleAssets.filter(a => a.details?._isShared);

    const renderAssetList = (assetList: Asset[], title?: string, listKey?: 'MY' | 'SHARED') => {
      if (assetList.length === 0 && !title?.includes('Compartilhados')) return null;
      if (assetList.length === 0 && title?.includes('Compartilhados') && pendingShares.length === 0) return null;
      const isThisListReordering = reorderingList === listKey;
      const isGlobal = activeFilter === 'GLOBAL';
      return (
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          {title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>
              {!isThisListReordering && (
                <Text style={{ fontSize: 10, color: colors.textLight, fontWeight: '600' }}>Segure para reordenar</Text>
              )}
            </View>
          )}
          {!title && !isThisListReordering && assetList.length > 1 && (
            <Text style={{ fontSize: 10, color: colors.textLight, fontWeight: '600', textAlign: 'right', marginBottom: 8, marginTop: -4 }}>Segure um card para reordenar</Text>
          )}
          {assetList.map((asset, idx) => {
              const stockInfo = getAssetStockInfo(asset.id);
              return (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onPress={() => { if (!isThisListReordering) router.push(`/asset/${asset.id}` as any); }}
                  onLongPress={assetSortMode === 'MANUAL' && listKey ? () => setReorderingList(isThisListReordering ? null : listKey) : undefined}
                  hasStock={stockInfo.hasStock}
                  hasLowStock={stockInfo.hasLowStock}
                  forceExpand={allExpanded}
                  isReordering={isThisListReordering}
                  onMoveUp={isThisListReordering ? () => moveAsset(idx, 'UP', assetList, isGlobal) : undefined}
                  onMoveDown={isThisListReordering ? () => moveAsset(idx, 'DOWN', assetList, isGlobal) : undefined}
                />
              );
            })}
        </View>
      );
    };

    return (
      <View>
        {pendingShares.length > 0 && (
          <View style={{ padding: 16, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 16, marginHorizontal: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Ionicons name="mail-unread" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E3A8A' }}>Você tem {pendingShares.length} convite(s) pendente(s)</Text>
                <Text style={{ fontSize: 12, color: '#3B82F6', marginTop: 2 }}>Alguém quer compartilhar um ativo com você.</Text>
              </View>
            </View>
            {pendingShares.map(ps => (
              <View key={ps.id} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                 <View style={{ flex: 1 }}>
                   <Text style={{ fontSize: 13, fontWeight: '800', color: colors.slate, marginBottom: 2 }}>{ps.asset?.title || 'Bem Compartilhado'}</Text>
                   <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600' }}>DE: {ps.ownerEmail}</Text>
                   <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '800', marginTop: 2 }}>{ps.permission === 'WRITE' ? 'Pode Editar' : 'Somente Leitura'}</Text>
                 </View>
                 <View style={{ flexDirection: 'row', gap: 8 }}>
                   <TouchableOpacity onPress={() => handleRejectShare(ps.assetId)} style={{ padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8 }}>
                     <Ionicons name="close" size={18} color="#EF4444" />
                   </TouchableOpacity>
                   <TouchableOpacity onPress={() => handleAcceptShare(ps.assetId)} style={{ padding: 8, backgroundColor: '#ECFDF5', borderRadius: 8 }}>
                     <Ionicons name="checkmark" size={18} color="#10B981" />
                   </TouchableOpacity>
                 </View>
              </View>
            ))}
          </View>
        )}
        {renderAssetList(myAssets, sharedAssets.length > 0 || pendingShares.length > 0 ? 'Meus Bens' : undefined, 'MY')}
        {renderAssetList(sharedAssets, 'Compartilhados comigo', 'SHARED')}
        {/* Floating Done button when reordering */}
        {reorderingList && (
          <TouchableOpacity
            onPress={() => setReorderingList(null)}
            style={{
              position: 'absolute', bottom: 16, alignSelf: 'center',
              backgroundColor: '#10B981', borderRadius: 24,
              paddingHorizontal: 28, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
              left: '25%',
            }}
          >
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>Concluir Ordenação</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>

      {/* Horizontal Pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageScroll}
        onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}
        scrollEventThrottle={16}
        scrollEnabled={true}
        style={{ flex: 1 }}
      >
        {/* ═══════ PAGE 1: Catálogo de Serviços ═══════ */}
        {userRole === 'CLIENT' && (
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium UI Header (Services Only) */}
          <LinearGradient 
            colors={['#8B4100', '#F97316']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.premiumHeader}
          >
            <View style={styles.premiumHeaderRow}>
              <Text style={styles.premiumHeaderText}>{t('home.searchTitle')}</Text>
            </View>

            {/* Circular Categories (Scrollable) */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.circularCatScroll}
             keyboardShouldPersistTaps="handled">
              {SERVICE_CATEGORIES.map((cat: any) => (
                <TouchableOpacity key={cat.id} style={styles.circularCatItem} onPress={() => setSvcFilter(cat.id)}>
                  <View style={[styles.circularCatIconWrap, svcFilter === cat.id && styles.circularCatActive]}>
                    {cat.isMCI
                      ? <MaterialCommunityIcons name={cat.icon as any} size={24} color="#fff" />
                      : <Ionicons name={cat.icon as any} size={24} color="#fff" />}
                  </View>
                  <Text style={styles.circularCatLabel} numberOfLines={1}>{t(`home.serviceCategories.${cat.labelKey}`)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </LinearGradient>

          {/* Search Bar (Floating style) */}
          <View style={styles.searchWrapPremium}>
            <Ionicons name="search" size={18} color={colors.textLight} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={colors.textLight}
              value={searchText}
              onChangeText={(t) => setSearchText(t)}
            returnKeyType="done"
                      />
          </View>

          {/* Filter & Sort Chips (iFood Inspired) */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
           keyboardShouldPersistTaps="handled">
            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode !== 'DEFAULT' && styles.ifoodChipActive]}
              onPress={() => setSortModalVisible(true)}
            >
              <Ionicons name="options-outline" size={16} color={sortMode !== 'DEFAULT' ? colors.accent : colors.textSecondary} />
              <Text style={[styles.ifoodChipText, sortMode !== 'DEFAULT' && { color: colors.accent, fontWeight: '800' }]}>
                {sortMode === 'DEFAULT' ? 'Ordenar' : t(`home.sort.${sortMode.toLowerCase()}`)}
              </Text>
              <Ionicons name="chevron-down" size={14} color={sortMode !== 'DEFAULT' ? colors.accent : colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode === 'VERIFIED' && styles.ifoodChipActive]}
              onPress={() => setSortMode(sortMode === 'VERIFIED' ? 'DEFAULT' : 'VERIFIED')}
            >
              <Text style={[styles.ifoodChipText, sortMode === 'VERIFIED' && { color: colors.accent, fontWeight: '800' }]}>
                {t('home.verifiedProviders') || 'Verificados'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode === 'AGENDA' && styles.ifoodChipActive]}
              onPress={() => setSortMode(sortMode === 'AGENDA' ? 'DEFAULT' : 'AGENDA')}
            >
              <Text style={[styles.ifoodChipText, sortMode === 'AGENDA' && { color: colors.accent, fontWeight: '800' }]}>
                {t('home.availableNow') || 'Agenda'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode === 'RATING' && styles.ifoodChipActive]}
              onPress={() => setSortMode(sortMode === 'RATING' ? 'DEFAULT' : 'RATING')}
            >
              <Text style={[styles.ifoodChipText, sortMode === 'RATING' && { color: colors.accent, fontWeight: '800' }]}>
                {t('home.topRated') || 'Melhor Avaliados'}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Provider List */}
          <View style={{ paddingHorizontal: 16 }}>
            {(svcFilter !== 'all' || searchText.length > 0) && (
              <Text style={styles.resultsLabel}>
                {searchText ? t('home.resultsFor', { query: searchText }) : (svcFilter !== 'all' ? t(`home.serviceCategories.${svcFilter}`) : '')}
              </Text>
            )}

            {svcFilter === 'all' && !searchText && (
              <Text style={styles.sectionLabel}>{t('home.featuredProviders')}</Text>
            )}

            {providers
              .filter(p => svcFilter === 'all' ? true : p.category === svcFilter)
              .filter(p => smartMatch(p, searchText))
              .sort((a, b) => {
                if (sortMode === 'RATING') return b.rating - a.rating;
                if (sortMode === 'VERIFIED') return (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
                // Simple alphabetic for others in this mock
                if (sortMode === 'DEFAULT') return 0;
                return a.id.localeCompare(b.id);
              })
              .map(provider => {
                const isExpanded = expandedProviders.has(provider.id);
                return (
                  <View key={provider.id} style={styles.providerCard}>
                    <TouchableOpacity 
                      activeOpacity={0.8}
                      onPress={() => toggleExpand(provider.id)}
                      style={{ flexDirection: 'row', alignItems: 'flex-start' }}
                    >
                      <Image source={{ uri: provider.photo }} style={styles.providerPhoto} />
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingRight: 8 }}>
                            <Text style={[styles.providerName, { flexShrink: 1 }]} numberOfLines={2}>{provider.name}</Text>
                          </View>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textLight} style={{ marginTop: 2 }} />
                        </View>
                        
                        <View style={[styles.providerSubRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                            <Ionicons name="star" size={11} color="#F59E0B" />
                            <Text style={[styles.providerRating, { fontSize: 11 }]}>{provider.rating}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8' }}>({provider.reviews || 0})</Text>
                          </View>
                          <View style={[styles.promoBadge, { 
                            backgroundColor: colors.accent + '10', 
                            borderColor: colors.accent + '30', 
                            borderWidth: 0.5,
                            marginVertical: 2,
                            flexShrink: 1
                          }]}>
                            <Ionicons name="calendar-outline" size={10} color={colors.accent} style={{ marginRight: 3 }} />
                            <Text style={[styles.promoBadgeText, { color: colors.accent, fontSize: 8.5, fontWeight: '800' }]} numberOfLines={1}>
                              {provider.category?.toUpperCase() || 'SERVIÇO'}
                            </Text>
                          </View>
                        </View>

                        {isExpanded && (
                          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 }}>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>{t('assetDetail.generalInfo') || 'Informações da Empresa'}</Text>
                            <View style={styles.providerTagsRow}>
                                <View style={styles.providerHighlightPill}>
                                  <Text style={styles.providerHighlightText}>{typeof provider.tags === 'string' ? provider.tags.split(',').slice(0,2).join(' · ') : ''}</Text>
                                </View>
                            </View>
                            <Text style={{ fontSize: 11, color: colors.textLight, marginTop: 10 }}>{t('home.providerDescription') || 'Especialista em reparos e manutenções preventivas com garantia de 90 dias.'}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                      <TouchableOpacity 
                        style={{ backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => handleSolicitar(provider.name)}
                      >
                         <Text style={{ color: '#fff', fontWeight: '900', fontSize: 9.5, textTransform: 'uppercase' }}>{t('home.requestBtn') || 'Solicitar'}</Text>
                         <Ionicons name="arrow-forward" size={10} color="#fff" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

            {providers.filter(p => svcFilter === 'all' ? p.verified : p.category === svcFilter).filter(p => smartMatch(p, searchText)).length === 0 && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="search-outline" size={44} color={colors.textLight} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: 12 }}>{t('home.noProviders')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
        )}

        {/* ═══════ PAGE 2: Dashboard de Ativos ═══════ */}
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: C.primary }]}>{t('home.activePortfolio')}</Text>
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>

              {/* Cards view */}
              <TouchableOpacity
                style={[styles.selectorBtnActive, {
                  paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: portfolioViewMode === 'LIST' ? C.primary + '15' : C.cardWhite,
                  borderWidth: portfolioViewMode === 'LIST' ? 1 : 0,
                  borderColor: portfolioViewMode === 'LIST' ? C.primary + '40' : 'transparent',
                }]}
                onPress={() => setPortfolioViewMode('LIST')}
              >
                <Ionicons
                  name={portfolioViewMode === 'LIST' ? 'grid' : 'grid-outline'}
                  size={20}
                  color={portfolioViewMode === 'LIST' ? C.primary : C.textLight}
                />
              </TouchableOpacity>

              {/* Expand/collapse — when in MAP, switches to LIST expanded */}
              <TouchableOpacity
                style={[styles.selectorBtnActive, { backgroundColor: C.cardWhite, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10 }]}
                onPress={() => {
                  if (portfolioViewMode === 'MAP') {
                    setPortfolioViewMode('LIST');
                    setAllExpanded(true);
                  } else {
                    setAllExpanded(prev => !prev);
                  }
                }}
              >
                <Ionicons name="git-branch-outline" size={20} color={allExpanded && portfolioViewMode === 'LIST' ? C.primary : C.textLight} />
              </TouchableOpacity>

              {/* Map view — last before + */}
              <TouchableOpacity
                style={[styles.selectorBtnActive, {
                  paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: portfolioViewMode === 'MAP' ? '#EFF6FF' : C.cardWhite,
                  borderWidth: portfolioViewMode === 'MAP' ? 1 : 0,
                  borderColor: portfolioViewMode === 'MAP' ? '#3B82F6' : 'transparent',
                }]}
                onPress={() => setPortfolioViewMode('MAP')}
              >
                <Ionicons
                  name={portfolioViewMode === 'MAP' ? 'map' : 'map-outline'}
                  size={20}
                  color={portfolioViewMode === 'MAP' ? '#3B82F6' : C.textLight}
                />
              </TouchableOpacity>

              {/* Add new */}
              <TouchableOpacity
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                onPress={() => router.push('/asset/new')}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>


          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={{marginBottom: 16}} keyboardShouldPersistTaps="handled">
             {[
                { id: 'ALL',         label: 'Geral' },
                { id: 'REAL_ESTATE', label: t('home.assetTypes.realEstate') },
                { id: 'TERRESTRIAL', label: t('home.assetTypes.terrestrial') },
                { id: 'AQUATIC',     label: t('home.assetTypes.aquatic') },
                { id: 'SPECIAL',     label: t('home.assetTypes.special') },
                { id: 'GLOBAL',      label: 'Todos' },
             ].map(f => (
               <TouchableOpacity key={f.id} style={[styles.filterChip, { backgroundColor: C.divider, borderColor: C.border }, activeFilter === f.id && styles.filterChipActive]} onPress={() => setActiveFilter(f.id)}><Text style={[styles.filterChipText, { color: C.textSecondary }, activeFilter === f.id && styles.filterChipTextActive]}>{f.label}</Text></TouchableOpacity>
             ))}
          </ScrollView>
          {portfolioViewMode === 'MAP' ? renderMapContent() : renderAssetContent()}
        </ScrollView>

        {/* ═══════ PAGE 3: Dashboard do Prestador ═══════ */}
        {userRole === 'TECHNICIAN' && (
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          {/* Sticky Tab Header Wrapper */}
          <View style={{ backgroundColor: C.background, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', zIndex: 10 }}>
            {/* Provider Top Tabs */}
            <View style={{ flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#F1F5F9', borderRadius: 14, padding: 4 }}>
              {[
                { id: 'PENDING', label: 'Pendentes', color: '#D97706' },
                { id: 'IN_PROGRESS', label: 'Em andamento', color: '#3B82F6' },
                { id: 'COMPLETED', label: 'Concluídas', color: '#10B981' }
              ].map(tab => {
              const isActive = providerTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setProviderTab(tab.id as any)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                    backgroundColor: isActive ? '#fff' : 'transparent',
                    shadowColor: isActive ? '#000' : 'transparent', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isActive ? 0.1 : 0, shadowRadius: 4, elevation: isActive ? 2 : 0
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: isActive ? '900' : '700', color: isActive ? tab.color : '#64748B' }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </View>
          </View>

          {/* Provider Search & Filters */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 }}>
               <Ionicons name="search" size={20} color="#94A3B8" style={{ marginRight: 12 }} />
               <TextInput 
                 style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#1E293B', padding: 0 }} 
                 placeholder="Buscar OS..." 
                 placeholderTextColor="#94A3B8"
                 value={providerSearch}
                 onChangeText={setProviderSearch}
                 returnKeyType="search"
               />
               {providerSearch.length > 0 && (
                 <TouchableOpacity onPress={() => setProviderSearch('')}>
                   <Ionicons name="close-circle" size={20} color="#CBD5E1" />
                 </TouchableOpacity>
               )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 4 }}>
               <TouchableOpacity 
                  onPress={() => setProviderSortMode('NEWEST')}
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, backgroundColor: providerSortMode === 'NEWEST' ? '#FEF3C7' : 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
               >
                  <Ionicons name={providerSortMode === 'NEWEST' ? "time" : "time-outline"} size={16} color={providerSortMode === 'NEWEST' ? '#D97706' : '#94A3B8'} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: providerSortMode === 'NEWEST' ? '900' : '700', color: providerSortMode === 'NEWEST' ? '#D97706' : '#64748B', textTransform: 'uppercase' }}>Mais Novas</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                  onPress={() => setProviderSortMode('OLDEST')}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: providerSortMode === 'OLDEST' ? '#FEF3C7' : 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
               >
                  <Ionicons name={providerSortMode === 'OLDEST' ? "calendar" : "calendar-outline"} size={16} color={providerSortMode === 'OLDEST' ? '#D97706' : '#94A3B8'} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: providerSortMode === 'OLDEST' ? '900' : '700', color: providerSortMode === 'OLDEST' ? '#D97706' : '#64748B', textTransform: 'uppercase' }}>Mais Antigas</Text>
               </TouchableOpacity>
            </View>
          </View>

          {/* Provider Content Placeholder / List */}
          {providerTasks.filter(t => {
            let s = completedIds.has(String(t.id)) ? 'COMPLETED' : inprogressIds.has(String(t.id)) ? 'IN_PROGRESS' : (t.status || 'PENDING');
            if (s === 'RECEIVED') s = 'PENDING';
            return s === providerTab;
          }).length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="construct" size={40} color="#D97706" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 }}>
              {providerTab === 'PENDING' ? 'Nenhuma Ordem Pendente' : providerTab === 'IN_PROGRESS' ? 'Nenhuma Em Andamento' : 'Nenhuma Concluída'}
            </Text>
            <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 }}>
              A lista de serviços aparecerá aqui logo que houver despachos do painel central.
            </Text>
            
            <TouchableOpacity onPress={() => loadData(true)} style={{ marginTop: 32, backgroundColor: '#D97706', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, shadowColor: '#D97706', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Atualizar Fila</Text>
            </TouchableOpacity>
          </View>
          ) : (
            <View style={{ padding: 16 }}>
              {providerTasks
                .filter(t => {
                  let s = completedIds.has(String(t.id)) ? 'COMPLETED' : inprogressIds.has(String(t.id)) ? 'IN_PROGRESS' : (t.status || 'PENDING');
                  if (s === 'RECEIVED') s = 'PENDING';
                  return s === providerTab;
                })
                .filter(t => providerSearch === '' || t.id.toLowerCase().includes(providerSearch.toLowerCase()) || (t.service && t.service.toLowerCase().includes(providerSearch.toLowerCase())))
                .sort((a,b) => {
                   const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                   const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                   if (isNaN(tA) || isNaN(tB)) return 0;
                   return providerSortMode === 'NEWEST' ? tB - tA : tA - tB;
                })
                .map(order => (
                <View
                  key={order.id}
                  style={{
                    borderRadius: 16, marginBottom: 12, overflow: 'hidden',
                    shadowColor: order.color, shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
                  }}
                >
                  {/* Gradient background wash from status color */}
                  <LinearGradient
                    colors={[`${order.color}22`, `${order.color}08`, '#FFFFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ borderRadius: 16, borderWidth: 1, borderColor: `${order.color}30` }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedTask(order);
                        setTaskModalVisible(true);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'stretch' }}
                    >
                      {/* Wide left accent bar */}
                      <View style={{
                        width: 6, borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
                        backgroundColor: order.color,
                      }} />

                      {/* Icon area with status tint */}
                      <View style={{
                        width: 64, justifyContent: 'center', alignItems: 'center',
                        paddingVertical: 16, paddingLeft: 10,
                      }}>
                        <View style={{
                          width: 48, height: 48, borderRadius: 12,
                          backgroundColor: `${order.color}20`,
                          borderWidth: 1.5, borderColor: `${order.color}40`,
                          justifyContent: 'center', alignItems: 'center',
                        }}>
                          <Ionicons
                            name={(order.icon as any) || 'construct-outline'}
                            size={24}
                            color={order.color}
                          />
                        </View>
                      </View>

                      {/* Right Content */}
                      <View style={{ flex: 1, paddingVertical: 14, paddingRight: 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: order.color, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                              OS {order.id.split('_').pop()?.substring(0, 12) || order.id.substring(0, 12)}
                            </Text>
                            {(order as any).etaMinutes !== undefined && (order as any).etaMinutes !== null && (
                               <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center' }}>
                                  <Ionicons name="location" size={10} color="#166534" style={{ marginRight: 2 }} />
                                  <Text style={{ fontSize: 9, color: '#166534', fontWeight: '900' }}>ETA: {(order as any).etaMinutes} min</Text>
                               </View>
                            )}
                          </View>
                          {order.status === 'COMPLETED' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                               {order.isCachedLocally && !order.isPendingSync && (
                                   <Ionicons name="arrow-down" size={14} color="#10B981" style={{ marginRight: 2, marginTop: 2, fontWeight: '900' }} />
                               )}
                               <Ionicons
                                 name={order.isPendingSync ? 'cloud-offline' : 'cloud-done'}
                                 size={22}
                                 color={order.isPendingSync ? '#F59E0B' : '#10B981'}
                               />
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 15, color: '#0F172A', fontWeight: '900', marginBottom: 8, lineHeight: 20 }} numberOfLines={2}>
                          {order.service}
                        </Text>
                        <View style={{ gap: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={12} color="#94A3B8" style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Criado: {new Date(order.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="calendar-outline" size={12} color="#EF4444" style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '800' }}>Vence: {new Date(order.dueDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                          </View>
                        </View>

                        {/* Footer dropdown */}
                        <TouchableOpacity
                          style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: `${order.color}20`, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => setActiveCardDropdown(activeCardDropdown === order.id ? null : order.id)}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {activeCardDropdown === order.id ? 'Esconder' : 'Mais Opções'}
                          </Text>
                          <Ionicons name={activeCardDropdown === order.id ? 'chevron-up' : 'chevron-down'} size={12} color="#94A3B8" style={{ marginLeft: 3 }} />
                        </TouchableOpacity>

                        {activeCardDropdown === order.id && (
                          <View style={{ marginTop: 8, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic', textAlign: 'center' }}>
                              Painel reservado para submenus, materiais e instruções.
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        )}
      </ScrollView>



      {/* ─── Asset Smart Sort Bottom Sheet ─── */}
      <Modal
        visible={assetSortSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssetSortSheetVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setAssetSortSheetVisible(false)} />
          <View style={[styles.sortSheet, { backgroundColor: C.cardWhite }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.primary }]}>Ordenar Portfolio</Text>
            <View style={styles.sortGrid}>
              {[
                { id: 'MANUAL',      label: 'Padrão',           icon: 'layers-outline',      color: '#64748B',
                  desc: 'Ordem de cadastro' },
                { id: 'A_Z',         label: 'A → Z',            icon: 'text-outline',         color: '#3B82F6',
                  desc: 'Ordem alfabética' },
                { id: 'Z_A',         label: 'Z → A',            icon: 'text-outline',         color: '#6366F1',
                  desc: 'Ordem reversa' },
                { id: 'STATUS_DOWN', label: 'Alertas Primeiro', icon: 'warning-outline',      color: '#F59E0B',
                  desc: 'Atenção no topo' },
                { id: 'STATUS_UP',   label: 'OK Primeiro',      icon: 'checkmark-circle-outline', color: '#10B981',
                  desc: 'Saudáveis no topo' },
              ].map(item => {
                const isActive = assetSortMode === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.sortItem, isActive && { opacity: 1 }]}
                    onPress={() => { setAssetSortMode(item.id as any); setAssetSortSheetVisible(false); }}
                  >
                    <View style={[styles.sortIconCircle, isActive && { borderColor: item.color, borderWidth: 2, backgroundColor: item.color + '12' }]}>
                      <Ionicons name={item.icon as any} size={26} color={isActive ? item.color : '#94A3B8'} />
                    </View>
                    <Text style={[styles.sortItemLabel, isActive && { color: item.color, fontWeight: '800' }]}>{item.label}</Text>
                    <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '600', textAlign: 'center', marginTop: 2 }}>{item.desc}</Text>
                    {isActive && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color, marginTop: 4 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Sorting Modal (iFood Bottom Sheet style) ─── */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setSortModalVisible(false)} />
          <View style={[styles.sortSheet, { backgroundColor: C.cardWhite }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.primary }]}>Ordenação por</Text>
            
            <View style={styles.sortGrid}>
              {[
                { id: 'DEFAULT',  label: 'Filtro Padrão', icon: 'swap-vertical', color: '#D97706' },
                { id: 'RATING',   label: 'Avaliação',     icon: 'star',          color: '#F59E0B' },
                { id: 'AGENDA',   label: 'Próxima Agenda',  icon: 'calendar',      color: colors.accent },
                { id: 'VERIFIED', label: 'Verificados',   icon: 'checkmark-circle',color: '#3B82F6' },
                { id: 'DISTANCE', label: 'Proximidade',   icon: 'location',      color: '#059669' },
                { id: 'PRICE',    label: 'Custo Benefício', icon: 'cash',          color: '#10B981' },
              ].map(item => (
                <TouchableOpacity 
                  key={item.id} 
                  style={styles.sortItem} 
                  onPress={() => { setSortMode(item.id as any); setSortModalVisible(false); }}
                >
                  <View style={[styles.sortIconCircle, sortMode === item.id && { borderColor: colors.accent, borderWidth: 2 }]}>
                    <Ionicons name={item.icon as any} size={28} color={sortMode === item.id ? colors.accent : '#64748b'} />
                  </View>
                  <Text style={[styles.sortItemLabel, sortMode === item.id && { color: colors.accent, fontWeight: '800' }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Task Details Modal (Bottom Sheet variant) ─── */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setTaskModalVisible(false)} />
          <View style={[styles.sortSheet, { backgroundColor: C.cardWhite, paddingHorizontal: 24, paddingBottom: 48, maxHeight: Dimensions.get('window').height * 0.85 }]}>
            <View style={styles.sheetHandle} />
            
            {selectedTask && (
               <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                     {selectedTask.icon ? (
                       <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#FFF7ED', borderWidth: 2, borderColor: '#FED7AA', justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#EA580C', shadowOffset: {width:0, height:6}, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 }}>
                           {selectedTask.icon.startsWith('http') ? (
                               <Image source={{uri: selectedTask.icon}} style={{width: 32, height: 32}} resizeMode="contain" />
                           ) : (
                               <Ionicons name={selectedTask.icon as any} size={32} color="#EA580C" />
                           )}
                       </View>
                     ) : null}
                     <Text style={{ fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                       OS {String(selectedTask.id).split('_').pop() || selectedTask.id}
                     </Text>
                     <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', textAlign: 'center', lineHeight: 28, marginBottom: 20 }}>
                       {selectedTask.service}
                     </Text>
                  </View>

                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9' }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Cronograma</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Ionicons name="time" size={18} color="#94A3B8" style={{ marginRight: 12 }} />
                        <View>
                           <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Criado em</Text>
                           <Text style={{ fontSize: 14, color: '#334155', fontWeight: '800' }}>{new Date(selectedTask.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginRight: 12 }} />
                        <View>
                           <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800', textTransform: 'uppercase' }}>Vencimento Limite</Text>
                           <Text style={{ fontSize: 14, color: '#EF4444', fontWeight: '900' }}>{new Date(selectedTask.dueDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                        </View>
                      </View>
                  </View>

                  <View style={{ marginBottom: 32 }}>
                     <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Descrição</Text>
                     <Text style={{ fontSize: 15, color: '#334155', lineHeight: 24 }}>{selectedTask.description}</Text>
                  </View>

                  {(selectedTask.status === 'PENDING' || selectedTask.status === 'RECEIVED') && !selectedTask.isAccepted && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                     <TouchableOpacity 
                        onPress={() => {
                           setTaskModalVisible(false);
                           Alert.alert('Rejeitada', 'Esta atividade foi movida para o fim da fila.');
                        }}
                        style={{ flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FDE8E8' }}>
                         <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 15 }}>Rejeitar</Text>
                     </TouchableOpacity>

                     <TouchableOpacity 
                        onPress={async () => {
                           if (!selectedTask.refId) {
                               Alert.alert("Erro", "Formulário ausente na OS.");
                               return;
                           }
                           
                           // Move para "Aceita" salvando localmente
                           const accStr = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
                           let acceptedLocal: string[] = [];
                           try { acceptedLocal = JSON.parse(accStr); } catch(e) {}
                           if (!Array.isArray(acceptedLocal)) acceptedLocal = [];
                           
                           if (!acceptedLocal.includes(String(selectedTask.id))) {
                               acceptedLocal.push(String(selectedTask.id));
                               await AsyncStorage.setItem('@brspark_accepted_tasks', JSON.stringify(acceptedLocal));
                           }
                           
                           // Atualiza a view (mantém a OS no Pending, mas seta estado para aceito)
                           setSelectedTask((prev: any) => ({ ...prev, isAccepted: true }));
                           loadData(false);
                           
                           Alert.alert(
                               "OS Aceita!", 
                               "Excelente! Deseja iniciar a execução da atividade agora mesmo?",
                               [
                                   {
                                      text: "Agora Não",
                                      style: "cancel",
                                      onPress: () => {
                                          setTaskModalVisible(false);
                                      }
                                   },
                                   {
                                      text: "Sim, Iniciar Agora",
                                      style: "default",
                                      onPress: async () => {
                                          // Mesma lógica de Iniciar
                                          const _ip = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
                                          let _ipArr: string[] = [];
                                          try { _ipArr = JSON.parse(_ip); } catch(e) {}
                                          if (!Array.isArray(_ipArr)) _ipArr = [];
                                          if (!_ipArr.includes(String(selectedTask.id))) {
                                             _ipArr.push(String(selectedTask.id));
                                             await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(_ipArr));
                                          }
                                          setInprogressIds(prev => { const s = new Set(prev); s.add(String(selectedTask.id)); return s; });
                                          setTaskModalVisible(false);
                                          router.push({ pathname: '/checklist/[id]', params: { id: selectedTask.refId, taskId: selectedTask.id } } as any);
                                      }
                                   }
                               ]
                           );
                        }}
                        style={{ flex: 2, backgroundColor: '#059669', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#059669', shadowOffset: {width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation: 4 }}>
                         <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Aceitar Ordem</Text>
                     </TouchableOpacity>
                  </View>
                  )}

                  {(selectedTask.status === 'PENDING' || selectedTask.status === 'RECEIVED') && selectedTask.isAccepted && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                     <TouchableOpacity 
                        onPress={async () => {
                           if (!selectedTask.refId || selectedTask.refId === 'null') {
                               Alert.alert("Erro", "Formulário não associado a esta Atividade.");
                               return;
                           }
                           // Marca IN_PROGRESS imediatamente ao clicar em Iniciar
                           const _ip = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
                           let _ipArr: string[] = [];
                           try { _ipArr = JSON.parse(_ip); } catch(e) {}
                           if (!Array.isArray(_ipArr)) _ipArr = [];
                           if (!_ipArr.includes(String(selectedTask.id))) {
                              _ipArr.push(String(selectedTask.id));
                              await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(_ipArr));
                           }
                           // Update reactive state immediately so tab filter works without reload
                           setInprogressIds(prev => { const s = new Set(prev); s.add(String(selectedTask.id)); return s; });
                           setTaskModalVisible(false);
                           router.push({ pathname: '/checklist/[id]', params: { id: selectedTask.refId, taskId: selectedTask.id } } as any);
                        }}
                        style={{ flex: 1, backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#F59E0B', shadowOffset: {width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation: 4 }}>
                         <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Iniciar Ordem (Em Campo)</Text>
                     </TouchableOpacity>
                  </View>
                  )}

                  {selectedTask.status === 'IN_PROGRESS' && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                     <TouchableOpacity 
                        onPress={() => {
                           if (!selectedTask.refId || selectedTask.refId === 'null') {
                               Alert.alert("Erro", "Formulário não associado a esta Atividade.");
                               return;
                           }
                           setTaskModalVisible(false);
                           router.push({ pathname: '/checklist/[id]', params: { id: selectedTask.refId, taskId: selectedTask.id } } as any);
                        }}
                        style={{ flex: 1, backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#3B82F6', shadowOffset: {width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation: 4 }}>
                         <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Iniciar / Retomar</Text>
                     </TouchableOpacity>
                  </View>
                  )}

                  {selectedTask.status === 'COMPLETED' && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                     <TouchableOpacity 
                        onPress={() => {
                           if (!selectedTask.refId) return;
                           setTaskModalVisible(false);
                           router.push({ pathname: '/checklist/[id]', params: { id: selectedTask.refId, taskId: selectedTask.id } } as any);
                        }}
                        style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#10B981', shadowOffset: {width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation: 4 }}>
                         <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Visualizar</Text>
                     </TouchableOpacity>
                  </View>
                  )}
               </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Page Indicator
  pageIndicator: { flexDirection: 'row', marginHorizontal: 48, marginTop: 12, marginBottom: 8, backgroundColor: '#F1F5F9', borderRadius: 14, padding: 4 },
  pageTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 11 },
  pageTabActive: { backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  pageTabText: { fontSize: 10, fontWeight: '900', color: colors.textSecondary },
  pageTabTextActive: { color: '#fff' },

  // Services: Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 12, backgroundColor: colors.surfaceLow, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.primary, padding: 0 },

  // Services: Section Label
  sectionLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, paddingHorizontal: 16, marginTop: 12, marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.6 },

  // Services: Category Grid (iFood-style 2 columns)
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  catGridCard: { flexDirection: 'row', alignItems: 'center', width: (SCREEN_W - 42) / 2, backgroundColor: colors.surfaceLow, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 },
  catGridLabel: { fontSize: 13, fontWeight: '700', color: colors.primary, marginLeft: 10 },

  // Services: Category Pills
  catScroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.surfaceLow },
  catPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catPillText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  catPillTextActive: { color: '#fff' },

  // Services: Dropdown
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLow, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  dropdownLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  dropdownMenu: { marginTop: 6, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  dropdownItemActive: { backgroundColor: '#F0F7FF' },
  dropdownItemText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  dropdownItemTextActive: { fontWeight: '800', color: colors.primary },

  // Services: Results
  resultsLabel: { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 14, letterSpacing: -0.3 },

  // Services: Provider Card (iFood-inspired High End)
  providerCard: { backgroundColor: colors.cardWhite, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  providerPhoto: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9' },
  providerName: { fontSize: 12, fontWeight: '700', color: '#191C1D', letterSpacing: -0.2 },
  providerRating: { fontSize: 12, fontWeight: '700', color: '#F59E0B', marginLeft: 4 },
  providerSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  providerSubText: { fontSize: 13, color: '#565E61', fontWeight: '500' },
  promoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  promoBadgeText: { fontSize: 11, fontWeight: '800', color: '#8257E5' },
  providerTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  providerHighlightPill: { backgroundColor: '#F3F4F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  providerHighlightText: { fontSize: 11, fontWeight: '600', color: '#565E61' },

  // Assets: Section header
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, letterSpacing: -0.5, textTransform: 'uppercase' },
  selectorGroup: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4 },
  selectorBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  selectorBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  listCard: { backgroundColor: colors.cardWhite, padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listInfo: { flex: 1, paddingRight: 12 },
  listTitle: { fontSize: 14, fontWeight: '900', color: colors.primary, textTransform: 'uppercase', letterSpacing: -0.2 },
  listType: { fontSize: 10, color: colors.textSecondary, marginTop: 2, fontWeight: '800', textTransform: 'uppercase' },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 8 },
  // Premium Services UI
  // Premium Services UI (Refined Typo & Deep Slate Ardósia)
  premiumHeader: { paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 16, paddingTop: 10 },
  premiumHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  premiumHeaderText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  
  circularCatScroll: { paddingRight: 20 },
  circularCatItem: { alignItems: 'center', width: 95 },
  circularCatIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  circularCatActive: { backgroundColor: '#904D00', shadowColor: '#904D00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  circularCatLabel: { fontSize: 9, fontWeight: '900', color: '#fff', opacity: 0.85, letterSpacing: 0.5, textAlign: 'center', textTransform: 'uppercase' },

  searchWrapPremium: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: -16, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },

  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surfaceLow, marginRight: 8 },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { fontSize: 11, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterChipTextActive: { color: '#fff', fontWeight: '900' },

  // iFood Chips
  ifoodChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cad3d8', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  ifoodChipActive: { backgroundColor: colors.accent + '10', borderColor: colors.accent },
  ifoodChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginHorizontal: 4 },

  // Sort Bottom Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sortSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 30, letterSpacing: -0.5 },
  sortGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  sortItem: { width: '31%', alignItems: 'center', marginBottom: 24 },
  sortIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  sortItemLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', textAlign: 'center' },
});
