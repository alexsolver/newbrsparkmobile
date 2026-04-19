import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Image, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ValueInput, parseLocaleAmountString } from '../../../src/components/ValueInput';
import { ColorPalette, SERVICE_CATEGORY_COLORS } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { StockService } from '../../../src/services/stockService';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StockItem, StockMovement } from '../../../src/types/stock';
import { getRootAssets } from '../../../src/database';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { formatDateTime, isImperial as getIsImperial } from '../../../src/i18n/formatters';
import { useAuth } from '../../../src/hooks/useAuth';
import { useManualSync } from '../../../src/hooks/useManualSync';

const CATEGORIES_KEYS = ['general', 'maintenance', 'cleaning', 'food', 'beverages', 'supplies'];
const UNITS_METRIC = ['un', 'lt', 'kg', 'mt', 'pct'];
const UNITS_IMPERIAL = ['un', 'lb', 'oz', 'gal', 'ft', 'pct'];

export default function StockScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { colors: C } = useTheme();
  const S = useMemo(() => createStockStyles(C), [C]);
  const [modalUseImperial, setModalUseImperial] = useState(() => getIsImperial());
  const UNITS = modalUseImperial ? UNITS_IMPERIAL : UNITS_METRIC;
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'ITEMS' | 'REPORTS'>('ITEMS');
  const [selectedLoc, setSelectedLoc] = useState('ALL');
  const [showNeedsOnly, setShowNeedsOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [venues, setVenues] = useState<any[]>([]);

  // Modais Visíveis
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanMode, setScanMode] = useState<'SEARCH' | 'CREATE'>('SEARCH');
  const [fetchingProduct, setFetchingProduct] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<StockItem | null>(null);
  
  // Estados de Movimentação
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<'IN' | 'OUT' | 'ADJUST' | 'TRANSFER'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [destAssetId, setDestAssetId] = useState('');

  // Novo Item
  const [newItem, setNewItem] = useState<Partial<StockItem>>({
    unit: 'un', category: 'general', currentStock: 0, minStock: 2, targetStock: 5, locationId: '1'
  });
  
  const loadData = async () => {
    setLoading(true);
    const email = user?.email || undefined;
    const data = await StockService.getItems(email);
    const moves = await StockService.getMovements(email);
    const roots = getRootAssets(email);
    setVenues(roots);
    setItems(data);
    setMovements(moves.reverse());
    setLoading(false);
  };

  const { refreshing, onRefresh } = useManualSync(loadData);

  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, []));

  const pickImage = async (isNew: boolean) => {
    let res = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!res.canceled) {
      if (isNew) setNewItem({ ...newItem, photoUri: res.assets[0].uri });
    }
  };

  const generateSKU = () => `BS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const handleCreateItem = async () => {
    if (!newItem.name || !newItem.sku) return Alert.alert(t('common.attention'), t('stock.nameRequired'));
    const all = await StockService.getItems(user?.email || undefined);
    if (all.some(i => i.sku.toUpperCase() === newItem.sku?.toUpperCase())) {
      return Alert.alert(t('common.error'), t('stock.skuExists', { sku: newItem.sku }));
    }

    const it: StockItem = {
      ...newItem as StockItem,
      id: Math.random().toString(36).substring(7),
      currentStock: Number(newItem.currentStock) || 0,
      minStock: Number(newItem.minStock) || 0,
      targetStock: Number(newItem.targetStock) || 0,
      sku: newItem.sku.toUpperCase()
    };
    await StockService.saveItem(it, user?.email || undefined);
    setCreateModalVisible(false);
    loadData();
    Alert.alert(t('common.success'), t('stock.materialCreated'));
  };

  const handleMovement = async () => {
    if (!selectedItem) return;
    const qVal = parseLocaleAmountString(quantity);
    if (!quantity || isNaN(qVal)) return Alert.alert(t('common.attention'), t('stock.enterQuantity'));
    if (moveType === 'TRANSFER' && !destAssetId) return Alert.alert(t('common.attention'), t('stock.enterDest'));
    
    try {
      await StockService.recordMovement({
        itemId: selectedItem.id,
        type: moveType,
        quantity: qVal,
        responsibleId: 'user_admin',
        reason: reason || (moveType === 'IN' ? t('stock.movement.IN') : moveType === 'TRANSFER' ? t('stock.movement.TRANSFER') : t('stock.movement.OUT')),
        subLocation: subLocation,
        destinationAssetId: destAssetId,
        unitPrice: parseLocaleAmountString(unitPrice) || 0
      }, user?.email || undefined);
      setMoveModalVisible(false); setQuantity(''); setReason(''); setSubLocation(''); setDestAssetId(''); setUnitPrice('');
      loadData();
      Keyboard.dismiss();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
  };

  const openMoveModal = (item: StockItem) => {
    setSelectedItem(item);
    setQuantity(''); setReason(''); setSubLocation(item.subLocation || '');
    setMoveType('OUT'); setDestAssetId(''); setMoveModalVisible(true);
  };

  const handleExportReport = async () => {
    try {
      await StockService.exportStockAsCSV(items, venues);
    } catch (e: any) {
      Alert.alert(t('common.exportError'), e.message);
    }
  };


  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanning) return;
    setIsScanning(true);
    setScanModalVisible(false);
    
    if (scanMode === 'CREATE') {
      setNewItem({ ...newItem, sku: data.toUpperCase() });
      setFetchingProduct(true);
      setCreateModalVisible(true);
      
      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
        const json = await res.json();
        if (json.status === 1 && json.product) {
          setNewItem(prev => ({
            ...prev,
            sku: data.toUpperCase(),
            name: json.product.product_name || prev.name,
            photoUri: json.product.image_front_url || json.product.image_url || prev.photoUri,
            category: 'supplies' // DEFAULT para itens encontrados no OFF
          }));
          showToast(t('stock.productIdentified', { name: json.product.product_name || data }), 'success');
        } else {
          showToast(t('stock.skuReadyCreate', { sku: data }), 'success');
        }
      } catch (e) { 
        console.log('OFF API Error', e); 
        showToast(t('stock.productSearchError'), 'error');
      }
      setFetchingProduct(false);
      setIsScanning(false);
      return;
    }

    const found = items.find(i => i.sku.toUpperCase() === data.toUpperCase());
    if (found) {
      setSelectedItem(found);
      setMoveType('OUT');
      setQuantity('');
      setReason(t('stock.barcodeRead'));
      setMoveModalVisible(true);
    } else {
      showToast(t('stock.skuNotFound', { sku: data }), 'error');
    }
    setIsScanning(false);
  };

  const startScanner = async (mode: 'SEARCH' | 'CREATE' = 'SEARCH') => {
    setScanMode(mode);
    if (mode === 'CREATE') setCreateModalVisible(false);
    if (mode === 'SEARCH' && moveModalVisible) setMoveModalVisible(false);
    
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        if (mode === 'CREATE') setCreateModalVisible(true);
        return Alert.alert(t('common.accessDenied'), t('common.allowCamera'));
      }
    }
    setIsScanning(false);
    setScanModalVisible(true);
  };

  const filteredItems = items.filter(i => {
    const matchLoc = selectedLoc === 'ALL' || i.locationId === selectedLoc;
    const matchNeed = showNeedsOnly ? (i.currentStock <= i.minStock) : true;
    const matchSearch = i.name.toLowerCase().includes(searchText.toLowerCase()) || i.sku.toLowerCase().includes(searchText.toLowerCase());
    return matchLoc && matchNeed && matchSearch;
  });

  const renderStockItem = ({ item }: { item: StockItem }) => {
    const p = Math.min((item.currentStock / item.targetStock) * 100, 100);
    const isC = item.currentStock <= item.minStock;
    const asset = venues.find(v => v.id === item.locationId);
    
    // Distribuição do SKU em outros locais
    const distribution = items.filter(i => i.sku === item.sku && i.id !== item.id && i.currentStock > 0);

    return (
      <TouchableOpacity style={S.itemCard} activeOpacity={0.7} onPress={() => setDetailItem(item)}>
        {item.photoUri ? <Image source={{uri: item.photoUri}} style={S.itemImg} /> : <View style={S.itemImgPH}><Ionicons name="camera-outline" size={16} color={C.textLight} /></View>}
        <View style={S.itemInfo}>
          <Text style={S.itemName}>{item.name}</Text>
          <Text style={S.itemSku}>{item.sku} • {item.category}</Text>
          <View style={S.hBadgeRow}>
            <View style={S.minLocBadge}><Text style={S.minLocT}>{asset?.title.toUpperCase() || t('common.general').toUpperCase()}</Text></View>
            {item.subLocation && <Text style={S.subT}> › {item.subLocation}</Text>}
          </View>
          
          {distribution.length > 0 && (
            <View style={S.distRow}>
              <Text style={S.distL}>{t('common.alsoAt')}: </Text>
              {distribution.map(d => (
                <View key={d.id} style={S.distBadge}>
                  <Text style={S.distT}>{venues.find(v => v.id === d.locationId)?.title.toUpperCase() || 'S'}: {d.currentStock}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={S.progressC}><View style={[S.progressB, { width: `${p}%`, backgroundColor: isC ? C.destructive : C.connectivity.online } as any]} /></View>
        </View>
        <View style={S.stockBadge}><Text style={[S.stockV, isC && { color: C.destructive }]}>{item.currentStock}</Text><Text style={S.stockU}>{item.unit}</Text></View>
        <TouchableOpacity style={S.moveBtn} onPress={() => openMoveModal(item)}><Ionicons name="swap-vertical" size={20} color={C.primary} /></TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHistoryItem = ({ item: m }: { item: StockMovement }) => {
    const it = items.find(i => i.id === m.itemId);
    const asset = venues.find(v => v.id === it?.locationId);
    const dest = venues.find(v => v.id === m.destinationAssetId);
    return (
      <View style={S.hCard}>
        <View style={[S.hIndicator, { backgroundColor: m.type === 'IN' ? C.connectivity.online : m.type === 'TRANSFER' ? SERVICE_CATEGORY_COLORS.Tecnologia : C.destructive }]} />
        <View style={{flex:1}}>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}>
             <Text style={S.hItemName}>{it?.name || t('common.removed')}</Text>
             <Text style={[S.hQty, { color: m.type === 'OUT' ? C.destructive : m.type === 'TRANSFER' ? SERVICE_CATEGORY_COLORS.Tecnologia : C.connectivity.online }]}>{(m.type === 'OUT' ? '-' : m.type === 'TRANSFER' ? '⇄' : '+')+m.quantity}</Text>
          </View>
          <View style={S.hSubRow}><Text style={S.hAsset}>{asset?.title || 'Geral'}</Text>{dest && <Text style={S.hSubLoc}> ⇢ {dest.title}</Text>}</View>
          <Text style={S.hMeta}>{formatDateTime(m.timestamp)} • {m.reason}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={S.container}>
      {toast && (
        <TouchableOpacity style={[S.toast, toast.type === 'error' ? S.toastE : S.toastS]} onPress={() => setToast(null)}>
          <Ionicons name={toast.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={24} color="#fff" />
          <Text style={S.toastT}>{toast.msg}</Text>
        </TouchableOpacity>
      )}
      <View style={S.pHeader}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
           <View><Text style={S.pTitle}>{t('stock.title')}</Text></View>
           <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={[S.needsBtn, {backgroundColor: C.accent, borderColor: C.accent}]} onPress={handleExportReport}><Ionicons name="share-outline" size={20} color="#fff" /></TouchableOpacity>
              <TouchableOpacity style={S.addBtn} onPress={() => { setSelectedLoc('ALL'); setNewItem({ name: '', sku: generateSKU(), unit: 'un', category: 'general', currentStock: 0, minStock: 2, targetStock: 5, locationId: venues[0]?.id || '1' }); setCreateModalVisible(true); }}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>

              <TouchableOpacity style={[S.needsBtn, showNeedsOnly && S.needsBtnActive]} onPress={() => setShowNeedsOnly(!showNeedsOnly)}><Ionicons name="cart" size={20} color={showNeedsOnly ? '#fff' : C.primary} /></TouchableOpacity>
           </View>
        </View>
        <View style={S.tabBar}>
           <TouchableOpacity style={[S.tabBtn, activeSubTab === 'ITEMS' && S.tabBtnActive]} onPress={() => setActiveSubTab('ITEMS')}><Text style={[S.tabBtnText, activeSubTab === 'ITEMS' && S.tabBtnTextActive]}>{t('stock.warehouse')}</Text></TouchableOpacity>
           <TouchableOpacity style={[S.tabBtn, activeSubTab === 'REPORTS' && S.tabBtnActive]} onPress={() => setActiveSubTab('REPORTS')}><Text style={[S.tabBtnText, activeSubTab === 'REPORTS' && S.tabBtnTextActive]}>{t('stock.globalHistory')}</Text></TouchableOpacity>
        </View>
      </View>

      {activeSubTab === 'ITEMS' ? (
        <>
          <View style={S.locBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={[S.filterChip, selectedLoc === 'ALL' && S.filterChipActive]} onPress={() => setSelectedLoc('ALL')}><Text style={[S.filterChipText, selectedLoc === 'ALL' && S.filterChipTextActive]}>{t('common.portfolio')}</Text></TouchableOpacity>
                {venues.map(v => (<TouchableOpacity key={v.id} style={[S.filterChip, selectedLoc === v.id && S.filterChipActive]} onPress={() => setSelectedLoc(v.id)}><Text style={[S.filterChipText, selectedLoc === v.id && S.filterChipTextActive]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
            </ScrollView>
          </View>
          <View style={S.searchArea}>
            <View style={S.searchRow}>
              <View style={S.searchBox}>
                <Ionicons name="search" size={18} color={C.textLight} />
                <TextInput 
                  placeholder={t('stock.searchPlaceholder')} 
                  style={S.searchInput}
                  value={searchText}
                  onChangeText={setSearchText}
                returnKeyType="done"
                      />
              </View>
              <TouchableOpacity style={S.barcodeBtn} onPress={() => startScanner('SEARCH')}>
                <Ionicons name="barcode-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <FlatList 
            data={filteredItems} 
            renderItem={renderStockItem} 
            keyExtractor={i => i.id} 
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        </>
      ) : (
        <FlatList 
          data={movements} 
          renderItem={renderHistoryItem} 
          keyExtractor={m => m.id} 
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      {/* MODAL MOVIMENTAÇÃO */}
      <Modal visible={moveModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={S.modalH}><Text style={S.modalTitleHeader}>{t('stock.logistics')}</Text><TouchableOpacity onPress={() => setMoveModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
            <Text style={S.itemLText}>{selectedItem?.name}</Text>
            <View style={S.hierRow}><View style={S.mBadge}><Ionicons name="business" size={12} color="#fff" /><Text style={S.mBadgeT}>{venues.find(v => v.id === selectedItem?.locationId)?.title || t('common.general').toUpperCase()}</Text></View><Ionicons name="chevron-forward" size={14} color={C.border} /><View style={S.sBadge}><Ionicons name="location" size={12} color={C.primary} /><Text style={S.sBadgeT}>{subLocation || t('common.noLocation')}</Text></View></View>
            
            <View style={S.typeRow}>
               <TouchableOpacity style={[S.typeB, moveType === 'IN' && S.typeBA]} onPress={() => setMoveType('IN')}><Text style={[S.typeT, moveType === 'IN' && {color:'#fff'}]} numberOfLines={1} adjustsFontSizeToFit>{t('stock.entry')}</Text></TouchableOpacity>
               <TouchableOpacity style={[S.typeB, moveType === 'OUT' && S.typeBAO]} onPress={() => setMoveType('OUT')}><Text style={[S.typeT, moveType === 'OUT' && {color:'#fff'}]} numberOfLines={1} adjustsFontSizeToFit>{t('stock.exit')}</Text></TouchableOpacity>
               <TouchableOpacity style={[S.typeB, moveType === 'TRANSFER' && S.typeBAT]} onPress={() => setMoveType('TRANSFER')}><Text style={[S.typeT, moveType === 'TRANSFER' && {color:'#fff'}]} numberOfLines={1} adjustsFontSizeToFit>{t('stock.transfer')}</Text></TouchableOpacity>
            </View>

            {moveType === 'TRANSFER' && (
              <View style={S.inputG}><Text style={S.inputL}>{t('stock.transferDest')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:8, marginBottom:15}} keyboardShouldPersistTaps="handled">
                  {venues.filter(v => v.id !== selectedItem?.locationId).map(v => (<TouchableOpacity key={v.id} style={[S.pChip, destAssetId === v.id && S.pChipA]} onPress={()=>setDestAssetId(v.id)}><Text style={[S.pChipT, destAssetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
                </ScrollView>
              </View>
            )}
            
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}><TextInput style={[S.input, {flex: 2}]} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder={t('stock.quantity')} returnKeyType="done" /><TextInput style={[S.input, {flex: 3}]} value={subLocation} onChangeText={setSubLocation} placeholder={t('stock.position')} returnKeyType="done" /></View>
            {moveType === 'IN' && (
              <View style={S.inputG}><Text style={S.inputL}>{t('stock.unitPricePaid')}</Text><ValueInput style={S.input} value={unitPrice} onChangeText={setUnitPrice} placeholder="0,00" currency /></View>
            )}
            <TextInput style={[S.input, {height:60}]} multiline value={reason} onChangeText={setReason} placeholder={t('stock.reasonObs')} returnKeyType="done" blurOnSubmit /><TouchableOpacity style={S.confirmBtn} onPress={handleMovement}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('stock.confirmMovement')}</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* MODAL MASTER DE CADASTRO COM FOTO */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={S.modalH}><Text style={S.modalTitleHeader}>{t('stock.newMaterial')}</Text><TouchableOpacity onPress={() => setCreateModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{flexDirection:'row', gap:15, marginBottom:20}}>
                 <TouchableOpacity style={S.imgPick} onPress={()=>pickImage(true)}>
                    {newItem.photoUri ? <Image source={{uri: newItem.photoUri}} style={S.imgFull} /> : <View style={{alignItems:'center'}}><Ionicons name="camera" size={30} color={C.textLight} /><Text style={S.imgL}>{t('common.photo')}</Text></View>}
                    {fetchingProduct && <View style={[StyleSheet.absoluteFill, {backgroundColor:'rgba(255,255,255,0.7)', justifyContent:'center', alignItems:'center'}]}><ActivityIndicator color={C.primary} /></View>}
                 </TouchableOpacity>
                 <View style={{flex:1}}>
                    <View style={S.inputG}><Text style={S.inputL}>{t('stock.nameLabel')} {fetchingProduct && <Text style={{color:C.primary}}> ({t('common.searching')})</Text>}</Text><TextInput style={S.input} value={newItem.name} onChangeText={t=>setNewItem({...newItem, name:t})} placeholder={t('stock.nameExample')} returnKeyType="done"
                      /></View>
                    <View style={S.inputG}><Text style={S.inputL}>SKU</Text>
                      <View style={{flexDirection:'row', gap:10}}>
                        <TextInput style={[S.input, {flex:1}]} value={newItem.sku} onChangeText={t=>setNewItem({...newItem, sku:t})} placeholder={t('stock.codePlaceholder')} returnKeyType="done"
                      />
                        <TouchableOpacity style={S.skuScanBtn} onPress={() => startScanner('CREATE')}><Ionicons name="barcode-outline" size={20} color="#fff" /></TouchableOpacity>
                      </View>
                    </View>
                 </View>
              </View>
              
              <View style={S.inputG}><Text style={S.inputL}>{t('stock.assetLink')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:5}} keyboardShouldPersistTaps="handled">{venues.map(v => (<TouchableOpacity key={v.id} style={[S.pChip, newItem.locationId === v.id && S.pChipA]} onPress={()=>setNewItem({...newItem, locationId:v.id})}><Text style={[S.pChipT, newItem.locationId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
              <View style={{flexDirection:'row', gap:10}}>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>{t('stock.currentCalc')}</Text><TextInput style={[S.input, {backgroundColor: C.surfaceLow, color: C.textSecondary}]} value={String(newItem.currentStock)} editable={false} returnKeyType="done"
                      /></View>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>{t('stock.warning')}</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.minStock)} onChangeText={t=>setNewItem({...newItem, minStock:Number(t)})} returnKeyType="done"
                      /></View>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>{t('stock.target')}</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.targetStock)} onChangeText={t=>setNewItem({...newItem, targetStock:Number(t)})} returnKeyType="done"
                      /></View>
              </View>
              <View style={S.inputG}><Text style={S.inputL}>{t('stock.positionBox')}</Text><TextInput style={S.input} value={newItem.subLocation} onChangeText={t=>setNewItem({...newItem, subLocation:t})} placeholder={t('stock.positionExample')} returnKeyType="done"
                      /></View>
              <View style={S.inputG}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={S.inputL}>{t('stock.categoryUnit')}</Text>
                  {/* Mini seletor de sistema de medida */}
                  <View style={{ flexDirection: 'row', backgroundColor: C.surfaceLow, borderRadius: 10, padding: 3 }}>
                    <TouchableOpacity
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }, !modalUseImperial && { backgroundColor: C.cardWhite }]}
                      onPress={() => { setModalUseImperial(false); setNewItem({ ...newItem, unit: 'un' }); }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '900', color: !modalUseImperial ? C.accent : C.textLight }}>MÉTRICO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }, modalUseImperial && { backgroundColor: C.cardWhite }]}
                      onPress={() => { setModalUseImperial(true); setNewItem({ ...newItem, unit: 'un' }); }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '900', color: modalUseImperial ? C.accent : C.textLight }}>IMPERIAL</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}} keyboardShouldPersistTaps="handled">{CATEGORIES_KEYS.map(c => (<TouchableOpacity key={c} style={[S.pChip, newItem.category === c && S.pChipA]} onPress={()=>setNewItem({...newItem, category:c})}><Text style={[S.pChipT, newItem.category === c && S.pChipTA]}>{t(`stock.stockCategories.${c}`).toUpperCase()}</Text></TouchableOpacity>))}</ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{UNITS.map(u => (<TouchableOpacity key={u} style={[S.pChip, newItem.unit === u && S.pChipA]} onPress={()=>setNewItem({...newItem, unit:u as any})}><Text style={[S.pChipT, newItem.unit === u && S.pChipTA]}>{t(`stock.units.${u}`).toUpperCase()}</Text></TouchableOpacity>))}</ScrollView>
              </View>
              <TouchableOpacity style={S.confirmBtn} onPress={handleCreateItem}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('stock.saveToStock')}</Text></TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      <Modal visible={inventoryModalVisible} transparent animationType="fade"><View style={S.modalO}><View style={S.modalC}><Text style={S.modalTitleHeader}>{t('stock.globalInventory')}</Text><TouchableOpacity onPress={()=>setInventoryModalVisible(false)} style={[S.confirmBtn, {marginTop:20}]}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('common.close').toUpperCase()}</Text></TouchableOpacity></View></View></Modal>

      {/* Modal Scanner de Código de Barras */}
      <Modal visible={scanModalVisible} animationType="slide" transparent>
        <View style={S.scanOverlay}>
          <View style={S.scanContainer}>
             <View style={S.modalH}><Text style={S.modalT}>{t('stock.skuScan')}</Text><TouchableOpacity onPress={() => setScanModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
             <Text style={S.scanSub}>{t('stock.scanHint')}</Text>
             <View style={S.cameraWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128"] }}
                />
                <View style={S.cameraOverlay}>
                  <View style={S.scannerFrame} />
                </View>
             </View>
             <TouchableOpacity style={[S.confirmBtn, {marginTop: 20, backgroundColor: C.surfaceLow}]} onPress={() => { setScanModalVisible(false); if (scanMode === 'CREATE') setCreateModalVisible(true); }}><Text style={[S.confirmText, {color: C.primary}]}>{t('common.cancel').toUpperCase()}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DETALHES DO ITEM */}
      <Modal visible={!!detailItem} transparent animationType="slide">
        <View style={S.modalO}>
          <View style={[S.modalC, { maxHeight: '92%' }]}>
            <View style={S.modalH}>
              <Text style={S.modalTitleHeader}>{t('stock.materialDetails')}</Text>
              <TouchableOpacity onPress={() => setDetailItem(null)}>
                <Ionicons name="close" size={24} color={C.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
              {/* Header com foto e nome */}
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                {detailItem?.photoUri ? (
                  <Image source={{ uri: detailItem.photoUri }} style={{ width: 90, height: 90, borderRadius: 18 }} />
                ) : (
                  <View style={{ width: 90, height: 90, borderRadius: 18, backgroundColor: C.surfaceLow, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="cube-outline" size={36} color={C.textLight} />
                  </View>
                )}
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: C.primary }}>{detailItem?.name}</Text>
                  <Text style={{ fontSize: 13, color: C.textSecondary, fontWeight: '700', marginTop: 4 }}>SKU: {detailItem?.sku}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ backgroundColor: C.accent + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: C.accent }}>{t(`stock.stockCategories.${detailItem?.category}`)?.toUpperCase() || detailItem?.category?.toUpperCase()}</Text>
                    </View>
                    <View style={{ backgroundColor: C.surfaceLow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: C.primary }}>{detailItem?.unit?.toUpperCase()}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Métricas de estoque */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                {[{
                  label: t('stock.current'), value: detailItem?.currentStock ?? 0,
                  color: (detailItem?.currentStock ?? 0) <= (detailItem?.minStock ?? 0) ? C.destructive : C.connectivity.online,
                  bg: (detailItem?.currentStock ?? 0) <= (detailItem?.minStock ?? 0) ? C.status.danger.bg : C.status.success.bg,
                }, {
                  label: t('stock.minimum'), value: detailItem?.minStock ?? 0, color: C.warning.text, bg: C.status.warning.bg,
                }, {
                  label: t('stock.targetLabel'), value: detailItem?.targetStock ?? 0, color: C.accent, bg: C.status.info.bg,
                }].map((m, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: m.bg, borderRadius: 16, padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '900', color: m.color }}>{m.value}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: m.color, marginTop: 4, letterSpacing: 0.5 }}>{m.label}</Text>
                  </View>
                ))}
              </View>

              {/* Barra de progresso */}
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: C.textLight }}>{t('stock.supplyLevel')}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: C.primary }}>{Math.min(Math.round(((detailItem?.currentStock ?? 0) / (detailItem?.targetStock ?? 1)) * 100), 100)}%</Text>
                </View>
                <View style={{ height: 8, backgroundColor: C.surfaceLow, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: '100%', borderRadius: 4, backgroundColor: (detailItem?.currentStock ?? 0) <= (detailItem?.minStock ?? 0) ? C.destructive : C.connectivity.online, width: `${Math.min(((detailItem?.currentStock ?? 0) / (detailItem?.targetStock ?? 1)) * 100, 100)}%` } as any} />
                </View>
              </View>

              {/* Localização */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: C.textLight, marginBottom: 8, letterSpacing: 0.5 }}>{t('stock.location')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={S.mBadge}><Ionicons name="business" size={12} color="#fff" /><Text style={S.mBadgeT}>{venues.find(v => v.id === detailItem?.locationId)?.title?.toUpperCase() || 'GERAL'}</Text></View>
                  {detailItem?.subLocation && <><Ionicons name="chevron-forward" size={14} color={C.border} /><View style={S.sBadge}><Ionicons name="location" size={12} color={C.primary} /><Text style={S.sBadgeT}>{detailItem.subLocation}</Text></View></>}
                </View>
              </View>

              {/* Últimos movimentos */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: C.textLight, marginBottom: 10, letterSpacing: 0.5 }}>{t('stock.lastMovements')}</Text>
                {(() => {
                  const itemMoves = movements.filter(m => m.itemId === detailItem?.id).slice(0, 5);
                  if (itemMoves.length === 0) return <Text style={{ color: C.textSecondary, fontStyle: 'italic', fontSize: 13 }}>{t('stock.noMovements')}</Text>;
                  return itemMoves.map((m, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < itemMoves.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.type === 'IN' ? C.connectivity.online : m.type === 'TRANSFER' ? SERVICE_CATEGORY_COLORS.Tecnologia : C.destructive, marginRight: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.primary }}>{m.reason || t(`stock.movement.${m.type}`)}</Text>
                        <Text style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{formatDateTime(m.timestamp)}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: m.type === 'OUT' ? C.destructive : m.type === 'TRANSFER' ? SERVICE_CATEGORY_COLORS.Tecnologia : C.connectivity.online }}>{m.type === 'OUT' ? '-' : m.type === 'TRANSFER' ? '⇄' : '+'}{m.quantity}</Text>
                    </View>
                  ));
                })()}
              </View>

              {/* Botão de movimentação */}
              <TouchableOpacity
                style={S.confirmBtn}
                onPress={() => { const it = detailItem; setDetailItem(null); if (it) openMoveModal(it); }}
              >
                <Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('stock.registerMovement')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStockStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cardWhite },
  pHeader: { padding: 16, paddingTop: 60, backgroundColor: C.cardWhite },
  pTitle: { color: C.primary, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  addBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },

  needsBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: C.surfaceLow, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: C.border },
  needsBtnActive: { backgroundColor: C.accent, borderColor: C.accent },

  tabBar: { flexDirection: 'row', gap: 15, marginTop: 25 },
  tabBtn: { paddingVertical: 8 },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: C.accent },
  tabBtnText: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6 },
  tabBtnTextActive: { color: C.accent },
  locBar: { backgroundColor: C.cardWhite, paddingBottom: 12 },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.background, borderWidth: 1, borderColor: C.border, marginRight: 8 },
  filterChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterChipText: { fontSize: 11, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterChipTextActive: { color: '#fff' },

  searchArea: { paddingHorizontal: 16, marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceLow, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 13, fontWeight: '700' },
  barcodeBtn: { backgroundColor: C.accent, width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  skuScanBtn: { backgroundColor: C.accent, width: 44, height: 50, borderRadius: 12, justifyContent:'center', alignItems:'center' },
  invBtn: { backgroundColor: C.accent, width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  itemCard: { flexDirection: 'row', backgroundColor: C.cardWhite, padding: 18, borderRadius: 24, marginBottom: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border },
  itemImg: { width: 60, height: 60, borderRadius: 14, marginRight: 15 },
  itemImgPH: { width: 60, height: 60, borderRadius: 14, backgroundColor: C.surfaceLow, justifyContent:'center', alignItems:'center', marginRight: 15 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  itemSku: { fontSize: 9, color: C.textSecondary, marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  hBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  minLocBadge: { backgroundColor: C.surfaceLow, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  minLocT: { fontSize: 9, fontWeight: '900', color: C.primary, letterSpacing: 0.5 },
  subT: { fontSize: 11, fontWeight: '700', color: C.textSecondary },
  progressC: { height: 4, backgroundColor: C.surfaceLow, borderRadius: 2, marginTop: 10, width: '100%', overflow: 'hidden' },
  progressB: { height: '100%', borderRadius: 2 },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8, alignItems: 'center' },
  distL: { fontSize: 8, fontWeight: '900', color: C.textLight },
  distBadge: { backgroundColor: C.surfaceLow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: C.border },
  distT: { fontSize: 8, fontWeight: '800', color: C.primary },
  stockBadge: { alignItems: 'center', justifyContent: 'center', minWidth: 50, marginRight: 15 },
  stockV: { fontSize: 20, fontWeight: '900', color: C.primary, letterSpacing: -0.5 },
  stockU: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  moveBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surfaceLow, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  hCard: { flexDirection: 'row', backgroundColor: C.cardWhite, padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  hIndicator: { width: 4, height: '70%', borderRadius: 2, marginRight: 12 },
  hItemName: { fontSize: 13, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  hQty: { fontSize: 16, fontWeight: '900', letterSpacing: -0.4 },
  hSubRow: { flexDirection: 'row', gap: 4, marginTop: 4, alignItems:'center' },
  hAsset: { fontSize: 9, fontWeight: '900', color: C.primary, textTransform:'uppercase', letterSpacing: 0.5 },
  hSubLoc: { fontSize: 10, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase' },
  hMeta: { fontSize: 9, color: C.textLight, marginTop: 6, fontWeight: '700', textTransform: 'uppercase' },
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: C.cardWhite, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 60, maxHeight: '90%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitleHeader: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase', letterSpacing: 1.2 },
  modalT: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase', letterSpacing: 1.2 },
  itemLText: { fontSize: 20, fontWeight: '900', color: C.primary, marginBottom: 12, letterSpacing: -0.4 },
  hierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 25 },
  mBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  mBadgeT: { fontSize: 9, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  sBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  sBadgeT: { fontSize: 9, fontWeight: '900', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeB: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  typeBA: { backgroundColor: C.connectivity.online, borderColor: C.connectivity.online },
  typeBAO: { backgroundColor: C.warning.text, borderColor: C.warning.text },
  typeBAT: { backgroundColor: SERVICE_CATEGORY_COLORS.Tecnologia, borderColor: SERVICE_CATEGORY_COLORS.Tecnologia },
  typeT: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  input: { backgroundColor: C.background, padding: 14, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 15, borderWidth: 1, borderColor: C.border },

  inputG: { marginBottom: 15 },
  inputL: { fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 6, letterSpacing: 0.6, textTransform: 'uppercase' },
  pChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.surfaceLow, marginRight: 8, borderWidth: 1, borderColor: C.border },
  pChipA: { backgroundColor: C.accent, borderColor: C.accent },

  pChipT: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  pChipTA: { color: '#fff' },
  confirmBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },

  confirmText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  imgPick: { width: 100, height: 100, borderRadius: 20, backgroundColor: C.surfaceLow, borderStyle: 'dashed', borderWidth: 2, borderColor: C.border, justifyContent:'center', alignItems:'center', overflow:'hidden' },
  imgFull: { width: '100%', height: '100%' },
  imgL: { fontSize: 9, fontWeight: '900', color: C.textLight, marginTop: 5 },
  scanOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  scanContainer: { backgroundColor: C.cardWhite, borderRadius: 32, padding: 24, alignItems: 'center' },
  scanSub: { fontSize: 11, color: C.textSecondary, textAlign: 'center', marginBottom: 20, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cameraWrapper: { width: '100%', height: 300, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  scannerFrame: { width: 220, height: 220, borderWidth: 2, borderColor: C.primary, borderRadius: 20, borderStyle: 'dashed' },
  toast: { position: 'absolute', top: 50, left: 16, right: 16, backgroundColor: C.accent, paddingVertical: 20, paddingHorizontal: 20, minHeight: 64, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10 },

  toastS: { backgroundColor: C.connectivity.online },
  toastE: { backgroundColor: C.destructive },
  toastT: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1, lineHeight: 22 },
  });
}
