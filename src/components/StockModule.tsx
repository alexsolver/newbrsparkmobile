import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Image, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { ValueInput, parseLocaleAmountString } from './ValueInput';
import { Ionicons } from '@expo/vector-icons';
import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { StockService } from '../services/stockService';
import { StockItem, StockMovement } from '../types/stock';
import { CostSummary } from '../types/costs';
import { AssetLocation } from '../types/asset';
import { getLocalAssets, getAssetLocations, saveAssetLocation, getStockLocations, saveStockItemLocal } from '../database';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { formatDate, isImperial } from '../i18n/formatters';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { uploadFile, mediaRemotePath } from '../services/storageService';
import { LocationGroupCard } from './LocationGroupCard';
import { SubLocationPicker } from './SubLocationPicker';

const UNITS_METRIC   = ['un', 'lt', 'kg', 'mt', 'pct'];
const UNITS_IMPERIAL = ['un', 'gal', 'lb', 'oz', 'ft', 'pct'];

// ── StockLocationGroup ────────────────────────────────────────────────────────
function StockLocationGroup({ loc, locItems, onItemPress, onMovePress, onAddItem, t }: {
  loc: any;
  locItems: any[];
  onItemPress: (item: any) => void;
  onMovePress: (item: any) => void;
  onAddItem: () => void;
  t: any;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const hasLow = locItems.some(i => i.currentStock <= i.minStock);

  const isGeneral = loc.id === '';
  const headerBg = isGeneral ? '#F8FAFC' : '#F0FFF4';
  const badgeBg = isGeneral ? '#E2E8F0' : '#DCFCE7';
  const primary = isGeneral ? '#334155' : '#15803D';

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' }}>
      {/* Header — 2 rows so the name always gets full width */}
      <View style={{ backgroundColor: headerBg, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 }}>

        {/* Row 1: icon + name + chevron */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: badgeBg, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
            <Ionicons name={loc.icon || 'location-outline'} size={18} color={primary} />
          </View>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setExpanded(e => !e)} activeOpacity={0.75}>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#191C1D', lineHeight: 18 }}>{loc.room}</Text>
            {loc.floor ? <Text style={{ fontSize: 10, color: primary, fontWeight: '700', marginTop: 1 }}>{loc.floor}</Text> : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpanded(e => !e)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#A8B5BB" />
          </TouchableOpacity>
        </View>

        {/* Row 2: badges + actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ backgroundColor: badgeBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: primary }}>{locItems.length} {locItems.length === 1 ? 'item' : 'itens'}</Text>
          </View>
          {hasLow && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Ionicons name="warning-outline" size={11} color="#B45309" />
              <Text style={{ fontSize: 9, fontWeight: '900', color: '#B45309', marginLeft: 2 }}>{t('stock.stockLowBadge')}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: primary, justifyContent: 'center', alignItems: 'center' }}
            onPress={onAddItem}
          >
            <Ionicons name="add" size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Item list */}
      {expanded && (
        <View style={{ backgroundColor: '#FAFCFF' }}>
          {locItems.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ fontSize: 11, color: '#CBD5E1', fontWeight: '700' }}>{t('stock.noItemHere')}</Text>
            </View>
          ) : (
            locItems.map((item, idx) => {
              const isLow = item.currentStock <= item.minStock;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: '#F1F5F9' }}
                  onPress={() => onItemPress(item)}
                  activeOpacity={0.75}
                >
                  {/* Photo or icon */}
                  {item.photoUri
                    ? <Image source={{ uri: item.photoUri }} style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }} />
                    : <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                        <Ionicons name="cube-outline" size={20} color="#94A3B8" />
                      </View>
                  }
                  {/* Info */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#191C1D' }} numberOfLines={1}>{item.name}</Text>
                    <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase' }}>{item.sku} · {item.category}</Text>
                    {/* Stock level bar */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={{ flex: 1, height: 4, backgroundColor: '#E2E8F0', borderRadius: 4 }}>
                        <View style={{ width: `${Math.min(100, item.targetStock > 0 ? (item.currentStock / item.targetStock) * 100 : 100)}%`, height: 4, backgroundColor: isLow ? '#F59E0B' : '#22C55E', borderRadius: 4 }} />
                      </View>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: isLow ? '#B45309' : '#15803D', minWidth: 36 }}>
                        {item.currentStock} {t(`stock.units.${item.unit}`)}
                      </Text>
                    </View>
                  </View>
                  {/* Move button */}
                  <TouchableOpacity
                    style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginLeft: 8 }}
                    onPress={() => onMovePress(item)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="swap-vertical" size={16} color="#64748B" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

export function StockModule({ assetId }: { assetId?: string }) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createStockModuleStyles(C), [C]);
  const { user } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [assetLocations, setAssetLocations] = useState<AssetLocation[]>([]);
  const [allLocations, setAllLocations] = useState<AssetLocation[]>([]);
  const [activeLocationTab, setActiveLocationTab] = useState<string>('');
  const [scanMode, setScanMode] = useState<'SEARCH' | 'CREATE'>('SEARCH');
  const [createStockModalVisible, setCreateStockModalVisible] = useState(false);
  const [createLocVisible, setCreateLocVisible] = useState(false);
  const [pendingStockLocation, setPendingStockLocation] = useState<AssetLocation | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'HISTORY'>('ITEMS');
  const [searchText, setSearchText] = useState('');
  
  // Modais
  const [modalVisible, setModalVisible] = useState(false);
  const [invModalVisible, setInvModalVisible] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [viewingItem, setViewingItem] = useState<StockItem | null>(null);
  const [newItem, setNewItem] = useState<any>({
    unit: 'un', category: 'Geral', currentStock: 0, minStock: 2, targetStock: 5
  });
  const [modalUseImperial, setModalUseImperial] = useState(() => isImperial());
  const [permission, requestPermission] = useCameraPermissions();

  
  // Movimentação
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<'IN' | 'OUT' | 'ADJUST' | 'TRANSFER'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [destAssetId, setDestAssetId] = useState('');
  const [destLocationId, setDestLocationId] = useState('');



  const venues = getLocalAssets();
  const currentAsset = venues.find(a => a.id === assetId);

  useEffect(() => { loadData(); }, [assetId]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('FAB_ADD_PRESSED', () => {
      // Find the currently active stock location using the tab ID
      const loc = assetLocations.find(l => l.id === activeLocationTab) || null;
      setPendingStockLocation(loc);
      setNewItem({ name: '', sku: `BS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`, unit: 'un', category: 'Geral', currentStock: 0, minStock: 2, targetStock: 5 });
      setCreateModalVisible(true);
    });
    return () => sub.remove();
  }, [activeLocationTab, assetLocations]);

  const loadData = async () => {
    setLoading(true);
    const allI = await StockService.getItems();
    const allM = await StockService.getMovements();
    if (assetId) {
      setAssetLocations(getStockLocations(assetId));  // only stock-flagged
      setAllLocations(getAssetLocations(assetId));    // all locations for picker
    }
    
    if (assetId) {
      setItems(allI.filter(i => i.locationId === assetId));
      setMovements(allM.filter(m => {
        const it = allI.find(item => item.id === m.itemId);
        return it?.locationId === assetId;
      }).reverse());
    }
    setLoading(false);
  };

  const handleMovement = async () => {
    if (!selectedItem) return;
    const qVal = parseLocaleAmountString(quantity);
    if (!quantity || isNaN(qVal)) return Alert.alert(t('common.attention'), t('stock.informQuantity') || 'Informe a quantidade.');
    if (moveType === 'TRANSFER' && !destAssetId) return Alert.alert(t('common.attention'), t('stock.informDestination') || 'Informe o destino.');

    try {
      // Check if destAssetId is a stock location within same asset (not another venue)
      const isInternalLocMove = moveType === 'TRANSFER' && assetLocations.some(l => l.id === destAssetId);

      if (isInternalLocMove) {
        // Internal move: keep quantity, just update subLocation to the new stock location
        const destLoc = assetLocations.find(l => l.id === destAssetId)!;
        const destLabel = destLoc.floor ? `${destLoc.floor} · ${destLoc.room}` : destLoc.room;
        await StockService.recordMovement({
          itemId: selectedItem.id,
          type: 'ADJUST',
          quantity: selectedItem.currentStock, // keep same quantity
          responsibleId: 'user_admin',
          reason: `${t('stock.moveTransfer') || 'Transferência'} → ${destLabel}`,
          subLocation: destLoc.id, // store loc ID so grouping works
          destinationAssetId: '',
          unitPrice: 0,
        });
      } else {
        await StockService.recordMovement({
          itemId: selectedItem.id,
          type: moveType,
          quantity: qVal,
          responsibleId: 'user_admin',
          reason: reason || (moveType === 'IN' ? t('stock.moveIn') : moveType === 'TRANSFER' ? t('stock.moveTransfer') : t('stock.moveOut')),
          subLocation: subLocation,
          destinationAssetId: destAssetId,
          destinationSubLocation: destLocationId,
          unitPrice: parseLocaleAmountString(unitPrice) || 0
        });
      }

      setModalVisible(false); setQuantity(''); setReason(''); setSubLocation(''); setDestAssetId(''); setDestLocationId(''); setUnitPrice('');
      loadData();
      Keyboard.dismiss();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreateItem = async () => {
    if (!newItem.name || !newItem.sku) return Alert.alert(t('common.attention'), t('stock.nameSkuRequired'));
    const all = await StockService.getItems();
    if (all.some(i => i.sku.toUpperCase() === newItem.sku?.toUpperCase())) return Alert.alert(t('common.error'), t('stock.skuExists', { sku: newItem.sku }));

    const it: StockItem = {
      ...newItem as StockItem,
      id: Math.random().toString(36).substring(7),
      locationId: assetId || '1',
      // If created from a location group, store the location id/label
      subLocation: pendingStockLocation ? pendingStockLocation.id || `${pendingStockLocation.floor} · ${pendingStockLocation.room}` : (newItem.subLocation || ''),
      currentStock: Number(newItem.currentStock) || 0,
      minStock: Number(newItem.minStock) || 0,
      targetStock: Number(newItem.targetStock) || 0,
      sku: newItem.sku!.toUpperCase(),
      unit: newItem.unit as any
    };

    await StockService.saveItem(it);

    // Upload da foto do item para o R2 em background
    if (it.photoUri && user?.email) {
      const remotePath = mediaRemotePath(user.email, `stock_${it.id}`, it.photoUri);
      uploadFile(it.photoUri, remotePath).then((res) => {
        if ((res?.url || res?.provider === 'dropbox') && user?.email) {
          const cloudUri = res?.url || res?.path || it.photoUri;
          saveStockItemLocal({ ...it, photoUri: cloudUri }, user.email);
        }
      }).catch(() => {});
    }

    setCreateModalVisible(false);
    setPendingStockLocation(null);
    loadData();
    showToast(t('stock.materialSaved'));
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanning) return;
    setIsScanning(true);
    setScanModalVisible(false);

    if (scanMode === 'CREATE') {
      setNewItem({ ...newItem, sku: data.toUpperCase() });
      setCreateModalVisible(true);
      setIsScanning(false);
      return;
    }

    const found = items.find(i => i.sku.toUpperCase() === data.toUpperCase());
    if (found) {
      setSelectedItem(found);
      setMoveType('OUT');
      setQuantity('');
      setReason(t('stock.barcodeReadLocal'));
      setModalVisible(true);
    } else {
      showToast(t('stock.skuNotFoundAsset', { sku: data }), 'error');
    }
    setIsScanning(false);
  };

  const startScanner = async (mode: 'SEARCH' | 'CREATE' = 'SEARCH') => {
    setScanMode(mode);
    if (modalVisible) setModalVisible(false);
    if (createModalVisible) setCreateModalVisible(false);

    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return Alert.alert(t('common.accessDenied'), t('common.allowCamera'));
    }
    setIsScanning(false);
    setScanModalVisible(true);
  };


  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(searchText.toLowerCase()) || 
    i.sku.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={S.container}>
      {toast && (
        <TouchableOpacity style={[S.toast, toast.type === 'error' ? S.toastE : S.toastS]} onPress={() => setToast(null)}>
          <Ionicons name={toast.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={24} color="#fff" />
          <Text style={S.toastT}>{toast.msg}</Text>
        </TouchableOpacity>
      )}
      <View style={S.modHeader}>
         <View><Text style={S.modTitle}>{t('stock.operationalMgmt')}</Text><Text style={S.modSub}>{currentAsset?.title || t('stock.localStock')}</Text></View>
         <View style={{flexDirection:'row', gap:10}}>
            <TouchableOpacity style={[S.stdAddBtn, { backgroundColor: '#F1F5F9' }]} onPress={() => setCreateStockModalVisible(true)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="albums-outline" size={20} color="#15803D" />
            </TouchableOpacity>
         </View>



      </View>




      <View style={S.modTabBar}>
         <TouchableOpacity style={[S.modTab, activeTab === 'ITEMS' && S.modTabActive]} onPress={() => setActiveTab('ITEMS')}><Text style={[S.modTabText, activeTab === 'ITEMS' && S.modTabTextActive]}>{t('stock.warehouse')}</Text></TouchableOpacity>
         <TouchableOpacity style={[S.modTab, activeTab === 'HISTORY' && S.modTabActive]} onPress={() => setActiveTab('HISTORY')}><Text style={[S.modTabText, activeTab === 'HISTORY' && S.modTabTextActive]}>{t('stock.historyTab')}</Text></TouchableOpacity>
      </View>

      {activeTab === 'ITEMS' ? (
        <>
          <View style={S.searchRow}><View style={S.searchBox}><Ionicons name="search" size={16} color={C.textLight} /><TextInput placeholder={t('stock.searchPlaceholder')} style={S.searchInput} value={searchText} onChangeText={setSearchText} returnKeyType="done"
                      /></View><TouchableOpacity style={S.barcodeBtn} onPress={() => startScanner()}><Ionicons name="barcode" size={20} color="#fff" /></TouchableOpacity></View>

          {searchText.trim() ? (
            /* Flat search results */
            <FlatList
              data={filteredItems}
              renderItem={({ item }) => (
                <TouchableOpacity style={S.itemCard} onPress={() => { setViewingItem(item); setDetailModalVisible(true); }}>
                  {item.photoUri ? <Image source={{uri: item.photoUri}} style={S.itemThumb} /> : <View style={S.itemThumbPH}><Ionicons name="cube-outline" size={16} color={C.textLight} /></View>}
                  <View style={S.itemInfo}><Text style={S.itemName}>{item.name}</Text><Text style={S.itemSku}>{item.sku} · {item.category}</Text></View>
                  <View style={S.stockB}><Text style={[S.stockV, item.currentStock <= item.minStock && { color: C.warning.text }]}>{item.currentStock}</Text><Text style={S.stockU}>{t(`stock.units.${item.unit}`)}</Text></View>
                  <TouchableOpacity style={S.moveBtn} onPress={() => { setSelectedItem(item); setSubLocation(item.subLocation || ''); setQuantity(''); setReason(''); setModalVisible(true); }}><Ionicons name="swap-vertical" size={18} color={C.primary} /></TouchableOpacity>
                </TouchableOpacity>
              )}
              keyExtractor={i => i.id} scrollEnabled={false}
            />
          ) : (
            /* Tabbed stock locations */
            <View style={{ marginBottom: 16 }}>
              {/* Horizontal Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0, gap: 10, marginBottom: 16 }}>
                <TouchableOpacity 
                  style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9' }, activeLocationTab === '' && { backgroundColor: '#15803D' }]} 
                  onPress={() => setActiveLocationTab('')}
                >
                  <Text style={[{ fontSize: 13, fontWeight: '800', color: '#475569' }, activeLocationTab === '' && { color: '#fff' }]}>{t('stock.generalStock', 'Estoque Geral')}</Text>
                </TouchableOpacity>

                {assetLocations.map(loc => (
                  <TouchableOpacity 
                    key={loc.id}
                    style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 6 }, activeLocationTab === loc.id && { backgroundColor: '#15803D' }]} 
                    onPress={() => setActiveLocationTab(loc.id)}
                  >
                    <Ionicons name={(loc.icon as any) || 'location-outline'} size={14} color={activeLocationTab === loc.id ? '#fff' : '#475569'} />
                    <Text style={[{ fontSize: 13, fontWeight: '800', color: '#475569' }, activeLocationTab === loc.id && { color: '#fff' }]}>{loc.room}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Items List for Active Tab */}
              {(() => {
                const knownSubLocs = new Set(assetLocations.flatMap(l => [l.id, `${l.floor} · ${l.room}`]));
                let tabItems = [];
                if (activeLocationTab === '') {
                  tabItems = items.filter(i => i.locationId === assetId && (!i.subLocation || !knownSubLocs.has(i.subLocation)));
                } else {
                  const loc = assetLocations.find(l => l.id === activeLocationTab);
                  tabItems = items.filter(i => i.locationId === assetId && (i.subLocation === activeLocationTab || (loc && i.subLocation === `${loc.floor} · ${loc.room}`)));
                }

                if (tabItems.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                        <Ionicons name="cube-outline" size={32} color="#94A3B8" />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#475569' }}>{t('stock.noItemHere')}</Text>
                    </View>
                  );
                }

                return tabItems.map(item => {
                  const isLow = item.currentStock <= item.minStock;
                  return (
                    <TouchableOpacity key={item.id} style={S.itemCard} onPress={() => { setViewingItem(item); setDetailModalVisible(true); }}>
                      {item.photoUri ? <Image source={{uri: item.photoUri}} style={S.itemThumb} /> : <View style={S.itemThumbPH}><Ionicons name="cube-outline" size={16} color={C.textLight} /></View>}
                      <View style={S.itemInfo}><Text style={S.itemName}>{item.name}</Text><Text style={S.itemSku}>{item.sku} · {item.category}</Text></View>
                      <View style={S.stockB}><Text style={[S.stockV, isLow && { color: C.warning.text }]}>{item.currentStock}</Text><Text style={S.stockU}>{t(`stock.units.${item.unit}`)}</Text></View>
                      <TouchableOpacity style={S.moveBtn} onPress={() => { setSelectedItem(item); setSubLocation(item.subLocation || ''); setQuantity(''); setReason(''); setModalVisible(true); }}><Ionicons name="swap-vertical" size={18} color={C.primary} /></TouchableOpacity>
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>
          )}

          {/* ── Modal: Criar Estoque ─────────────────────────────────── */}
          <Modal visible={createStockModalVisible} transparent animationType="slide">
            <View style={S.modalO}><View style={[S.modalC, { maxHeight: '80%' }]}>
              <View style={S.modalH}>
                <View>
                  <Text style={S.modalT}>{t('stock.createStock')}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#15803D' }}>Selecionar Local</Text>
                </View>
                <TouchableOpacity onPress={() => setCreateStockModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {allLocations.filter(l => !l.isStock).length > 0 ? (
                  <>
                    <Text style={[S.inputL2, { marginBottom: 10 }]}>Locais existentes (sem estoque)</Text>
                    {allLocations.filter(l => !l.isStock).map(loc => (
                      <TouchableOpacity
                        key={loc.id}
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}
                        onPress={() => {
                          saveAssetLocation({ ...loc, isStock: true }, user?.email || '');
                          loadData();
                          setCreateStockModalVisible(false);
                        }}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0FFF4', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                          <Ionicons name={loc.icon as any} size={20} color="#15803D" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '900', color: '#191C1D' }}>{loc.room}</Text>
                          {loc.floor ? <Text style={{ fontSize: 10, color: '#15803D', fontWeight: '700' }}>{loc.floor}</Text> : null}
                        </View>
                        <Ionicons name="add-circle-outline" size={22} color="#15803D" />
                      </TouchableOpacity>
                    ))}
                    <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 }} />
                  </>
                ) : null}
                <Text style={[S.inputL2, { marginBottom: 10 }]}>{t('stock.newStockLocation')}</Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#15803D', borderRadius: 14, paddingVertical: 14, backgroundColor: '#F0FFF4' }}
                  onPress={() => { setCreateStockModalVisible(false); setCreateLocVisible(true); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#15803D" />
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#15803D', textTransform: 'uppercase', letterSpacing: 0.5 }}>Novo Local de Estoque</Text>
                </TouchableOpacity>
              </ScrollView>
            </View></View>
          </Modal>

          {/* SubLocationPicker for creating a new stock location */}
          <SubLocationPicker
            visible={createLocVisible}
            parentType={currentAsset?.type || 'OTHER'}
            maxStep={2}
            confirmLabel="Criar Estoque →"
            onConfirm={loc => {
              setCreateLocVisible(false);
              const saved = saveAssetLocation({ id: Math.random().toString(36).substring(2, 10), assetId: assetId || '', floor: loc.floor, room: loc.room, icon: loc.icon || 'location-outline', isStock: true }, user?.email || '');
              setPendingStockLocation(saved);
              loadData();
              setNewItem({ name: '', sku: `BS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`, unit: 'un', category: 'Geral', currentStock: 0, minStock: 2, targetStock: 5 });
              setCreateModalVisible(true);
            }}
            onClose={() => setCreateLocVisible(false)}
          />
        </>
      ) : (
        <View style={S.historyList}>
           {movements.map(m => (
              <View key={m.id} style={S.moveRow}>
                <View style={[S.moveDot, {backgroundColor: m.type === 'IN' ? '#10B981' : m.type === 'TRANSFER' ? '#6366F1' : C.warning.text}]} />
                <View style={{flex:1}}><Text style={S.moveTitle}>{items.find(i=>i.id===m.itemId)?.name || t('common.removed')}</Text><Text style={S.moveSub}>{formatDate(m.timestamp)} • {m.reason}</Text></View>
                <Text style={S.moveQty}>{(m.type === 'OUT' ? '-' : m.type === 'TRANSFER' ? '⇄' : '+') + m.quantity}</Text>
              </View>
           ))}
        </View>
      )}

      {/* Modal Movimentação com Transferência */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
             <View style={S.modalH}><Text style={S.modalT}>{t('stock.logisticActivity')}</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
             <Text style={S.itemL}>{selectedItem?.name}</Text>
             <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 6 }}>
                {/* ORIGIN BADGE */}
                {(() => {
                   const loc = assetLocations.find(l => l.id === selectedItem?.locationId);
                   if (loc) {
                     return (
                       <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                         <Ionicons name={(loc.icon as any) || 'location-outline'} size={12} color="#15803D" style={{marginRight: 6}} />
                         <Text style={{fontSize: 10, fontWeight: '900', color: '#15803D', textTransform: 'uppercase'}}>{loc.room}</Text>
                       </View>
                     );
                   }
                   return (
                     <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                       <Ionicons name="cube-outline" size={12} color="#475569" style={{marginRight: 6}} />
                       <Text style={{fontSize: 10, fontWeight: '900', color: '#475569', textTransform: 'uppercase'}}>{t('stock.generalStock', 'Estoque Geral')}</Text>
                     </View>
                   );
                })()}

                {/* DESTINATION BADGE (IF TRANSFER && DESTINATION SELECTED) */}
                {moveType === 'TRANSFER' && destAssetId && (
                  <Ionicons name="arrow-forward" size={14} color="#64748B" />
                )}
                {moveType === 'TRANSFER' && destAssetId && (() => {
                   const dLoc = assetLocations.find(l => l.id === destAssetId);
                   const dVenue = venues.find(v => v.id === destAssetId);
                   if (dLoc) {
                     return (
                       <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                         <Ionicons name={(dLoc.icon as any) || 'location-outline'} size={12} color="#1D4ED8" style={{marginRight: 6}} />
                         <Text style={{fontSize: 10, fontWeight: '900', color: '#1D4ED8', textTransform: 'uppercase'}}>{dLoc.room}</Text>
                       </View>
                     );
                   } else if (dVenue) {
                     const externalLocs = getStockLocations(destAssetId);
                     const dExternalLoc = externalLocs.find(l => l.id === destLocationId);
                     
                     return (
                       <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                         <Ionicons name="business" size={12} color="#D97706" style={{marginRight: 6}} />
                         <Text style={{fontSize: 10, fontWeight: '900', color: '#D97706', textTransform: 'uppercase'}}>{dVenue.title}</Text>
                         {dExternalLoc ? (
                           <>
                             <Ionicons name="chevron-forward" size={10} color="#D97706" style={{marginHorizontal: 4}} />
                             <Ionicons name={((dExternalLoc.icon as any) || 'location-outline')} size={10} color="#D97706" style={{marginRight: 4}} />
                             <Text style={{fontSize: 10, fontWeight: '900', color: '#D97706', textTransform: 'uppercase'}}>{dExternalLoc.room}</Text>
                           </>
                         ) : (
                           <>
                             <Ionicons name="chevron-forward" size={10} color="#D97706" style={{marginHorizontal: 4}} />
                             <Ionicons name="cube-outline" size={10} color="#D97706" style={{marginRight: 4}} />
                             <Text style={{fontSize: 10, fontWeight: '900', color: '#D97706', textTransform: 'uppercase'}}>{t('stock.generalStock', 'Geral')}</Text>
                           </>
                         )}
                       </View>
                     );
                   }
                   return null;
                })()}
             </View>
             <View style={S.typeR}>
               <TouchableOpacity style={[S.typeB, moveType === 'IN' && S.typeBA]} onPress={() => setMoveType('IN')}>
                 <Text style={[S.typeT, moveType === 'IN' && {color:'#fff'}]} numberOfLines={1} adjustsFontSizeToFit>{t('stock.moveIn')}</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[S.typeB, moveType === 'OUT' && S.typeBAO]} onPress={() => setMoveType('OUT')}>
                 <Text style={[S.typeT, moveType === 'OUT' && {color:'#fff'}]} numberOfLines={1} adjustsFontSizeToFit>{t('stock.moveOut')}</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[S.typeB, moveType === 'TRANSFER' && S.typeBAT]} onPress={() => setMoveType('TRANSFER')}>
                 <Text style={[S.typeT, moveType === 'TRANSFER' && {color:'#fff'}]} numberOfLines={1} adjustsFontSizeToFit>{t('stock.moveTransfer')}</Text>
               </TouchableOpacity>
             </View>
             {moveType === 'TRANSFER' && (
                 <View style={S.inputG2}>
                   <Text style={S.inputL2}>{t('stock.destination')}</Text>
                   {/* Stock locations within same asset */}
                   {assetLocations.length > 0 && (
                     <View style={{ marginTop: 8, marginBottom: 8, backgroundColor: '#F0FFF4', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#DCFCE7' }}>
                       <Text style={{ fontSize: 9, fontWeight: '900', color: '#15803D', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>NESTE BEM: {currentAsset?.title}</Text>
                       <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                         {assetLocations.map(loc => {
                           const locLabel = `${loc.floor ? loc.floor + ' · ' : ''}${loc.room}`;
                           const isSelected = destAssetId === loc.id;
                           return (
                             <TouchableOpacity
                               key={loc.id}
                               style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: isSelected ? '#15803D' : '#fff', borderWidth: 1, borderColor: isSelected ? '#15803D' : '#BBF7D0', marginRight: 8 }}
                               onPress={() => setDestAssetId(loc.id)}
                             >
                               <Ionicons name={(loc.icon || 'location-outline') as any} size={12} color={isSelected ? '#fff' : '#15803D'} style={{ marginRight: 4 }} />
                               <Text style={{ fontSize: 11, fontWeight: '900', color: isSelected ? '#fff' : '#15803D' }}>{locLabel.toUpperCase()}</Text>
                             </TouchableOpacity>
                           );
                         })}
                       </ScrollView>
                     </View>
                   )}
                   {/* Other asset venues */}
                   {venues.filter(v => v.id !== assetId).length > 0 && (
                     <View style={{ marginTop: 4, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                       <Text style={{ fontSize: 9, fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>TRANSFERIR PARA: {t('stock.otherAssets')}</Text>
                       <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                         {venues.filter(v => v.id !== assetId).map(v => (
                           <TouchableOpacity key={v.id} style={[S.pChip, destAssetId === v.id && S.pChipA]} onPress={() => { setDestAssetId(v.id); setDestLocationId(''); }}>
                             <Text style={[S.pChipT, destAssetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text>
                           </TouchableOpacity>
                         ))}
                       </ScrollView>

                       {/* Extra Locations picker for selected Venue */}
                       {destAssetId && venues.find(v => v.id === destAssetId) && (() => {
                          const externalLocs = getStockLocations(destAssetId);
                          if (externalLocs.length === 0) return null;
                          return (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{marginTop: 8}}>
                                <TouchableOpacity style={[S.pChip, !destLocationId && S.pChipA]} onPress={() => setDestLocationId('')}>
                                  <Text style={[S.pChipT, !destLocationId && S.pChipTA]}>{t('stock.generalStock', 'Estoque Geral').toUpperCase()}</Text>
                                </TouchableOpacity>
                                {externalLocs.map(eloc => (
                                   <TouchableOpacity key={eloc.id} style={[S.pChip, destLocationId === eloc.id && S.pChipA]} onPress={() => setDestLocationId(eloc.id)}>
                                     <Text style={[S.pChipT, destLocationId === eloc.id && S.pChipTA]}>{eloc.room.toUpperCase()}</Text>
                                   </TouchableOpacity>
                                ))}
                            </ScrollView>
                          );
                       })()}
                     </View>
                   )}
                 </View>
              )}
             <View style={{flexDirection:'row', gap:10, marginBottom:10}}>
               <TextInput style={[S.input, {flex:1}]} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder={t('stock.quantity')} returnKeyType="done" />
               <TextInput
                 style={[S.input, {flex:2}]}
                 value={(() => {
                   // If subLocation looks like a raw ID (alphanumeric, no spaces), try to resolve to location name
                   const loc = assetLocations.find(l => l.id === subLocation);
                   if (loc) return loc.floor ? `${loc.floor} · ${loc.room}` : loc.room;
                   return subLocation;
                 })()}
                 onChangeText={setSubLocation}
                 placeholder={t('stock.position')}
                 returnKeyType="done"
               />
             </View>
             {moveType === 'IN' && (
               <View style={S.inputG2}><Text style={S.inputL2}>{t('stock.unitPrice')}</Text><ValueInput style={S.input} value={unitPrice} onChangeText={setUnitPrice} placeholder="0,00" currency /></View>
             )}
             <TextInput style={[S.input, {height:60}]} multiline value={reason} onChangeText={setReason} placeholder={t('stock.reasonObs')} returnKeyType="done" blurOnSubmit />
             <TouchableOpacity style={S.confirmBtn} onPress={handleMovement}>
               <Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('stock.confirmMovement')}</Text>
             </TouchableOpacity>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* Modal Cadastro Removido em prol do Reabastecimento */}

      {/* Inventário Standby */}
      <Modal visible={invModalVisible} transparent animationType="fade"><View style={S.modalO}><View style={S.modalC}><Text style={S.modalT}>{t('stock.localInventory')}</Text><TouchableOpacity onPress={()=>setInvModalVisible(false)} style={[S.confirmBtn, {marginTop:20}]}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('common.close')}</Text></TouchableOpacity></View></View></Modal>

      {/* Modal Cadastro de Item */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={S.modalH}>
              <View>
                <Text style={S.modalT}>{t('stock.newMaterial')}</Text>
                {pendingStockLocation ? (
                   <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start'}}>
                     <Ionicons name={(pendingStockLocation.icon as any) || 'location-outline'} size={12} color="#15803D" style={{marginRight: 6}} />
                     <Text style={{fontSize: 10, fontWeight: '900', color: '#15803D', textTransform: 'uppercase', letterSpacing: 0.5}}>{pendingStockLocation.room}</Text>
                   </View>
                ) : (
                   <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start'}}>
                     <Ionicons name="cube-outline" size={12} color="#475569" style={{marginRight: 6}} />
                     <Text style={{fontSize: 10, fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5}}>{t('stock.generalStock', 'Estoque Geral')}</Text>
                   </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={C.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={S.inputG2}><Text style={S.inputL2}>{t('stock.fields.skuBarcode')}</Text><View style={{flexDirection:'row', gap:10}}><TextInput style={[S.input, {flex:1}]} value={newItem.sku} onChangeText={t=>setNewItem({...newItem, sku:t})} placeholder={t('stock.fields.code')} returnKeyType="done"
                      /><TouchableOpacity style={S.skuScanBtn} onPress={() => startScanner('CREATE')}><Ionicons name="barcode-outline" size={20} color="#fff" /></TouchableOpacity></View></View>
              <View style={S.inputG2}><Text style={S.inputL2}>{t('stock.fields.itemName')}</Text><TextInput style={S.input} value={newItem.name} onChangeText={t=>setNewItem({...newItem, name:t})} placeholder="Ex: Óleo de Motor 15W40" returnKeyType="done"
                      /></View>
              <View style={{flexDirection:'row', gap:10}}><View style={[S.inputG2, {flex:2}]}><Text style={S.inputL2}>{t('stock.fields.category')}</Text><TextInput style={S.input} value={newItem.category} onChangeText={t=>setNewItem({...newItem, category:t})} placeholder="Ex: Manutenção" returnKeyType="done"
                      /></View></View>
              <View style={S.inputG2}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={S.inputL2}>{t('stock.fields.unit')}</Text>
                  {/* Seletor MÉTRICO / IMPERIAL */}
                  <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 3 }}>
                    <TouchableOpacity
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }, !modalUseImperial && { backgroundColor: '#fff' }]}
                      onPress={() => { setModalUseImperial(false); setNewItem({ ...newItem, unit: 'un' }); }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '900', color: !modalUseImperial ? C.primary : '#94A3B8' }}>MÉTRICO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }, modalUseImperial && { backgroundColor: '#fff' }]}
                      onPress={() => { setModalUseImperial(true); setNewItem({ ...newItem, unit: 'un' }); }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '900', color: modalUseImperial ? C.primary : '#94A3B8' }}>IMPERIAL</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection:'row', gap:8, marginBottom: 10}} keyboardShouldPersistTaps="handled">
                  {(modalUseImperial ? UNITS_IMPERIAL : UNITS_METRIC).map(u => (
                    <TouchableOpacity 
                      key={u} 
                      style={[S.pChip, newItem.unit === u && S.pChipA]} 
                      onPress={() => setNewItem({...newItem, unit: u})}
                    >
                      <Text style={[S.pChipT, newItem.unit === u && S.pChipTA]}>{t(`stock.units.${u}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{flexDirection:'row', gap:10}}><View style={[S.inputG2, {flex:1}]}><Text style={S.inputL2}>{t('stock.fields.initialBalance')}</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.currentStock)} onChangeText={t=>setNewItem({...newItem, currentStock:Number(t)})} returnKeyType="done"
                      /></View><View style={[S.inputG2, {flex:1}]}><Text style={S.inputL2}>{t('stock.fields.minimum')}</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.minStock)} onChangeText={t=>setNewItem({...newItem, minStock:Number(t)})} returnKeyType="done"
                      /></View></View>
              <TouchableOpacity style={S.confirmBtn} onPress={handleCreateItem}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('stock.saveToStock')}</Text></TouchableOpacity>

            </ScrollView>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* Modal Detalhes do Item */}
      <Modal visible={detailModalVisible} transparent animationType="fade">
        <View style={S.modalO}><View style={[S.modalC, { maxHeight: '80%' }]}>
           <View style={S.modalH}><Text style={S.modalT}>{t('stock.materialDetails')}</Text><TouchableOpacity onPress={() => setDetailModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
           {viewingItem && (
             <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
               <View style={{alignItems:'center', marginBottom:20}}>
                 {viewingItem.photoUri ? <Image source={{uri: viewingItem.photoUri}} style={{width: 120, height: 120, borderRadius: 24}} /> : <View style={{width: 120, height: 120, borderRadius: 24, backgroundColor: C.background, justifyContent:'center', alignItems:'center'}}><Ionicons name="cube-outline" size={60} color={C.textLight} /></View>}
                 <Text style={{fontSize: 24, fontWeight: '900', color: C.primary, marginTop: 15}}>{viewingItem.name}</Text>
                 <Text style={{fontSize: 14, color: C.textSecondary, fontWeight: '700'}}>{viewingItem.sku} • {viewingItem.category}</Text>
               </View>

               <View style={{flexDirection:'row', gap:10, marginBottom:20}}>
                  <View style={{flex:1, backgroundColor: C.background, padding: 15, borderRadius: 20, alignItems:'center'}}><Text style={{fontSize: 10, fontWeight:'900', color: C.textLight}}>{t('stock.currentBalance')}</Text><Text style={{fontSize: 24, fontWeight:'900', color: C.primary}}>{viewingItem.currentStock} {viewingItem.unit}</Text></View>
                  <View style={{flex:1, backgroundColor: C.background, padding: 15, borderRadius: 20, alignItems:'center'}}><Text style={{fontSize: 10, fontWeight:'900', color: C.textLight}}>{t('stock.minLevel')}</Text><Text style={{fontSize: 24, fontWeight:'900', color: viewingItem.currentStock <= viewingItem.minStock ? C.warning.text : C.primary}}>{viewingItem.minStock}</Text></View>
               </View>

               <Text style={S.modalT}>{t('stock.lastMovements')}</Text>
               <View style={{marginTop: 15}}>
                 {movements.filter(m => m.itemId === viewingItem.id).slice(0,5).map(m => (
                   <View key={m.id} style={[S.moveRow, {borderBottomColor: C.border}]}>
                     <View style={[S.moveDot, {backgroundColor: m.type === 'IN' ? '#10B981' : m.type === 'TRANSFER' ? '#6366F1' : C.warning.text}]} />
                     <View style={{flex:1}}><Text style={S.moveTitle}>{m.reason}</Text><Text style={S.moveSub}>{formatDate(m.timestamp)}</Text></View>
                     <Text style={S.moveQty}>{(m.type === 'OUT' ? '-' : m.type === 'TRANSFER' ? '⇄' : '+') + m.quantity}</Text>
                   </View>
                 ))}
               </View>
               <TouchableOpacity style={[S.confirmBtn, {marginTop: 30}]} onPress={() => { setDetailModalVisible(false); setSelectedItem(viewingItem); setModalVisible(true); }}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('stock.recordMovement')}</Text></TouchableOpacity>
             </ScrollView>
           )}
        </View></View>
      </Modal>

      {/* Modal Scanner Local */}

      <Modal visible={scanModalVisible} animationType="slide" transparent>
        <View style={S.scanOverlay}>
          <View style={S.scanContainer}>
             <View style={S.modalH}><Text style={S.modalT}>{t('stock.scannerTitle')}</Text><TouchableOpacity onPress={() => setScanModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
             <Text style={S.scanSub}>{t('stock.scanLocalSub')}</Text>
             <View style={S.cameraWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128"] }}
                />
                <View style={S.cameraOverlay}><View style={S.scannerFrame} /></View>
             </View>
             <TouchableOpacity style={[S.confirmBtn, {marginTop: 20, backgroundColor: '#F1F5F9'}]} onPress={() => setScanModalVisible(false)}><Text style={[S.confirmText, {color: C.primary}]}>{t('common.cancel').toUpperCase()}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

function createStockModuleStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { marginTop: 15, paddingHorizontal: 0, backgroundColor: '#fff', borderRadius: 24, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  modHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20 },
  modTitle: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.5, textTransform: 'uppercase' },
  modSub: { fontSize: 18, fontWeight: '900', color: C.primary, marginTop: 4, letterSpacing: -0.4 },
  stdAddBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  fab: { position: 'absolute', bottom: 30, right: 20, zIndex: 10, width: 60, height: 60, borderRadius: 30, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center', shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  modTabBar: { flexDirection: 'row', gap: 15, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 20 },
  modTabActive: { borderBottomWidth: 3, borderBottomColor: C.accent, paddingBottom: 8 },
  modTabTextActive: { color: C.accent, fontWeight: '800' },
  modTab: { paddingBottom: 8 },
  modTabText: { fontSize: 11, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 15 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  searchInput: { paddingVertical: 10, flex: 1, marginLeft: 10, fontSize: 13, fontWeight: '700' },
  barcodeBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },


  
  itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 18, borderRadius: 24, marginBottom: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border },
  itemThumb: { width: 44, height: 44, borderRadius: 10, marginRight: 12 },
  itemThumbPH: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  itemSku: { fontSize: 9, color: C.textSecondary, fontWeight: '800', textTransform: 'uppercase' },
  locBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  subLocText: { fontSize: 9, color: C.textLight, fontWeight: '700' },
  stockB: { alignItems: 'flex-end', marginRight: 15 },
  stockV: { fontSize: 16, fontWeight: '900', color: C.primary },
  stockU: { fontSize: 8, fontWeight: '900', color: C.textLight, textTransform: 'uppercase' },
  moveBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  
  historyList: { paddingHorizontal: 20 },
  moveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  moveDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  moveTitle: { fontSize: 11, fontWeight: '800', color: C.primary },
  moveSub: { fontSize: 9, color: C.textLight, fontWeight: '600' },
  moveQty: { fontSize: 12, fontWeight: '900', color: C.primary },
  
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '95%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalT: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase', letterSpacing: 1.5 },
  itemL: { fontSize: 18, fontWeight: '900', color: C.primary, marginBottom: 12, letterSpacing: -0.4 },
  hierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 25 },
  pBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pBadgeT: { fontSize: 9, fontWeight: '900', color: '#fff' },
  sBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  sBadgeT: { fontSize: 9, fontWeight: '800', color: C.primary },
  
  inputG2: { marginBottom: 15 },
  inputL2: { fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { backgroundColor: C.background, padding: 14, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 10, borderWidth: 1, borderColor: C.border },
  skuScanBtn: { backgroundColor: C.accent, width: 44, height: 48, borderRadius: 12, justifyContent:'center', alignItems:'center' },

  
  confirmBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 16, alignItems: 'center' },

  confirmText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  typeR: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeB: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  typeBA: { backgroundColor: '#10B981', borderColor: '#10B981' },
  typeBAO: { backgroundColor: C.warning.text, borderColor: C.warning.text },
  typeBAT: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  typeT: { fontSize: 10, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', textAlign: 'center' },
  
  scanOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  scanContainer: { backgroundColor: '#fff', borderRadius: 32, padding: 24, alignItems: 'center' },
  scanSub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginBottom: 20, fontWeight: '600' },
  cameraWrapper: { width: '100%', height: 300, borderRadius: 20, overflow: 'hidden' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: { width: 220, height: 220, borderWidth: 2, borderColor: C.accent, borderRadius: 20, borderStyle: 'dashed' },
  
  toast: { position: 'absolute', top: 20, left: 16, right: 16, backgroundColor: C.primary, paddingVertical: 20, paddingHorizontal: 20, minHeight: 64, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 9999 },
  toastS: { backgroundColor: '#10B981' },
  toastE: { backgroundColor: C.warning.text },
  toastT: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1, lineHeight: 22 },
  
  finSummary: { backgroundColor: C.background, padding: 20, borderRadius: 24, marginHorizontal: 20, marginBottom: 20 },
  finItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  finL: { fontSize: 11, color: C.textSecondary, fontWeight: '800' },
  finV: { fontSize: 11, color: C.primary, fontWeight: '900' },
  
  catalogItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 8, gap: 12 },
  catalogT: { fontSize: 12, fontWeight: '800', color: C.primary, flex: 1 },
  pChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.background, marginRight: 8 },
  pChipA: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
  pChipT: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  pChipTA: { color: C.menuChipActiveFg },
  });
}
